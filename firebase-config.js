const BACKEND_ORIGIN = location.hostname.endsWith(".vercel.app")
  ? location.origin
  : "https://thong-bao-bep-thu-ngan.vercel.app";
const FIREBASE_CONFIG_URL = `${BACKEND_ORIGIN}/api/firebase-config`;

const REQUIRED_CONFIG_KEYS = [
  "apiKey",
  "authDomain",
  "databaseURL",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId"
];

export async function loadFirebaseConfig() {
  const response = await fetch(FIREBASE_CONFIG_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "omit"
  });

  if (!response.ok) {
    throw new Error(`Không tải được cấu hình Firebase (${response.status}).`);
  }

  const config = await response.json();
  const isValid = REQUIRED_CONFIG_KEYS.every((key) =>
    typeof config[key] === "string" && config[key].trim() !== ""
  );

  if (!isValid) throw new Error("Cấu hình Firebase từ backend không đầy đủ.");
  return config;
}

export async function loadWebPushPublicKey() {
  const response = await fetch(`${BACKEND_ORIGIN}/api/push-config`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "omit"
  });

  if (!response.ok) {
    throw new Error("Chưa cấu hình khóa thông báo nền trên Vercel.");
  }

  const config = await response.json();
  if (typeof config.publicKey !== "string" || !config.publicKey.trim()) {
    throw new Error("Khóa thông báo nền không hợp lệ.");
  }
  return config.publicKey.trim();
}

export function getPushApiUrl() {
  return `${BACKEND_ORIGIN}/api/push`;
}
