import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

const app = express();
const port = Number(process.env.PORT || 3000);

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
app.get("/school-updates.html", (request, response) =>
  response.sendFile(path.join(rootDirectory, "school-updates.html")));
app.get("/school-updates.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "school-updates.js")));
app.get("/index.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "index.js")));
app.get("/announcement-editor.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "announcement-editor.js")));
app.get("/announcement-storage.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "announcement-storage.js")));
app.get("/updates-client.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "updates-client.js")));
app.get("/updates-data.js", (request, response) =>
  response.sendFile(path.join(rootDirectory, "updates-data.js")));
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
  response.status(500).json({ error: "حدث خطأ في الخادم. حاول مرة أخرى لاحقاً." });
});

app.listen(port, host, () => {
  console.log(`School website server is running at http://${host}:${port}`);
});
