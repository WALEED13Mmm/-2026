import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test, { after, before } from "node:test";
import { filterAnnouncements } from "./announcement-filter.js";
import { colorToHex } from "./announcement-storage.js";

let serverProcess;
let baseUrl;
let announcementFile;
let updatesFile;

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

async function login(username = "school-admin", password = "test-admin-password") {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl
    },
    body: JSON.stringify({ username, password })
  });
  return response;
}

before(async () => {
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  announcementFile = path.join(os.tmpdir(), `nahrawan-test-${process.pid}-${port}.json`);
  updatesFile = path.join(os.tmpdir(), `nahrawan-updates-test-${process.pid}-${port}.json`);
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      ADMIN_USERNAME: "school-admin",
      ADMIN_PASSWORD: "test-admin-password",
      SESSION_SECRET: "test-session-secret-that-is-long-enough-32",
      ANNOUNCEMENTS_FILE: announcementFile,
      UPDATES_FILE: updatesFile
    },
    stdio: "ignore"
  });
  await waitForServer();
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
    await once(serverProcess, "exit");
  }
  if (announcementFile) {
    await rm(announcementFile, { force: true });
  }
  if (updatesFile) {
    await rm(updatesFile, { force: true });
  }
});

test("public pages hide admin login and keep publishing actions gated", async () => {
  for (const pathname of [
    "/",
    "/index.html",
    "/school-site.html",
    "/school-updates.html",
    "/announcements.html",
    "/admin.html"
  ]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 200, `${pathname} should be public`);
  }

  for (const pathname of ["/", "/school-updates.html", "/announcements.html"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    const html = await response.text();
    assert.doesNotMatch(html, /class="admin-access"/, `${pathname} should not expose admin login`);
    assert.doesNotMatch(html, /id="admin-login-form"/, `${pathname} should not expose admin login`);
    assert.doesNotMatch(html, /id="admin-logout"/, `${pathname} should not expose admin logout`);
  }

  for (const pathname of ["/school-updates.html", "/announcements.html"]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    const html = await response.text();
    assert.match(html, /id="show-announcement-form"[^>]*hidden/);
    assert.match(html, /id="announcement-form" hidden/);
    assert.match(html, /id="announcement-search"|id="update-search"/);
    assert.match(html, /id="announcement-filter-category"|id="update-filter-category"/);
    assert.match(html, /id="announcement-category"/);
    assert.match(html, /data-text-format="STRONG"/);
    assert.match(html, /data-text-format="EM"/);
    assert.match(html, /data-text-format="U"/);
    assert.match(html, /id="remove-announcement-formatting"/);
    assert.match(html, /id="announcement-image-width"/);
    assert.match(html, /id="announcement-image-height"/);
    assert.match(html, /id="preserve-image-ratio"/);
    assert.match(html, /id="announcement-urgent"/);
    assert.match(html, /عرض كتنبيه مهم أعلى الصفحة الرئيسية/);
    assert.match(html, /اسحبها لتغيير موضعها/);
    assert.match(html, /\.image-viewer::backdrop/);
    assert.match(html, /id="cancel-announcement-edit"/);
  }

  const schoolUpdatesPage = await fetch(`${baseUrl}/school-updates.html`);
  const schoolUpdatesHtml = await schoolUpdatesPage.text();
  assert.match(schoolUpdatesHtml, /<body data-collection="updates">/);
  assert.match(schoolUpdatesHtml, /id="show-announcement-form"[^>]*>إضافة تعميم<\/button>/);
  assert.match(schoolUpdatesHtml, /سيظهر التعميم في لوحة التعميمات فقط/);
  assert.match(schoolUpdatesHtml, /بحث في التعميمات/);
  assert.match(schoolUpdatesHtml, /image-viewer-close/);

  const adminPage = await fetch(`${baseUrl}/admin.html`);
  const adminHtml = await adminPage.text();
  assert.match(adminHtml, /id="admin-login-form"/);
  assert.match(adminHtml, /id="admin-logout"[^>]*hidden/);
  assert.match(adminHtml, /name="password"/);

  const announcementsPage = await fetch(`${baseUrl}/announcements.html`);
  const announcementsHtml = await announcementsPage.text();
  assert.match(announcementsHtml, /id="announcement-list"|id="update-list"/);
  assert.match(announcementsHtml, /id="announcement-search"|id="update-search"/);
  assert.match(announcementsHtml, /id="announcement-filter-category"|id="update-filter-category"/);
  assert.match(announcementsHtml, /update-content img\[role="button"\]/);

  const homePage = await fetch(`${baseUrl}/`);
  const homeHtml = await homePage.text();
  assert.match(homeHtml, /data-collection="announcements"/);
  assert.match(homeHtml, /id="urgent-announcement-banner"[^>]*hidden/);
  assert.match(homeHtml, /id="announcement-urgent"/);
  assert.match(homeHtml, /id="update-list"/);
  assert.match(homeHtml, /<button[^>]*id="show-announcement-form"[^>]*hidden[^>]*>إضافة إعلان<\/button>/);
  assert.match(homeHtml, /id="announcement-form"/);
  assert.match(homeHtml, /id="update-search"/);
  assert.match(homeHtml, /id="update-filter-category"/);
  assert.doesNotMatch(homeHtml, /عرض الإعلانات في صفحة مستقلة/);
  assert.match(homeHtml, /href="announcements\.html"/);
  assert.match(homeHtml, /href="school-updates\.html"/);

  const authResponse = await fetch(`${baseUrl}/api/auth/me`);
  assert.deepEqual(await authResponse.json(), { authenticated: false, username: null });
  assert.equal(authResponse.headers.get("cache-control"), "no-store");
  const updatesResponse = await fetch(`${baseUrl}/api/updates`);
  assert.deepEqual(await updatesResponse.json(), { updates: [] });
  assert.match(updatesResponse.headers.get("content-security-policy"), /script-src 'self'/);
});

