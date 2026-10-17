import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { announcementCategories } from "./announcement-categories.js";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const port = Number(process.env.PORT || 3000);
const sessionDuration = 8 * 60 * 60 * 1000;
const sessionCookie = "nahrawan_admin_session";
const cookieSecure = process.env.NODE_ENV === "production";
const announcementsFile = path.resolve(process.env.ANNOUNCEMENTS_FILE ||
  path.join(rootDirectory, "data", "announcements.json"));
const updatesFile = path.resolve(process.env.UPDATES_FILE ||
  path.join(rootDirectory, "data", "updates.json"));
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;
const authEnabled = Boolean(adminUsername && adminPassword && sessionSecret);
const allowedTags = new Set(["P", "DIV", "BR", "SPAN", "A", "IMG", "B", "STRONG", "I", "EM", "U"]);
const allowedImageWidths = new Set(["25%", "50%", "75%", "100%"]);
const isValidImageDimension = (value) => Number.isInteger(value) && value >= 1 && value <= 2000;
const allowedFontSizes = new Set(["14px", "16px", "20px", "24px", "32px"]);
const imageSourcePattern = /^data:image\/(?:png|jpeg|gif|webp);base64,/i;
const loginAttempts = new Map();
const sessions = new Map();
const writeQueues = new Map();

if (path.resolve(announcementsFile) === path.resolve(updatesFile)) {
  throw new Error("ANNOUNCEMENTS_FILE and UPDATES_FILE must point to different files.");
}
if (process.env.NODE_ENV === "production" && !authEnabled) {
  throw new Error("ADMIN_USERNAME, ADMIN_PASSWORD, and SESSION_SECRET must be configured in production.");
}
if (authEnabled && sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters.");
}
if (authEnabled && (adminUsername.length > 100 || adminPassword.length < 12)) {
  throw new Error("ADMIN_USERNAME must be at most 100 characters and ADMIN_PASSWORD at least 12 characters.");
}
const adminPasswordHash = authEnabled ? scryptSync(adminPassword, sessionSecret, 64) : null;

const app = express();
app.disable("x-powered-by");
app.use((request, response, next) => {
  response.set({
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  });
  next();
});
app.use("/api", (request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "12mb", strict: true }));

function sign(value) {
  return createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function createSession(username) {
  const sessionId = randomBytes(32).toString("base64url");
  sessions.set(sessionId, {
    username,
    expiresAt: Date.now() + sessionDuration
  });
  return `${sessionId}.${sign(sessionId)}`;
}

function getCookie(request, name) {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator !== -1 && cookie.slice(0, separator).trim() === name) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return null;
}

