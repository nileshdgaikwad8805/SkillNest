const path = require("path");

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function detectRuntimeMode() {
  if (process.env.SERVER_RUNTIME_MODE) {
    return String(process.env.SERVER_RUNTIME_MODE).trim().toLowerCase();
  }

  if (process.env.VERCEL) {
    return "serverless";
  }

  return "long-running";
}

function loadAppConfig(rootDir) {
  const runtimeMode = detectRuntimeMode();
  const dataDir = process.env.DATA_DIR || path.join(rootDir, "data");
  const dbPath = process.env.DB_PATH || path.join(dataDir, "skillnest.db");
  const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || "127.0.0.1",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    adminUsername: process.env.ADMIN_USERNAME || "admin",
    adminPassword: process.env.ADMIN_PASSWORD || "skillnest123",
    sessionCookie: process.env.SESSION_COOKIE || "skillnest_admin_session",
    appBaseUrl: process.env.APP_BASE_URL || "",
    publicApiBase: process.env.PUBLIC_API_BASE || "",
    dataDir,
    dbPath,
    allowedOrigins,
    resendApiKey: process.env.RESEND_API_KEY || "",
    resendFromEmail: process.env.RESEND_FROM_EMAIL || "SkillNest <onboarding@resend.dev>",
    notifyEmailTo: process.env.NOTIFY_EMAIL_TO || "",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
    runtimeMode,
    platformTarget: (process.env.PLATFORM_TARGET || "generic").trim().toLowerCase(),
    enableBackgroundJobs: parseBoolean(process.env.ENABLE_BACKGROUND_JOBS, runtimeMode !== "serverless"),
    secureStaticFiles: parseBoolean(process.env.SECURE_STATIC_FILES, true),
  };
}

module.exports = {
  loadAppConfig,
};
