const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, ".env");

if (fs.existsSync(ENV_PATH)) {
  const envText = fs.readFileSync(ENV_PATH, "utf8");
  envText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "skillnest123";
const SESSION_COOKIE = "skillnest_admin_session";
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "skillnest.db");
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "SkillNest <onboarding@resend.dev>";
const NOTIFY_EMAIL_TO = process.env.NOTIFY_EMAIL_TO || "";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
const adminSessions = new Map();
const resendConfigured = Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL && NOTIFY_EMAIL_TO);

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }

  const [salt, originalKey] = storedHash.split(":");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(derivedKey, "hex"), Buffer.from(originalKey, "hex"));
}

db.exec(`
  CREATE TABLE IF NOT EXISTS contact_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    organization TEXT,
    interest TEXT NOT NULL,
    message TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'contact_form',
    ai_score INTEGER NOT NULL DEFAULT 0,
    ai_summary TEXT NOT NULL DEFAULT '',
    ai_next_step TEXT NOT NULL DEFAULT '',
    ai_followup_subject TEXT NOT NULL DEFAULT '',
    ai_followup_body TEXT NOT NULL DEFAULT '',
    ai_followup_sent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chatbot_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    name TEXT NOT NULL,
    contact TEXT NOT NULL,
    learner_type TEXT NOT NULL,
    interest TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT NOT NULL DEFAULT '',
    ai_score INTEGER NOT NULL DEFAULT 0,
    ai_summary TEXT NOT NULL DEFAULT '',
    ai_next_step TEXT NOT NULL DEFAULT '',
    ai_followup_subject TEXT NOT NULL DEFAULT '',
    ai_followup_body TEXT NOT NULL DEFAULT '',
    ai_followup_sent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workshops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    schedule_text TEXT NOT NULL,
    duration_text TEXT NOT NULL,
    level_text TEXT NOT NULL,
    cta_text TEXT NOT NULL,
    cta_link TEXT NOT NULL,
    ai_workshop_description TEXT NOT NULL DEFAULT '',
    ai_announcement TEXT NOT NULL DEFAULT '',
    ai_social_posts TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function ensureColumn(tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

ensureColumn("chatbot_leads", "status", "TEXT NOT NULL DEFAULT 'new'");
ensureColumn("chatbot_leads", "notes", "TEXT NOT NULL DEFAULT ''");
ensureColumn("chatbot_leads", "updated_at", "TEXT");
ensureColumn("chatbot_leads", "ai_score", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("chatbot_leads", "ai_summary", "TEXT NOT NULL DEFAULT ''");
ensureColumn("chatbot_leads", "ai_next_step", "TEXT NOT NULL DEFAULT ''");
ensureColumn("chatbot_leads", "ai_followup_subject", "TEXT NOT NULL DEFAULT ''");
ensureColumn("chatbot_leads", "ai_followup_body", "TEXT NOT NULL DEFAULT ''");
ensureColumn("chatbot_leads", "ai_followup_sent", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("contact_inquiries", "ai_score", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("contact_inquiries", "ai_summary", "TEXT NOT NULL DEFAULT ''");
ensureColumn("contact_inquiries", "ai_next_step", "TEXT NOT NULL DEFAULT ''");
ensureColumn("contact_inquiries", "ai_followup_subject", "TEXT NOT NULL DEFAULT ''");
ensureColumn("contact_inquiries", "ai_followup_body", "TEXT NOT NULL DEFAULT ''");
ensureColumn("contact_inquiries", "ai_followup_sent", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("workshops", "ai_workshop_description", "TEXT NOT NULL DEFAULT ''");
ensureColumn("workshops", "ai_announcement", "TEXT NOT NULL DEFAULT ''");
ensureColumn("workshops", "ai_social_posts", "TEXT NOT NULL DEFAULT ''");
db.exec(`
  UPDATE chatbot_leads
  SET updated_at = COALESCE(updated_at, created_at),
      status = COALESCE(status, 'new'),
      notes = COALESCE(notes, ''),
      ai_score = COALESCE(ai_score, 0),
      ai_summary = COALESCE(ai_summary, ''),
      ai_next_step = COALESCE(ai_next_step, ''),
      ai_followup_subject = COALESCE(ai_followup_subject, ''),
      ai_followup_body = COALESCE(ai_followup_body, ''),
      ai_followup_sent = COALESCE(ai_followup_sent, 0)
`);
db.exec(`
  UPDATE contact_inquiries
  SET ai_score = COALESCE(ai_score, 0),
      ai_summary = COALESCE(ai_summary, ''),
      ai_next_step = COALESCE(ai_next_step, ''),
      ai_followup_subject = COALESCE(ai_followup_subject, ''),
      ai_followup_body = COALESCE(ai_followup_body, ''),
      ai_followup_sent = COALESCE(ai_followup_sent, 0)
`);
db.exec(`
  UPDATE workshops
  SET ai_workshop_description = COALESCE(ai_workshop_description, ''),
      ai_announcement = COALESCE(ai_announcement, ''),
      ai_social_posts = COALESCE(ai_social_posts, '')
`);

const insertInquiry = db.prepare(`
  INSERT INTO contact_inquiries (name, email, organization, interest, message, source, ai_score, ai_summary, ai_next_step, ai_followup_subject, ai_followup_body, ai_followup_sent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const selectAdminUser = db.prepare(`
  SELECT id, username, password_hash, created_at, updated_at
  FROM admin_users
  ORDER BY id ASC
  LIMIT 1
`);
const insertAdminUser = db.prepare(`
  INSERT INTO admin_users (username, password_hash)
  VALUES (?, ?)
`);
const updateAdminPassword = db.prepare(`
  UPDATE admin_users
  SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const insertLead = db.prepare(`
  INSERT INTO chatbot_leads (session_id, name, contact, learner_type, interest, status, notes, ai_score, ai_summary, ai_next_step, ai_followup_subject, ai_followup_body, ai_followup_sent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertChatMessage = db.prepare(`
  INSERT INTO chat_messages (session_id, role, content)
  VALUES (?, ?, ?)
`);
const selectInquiryCount = db.prepare(`SELECT COUNT(*) AS count FROM contact_inquiries`);
const selectLeadCount = db.prepare(`SELECT COUNT(*) AS count FROM chatbot_leads`);
const selectChatCount = db.prepare(`SELECT COUNT(*) AS count FROM chat_messages`);
const selectWorkshopCount = db.prepare(`SELECT COUNT(*) AS count FROM workshops`);
const selectRecentInquiries = db.prepare(`
  SELECT id, name, email, organization, interest, message, source, ai_score, ai_summary, ai_next_step, ai_followup_subject, ai_followup_body, ai_followup_sent, created_at
  FROM contact_inquiries
  ORDER BY id DESC
  LIMIT 20
`);
const selectRecentLeads = db.prepare(`
  SELECT id, session_id, name, contact, learner_type, interest, status, notes, ai_score, ai_summary, ai_next_step, ai_followup_subject, ai_followup_body, ai_followup_sent, created_at, updated_at
  FROM chatbot_leads
  ORDER BY id DESC
  LIMIT 20
`);
const selectRecentChats = db.prepare(`
  SELECT id, session_id, role, content, created_at
  FROM chat_messages
  ORDER BY id DESC
  LIMIT 30
`);
const selectWorkshops = db.prepare(`
  SELECT id, title, type, description, schedule_text, duration_text, level_text, cta_text, cta_link, ai_workshop_description, ai_announcement, ai_social_posts, is_active, created_at, updated_at
  FROM workshops
  ORDER BY id DESC
`);
const selectPublicWorkshops = db.prepare(`
  SELECT id, title, type, description, schedule_text, duration_text, level_text, cta_text, cta_link
  FROM workshops
  WHERE is_active = 1
  ORDER BY id DESC
`);
const insertWorkshop = db.prepare(`
  INSERT INTO workshops (title, type, description, schedule_text, duration_text, level_text, cta_text, cta_link, ai_workshop_description, ai_announcement, ai_social_posts, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateWorkshop = db.prepare(`
  UPDATE workshops
  SET title = ?, type = ?, description = ?, schedule_text = ?, duration_text = ?, level_text = ?, cta_text = ?, cta_link = ?, ai_workshop_description = ?, ai_announcement = ?, ai_social_posts = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);
const selectWorkshopById = db.prepare(`
  SELECT id, title, type, description, schedule_text, duration_text, level_text, cta_text, cta_link, is_active
  FROM workshops
  WHERE id = ?
`);
const deleteWorkshop = db.prepare(`DELETE FROM workshops WHERE id = ?`);
const updateLeadStatus = db.prepare(`
  UPDATE chatbot_leads
  SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

function seedAdminUserIfNeeded() {
  const existingAdmin = selectAdminUser.get();
  if (existingAdmin) {
    return;
  }

  insertAdminUser.run(ADMIN_USERNAME, createPasswordHash(ADMIN_PASSWORD));
}

function seedWorkshopsIfNeeded() {
  if (selectWorkshopCount.get().count > 0) {
    return;
  }

  const seedRows = [
    [
      "Cloud Basics for College Students",
      "Free Workshop",
      "Introductory session covering cloud concepts, career paths, and practical starting points.",
      "Saturday, 10:00 AM",
      "2 Hours",
      "Beginner",
      "Reserve Seat",
      "contact.html",
      "",
      "",
      "",
      1,
    ],
    [
      "Hands-On Data Analysis Sprint",
      "Paid Workshop",
      "Learn practical data workflows, basic tools, and how to think analytically with guided exercises.",
      "Sunday, 11:30 AM",
      "3 Hours",
      "Beginner to Intermediate",
      "Enroll Now",
      "contact.html",
      "",
      "",
      "",
      1,
    ],
    [
      "Introduction to AI Tools and Use Cases",
      "Free Workshop",
      "Explore AI ideas, practical examples, and how students and freshers can start learning responsibly.",
      "Wednesday, 5:00 PM",
      "90 Minutes",
      "Beginner",
      "Reserve Seat",
      "contact.html",
      "",
      "",
      "",
      1,
    ],
    [
      "Cybersecurity Awareness and Foundations",
      "Paid Workshop",
      "Understand security basics, threat awareness, and how cybersecurity skills connect to career growth.",
      "Saturday, 4:00 PM",
      "2.5 Hours",
      "Beginner",
      "Enroll Now",
      "contact.html",
      "",
      "",
      "",
      1,
    ],
  ];

  seedRows.forEach((row) => insertWorkshop.run(...row));
}

seedAdminUserIfNeeded();
seedWorkshopsIfNeeded();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function applyCors(request, response) {
  const requestOrigin = request.headers.origin;
  if (!requestOrigin) {
    return;
  }

  const allowed =
    ALLOWED_ORIGINS.includes("*") ||
    ALLOWED_ORIGINS.includes(requestOrigin) ||
    requestOrigin === `http://${request.headers.host}` ||
    requestOrigin === `https://${request.headers.host}`;

  if (!allowed) {
    return;
  }

  response.setHeader("Access-Control-Allow-Origin", requestOrigin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
}

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    ...extraHeaders,
  });
  response.end(text);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";

    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });

    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

async function parseJsonBody(request) {
  const rawBody = await readRequestBody(request);
  return rawBody ? JSON.parse(rawBody) : {};
}

function getSafeFilePath(urlPathname) {
  const normalizedPath = urlPathname === "/" ? "/index.html" : urlPathname;
  const cleanPath = path.normalize(decodeURIComponent(normalizedPath)).replace(/^(\.\.[/\\])+/, "");
  return path.join(ROOT, cleanPath);
}

function parseCookies(request) {
  const cookieHeader = request.headers.cookie || "";
  return cookieHeader.split(";").reduce((accumulator, chunk) => {
    const [key, ...rest] = chunk.trim().split("=");
    if (!key) {
      return accumulator;
    }
    accumulator[key] = decodeURIComponent(rest.join("="));
    return accumulator;
  }, {});
}

function getAdminSession(request) {
  const authorization = request.headers.authorization || "";
  const headerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const cookies = parseCookies(request);
  const token = headerToken || cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }

  return adminSessions.get(token) || null;
}

