export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
    const model = String(body?.model || "gemini-2.0-flash").trim();
    const persona = String(body?.persona || "").trim();
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

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

    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 512,
        },
      }),
    });

    if (!upstream.ok) {
      const t = await upstream.text().catch(() => "");
      return res.status(502).json({
        error: "Gemini upstream error",
        status: upstream.status,
        statusText: upstream.statusText,
        details: t,
      });
    }

    const data = await upstream.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text)
        .filter(Boolean)
        .join("") ?? "";

    if (!text) {
      return res.status(502).json({ error: "Empty response from Gemini" });
    }

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(400).json({ error: err?.message || String(err) });
  }
}