test("theme assets are publicly served for all school pages", async () => {
  for (const [pathname, contentType] of [
    ["/theme.js", "javascript"],
    ["/theme.css", "text/css"],
    ["/admin.js", "javascript"]
  ]) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", new RegExp(contentType));
  }

  const homeResponse = await fetch(`${baseUrl}/`);
  const homeHtml = await homeResponse.text();
  assert.match(homeHtml, /id="admin-menu-trigger"/);
});

test("announcement search matches titles and rich-text content while category filtering stays exact", () => {
  const announcements = [
    { title: "موعد الاختبار", category: "اختبارات", content: [{ type: "text", value: "الأسبوع القادم" }] },
    { title: "نشاط المدرسة", category: "فعاليات", content: [{ type: "text", value: "اختبار للمسرح" }] }
  ];
  assert.deepEqual(filterAnnouncements(announcements, "للمسرح", ""), [announcements[1]]);
  assert.deepEqual(filterAnnouncements(announcements, "اختبار", "اختبارات"), [announcements[0]]);
  assert.deepEqual(filterAnnouncements(announcements, "", "غير موجود"), []);
});

test("rich-text colors survive browser CSS normalization", () => {
  assert.equal(colorToHex("#ff0000"), "#ff0000");
  assert.equal(colorToHex("rgb(255, 0, 128)"), "#ff0080");
  assert.equal(colorToHex("rgba(1, 2, 3, 1)"), "#010203");
  assert.equal(colorToHex("rgba(1, 2, 3, 0.5)"), null);
  assert.equal(colorToHex("rgb(256, 2, 3)"), null);
});

test("anonymous users, invalid credentials, and cross-origin requests cannot publish", async () => {
  const payload = JSON.stringify({ title: "غير مسموح", content: [{ type: "text", value: "اختبار" }] });
  const anonymousResponse = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: payload
  });
  assert.equal(anonymousResponse.status, 401);

  for (const method of ["PUT", "DELETE"]) {
    const response = await fetch(`${baseUrl}/api/updates/not-an-id`, {
      method,
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: method === "PUT" ? JSON.stringify({ title: "تعديل", category: "عام", content: [] }) : undefined
    });
    assert.equal(response.status, 401, `anonymous ${method} requests should be denied`);
  }

  const invalidLogin = await login("school-admin", "wrong-password");
  assert.equal(invalidLogin.status, 401);
  assert.equal(invalidLogin.headers.get("set-cookie"), null);

  const crossOrigin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    body: JSON.stringify({ username: "school-admin", password: "test-admin-password" })
  });
  assert.equal(crossOrigin.status, 403);
});