function requireAdmin(request, response) {
  const session = getAdminSession(request);
  if (!session) {
    sendJson(response, 401, { error: "Unauthorized" });
    return null;
  }
  return session;
}

function escapeCsv(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function toCsv(rows) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(escapeCsv).join(",");
  const dataLines = rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","));
  return [headerLine, ...dataLines].join("\n");
}

function extractGeminiText(payload) {
  if (!Array.isArray(payload?.candidates)) {
    return "";
  }

  const firstCandidate = payload.candidates[0];
  const parts = firstCandidate?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

async function sendNotificationEmail({ subject, text, html }) {
  if (!resendConfigured) {
    return false;
  }
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [NOTIFY_EMAIL_TO],
      subject,
      text,
      html,
    }),
  });

  const resendPayload = await resendResponse.json();
  if (!resendResponse.ok) {
    throw new Error(resendPayload?.message || resendPayload?.error || "Resend request failed.");
  }

  return true;
}

async function sendTransactionalEmail({ to, subject, text, html }) {
  if (!resendConfigured || !to) {
    return false;
  }

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  const resendPayload = await resendResponse.json();
  if (!resendResponse.ok) {
    throw new Error(resendPayload?.message || resendPayload?.error || "Resend request failed.");
  }

  return true;
}

async function notifyInquirySaved({ name, email, organization, interest, message, source, inquiryId, aiSummary, aiNextStep }) {
  try {
    await sendNotificationEmail({
      subject: `SkillNest inquiry #${inquiryId}: ${interest}`,
      text:
        `A new SkillNest inquiry was saved.\n\n` +
        `Inquiry ID: ${inquiryId}\n` +
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Organization: ${organization || "Not provided"}\n` +
        `Interest: ${interest}\n` +
        `Source: ${source}\n\n` +
        `AI Summary: ${aiSummary || "Not generated"}\n` +
        `AI Next Step: ${aiNextStep || "Not generated"}\n\n` +
        `Message:\n${message}`,
      html:
        `<h2>New SkillNest inquiry</h2>` +
        `<p><strong>Inquiry ID:</strong> ${inquiryId}</p>` +
        `<p><strong>Name:</strong> ${name}</p>` +
        `<p><strong>Email:</strong> ${email}</p>` +
        `<p><strong>Organization:</strong> ${organization || "Not provided"}</p>` +
        `<p><strong>Interest:</strong> ${interest}</p>` +
        `<p><strong>Source:</strong> ${source}</p>` +
        `<p><strong>AI Summary:</strong> ${aiSummary || "Not generated"}</p>` +
        `<p><strong>AI Next Step:</strong> ${aiNextStep || "Not generated"}</p>` +
        `<p><strong>Message:</strong><br>${message.replace(/\n/g, "<br>")}</p>`,
    });
  } catch (error) {
    console.error("Inquiry notification failed:", error);
  }
}

async function notifyLeadSaved({ name, contact, learnerType, interest, leadId, status, aiSummary, aiNextStep }) {
  try {
    await sendNotificationEmail({
      subject: `SkillNest chatbot lead #${leadId}: ${interest}`,
      text:
        `A new chatbot lead was saved.\n\n` +
        `Lead ID: ${leadId}\n` +
        `Name: ${name}\n` +
        `Contact: ${contact}\n` +
        `Learner Type: ${learnerType}\n` +
        `Interest: ${interest}\n` +
        `Status: ${status}\n` +
        `AI Summary: ${aiSummary || "Not generated"}\n` +
        `AI Next Step: ${aiNextStep || "Not generated"}`,
      html:
        `<h2>New SkillNest chatbot lead</h2>` +
        `<p><strong>Lead ID:</strong> ${leadId}</p>` +
        `<p><strong>Name:</strong> ${name}</p>` +
        `<p><strong>Contact:</strong> ${contact}</p>` +
        `<p><strong>Learner Type:</strong> ${learnerType}</p>` +
        `<p><strong>Interest:</strong> ${interest}</p>` +
        `<p><strong>Status:</strong> ${status}</p>` +
        `<p><strong>AI Summary:</strong> ${aiSummary || "Not generated"}</p>` +
        `<p><strong>AI Next Step:</strong> ${aiNextStep || "Not generated"}</p>`,
    });
  } catch (error) {
    console.error("Lead notification failed:", error);
  }
}

