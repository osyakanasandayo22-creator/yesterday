export default function handler(req, res) {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.status(200).json({
    ok: true,
    hasGeminiApiKey: hasKey,
    nodeEnv: process.env.NODE_ENV || null,
  });
}

