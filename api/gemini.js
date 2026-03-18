async function listModels({ apiKey }) {
  // v1beta ListModels
  const url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200";
  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
  });
  const ct = upstream.headers.get("content-type") || "";
  const raw = await upstream.text().catch(() => "");
  let json = null;
  if (ct.includes("application/json") && raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }
  if (!upstream.ok) {
    const msg = json?.error?.message || json?.message || raw || `${upstream.status} ${upstream.statusText}`;
    throw new Error(msg);
  }
  const models = Array.isArray(json?.models) ? json.models : [];
  // generateContent対応だけ返す
  return models
    .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => ({
      name: m.name, // "models/..."
      displayName: m.displayName || null,
      description: m.description || null,
      methods: m.supportedGenerationMethods || [],
    }));
}

function pickDefaultModelName(list) {
  // "models/xxx" → "xxx"
  const names = list.map((m) => String(m?.name || "")).filter(Boolean);
  const short = names.map((n) => n.replace(/^models\//, ""));
  // 好み順（存在すればそれを使う）
  const preferPatterns = [
    /^gemini-1\.5-flash(-.*)?$/i,
    /^gemini-1\.5-pro(-.*)?$/i,
    /^gemini-2\.0-flash(-.*)?$/i,
    /^gemini-2\.0-pro(-.*)?$/i,
    /flash/i,
  ];
  for (const pat of preferPatterns) {
    const hit = short.find((s) => pat.test(s));
    if (hit) return hit;
  }
  return short[0] || "";
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    // ListModels: /api/gemini?listModels=1
    if (String(req.query?.listModels || "") === "1") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: "Missing GEMINI_API_KEY",
          hint: "Vercelの環境変数に GEMINI_API_KEY を設定してください。",
        });
      }
      try {
        const models = await listModels({ apiKey });
        return res.status(200).json({ ok: true, models });
      } catch (err) {
        return res.status(502).json({ error: "ListModels failed", details: err?.message || String(err) });
      }
    }
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

    // モデル名は -preview などが付く実名を使う（例: gemini-3-flash-preview）
    // 未指定時は preview を優先し、だめなら lite-preview → 通常名へフォールバック
    const DEFAULT_PRIMARY = "gemini-3-flash-preview";
    const DEFAULT_LITE = "gemini-3-flash-lite-preview";
    const FALLBACK_PRIMARY = "gemini-3-flash";
    const FALLBACK_LITE = "gemini-3-flash-lite";
    const candidates = requestedModel
      ? [requestedModel, DEFAULT_PRIMARY, DEFAULT_LITE, FALLBACK_PRIMARY, FALLBACK_LITE].filter(Boolean)
      : [DEFAULT_PRIMARY, DEFAULT_LITE, FALLBACK_PRIMARY, FALLBACK_LITE];

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
      // 429(クォータ/レート制限)はモデルを変えても解決しないことが多いのでフォールバックしない
      if (result.status === 429) return false;
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

    // 429はクォータ/レート制限なので、クライアントに分かりやすく返す
    if (lastError?.status === 429) {
      const msg =
        lastError?.json?.error?.message ||
        lastError?.json?.message ||
        (typeof lastError?.raw === "string" ? lastError.raw : "");
      const wait = String(msg).match(/Please retry in\s+([0-9.]+)s/i)?.[1] || null;
      return res.status(429).json({
        error: "Gemini quota/rate limit exceeded",
        hint:
          "Gemini APIの無料枠クォータ/レート制限により拒否されました。時間を置いて再試行するか、Google AI Studio側で請求/プラン/クォータ設定を確認してください。",
        retryAfterSeconds: wait ? Number(wait) : null,
        status: lastError?.status ?? null,
        statusText: lastError?.statusText ?? null,
        modelTried: lastError?.model ?? null,
        details: lastError?.raw ?? null,
        detailsJson: lastError?.json ?? null,
      });
    }

    // 404はモデル名が存在しない可能性が高いので、候補を返す
    if (lastError?.status === 404) {
      let models = null;
      try {
        models = await listModels({ apiKey });
      } catch {
        models = null;
      }
      return res.status(404).json({
        error: "Gemini model not found",
        hint:
          "指定モデルが v1beta generateContent で見つかりません。モデル名は gemini-3-flash-preview のように -preview が付く場合があります。/api/gemini?listModels=1 で利用可能なモデル名を確認して、設定のモデルに貼り付けてください。",
        modelTried: lastError?.model ?? null,
        models: models ? models.map((m) => m.name.replace(/^models\//, "")).slice(0, 60) : null,
        detailsJson: lastError?.json ?? null,
      });
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