function extractEmailAddress(value) {
  const text = String(value || "").trim();
  return text.includes("@") ? text : "";
}

async function sendAutomatedFollowup({ to, subject, body }) {
  if (!to || !subject || !body) {
    return false;
  }

  try {
    await sendTransactionalEmail({
      to,
      subject,
      text: body,
      html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
    });
    return true;
  } catch (error) {
    console.error("Automated follow-up failed:", error);
    return false;
  }
}

async function callGemini({ instructions, contents }) {
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: instructions }],
        },
        contents,
      }),
    }
  );

  const payload = await geminiResponse.json();

  if (!geminiResponse.ok) {
    throw new Error(payload?.error?.message || "Gemini request failed.");
  }

  return extractGeminiText(payload) || "";
}

async function generateInquiryAutomation({ name, organization, interest, message }) {
  if (!GEMINI_API_KEY) {
    return { aiScore: 0, aiSummary: "", aiNextStep: "", aiFollowupSubject: "", aiFollowupBody: "" };
  }

  const output = await callGemini({
    instructions:
      "You are SkillNest's internal AI intake assistant. " +
      "Summarize incoming inquiries for admins. " +
      "Return exactly these lines: SCORE: ..., SUMMARY: ..., NEXT_STEP: ..., FOLLOWUP_SUBJECT: ..., FOLLOWUP_BODY: ... " +
      "Use an integer score from 1 to 100. " +
      "Keep summary and next step concise, practical, and actionable. " +
      "The follow-up should be a short email body from SkillNest that warmly guides the learner to the best next step. " +
      "Do not invent details.",
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Name: ${name}\n` +
              `Organization: ${organization || "Not provided"}\n` +
              `Interest: ${interest}\n` +
              `Message: ${message}\n`,
          },
        ],
      },
    ],
  });

  const scoreMatch = output.match(/SCORE:\s*(\d+)/i);
  const summaryMatch = output.match(/SUMMARY:\s*(.+)/i);
  const nextStepMatch = output.match(/NEXT_STEP:\s*(.+)/i);
  const subjectMatch = output.match(/FOLLOWUP_SUBJECT:\s*(.+)/i);
  const bodyMatch = output.match(/FOLLOWUP_BODY:\s*([\s\S]*)$/i);

  return {
    aiScore: Number(scoreMatch?.[1] || 0),
    aiSummary: summaryMatch?.[1]?.trim() || "",
    aiNextStep: nextStepMatch?.[1]?.trim() || "",
    aiFollowupSubject: subjectMatch?.[1]?.trim() || "",
    aiFollowupBody: bodyMatch?.[1]?.trim() || "",
  };
}

async function generateLeadAutomation({ name, learnerType, interest, contact }) {
  if (!GEMINI_API_KEY) {
    return { aiScore: 0, aiSummary: "", aiNextStep: "", aiFollowupSubject: "", aiFollowupBody: "" };
  }

  const output = await callGemini({
    instructions:
      "You are SkillNest's internal AI lead triage assistant. " +
      "Summarize a lead and recommend the best next step for the SkillNest team. " +
      "Return exactly these lines: SCORE: ..., SUMMARY: ..., NEXT_STEP: ..., FOLLOWUP_SUBJECT: ..., FOLLOWUP_BODY: ... " +
      "Use an integer score from 1 to 100. " +
      "Keep the advice actionable and short. " +
      "The follow-up should be a short outreach email from SkillNest that matches the lead's learner type and interest. " +
      "Do not invent fees, dates, or commitments.",
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Name: ${name}\n` +
              `Learner type: ${learnerType}\n` +
              `Interest: ${interest}\n` +
              `Contact: ${contact}\n`,
          },
        ],
      },
    ],
  });

  const scoreMatch = output.match(/SCORE:\s*(\d+)/i);
  const summaryMatch = output.match(/SUMMARY:\s*(.+)/i);
  const nextStepMatch = output.match(/NEXT_STEP:\s*(.+)/i);
  const subjectMatch = output.match(/FOLLOWUP_SUBJECT:\s*(.+)/i);
  const bodyMatch = output.match(/FOLLOWUP_BODY:\s*([\s\S]*)$/i);

  return {
    aiScore: Number(scoreMatch?.[1] || 0),
    aiSummary: summaryMatch?.[1]?.trim() || "",
    aiNextStep: nextStepMatch?.[1]?.trim() || "",
    aiFollowupSubject: subjectMatch?.[1]?.trim() || "",
    aiFollowupBody: bodyMatch?.[1]?.trim() || "",
  };
}