test("admin login grants server-verified publishing and logout revokes it", async () => {
  const response = await login();
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const sessionCookie = cookie.split(";")[0];

  const sessionResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: sessionCookie }
  });
  assert.deepEqual(await sessionResponse.json(), { authenticated: true, username: "school-admin" });

  const publishResponse = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "إعلان تجريبي",
      category: "اختبارات",
      urgent: true,
      content: [
        { type: "element", tag: "P", attributes: {}, children: [{ type: "text", value: "موعد الاختبار" }] }
      ]
    })
  });
  assert.equal(publishResponse.status, 201);
  const { announcement } = await publishResponse.json();
  assert.equal(announcement.title, "إعلان تجريبي");
  assert.equal(announcement.category, "اختبارات");
  assert.equal(announcement.urgent, true);
  assert.equal(announcement.author, "school-admin");

  const legacyPublish = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "إعلان من نسخة أقدم",
      content: [{ type: "text", value: "محتوى" }]
    })
  });
  assert.equal(legacyPublish.status, 201);
  const { announcement: legacyAnnouncement } = await legacyPublish.json();
  assert.equal(legacyAnnouncement.category, "عام");
  assert.equal(legacyAnnouncement.urgent, false);

  const updatesResponse = await fetch(`${baseUrl}/api/updates`);
  assert.deepEqual((await updatesResponse.json()).updates, [legacyAnnouncement, announcement]);

  const invalidContent = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({ title: "محتوى غير صالح", content: [{ type: "element", tag: "SCRIPT", attributes: {}, children: [] }] })
  });
  assert.equal(invalidContent.status, 400);

  const invalidUrgent = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "قيمة عاجل غير صالحة",
      urgent: "yes",
      content: [{ type: "text", value: "محتوى" }]
    })
  });
  assert.equal(invalidUrgent.status, 400);

  const resizedImagePublish = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "تعميم بصورة مصغرة",
      category: "عام",
      content: [{
        type: "element",
        tag: "IMG",
        attributes: { src: "data:image/png;base64,AA==", alt: "صورة", width: "50%" },
        children: []
      }]
    })
  });
  assert.equal(resizedImagePublish.status, 201);
  const { announcement: resizedImageAnnouncement } = await resizedImagePublish.json();
  assert.equal(resizedImageAnnouncement.content[0].attributes.width, "50%");

  const deleteResizedImage = await fetch(`${baseUrl}/api/updates/${resizedImageAnnouncement.id}`, {
    method: "DELETE",
    headers: { Origin: baseUrl, Cookie: sessionCookie }
  });
  assert.equal(deleteResizedImage.status, 200);

  const customImageDimensions = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "تعميم بصورة بمقاس مخصص",
      category: "عام",
      content: [{
        type: "element",
        tag: "IMG",
        attributes: { src: "data:image/png;base64,AA==", alt: "صورة", widthPx: 640, heightPx: 360 },
        children: []
      }]
    })
  });
  assert.equal(customImageDimensions.status, 201);
  const { announcement: customDimensionAnnouncement } = await customImageDimensions.json();
  assert.equal(customDimensionAnnouncement.content[0].attributes.widthPx, 640);
  assert.equal(customDimensionAnnouncement.content[0].attributes.heightPx, 360);
  const deleteCustomDimensions = await fetch(`${baseUrl}/api/updates/${customDimensionAnnouncement.id}`, {
    method: "DELETE",
    headers: { Origin: baseUrl, Cookie: sessionCookie }
  });
  assert.equal(deleteCustomDimensions.status, 200);

  const invalidImageWidth = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "صورة بعرض غير مسموح",
      category: "عام",
      content: [{
        type: "element",
        tag: "IMG",
        attributes: { src: "data:image/png;base64,AA==", alt: "صورة", width: "500px" },
        children: []
      }]
    })
  });
  assert.equal(invalidImageWidth.status, 400);

  const invalidCategory = await fetch(`${baseUrl}/api/updates/${announcement.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({ title: "تصنيف غير صالح", category: "غير معروف", content: [] })
  });
  assert.equal(invalidCategory.status, 400);

  const editResponse = await fetch(`${baseUrl}/api/updates/${announcement.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "إعلان معدل",
      category: "واجبات",
      urgent: false,
      content: [{ type: "text", value: "تم تغيير موعد التسليم" }]
    })
  });
  assert.equal(editResponse.status, 200);
  const { announcement: edited } = await editResponse.json();
  assert.equal(edited.id, announcement.id);
  assert.equal(edited.title, "إعلان معدل");
  assert.equal(edited.category, "واجبات");
  assert.equal(edited.urgent, false);
  assert.equal(edited.created_at, announcement.created_at);
  assert.ok(edited.updated_at);

  const legacyEdit = await fetch(`${baseUrl}/api/updates/${announcement.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({
      title: "تعديل من نسخة أقدم",
      content: [{ type: "text", value: "المحتوى المعدل" }]
    })
  });
  assert.equal(legacyEdit.status, 200);
  const { announcement: legacyEditedAnnouncement } = await legacyEdit.json();
  assert.equal(legacyEditedAnnouncement.category, "واجبات");

  const unknownEdit = await fetch(`${baseUrl}/api/updates/not-an-id`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({ title: "إعلان", category: "عام", content: [] })
  });
  assert.equal(unknownEdit.status, 404);

  const deleteResponse = await fetch(`${baseUrl}/api/updates/${announcement.id}`, {
    method: "DELETE",
    headers: { Origin: baseUrl, Cookie: sessionCookie }
  });
  assert.equal(deleteResponse.status, 200);
  const deleteLegacyResponse = await fetch(`${baseUrl}/api/updates/${legacyAnnouncement.id}`, {
    method: "DELETE",
    headers: { Origin: baseUrl, Cookie: sessionCookie }
  });
  assert.equal(deleteLegacyResponse.status, 200);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/updates`)).json()).updates, []);
  const unknownDelete = await fetch(`${baseUrl}/api/updates/not-an-id`, {
    method: "DELETE",
    headers: { Origin: baseUrl, Cookie: sessionCookie }
  });
  assert.equal(unknownDelete.status, 404);

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Origin: baseUrl, Cookie: sessionCookie }
  });
  assert.equal(logoutResponse.status, 200);
  const revokedPublish = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
      Cookie: sessionCookie
    },
    body: JSON.stringify({ title: "بعد تسجيل الخروج", content: [{ type: "text", value: "مرفوض" }] })
  });
  assert.equal(revokedPublish.status, 401);
});

