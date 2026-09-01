const REQUEST_TIMEOUT_MS = 20_000;

export class TtsProviderError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "TtsProviderError";
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new TtsProviderError(`Backend chưa cấu hình ${name}.`);
  return value;
}

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readJson(response, providerName) {
  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new TtsProviderError(`${providerName} trả về dữ liệu không hợp lệ.`);
  }

  if (!response.ok) {
    const detail = data?.message || data?.error?.message || `HTTP ${response.status}`;
    throw new TtsProviderError(`${providerName}: ${detail}`);
  }

  return data;
}

function assertProviderAudioUrl(rawUrl, providerName) {
  let audioUrl;
  try {
    audioUrl = new URL(rawUrl);
  } catch {
    throw new TtsProviderError(`${providerName} không trả về đường dẫn âm thanh hợp lệ.`);
  }

  if (audioUrl.protocol !== "https:") {
    throw new TtsProviderError(`${providerName} trả về đường dẫn âm thanh không an toàn.`);
  }

  return audioUrl;
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function downloadGeneratedAudio(rawUrl, providerName) {
  const audioUrl = assertProviderAudioUrl(rawUrl, providerName);
  const timeoutMs = numberFromEnv("AUDIO_POLL_TIMEOUT_MS", 120_000);
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(audioUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: "audio/mpeg,audio/wav,audio/*;q=0.9,*/*;q=0.1" }
      });
      lastStatus = response.status;

      if (response.ok) {
        const contentType = response.headers.get("content-type")?.split(";")[0] || "audio/mpeg";
        const buffer = Buffer.from(await response.arrayBuffer());
        const nonAudioType = /json|html|xml|text\//i.test(contentType);
        if (buffer.length > 100 && !nonAudioType) return { buffer, contentType };
      }
    } catch (error) {
      if (error?.name !== "TimeoutError" && error?.name !== "AbortError") throw error;
    }

    await delay(800);
  }

  throw new TtsProviderError(
    `${providerName} chưa tạo xong âm thanh trong ${Math.round(timeoutMs / 1000)} giây (HTTP ${lastStatus || "chưa có"}).`
  );
}

async function synthesizeWithGoogle(text) {
  const apiKey = requireEnv("GOOGLE_TTS_API_KEY");
  const voiceName = process.env.GOOGLE_TTS_VOICE?.trim() || "vi-VN-Neural2-A";
  const speakingRate = numberFromEnv("GOOGLE_TTS_SPEAKING_RATE", 1);
  const endpoint = "https://texttospeech.googleapis.com/v1/text:synthesize";

  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "vi-VN", name: voiceName },
      audioConfig: { audioEncoding: "MP3", speakingRate }
    })
  });
  const data = await readJson(response, "Google Cloud TTS");

  if (!data.audioContent) {
    throw new TtsProviderError("Google Cloud TTS không trả về audioContent.");
  }

  return {
    buffer: Buffer.from(data.audioContent, "base64"),
    contentType: "audio/mpeg"
  };
}

async function synthesizeWithFpt(text) {
  const apiKey = requireEnv("FPT_AI_API_KEY");
  const endpoint = process.env.FPT_AI_API_URL?.trim() || "https://api.fpt.ai/hmi/tts/v5";
  const voice = process.env.FPT_AI_VOICE?.trim() || "banmai";
  const speed = process.env.FPT_AI_SPEED?.trim() || "0";

  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "api_key": apiKey,
      voice,
      speed,
      format: "mp3",
      "Content-Type": "text/plain; charset=utf-8"
    },
    body: text
  });
  const data = await readJson(response, "FPT.AI");

  if (Number(data.error) !== 0 || !data.async) {
    throw new TtsProviderError(`FPT.AI: ${data.message || "không tạo được âm thanh"}.`);
  }

  return downloadGeneratedAudio(data.async, "FPT.AI");
}

async function synthesizeWithZalo(text) {
  const apiKey = requireEnv("ZALO_AI_API_KEY");
  const endpoint = process.env.ZALO_AI_API_URL?.trim() || "https://api.zalo.ai/v1/tts/synthesize";
  const body = new URLSearchParams({
    input: text,
    speaker_id: process.env.ZALO_AI_SPEAKER_ID?.trim() || "1",
    speed: process.env.ZALO_AI_SPEED?.trim() || "1.0"
  });

  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      apikey: apiKey,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
    },
    body
  });
  const data = await readJson(response, "Zalo AI");

  if (Number(data.error_code) !== 0 || !data?.data?.url) {
    throw new TtsProviderError(`Zalo AI: ${data.error_message || "không tạo được âm thanh"}.`);
  }

  return downloadGeneratedAudio(data.data.url, "Zalo AI");
}

export function getProviderName() {
  return (process.env.TTS_PROVIDER || "fpt").trim().toLowerCase();
}

export function getVoiceCacheKey() {
  const provider = getProviderName();
  if (provider === "google") return `${provider}:${process.env.GOOGLE_TTS_VOICE || "vi-VN-Neural2-A"}`;
  if (provider === "zalo") return `${provider}:${process.env.ZALO_AI_SPEAKER_ID || "1"}`;
  return `${provider}:${process.env.FPT_AI_VOICE || "banmai"}`;
}

export async function synthesizeSpeech(text) {
  switch (getProviderName()) {
    case "google":
      return synthesizeWithGoogle(text);
    case "zalo":
      return synthesizeWithZalo(text);
    case "fpt":
      return synthesizeWithFpt(text);
    default:
      throw new TtsProviderError("TTS_PROVIDER chỉ nhận: fpt, zalo hoặc google.");
  }
}
