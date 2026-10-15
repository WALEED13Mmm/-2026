import { initializeAnnouncementEditor } from "./announcement-editor.js?v=1";
import { contentFromData, getSavedAnnouncements } from "./announcement-storage.js?v=1";
import { getUpdates } from "./updates-client.js?v=2";

const reduceMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const notificationStatus = document.getElementById("notifications-empty");
const announcementList = document.getElementById("announcement-list");

function renderAnnouncements(updates) {
  announcementList.replaceChildren();
  if (updates.length === 0) {
    notificationStatus.hidden = false;
    return;
  }
  notificationStatus.hidden = true;

  for (const update of updates) {
    const announcement = document.createElement("article");
    announcement.className = "announcement";
    const title = document.createElement("h3");
    title.textContent = update.title;

    const meta = document.createElement("p");
    meta.className = "announcement-meta";
    const date = new Date(`${update.created_at.replace(" ", "T")}Z`);
    const formattedDate = Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-SA");
    meta.textContent = formattedDate ? `نشره ${update.author} - ${formattedDate}` : update.author;

    const content = document.createElement("div");
    content.className = "announcement-content";
    content.textContent = update.content;
    announcement.append(title, meta, content);
    announcementList.append(announcement);
  }
}

function renderSavedAnnouncement(announcement) {
  const card = document.createElement("article");
  card.className = "announcement";
  const title = document.createElement("h3");
  title.textContent = announcement.title;

  const meta = document.createElement("p");
  meta.className = "announcement-meta";
  meta.textContent = `إعلان محفوظ على هذا المتصفح - ${new Date(announcement.created_at).toLocaleString("ar-SA")}`;

  const content = document.createElement("div");
  content.className = "announcement-content";
  content.append(contentFromData(announcement.content));
  card.append(title, meta, content);
  announcementList.prepend(card);
  notificationStatus.hidden = true;
}

initializeAnnouncementEditor({
  button: document.getElementById("show-announcement-form"),
  form: document.getElementById("announcement-form"),
  emptyState: notificationStatus,
  renderAnnouncement(announcement) {
    renderSavedAnnouncement(announcement);
  }
});

document.addEventListener("pointerdown", (event) => {
  if (reduceMotionPreference.matches ||
      !(event.target instanceof Element) ||
      !event.target.closest("a, button, input, select, .overview-card, .announcement, .announcement-editor")) {
    return;
  }
  const effect = document.createElement("span");
  effect.className = "click-effect";
  effect.style.left = `${event.clientX - 9}px`;
  effect.style.top = `${event.clientY - 9}px`;
  effect.addEventListener("animationend", () => effect.remove(), { once: true });
  document.body.append(effect);
});

try {
  renderAnnouncements(getUpdates());
  for (const announcement of getSavedAnnouncements().reverse()) {
    renderSavedAnnouncement(announcement);
  }
} catch (error) {
  notificationStatus.textContent = error.message;
  notificationStatus.hidden = false;
}
