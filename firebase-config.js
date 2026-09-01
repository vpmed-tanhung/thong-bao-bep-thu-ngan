const FIREBASE_CONFIG_URL = location.hostname.endsWith(".vercel.app")
  ? `${location.origin}/api/firebase-config`
  : "https://thong-bao-bep-thu-ngan.vercel.app/api/firebase-config";

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