test("announcements and school updates use isolated collections", async () => {
  const loginResponse = await login();
  assert.equal(loginResponse.status, 200);
  const sessionCookie = loginResponse.headers.get("set-cookie").split(";")[0];
  const headers = {
    "Content-Type": "application/json",
    Origin: baseUrl,
    Cookie: sessionCookie
  };
  const announcementContent = [{ type: "text", value: "هذا إعلان" }];
  const updateContent = [{ type: "text", value: "هذا تحديث" }];

  const publishAnnouncement = await fetch(`${baseUrl}/api/announcements`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "إعلان مستقل", category: "عام", content: announcementContent })
  });
  assert.equal(publishAnnouncement.status, 201);
  const { announcement } = await publishAnnouncement.json();
  assert.deepEqual((await (await fetch(`${baseUrl}/api/announcements`)).json()).updates, [announcement]);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/updates`)).json()).updates, []);

  const wrongCollectionEdit = await fetch(`${baseUrl}/api/updates/${announcement.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ title: "تعديل خاطئ", category: "عام", content: updateContent })
  });
  assert.equal(wrongCollectionEdit.status, 404);
  const wrongCollectionDelete = await fetch(`${baseUrl}/api/updates/${announcement.id}`, {
    method: "DELETE",
    headers: { Origin: baseUrl, Cookie: sessionCookie }
  });
  assert.equal(wrongCollectionDelete.status, 404);
  assert.equal((await (await fetch(`${baseUrl}/api/announcements`)).json()).updates[0].title, "إعلان مستقل");

  const editAnnouncement = await fetch(`${baseUrl}/api/announcements/${announcement.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ title: "إعلان معدل", category: "فعاليات", content: announcementContent })
  });
  assert.equal(editAnnouncement.status, 200);
  assert.equal((await editAnnouncement.json()).announcement.title, "إعلان معدل");

  const publishUpdate = await fetch(`${baseUrl}/api/updates`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "تحديث مستقل", category: "عام", content: updateContent })
  });
  assert.equal(publishUpdate.status, 201);
  const { announcement: update } = await publishUpdate.json();
  assert.deepEqual((await (await fetch(`${baseUrl}/api/announcements`)).json()).updates.map(({ id }) => id),
    [announcement.id]);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/updates`)).json()).updates.map(({ id }) => id),
    [update.id]);

  const deleteAnnouncement = await fetch(`${baseUrl}/api/announcements/${announcement.id}`, {
    method: "DELETE",
    headers: { Origin: baseUrl, Cookie: sessionCookie }
  });
  assert.equal(deleteAnnouncement.status, 200);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/announcements`)).json()).updates, []);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/updates`)).json()).updates.map(({ id }) => id),
    [update.id]);
  assert.equal((await fetch(`${baseUrl}/api/updates/${update.id}`, {
    method: "DELETE",
    headers: { Origin: baseUrl, Cookie: sessionCookie }
  })).status, 200);
});

test("the admin login rate limit rejects repeated bad passwords", async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login("school-admin", "wrong-password")).status, 401);
  }
  assert.equal((await login()).status, 429);
});
