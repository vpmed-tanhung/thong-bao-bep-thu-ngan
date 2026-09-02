import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import webpush from "web-push";
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
const webPushPublicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
const webPushPrivateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
const webPushSubject = process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:admin@example.com";
const webPushConfigured = Boolean(webPushPublicKey && webPushPrivateKey);

if (webPushConfigured) {
  webpush.setVapidDetails(webPushSubject, webPushPublicKey, webPushPrivateKey);
}

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
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, provider: getProviderName() });
});

app.get("/api/firebase-config", (_request, response) => {
  const apiKey = process.env.FIREBASE_WEB_API_KEY?.trim();
  if (!apiKey) {
    return response.status(503).json({ error: "Backend chưa được cấu hình Firebase." });
  }

  response.set("Cache-Control", "no-store");
  return response.json({
    apiKey,
    authDomain: "thong-bao-bep.firebaseapp.com",
    databaseURL: "https://thong-bao-bep-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "thong-bao-bep",
    storageBucket: "thong-bao-bep.firebasestorage.app",
    messagingSenderId: "151352401372",
    appId: "1:151352401372:web:f88f82a0783c391b31c319"
  });
});

app.get("/api/push-config", (_request, response) => {
  if (!webPushPublicKey) {
    return response.status(503).json({ error: "Backend chưa được cấu hình thông báo nền." });
  }

  response.set("Cache-Control", "no-store");
  return response.json({ publicKey: webPushPublicKey });
});

const pushRateLimit = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.PUSH_RATE_LIMIT_PER_MINUTE) || 60,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

function isValidPushSubscription(subscription) {
  return Boolean(
    subscription &&
    typeof subscription.endpoint === "string" &&
    subscription.endpoint.startsWith("https://") &&
    subscription.endpoint.length <= 2_048 &&
    typeof subscription.keys?.p256dh === "string" &&
    subscription.keys.p256dh.length <= 512 &&
    typeof subscription.keys?.auth === "string" &&
    subscription.keys.auth.length <= 512
  );
}

app.post("/api/push", pushRateLimit, async (request, response, next) => {
  try {
    if (!webPushConfigured) {
      return response.status(503).json({ error: "Backend chưa được cấu hình thông báo nền." });
    }

    const message = typeof request.body?.message === "string"
      ? request.body.message.trim().normalize("NFC")
      : "";
    const type = typeof request.body?.type === "string"
      ? request.body.type.trim().slice(0, 40)
      : "KITCHEN_NOTICE";
    const subscriptions = Array.isArray(request.body?.subscriptions)
      ? request.body.subscriptions.filter(isValidPushSubscription).slice(0, 50)
      : [];

    if (!message || message.length > 200) {
      return response.status(400).json({ error: "Nội dung thông báo không hợp lệ." });
    }
    if (subscriptions.length === 0) {
      return response.status(400).json({ error: "Chưa có thiết bị Thu ngân đăng ký." });
    }

    const payload = JSON.stringify({
      title: "Thông báo từ bếp",
      body: message,
      type,
      url: "./quay.html",
      tag: `bep-${type}-${Date.now()}`
    });
    const results = await Promise.allSettled(
      subscriptions.map((subscription) =>
        webpush.sendNotification(subscription, payload, {
          TTL: 120,
          urgency: "high"
        })
      )
    );
    const sent = results.filter((result) => result.status === "fulfilled").length;

    return response.json({ ok: sent > 0, sent, failed: results.length - sent });
  } catch (error) {
    return next(error);
  }
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
      "Cache-Control": request.method === "GET"
        ? "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800"
        : "private, max-age=3600",
      "X-TTS-Provider": getProviderName()
    });
    return response.send(audio.buffer);
  } catch (error) {
    return next(error);
  }
}

app.get("/api/tts", ttsRateLimit, handleTts);
app.post("/api/tts", ttsRateLimit, handleTts);

app.use((error, request, response, _next) => {
  const expected = error instanceof TtsProviderError;
  console.error(expected ? error.message : error);
  response.status(expected ? 502 : 500).json({
    error: expected
      ? error.message
      : request.path.startsWith("/api/push")
        ? "Backend gặp lỗi khi gửi thông báo nền."
        : "Backend gặp lỗi khi tạo âm thanh."
  });
});

app.listen(port, () => {
  console.log(`TTS backend đang chạy tại http://localhost:${port}`);
  console.log(`Nhà cung cấp: ${getProviderName()}`);
});