function getAuthenticatedAdmin(request) {
  if (!authEnabled) {
    return null;
  }
  const token = getCookie(request, sessionCookie);
  if (!token) {
    return null;
  }
  const separator = token.lastIndexOf(".");
  if (separator < 1) {
    return null;
  }
  const sessionId = token.slice(0, separator);
  const suppliedSignature = Buffer.from(token.slice(separator + 1));
  const expectedSignature = Buffer.from(sign(sessionId));
  if (suppliedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(suppliedSignature, expectedSignature)) {
    return null;
  }
  const session = sessions.get(sessionId);
  if (!session || session.username !== adminUsername || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session.username;
}

function requireAdmin(request, response, next) {
  if (!getAuthenticatedAdmin(request)) {
    response.status(authEnabled ? 401 : 503).json({
      error: authEnabled ? "يلزم تسجيل دخول الإدارة للنشر." : "تسجيل الدخول غير مهيأ على الخادم."
    });
    return;
  }
  next();
}

function validateContent(content) {
  let nodeCount = 0;
  function validateNode(item, depth) {
    nodeCount += 1;
    if (nodeCount > 5000 || depth > 30 || !item || typeof item !== "object" || Array.isArray(item)) {
      return false;
    }
    if (item.type === "text") {
      return typeof item.value === "string" && item.value.length <= 1000000;
    }
    if (item.type !== "element" || !allowedTags.has(item.tag) ||
        !item.attributes || typeof item.attributes !== "object" || Array.isArray(item.attributes) ||
        !Array.isArray(item.children)) {
      return false;
    }
    if (item.tag === "A") {
      try {
        const url = new URL(item.attributes.href);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return false;
        }
      } catch {
        return false;
      }
    } else if (item.tag === "IMG") {
      if (typeof item.attributes.src !== "string" || !imageSourcePattern.test(item.attributes.src) ||
          item.attributes.src.length > 8 * 1024 * 1024 ||
          typeof item.attributes.alt !== "string" || item.attributes.alt.length > 200 ||
          (item.attributes.width !== undefined && !allowedImageWidths.has(item.attributes.width)) ||
          (item.attributes.widthPx !== undefined && !isValidImageDimension(item.attributes.widthPx)) ||
          (item.attributes.heightPx !== undefined && !isValidImageDimension(item.attributes.heightPx))) {
        return false;
      }
    } else if (item.tag === "SPAN") {
      if (item.attributes.color !== undefined &&
          (typeof item.attributes.color !== "string" || !/^#[0-9a-f]{6}$/i.test(item.attributes.color))) {
        return false;
      }
      if (item.attributes.fontSize !== undefined && !allowedFontSizes.has(item.attributes.fontSize)) {
        return false;
      }
    }
    return item.children.every((child) => validateNode(child, depth + 1));
  }
  return Array.isArray(content) && content.length <= 5000 &&
    content.every((item) => validateNode(item, 0));
}

async function readAnnouncements(file) {
  try {
    const content = await readFile(file, "utf8");
    const announcements = JSON.parse(content);
    if (!Array.isArray(announcements)) {
      throw new Error("ملف الإعلانات لا يحتوي على قائمة صالحة.");
    }
    return announcements;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function appendAnnouncement(file, announcement) {
  return mutateAnnouncements(file, (announcements) => {
    announcements.unshift(announcement);
    return announcement;
  });
}

function updateAnnouncement(file, id, changes) {
  return mutateAnnouncements(file, (announcements) => {
    const index = announcements.findIndex((announcement) => announcement.id === id);
    if (index === -1) {
      return null;
    }
    announcements[index] = {
      ...announcements[index],
      ...changes,
      updated_at: new Date().toISOString()
    };
    return announcements[index];
  });
}

function removeAnnouncement(file, id) {
  return mutateAnnouncements(file, (announcements) => {
    const index = announcements.findIndex((announcement) => announcement.id === id);
    if (index === -1) {
      return false;
    }
    announcements.splice(index, 1);
    return true;
  });
}

function mutateAnnouncements(file, mutate) {
  const writeQueue = writeQueues.get(file) ?? Promise.resolve();
  const operation = writeQueue.then(async () => {
    const announcements = await readAnnouncements(file);
    const result = mutate(announcements);
    if (result === null || result === false) {
      return result;
    }
    await mkdir(path.dirname(file), { recursive: true });
    const temporaryFile = `${file}.${randomBytes(8).toString("hex")}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(announcements), { flag: "wx" });
    await rename(temporaryFile, file);
    return result;
  });
  writeQueues.set(file, operation.catch(() => {}));
  return operation;
}

function normalizeAnnouncement(announcement) {
  return {
    ...announcement,
    urgent: announcement.urgent === true,
    category: announcementCategories.includes(announcement.category) ? announcement.category : "عام"
  };
}

function isSameOrigin(request) {
  const origin = request.get("origin");
  if (!origin) {
    return true;
  }
  try {
    const parsedOrigin = new URL(origin);
    const expectedProtocol = cookieSecure ? "https:" : `${request.protocol}:`;
    return parsedOrigin.host === request.get("host") && parsedOrigin.protocol === expectedProtocol;
  } catch {
    return false;
  }
}

function checkOrigin(request, response, next) {
  if (!isSameOrigin(request)) {
    response.status(403).json({ error: "تعذر التحقق من مصدر الطلب." });
    return;
  }
  next();
}

app.post("/api/auth/login", checkOrigin, (request, response) => {
  const client = request.ip;
  const now = Date.now();
  const attempts = loginAttempts.get(client);
  if (attempts && now - attempts.startedAt < 15 * 60 * 1000 && attempts.count >= 5) {
    response.status(429).json({ error: "محاولات كثيرة. حاول بعد 15 دقيقة." });
    return;
  }
  if (attempts && now - attempts.startedAt >= 15 * 60 * 1000) {
    loginAttempts.delete(client);
  }
  const currentAttempts = loginAttempts.get(client) ?? { startedAt: now, count: 0 };
  const username = typeof request.body?.username === "string" ? request.body.username : "";
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const passwordMatches = authEnabled && password.length <= 1024 &&
    timingSafeEqual(scryptSync(password, sessionSecret, 64), adminPasswordHash);
  if (!authEnabled || username !== adminUsername || !passwordMatches) {
    currentAttempts.count += 1;
    loginAttempts.set(client, currentAttempts);
    response.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." });
    return;
  }
  loginAttempts.delete(client);
  response.cookie(sessionCookie, createSession(adminUsername), {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "strict",
    path: "/",
    maxAge: sessionDuration
  });
  response.json({ authenticated: true, username: adminUsername });
});

app.get("/api/auth/me", (request, response) => {
  const username = getAuthenticatedAdmin(request);
  response.json({ authenticated: Boolean(username), username: username ?? null });
});

app.post("/api/auth/logout", checkOrigin, (request, response) => {
  const token = getCookie(request, sessionCookie);
  const separator = token?.lastIndexOf(".") ?? -1;
  if (authEnabled && separator > 0) {
    const sessionId = token.slice(0, separator);
    const suppliedSignature = Buffer.from(token.slice(separator + 1));
    const expectedSignature = Buffer.from(sign(sessionId));
    if (suppliedSignature.length === expectedSignature.length &&
        timingSafeEqual(suppliedSignature, expectedSignature)) {
      sessions.delete(sessionId);
    }
  }
  response.clearCookie(sessionCookie, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "strict",
    path: "/"
  });
  response.json({ authenticated: false });
});

for (const { endpoint, file } of [
  { endpoint: "announcements", file: announcementsFile },
  { endpoint: "updates", file: updatesFile }
]) {
  app.get(`/api/${endpoint}`, async (request, response, next) => {
    try {
      response.json({ updates: (await readAnnouncements(file)).map(normalizeAnnouncement) });
    } catch (error) {
      next(error);
    }
  });

  app.post(`/api/${endpoint}`, checkOrigin, requireAdmin, async (request, response, next) => {
    try {
      const { title, content, category, urgent } = request.body ?? {};
      if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 100) {
        response.status(400).json({ error: "عنوان الإعلان مطلوب ويجب ألا يتجاوز 100 حرف." });
        return;
      }
      if (urgent !== undefined && typeof urgent !== "boolean") {
        response.status(400).json({ error: "قيمة التنبيه العاجل غير صالحة." });
        return;
      }
      if (category !== undefined && !announcementCategories.includes(category)) {
        response.status(400).json({ error: "تصنيف الإعلان غير صالح." });
        return;
      }
      if (!validateContent(content)) {
        response.status(400).json({ error: "محتوى الإعلان غير صالح." });
        return;
      }
      const announcement = {
        id: randomBytes(16).toString("hex"),
        title: title.trim(),
        category: category ?? "عام",
        urgent: urgent === true,
        created_at: new Date().toISOString(),
        author: adminUsername,
        content
      };
      await appendAnnouncement(file, announcement);
      response.status(201).json({ announcement });
    } catch (error) {
      next(error);
    }
  });

  app.put(`/api/${endpoint}/:id`, checkOrigin, requireAdmin, async (request, response, next) => {
    try {
      const { title, content, category, urgent } = request.body ?? {};
      if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 100) {
        response.status(400).json({ error: "عنوان الإعلان مطلوب ويجب ألا يتجاوز 100 حرف." });
        return;
      }
      if (urgent !== undefined && typeof urgent !== "boolean") {
        response.status(400).json({ error: "قيمة التنبيه العاجل غير صالحة." });
        return;
      }
      if (category !== undefined && !announcementCategories.includes(category)) {
        response.status(400).json({ error: "تصنيف الإعلان غير صالح." });
        return;
      }
      if (!validateContent(content)) {
        response.status(400).json({ error: "محتوى الإعلان غير صالح." });
        return;
      }
      const announcement = await updateAnnouncement(file, request.params.id, {
        title: title.trim(),
        ...(category === undefined ? {} : { category }),
        ...(urgent === undefined ? {} : { urgent }),
        content
      });
      if (!announcement) {
        response.status(404).json({ error: "الإعلان المطلوب غير موجود." });
        return;
      }
      response.json({ announcement });
    } catch (error) {
      next(error);
    }
  });

  app.delete(`/api/${endpoint}/:id`, checkOrigin, requireAdmin, async (request, response, next) => {
    try {
      const deleted = await removeAnnouncement(file, request.params.id);
      if (!deleted) {
        response.status(404).json({ error: "الإعلان المطلوب غير موجود." });
        return;
      }
      response.json({ deleted: true });
    } catch (error) {
      next(error);
    }
  });
}

app.get("/school-updates.html", (request, response) =>
  response.sendFile(path.join(rootDirectory, "school-updates.html")));
app.get("/announcements.html", (request, response) =>
  response.sendFile(path.join(rootDirectory, "announcements.html")));
app.get("/admin.html", (request, response) =>
  response.sendFile(path.join(rootDirectory, "admin.html")));
app.get("/admin.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "admin.js")));
app.get("/school-updates.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "school-updates.js")));
app.get("/auth-client.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "auth-client.js")));
app.get("/index.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "index.js")));
app.get("/announcement-editor.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "announcement-editor.js")));
app.get("/announcement-storage.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "announcement-storage.js")));
app.get("/announcement-categories.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "announcement-categories.js")));
app.get("/announcement-management.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "announcement-management.js")));
app.get("/announcement-filter.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "announcement-filter.js")));
app.get("/updates-client.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "updates-client.js")));
app.get("/updates-data.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "updates-data.js")));
app.get("/theme.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "theme.js")));
app.get("/theme.css", (request, response) =>
  response.sendFile(path.join(rootDirectory, "theme.css")));
app.get("/", (request, response) => response.sendFile(path.join(rootDirectory, "index.html")));
app.get("/index.html", (request, response) => response.sendFile(path.join(rootDirectory, "index.html")));
app.get("/school-site.html", (request, response) =>
  response.sendFile(path.join(rootDirectory, "school-site.html")));
app.use("/assets", express.static(path.join(rootDirectory, "assets"), {
  dotfiles: "deny",
  immutable: true,
  maxAge: "1d"
}));

app.use((request, response) => {
  if (request.path.startsWith("/api/")) {
    return response.status(404).json({ error: "المسار المطلوب غير موجود." });
  }
  response.status(404).send("الصفحة غير موجودة.");
});

app.use((error, request, response, next) => {
  console.error("Request failed:", error);
  if (response.headersSent) {
    return next(error);
  }
  if (error.status === 400) {
    return response.status(400).json({ error: "بيانات الطلب غير صالحة." });
  }
  if (error.status === 413) {
    return response.status(413).json({ error: "حجم الطلب أكبر من المسموح." });
  }
  response.status(500).json({ error: "حدث خطأ في الخادم. حاول مرة أخرى لاحقاً." });
});

app.listen(port, host, () => {
  console.log(`School website server is running at http://${host}:${port}`);
  if (!authEnabled) {
    console.warn("Admin login is disabled. Configure ADMIN_USERNAME, ADMIN_PASSWORD, and SESSION_SECRET.");
  }
});
