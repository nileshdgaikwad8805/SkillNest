const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "config.js");

const apiBase = String(process.env.PUBLIC_API_BASE || "").replace(/\/$/, "");
const runtimeMode = String(process.env.PUBLIC_RUNTIME_MODE || "serverless");
const platformTarget = String(process.env.PUBLIC_PLATFORM_TARGET || "vercel");

const contents =
  `window.VIDYAOPS_CONFIG = window.VIDYAOPS_CONFIG || ${JSON.stringify(
    {
      apiBase,
      runtimeMode,
      platformTarget,
    },
    null,
    2
  )};\n`;

fs.writeFileSync(configPath, contents, "utf8");
console.log(`Generated config.js for ${platformTarget} with apiBase='${apiBase || "(same-origin)"}'`);
