import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import {
  getProviderName,
  getVoiceCacheKey,
  synthesizeSpeech,
  TtsProviderError
} from "./tts-providers.js";

const app = express();
const port = Number(process.env.PORT) || 3000;
const maxTextLength = Number(process.env.MAX_TEXT_LENGTH) || 120;
const cacheTtlMs = Number(process.env.TTS_CACHE_TTL_MS) || 3_600_000;
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "http://localhost:5500,http://127.0.0.1:5500")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const allowFileOrigin = process.env.ALLOW_FILE_ORIGIN === "true";
const trustedVercelOrigin = /^https:\/\/thong-bao-bep-thu-ngan(?:-[a-z0-9]+)*\.vercel\.app$/i;

const cache = new Map();
const pending = new Map();

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (origin === "null" && allowFileOrigin) return callback(null, true);
      return callback(null, allowedOrigins.has(origin) || trustedVercelOrigin.test(origin));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);
app.use(express.json({ limit: "8kb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, provider: getProviderName() });
});

const ttsRateLimit = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE) || 60,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

async function handleTts(request, response, next) {
  try {
    const rawText = request.method === "GET" ? request.query?.text : request.body?.text;
    if (typeof rawText !== "string") {
      return response.status(400).json({ error: "Trường text phải là chuỗi." });
    }

    const text = rawText.trim().normalize("NFC");
    if (text.length < 3 || text.length > maxTextLength) {
      return response.status(400).json({
        error: `Nội dung phải dài từ 3 đến ${maxTextLength} ký tự.`
      });
    }

    const cacheKey = `${getVoiceCacheKey()}:${text}`;
    const cached = cache.get(cacheKey);
    let audio;

    if (cached && cached.expiresAt > Date.now()) {
      audio = cached.audio;
    } else {
      cache.delete(cacheKey);
      let job = pending.get(cacheKey);
      if (!job) {
        job = synthesizeSpeech(text);
        pending.set(cacheKey, job);
      }

      try {
        audio = await job;
        cache.set(cacheKey, { audio, expiresAt: Date.now() + cacheTtlMs });
        if (cache.size > 200) cache.delete(cache.keys().next().value);
      } finally {
        pending.delete(cacheKey);
      }
    }

    response.set({
      "Content-Type": audio.contentType || "audio/mpeg",
      "Content-Length": String(audio.buffer.length),
      "Cache-Control": "private, max-age=3600",
      "X-TTS-Provider": getProviderName()
    });
    return response.send(audio.buffer);
  } catch (error) {
    return next(error);
  }
}

app.get("/api/tts", ttsRateLimit, handleTts);
app.post("/api/tts", ttsRateLimit, handleTts);

app.use((error, _request, response, _next) => {
  const expected = error instanceof TtsProviderError;
  console.error(expected ? error.message : error);
  response.status(expected ? 502 : 500).json({
    error: expected ? error.message : "Backend gặp lỗi khi tạo âm thanh."
  });
});

app.listen(port, () => {
  console.log(`TTS backend đang chạy tại http://localhost:${port}`);
  console.log(`Nhà cung cấp: ${getProviderName()}`);
});
