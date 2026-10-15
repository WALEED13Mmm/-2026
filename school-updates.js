import { initializeAnnouncementEditor } from "./announcement-editor.js?v=1";
import { contentFromData, getSavedAnnouncements } from "./announcement-storage.js?v=1";
import { getUpdates } from "./updates-client.js?v=2";

const loadingState = document.getElementById("loading-state");
const updateList = document.getElementById("update-list");

function renderUpdates(updates) {
  updateList.replaceChildren();
  if (updates.length === 0) {
    loadingState.textContent = "لا توجد تحديثات منشورة حالياً.";
    loadingState.hidden = false;
    updateList.hidden = true;
    return;
  }

  loadingState.hidden = true;
  updateList.hidden = false;
  for (const update of updates) {
    const card = document.createElement("article");
    card.className = "update-card";

    const title = document.createElement("h3");
    title.textContent = update.title;

    const meta = document.createElement("p");
    meta.className = "update-meta";
    const date = new Date(`${update.created_at.replace(" ", "T")}Z`);
    meta.textContent = `نشره ${update.author} - ${date.toLocaleString("ar-SA")}`;

    const content = document.createElement("p");
    content.className = "update-content";
    content.textContent = update.content;

    card.append(title, meta, content);
    updateList.append(card);
  }
}

function renderSavedAnnouncement(announcement) {
  const card = document.createElement("article");
  card.className = "update-card";
  const title = document.createElement("h3");
  title.textContent = announcement.title;

  const meta = document.createElement("p");
  meta.className = "update-meta";
  meta.textContent = `إعلان محفوظ على هذا المتصفح - ${new Date(announcement.created_at).toLocaleString("ar-SA")}`;

  const content = document.createElement("div");
  content.className = "update-content rich-update-content";
  content.append(contentFromData(announcement.content));
  card.append(title, meta, content);
  updateList.prepend(card);
  updateList.hidden = false;
  loadingState.hidden = true;
}

initializeAnnouncementEditor({
  button: document.getElementById("show-announcement-form"),
  form: document.getElementById("announcement-form"),
  emptyState: loadingState,
  renderAnnouncement(announcement) {
    renderSavedAnnouncement(announcement);
  }
});

try {
  renderUpdates(getUpdates());
  for (const announcement of getSavedAnnouncements().reverse()) {
    renderSavedAnnouncement(announcement);
  }
} catch (error) {
  loadingState.textContent = error.message;
  loadingState.hidden = false;
}
