export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      hasGeminiApiKey: !!process.env.GEMINI_API_KEY,
      nodeEnv: process.env.NODE_ENV || null,
      vercelEnv: process.env.VERCEL_ENV || null,
      vercelUrl: process.env.VERCEL_URL || null,
    });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Missing GEMINI_API_KEY",
      hint: "Vercelの環境変数に GEMINI_API_KEY を設定してください。",
      debug: {
        nodeEnv: process.env.NODE_ENV || null,
        vercelEnv: process.env.VERCEL_ENV || null,
        vercelUrl: process.env.VERCEL_URL || null,
      },
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const requestedModel = String(body?.model || "").trim();
    const persona = String(body?.persona || "").trim();
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    const contents = [];
    if (persona) {
      contents.push({
        role: "user",
        parts: [{ text: `指示:\n${persona}` }],
      });
    }

    const recent = messages.slice(-12);
    for (const m of recent) {
      if (!m || (m.role !== "user" && m.role !== "bot") || typeof m.text !== "string") continue;
      contents.push({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      });
    }

    const generationConfig = {
      temperature: 0.7,
      maxOutputTokens: 512,
    };

    const DEFAULT_PRIMARY = "gemini-3-flash";
    const DEFAULT_FALLBACK = "gemini-3.1-flash-lite";
    const candidates = requestedModel
      ? [requestedModel, DEFAULT_PRIMARY, DEFAULT_FALLBACK].filter(Boolean)
      : [DEFAULT_PRIMARY, DEFAULT_FALLBACK];

    async function attempt(model) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const upstream = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({ contents, generationConfig }),
      });

      const ct = upstream.headers.get("content-type") || "";
      const raw = await upstream.text().catch(() => "");
      let parsed = null;
      if (ct.includes("application/json") && raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
      }

      return {
        ok: upstream.ok,
        status: upstream.status,
        statusText: upstream.statusText,
        contentType: ct || null,
        raw: raw || null,
        json: parsed,
      };
    }

    function shouldFallback(result) {
      if (result.ok) return false;
      if (result.status === 429) return true; // rate limit / quota
      if (result.status === 404) return true; // model not found / deprecated
      if (result.status === 403) return true; // often quota / permission (try fallback)
      // some 400s indicate bad model name
      const msg =
        result?.json?.error?.message ||
        result?.json?.message ||
        (typeof result.raw === "string" ? result.raw : "");
      if (/model/i.test(String(msg)) && /(not found|unknown|invalid)/i.test(String(msg))) return true;
      return false;
    }

    let lastError = null;
    for (const model of candidates) {
      const r = await attempt(model);
      if (!r.ok) {
        lastError = { model, ...r };
        if (shouldFallback(r)) continue;
        break;
      }

      const data = r.json ?? (r.raw ? JSON.parse(r.raw) : null);
      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((p) => p?.text)
          .filter(Boolean)
          .join("") ?? "";

      if (!text) {
        lastError = { model, status: 200, statusText: "OK", contentType: r.contentType, raw: r.raw, json: r.json };
        continue;
      }

      return res.status(200).json({ text, modelUsed: model });
    }

    return res.status(502).json({
      error: "Gemini upstream error",
      status: lastError?.status ?? null,
      statusText: lastError?.statusText ?? null,
      modelTried: lastError?.model ?? null,
      contentType: lastError?.contentType ?? null,
      details: lastError?.raw ?? null,
      detailsJson: lastError?.json ?? null,
    });

    // (unreachable)
    // return res.status(500).json({ error: "Unexpected state" });
  } catch (err) {
    return res.status(400).json({ error: err?.message || String(err) });
  }
}