async function generateWorkshopAutomation({ title, type, description, scheduleText, durationText, levelText }) {
  if (!GEMINI_API_KEY) {
    return {
      aiWorkshopDescription: "",
      aiAnnouncement: "",
      aiSocialPosts: "",
    };
  }

  const output = await callGemini({
    instructions:
      "You are SkillNest's internal AI marketing assistant. " +
      "Create ready-to-use marketing assets for a workshop. " +
      "Return exactly these sections: WORKSHOP_DESCRIPTION:, ANNOUNCEMENT:, SOCIAL_POSTS:. " +
      "Keep it polished and practical. " +
      "Do not invent prices, venues, or extra details not provided.",
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Title: ${title}\n` +
              `Type: ${type}\n` +
              `Description: ${description}\n` +
              `Schedule: ${scheduleText}\n` +
              `Duration: ${durationText}\n` +
              `Level: ${levelText}\n` +
              `Brand: SkillNest, Pune, Maharashtra. Knowledge is the power.\n`,
          },
        ],
      },
    ],
  });

  const descriptionMatch = output.match(/WORKSHOP_DESCRIPTION:\s*([\s\S]*?)ANNOUNCEMENT:/i);
  const announcementMatch = output.match(/ANNOUNCEMENT:\s*([\s\S]*?)SOCIAL_POSTS:/i);
  const socialMatch = output.match(/SOCIAL_POSTS:\s*([\s\S]*)$/i);

  return {
    aiWorkshopDescription: descriptionMatch?.[1]?.trim() || "",
    aiAnnouncement: announcementMatch?.[1]?.trim() || "",
    aiSocialPosts: socialMatch?.[1]?.trim() || "",
  };
}

async function handleChat(request, response) {
  try {
    if (!GEMINI_API_KEY) {
      sendJson(response, 500, {
        error:
          "GEMINI_API_KEY is not set. Add it to your environment before starting the local server.",
      });
      return;
    }

    const body = await parseJsonBody(request);
    const sessionId = String(body.sessionId || "anonymous").trim();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const latestUserMessage = String(body.message || "").trim();
    const chatMode = String(body.mode || "default").trim().toLowerCase();

    if (!messages.length || !latestUserMessage) {
      sendJson(response, 400, { error: "A session, history, and latest message are required." });
      return;
    }

    const baseInstructions =
      "You are SkillNest AI, the admissions and learner guidance assistant for SkillNest in Pune, Maharashtra. " +
      "SkillNest offers Cloud, Data Analysis, AI, and Cybersecurity trainings plus free and paid workshops. " +
      "Primary audience: college students, freshers, early professionals, and knowledge seekers. " +
      "Keep replies concise, warm, practical, and conversion-aware. " +
      "Do not invent prices, schedules, certifications, job guarantees, or promises that are not provided. " +
      "If asked for location, say SkillNest is based in Pune, Maharashtra. " +
      "If asked who SkillNest is for, mention college students, freshers, early professionals, and knowledge seekers. " +
      "When a user shows buying intent, wants to enroll, asks for dates, fees, next batch, or deeper details not present in site context, tell them to contact SkillNest directly at phone 9284543320, email nileshdgaikwad8805@gmail.com, or WhatsApp.";

    const counselorInstructions =
      baseInstructions +
      " You are acting as a smart counselor. " +
      "Read the learner profile in the conversation carefully and recommend the single best starting path. " +
      "Use the learner's stage, interest area, and goal to choose between a free workshop, paid workshop, or full training track. " +
      "Briefly explain why that recommendation fits them, then mention one logical next alternative. " +
      "End with a soft next step toward Contact or WhatsApp.";

    const defaultInstructions =
      baseInstructions +
      " Your job is to guide visitors toward the right training or workshop, answer clearly, and help convert interest into inquiry. " +
      "When a user seems unsure, recommend the best starting option based on their stage. " +
      "End high-intent replies with a soft call to action such as inviting the learner to use Contact or WhatsApp.";

    const contents = messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content || "") }],
    }));

    const reply =
      (await callGemini({
        instructions: chatMode === "counselor" ? counselorInstructions : defaultInstructions,
        contents,
      })) || "I could not generate a reply right now. Please try again.";

    insertChatMessage.run(sessionId, "user", latestUserMessage);
    insertChatMessage.run(sessionId, "assistant", reply);

    sendJson(response, 200, {
      reply,
      model: GEMINI_MODEL,
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

async function handleAdminAiContent(request, response) {
  const session = requireAdmin(request, response);
  if (!session) {
    return;
  }

  try {
    if (!GEMINI_API_KEY) {
      sendJson(response, 500, { error: "GEMINI_API_KEY is not configured." });
      return;
    }

    const body = await parseJsonBody(request);
    const format = String(body.format || "").trim();
    const topic = String(body.topic || "").trim();
    const audience = String(body.audience || "").trim();
    const goal = String(body.goal || "").trim();
    const tone = String(body.tone || "professional").trim();

    if (!format || !topic || !audience || !goal) {
      sendJson(response, 400, { error: "Format, topic, audience, and goal are required." });
      return;
    }

    const instructions =
      "You are SkillNest's internal AI content assistant for admins. " +
      "Generate polished marketing content for a training brand in Pune offering Cloud, Data Analysis, AI, Cybersecurity, and workshop-based learning. " +
      "Write in a premium, practical, human tone. " +
      "Keep the output ready to use, specific, and clear. " +
      "Do not invent dates, fees, workshop seats, certifications, outcomes, or client names that were not provided. " +
      "If needed, use placeholders like [add date] or [add venue]. " +
      "Return only the requested content, with light formatting. " +
      "If format is workshop_description, produce a title, short intro, 4 bullet highlights, who it is for, and a CTA. " +
      "If format is announcement, produce a short promotional announcement suitable for website or WhatsApp broadcast. " +
      "If format is social_post, produce 3 distinct social post drafts with short captions and CTA lines.";

    const prompt =
      `Format: ${format}\n` +
      `Topic: ${topic}\n` +
      `Audience: ${audience}\n` +
      `Goal: ${goal}\n` +
      `Tone: ${tone}\n` +
      `Brand message: Knowledge is the power.\n` +
      `Location: Pune, Maharashtra.\n`;

    const output = await callGemini({
      instructions,
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    sendJson(response, 200, { success: true, output });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unable to generate AI content.",
    });
  }
}

async function handleContactInquiry(request, response) {
  try {
    const body = await parseJsonBody(request);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const organization = String(body.organization || "").trim();
    const interest = String(body.interest || "").trim();
    const message = String(body.message || "").trim();
    const source = String(body.source || "contact_form").trim();

    if (!name || !email || !interest || !message) {
      sendJson(response, 400, {
        error: "Name, email, interest, and message are required.",
      });
      return;
    }

    const { aiScore, aiSummary, aiNextStep, aiFollowupSubject, aiFollowupBody } = await generateInquiryAutomation({
      name,
      organization,
      interest,
      message,
    });

    const aiFollowupSent = (await sendAutomatedFollowup({
      to: email,
      subject: aiFollowupSubject,
      body: aiFollowupBody,
    }))
      ? 1
      : 0;

    const result = insertInquiry.run(
      name,
      email,
      organization,
      interest,
      message,
      source,
      aiScore,
      aiSummary,
      aiNextStep,
      aiFollowupSubject,
      aiFollowupBody,
      aiFollowupSent
    );
    const inquiryId = Number(result.lastInsertRowid);

    await notifyInquirySaved({
      name,
      email,
      organization,
      interest,
      message,
      source,
      inquiryId,
      aiSummary,
      aiNextStep,
    });

    sendJson(response, 201, {
      success: true,
      inquiryId,
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

async function handleLeadCapture(request, response) {
  try {
    const body = await parseJsonBody(request);
    const sessionId = String(body.sessionId || "").trim();
    const name = String(body.name || "").trim();
    const contact = String(body.contact || "").trim();
    const learnerType = String(body.learnerType || "").trim();
    const interest = String(body.interest || "").trim();
    const status = "new";
    const notes = "";

    if (!name || !contact || !learnerType || !interest) {
      sendJson(response, 400, {
        error: "Name, contact, learner type, and interest are required.",
      });
      return;
    }

    const { aiScore, aiSummary, aiNextStep, aiFollowupSubject, aiFollowupBody } = await generateLeadAutomation({
      name,
      learnerType,
      interest,
      contact,
    });

    const leadEmail = extractEmailAddress(contact);
    const aiFollowupSent = (await sendAutomatedFollowup({
      to: leadEmail,
      subject: aiFollowupSubject,
      body: aiFollowupBody,
    }))
      ? 1
      : 0;
    const computedStatus = aiFollowupSent ? "contacted" : status;

    const result = insertLead.run(
      sessionId,
      name,
      contact,
      learnerType,
      interest,
      computedStatus,
      notes,
      aiScore,
      aiSummary,
      aiNextStep,
      aiFollowupSubject,
      aiFollowupBody,
      aiFollowupSent
    );
    const leadId = Number(result.lastInsertRowid);

    await notifyLeadSaved({
      name,
      contact,
      learnerType,
      interest,
      leadId,
      status: computedStatus,
      aiSummary,
      aiNextStep,
    });

    sendJson(response, 201, {
      success: true,
      leadId,
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

function handleAdminOverview(request, response) {
  const session = requireAdmin(request, response);
  if (!session) {
    return;
  }

  try {
    sendJson(response, 200, {
      session: {
        username: session.username,
      },
      counts: {
        inquiries: selectInquiryCount.get().count,
        leads: selectLeadCount.get().count,
        chatMessages: selectChatCount.get().count,
        workshops: selectWorkshopCount.get().count,
      },
      notifications: {
        enabled: resendConfigured,
        recipient: NOTIFY_EMAIL_TO || "Not configured",
      },
      inquiries: selectRecentInquiries.all(),
      leads: selectRecentLeads.all(),
      chatMessages: selectRecentChats.all(),
      workshops: selectWorkshops.all(),
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

async function handleAdminLogin(request, response) {
  try {
    const body = await parseJsonBody(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    const adminUser = selectAdminUser.get();

    if (!adminUser || adminUser.username !== username || !verifyPassword(password, adminUser.password_hash)) {
      sendJson(response, 401, { error: "Invalid admin credentials." });
      return;
    }

    const token = crypto.randomUUID();
    adminSessions.set(token, {
      id: adminUser.id,
      username: adminUser.username,
      createdAt: Date.now(),
    });

    sendJson(
      response,
      200,
      { success: true, username: adminUser.username, token },
      {
        "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`,
      }
    );
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

function handleAdminLogout(request, response) {
  const authorization = request.headers.authorization || "";
  const headerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const cookies = parseCookies(request);
  const token = headerToken || cookies[SESSION_COOKIE];
  if (token) {
    adminSessions.delete(token);
  }

  sendJson(
    response,
    200,
    { success: true },
    {
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`,
    }
  );
}

function handleAdminSession(request, response) {
  const session = getAdminSession(request);
  if (!session) {
    sendJson(response, 401, { authenticated: false });
    return;
  }

  sendJson(response, 200, {
    authenticated: true,
    username: session.username,
  });
}

async function handleAdminChangePassword(request, response) {
  const session = requireAdmin(request, response);
  if (!session) {
    return;
  }

  try {
    const body = await parseJsonBody(request);
    const currentPassword = String(body.currentPassword || "").trim();
    const newPassword = String(body.newPassword || "").trim();
    const confirmPassword = String(body.confirmPassword || "").trim();
    const adminUser = selectAdminUser.get();

    if (!adminUser || adminUser.id !== session.id) {
      sendJson(response, 401, { error: "Admin session is invalid." });
      return;
    }

    if (!verifyPassword(currentPassword, adminUser.password_hash)) {
      sendJson(response, 400, { error: "Current password is incorrect." });
      return;
    }

    if (newPassword.length < 8) {
      sendJson(response, 400, { error: "New password must be at least 8 characters." });
      return;
    }

    if (newPassword !== confirmPassword) {
      sendJson(response, 400, { error: "New password and confirm password must match." });
      return;
    }

    updateAdminPassword.run(createPasswordHash(newPassword), adminUser.id);
    sendJson(response, 200, { success: true });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

function handleWorkshopList(_request, response) {
  sendJson(response, 200, {
    workshops: selectPublicWorkshops.all(),
  });
}

async function handleAdminWorkshopCreate(request, response) {
  if (!requireAdmin(request, response)) {
    return;
  }

  try {
    const body = await parseJsonBody(request);
    const title = String(body.title || "").trim();
    const type = String(body.type || "").trim();
    const description = String(body.description || "").trim();
    const scheduleText = String(body.scheduleText || "").trim();
    const durationText = String(body.durationText || "").trim();
    const levelText = String(body.levelText || "").trim();
    const ctaText = String(body.ctaText || "").trim();
    const ctaLink = String(body.ctaLink || "").trim() || "contact.html";
    const isActive = body.isActive ? 1 : 0;

    if (!title || !type || !description || !scheduleText || !durationText || !levelText || !ctaText) {
      sendJson(response, 400, { error: "All workshop fields are required." });
      return;
    }

    const aiAssets = await generateWorkshopAutomation({
      title,
      type,
      description,
      scheduleText,
      durationText,
      levelText,
    });

    const result = insertWorkshop.run(
      title,
      type,
      description,
      scheduleText,
      durationText,
      levelText,
      ctaText,
      ctaLink,
      aiAssets.aiWorkshopDescription,
      aiAssets.aiAnnouncement,
      aiAssets.aiSocialPosts,
      isActive
    );

    sendJson(response, 201, {
      success: true,
      workshopId: Number(result.lastInsertRowid),
    });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

async function handleAdminWorkshopUpdate(request, response, workshopId) {
  if (!requireAdmin(request, response)) {
    return;
  }

  try {
    const body = await parseJsonBody(request);
    const title = String(body.title || "").trim();
    const type = String(body.type || "").trim();
    const description = String(body.description || "").trim();
    const scheduleText = String(body.scheduleText || "").trim();
    const durationText = String(body.durationText || "").trim();
    const levelText = String(body.levelText || "").trim();
    const ctaText = String(body.ctaText || "").trim();
    const ctaLink = String(body.ctaLink || "").trim() || "contact.html";
    const isActive = body.isActive ? 1 : 0;

    if (!title || !type || !description || !scheduleText || !durationText || !levelText || !ctaText) {
      sendJson(response, 400, { error: "All workshop fields are required." });
      return;
    }

    const existingWorkshop = selectWorkshopById.get(workshopId);
    if (!existingWorkshop) {
      sendJson(response, 404, { error: "Workshop not found." });
      return;
    }

    const aiAssets = await generateWorkshopAutomation({
      title,
      type,
      description,
      scheduleText,
      durationText,
      levelText,
    });

    updateWorkshop.run(
      title,
      type,
      description,
      scheduleText,
      durationText,
      levelText,
      ctaText,
      ctaLink,
      aiAssets.aiWorkshopDescription,
      aiAssets.aiAnnouncement,
      aiAssets.aiSocialPosts,
      isActive,
      workshopId
    );

    sendJson(response, 200, { success: true });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

function handleAdminWorkshopDelete(request, response, workshopId) {
  if (!requireAdmin(request, response)) {
    return;
  }

  try {
    deleteWorkshop.run(workshopId);
    sendJson(response, 200, { success: true });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

async function handleAdminLeadUpdate(request, response, leadId) {
  if (!requireAdmin(request, response)) {
    return;
  }

  try {
    const body = await parseJsonBody(request);
    const status = String(body.status || "").trim().toLowerCase();
    const notes = String(body.notes || "").trim();
    const allowedStatuses = ["new", "contacted", "qualified", "enrolled", "closed"];

    if (!allowedStatuses.includes(status)) {
      sendJson(response, 400, { error: "Invalid lead status." });
      return;
    }

    updateLeadStatus.run(status, notes, leadId);
    sendJson(response, 200, { success: true });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

async function handleAdminTestEmail(request, response) {
  if (!requireAdmin(request, response)) {
    return;
  }

  try {
    if (!resendConfigured) {
      sendJson(response, 400, {
        error: "Email notifications are not configured yet. Add Resend settings to .env first.",
      });
      return;
    }

    await sendNotificationEmail({
      subject: "SkillNest notification test",
      text:
        "This is a SkillNest test email. Gmail SMTP is configured correctly if you received this message.",
      html:
        "<h2>SkillNest notification test</h2><p>Gmail SMTP is configured correctly if you received this message.</p>",
    });

    sendJson(response, 200, { success: true });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}

function handleCsvExport(request, response, kind) {
  if (!requireAdmin(request, response)) {
    return;
  }

  const rows =
    kind === "inquiries"
      ? selectRecentInquiries.all()
      : kind === "leads"
        ? selectRecentLeads.all()
        : selectWorkshops.all();

  const csv = toCsv(rows);
  sendText(response, 200, csv, "text/csv; charset=utf-8", {
    "Content-Disposition": `attachment; filename="skillnest-${kind}.csv"`,
  });
}

function serveStatic(request, response, pathname) {
  if (pathname === "/admin.html" && !getAdminSession(request)) {
    response.writeHead(302, { Location: "/admin-login.html" });
    response.end();
    return;
  }

  const filePath = getSafeFilePath(pathname);

  if (!filePath.startsWith(ROOT)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, fileBuffer) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendText(response, 404, "Not found");
        return;
      }

      sendText(response, 500, "Server error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    response.end(fileBuffer);
  });
}

const server = http.createServer((request, response) => {
  applyCors(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const workshopMatch = requestUrl.pathname.match(/^\/api\/admin\/workshops\/(\d+)$/);
  const leadMatch = requestUrl.pathname.match(/^\/api\/admin\/leads\/(\d+)$/);

  if (request.method === "POST" && requestUrl.pathname === "/api/chat") {
    handleChat(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/contact") {
    handleContactInquiry(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/leads") {
    handleLeadCapture(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/login") {
    handleAdminLogin(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/logout") {
    handleAdminLogout(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/change-password") {
    handleAdminChangePassword(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/test-email") {
    handleAdminTestEmail(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/ai-content") {
    handleAdminAiContent(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/session") {
    handleAdminSession(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "skillnest",
      time: new Date().toISOString(),
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/overview") {
    handleAdminOverview(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/workshops") {
    handleWorkshopList(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/workshops") {
    handleAdminWorkshopCreate(request, response);
    return;
  }

  if (workshopMatch && request.method === "PUT") {
    handleAdminWorkshopUpdate(request, response, Number(workshopMatch[1]));
    return;
  }

  if (workshopMatch && request.method === "DELETE") {
    handleAdminWorkshopDelete(request, response, Number(workshopMatch[1]));
    return;
  }

  if (leadMatch && request.method === "PUT") {
    handleAdminLeadUpdate(request, response, Number(leadMatch[1]));
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/export/inquiries.csv") {
    handleCsvExport(request, response, "inquiries");
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/export/leads.csv") {
    handleCsvExport(request, response, "leads");
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/export/workshops.csv") {
    handleCsvExport(request, response, "workshops");
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response, requestUrl.pathname);
    return;
  }

  sendText(response, 405, "Method not allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`SkillNest server running at http://${HOST}:${PORT}`);
  console.log(`Database ready at ${DB_PATH}`);
});
