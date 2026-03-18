export default function handler(req, res) {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.status(200).json({
    ok: true,
    hasGeminiApiKey: hasKey,
    nodeEnv: process.env.NODE_ENV || null,
    vercelEnv: process.env.VERCEL_ENV || null, // production | preview | development
    vercelUrl: process.env.VERCEL_URL || null,
  });
}

