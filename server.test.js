import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test, { after, before } from "node:test";
import { getUpdates } from "./updates-client.js?v=2";

let serverProcess;
let baseUrl;

async function unusedPort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        return;
      }
    } catch {
      await delay(100);
    }
  }
  throw new Error("Test server did not start.");
}

before(async () => {
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  await waitForServer();
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
    await once(serverProcess, "exit");
  }
});

test("all school pages are public and the local updates list loads", async () => {
  for (const pathname of ["/", "/index.html", "/school-site.html", "/school-updates.html"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 200, `${pathname} should be public`);
  }
  assert.deepEqual(getUpdates(), []);
});

test("account and publishing endpoints are removed", async () => {
  for (const pathname of [
    "/api/me",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/logout",
    "/api/updates",
    "/auth/google",
    "/auth/google/callback"
  ]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 404, `${pathname} should not be available`);
  }

  const publishResponse = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "غير مسموح", content: "لا يوجد نشر من الموقع." })
  });
  assert.equal(publishResponse.status, 404);
});

test("updates page offers local announcement creation without accounts or remote publishing", async () => {
  const response = await fetch(`${baseUrl}/school-updates.html`);
  const html = await response.text();
  assert.doesNotMatch(html, /login-form|register-form|auth-card|teacher-panel|logout-button|google-login-link/);
  assert.match(html, /id="show-announcement-form"/);
  assert.match(html, /id="announcement-form"/);
  assert.match(html, /contenteditable="true"/);
  assert.match(html, /id="announcement-color"/);
  assert.match(html, /id="announcement-size"/);
  assert.match(html, /id="add-announcement-link"/);
  assert.match(html, /id="choose-announcement-image"/);
  assert.match(html, /سيُحفظ الإعلان في هذا المتصفح فقط/);
  assert.match(html, /<script src="school-updates\.js\?v=4" type="module"><\/script>/);

  const script = await fetch(`${baseUrl}/school-updates.js`);
  const clientScript = await script.text();
  assert.match(clientScript, /getUpdates/);
  assert.match(clientScript, /getSavedAnnouncements/);
  assert.match(clientScript, /initializeAnnouncementEditor/);
  assert.match(clientScript, /renderAnnouncement/);
  assert.doesNotMatch(clientScript, /fetch\s*\(/);
  assert.doesNotMatch(clientScript, /\/api\/auth|\/api\/updates",\s*\{\s*method:\s*"POST"/);

  const homePage = await fetch(`${baseUrl}/`);
  const homeHtml = await homePage.text();
  assert.match(homeHtml, /<script type="module" src="index\.js\?v=6"><\/script>/);
  assert.match(homeHtml, /جوجل كلاس روم/);
  assert.match(homeHtml, /id="notifications"/);
  assert.match(homeHtml, /لوحة الإعلانات/);
  assert.match(homeHtml, /id="show-announcement-form"/);
  assert.match(homeHtml, /id="announcement-form"/);
  assert.match(homeHtml, /contenteditable="true"/);
  assert.match(homeHtml, /id="announcement-color"/);
  assert.match(homeHtml, /id="announcement-size"/);
  assert.match(homeHtml, /id="add-announcement-link"/);
  assert.match(homeHtml, /id="choose-announcement-image"/);
  assert.doesNotMatch(homeHtml, /<script>([\s\S]*?)<\/script>/);
  assert.doesNotMatch(homePage.headers.get("content-security-policy"), /script-src[^;]*unsafe-inline/);
  assert.match(homePage.headers.get("content-security-policy"), /img-src 'self' data:/);

  const homeScript = await fetch(`${baseUrl}/index.js`);
  assert.equal(homeScript.status, 200);
  const homeClientScript = await homeScript.text();
  assert.match(homeClientScript, /getUpdates/);
  assert.match(homeClientScript, /content\.textContent = update\.content/);
  assert.match(homeClientScript, /initializeAnnouncementEditor/);
  assert.doesNotMatch(homeClientScript, /innerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(homeClientScript, /fetch\s*\(/);

  const editorModule = await fetch(`${baseUrl}/announcement-editor.js`);
  assert.equal(editorModule.status, 200);
  const editorScript = await editorModule.text();
  assert.match(editorScript, /noopener noreferrer/);
  assert.match(editorScript, /data:image\\\/\(\?:png\|jpeg\|gif\|webp\);base64,/);
  assert.match(editorScript, /applyStyle/);
  assert.match(editorScript, /add-announcement-link/);
  assert.match(editorScript, /saveAnnouncement/);
  assert.doesNotMatch(editorScript, /innerHTML|insertAdjacentHTML|fetch\s*\(/);

  const storageModule = await fetch(`${baseUrl}/announcement-storage.js`);
  assert.equal(storageModule.status, 200);
  const storageScript = await storageModule.text();
  assert.match(storageScript, /localStorage/);
  assert.match(storageScript, /noopener noreferrer/);
  assert.doesNotMatch(storageScript, /innerHTML|insertAdjacentHTML|fetch\s*\(/);

  const updatesClient = await fetch(`${baseUrl}/updates-client.js`);
  assert.equal(updatesClient.status, 200);

  const updatesData = await fetch(`${baseUrl}/updates-data.js`);
  assert.equal(updatesData.status, 200);
  assert.match(await updatesData.text(), /export const updates = \[\]/);
  assert.doesNotMatch(clientScript, /fetch\s*\(/);
  assert.doesNotMatch(homeClientScript, /fetch\s*\(/);
  assert.doesNotMatch(editorScript, /fetch\s*\(/);
});
