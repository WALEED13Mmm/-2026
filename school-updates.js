import { initializeAdminSession } from "./auth-client.js?v=3";
import { initializeAnnouncementEditor } from "./announcement-editor.js?v=15";
import { contentFromData } from "./announcement-storage.js?v=4";
import { createManagementActions, deleteAnnouncement } from "./announcement-management.js?v=2";
import { filterAnnouncements } from "./announcement-filter.js?v=1";
import { getUpdates } from "./updates-client.js?v=4";

const loadingState = document.getElementById("loading-state");
const updateList = document.getElementById("update-list");
const noUpdateResults = document.getElementById("update-no-results");
const searchInput = document.getElementById("update-search");
const categoryFilter = document.getElementById("update-filter-category");
const adminStatus = document.getElementById("admin-access-status");
const editorButton = document.getElementById("show-announcement-form");
const urgentBanner = document.getElementById("urgent-announcement-banner");
const urgentBannerTitle = urgentBanner?.querySelector(".urgent-announcement-title");
const urgentBannerMessage = urgentBanner?.querySelector(".urgent-announcement-message");
const collection = document.body.dataset.collection === "announcements" ? "announcements" : "updates";
const isAnnouncementsPage = collection === "announcements";
let allAnnouncements = [];
let isAdmin = false;
let editAnnouncement = () => {};

const imageViewer = document.createElement("dialog");
imageViewer.className = "image-viewer";
imageViewer.setAttribute("aria-label", "عرض الصورة");
imageViewer.innerHTML = `
  <button class="image-viewer-close" type="button" aria-label="إغلاق الصورة">×</button>
  <img class="image-viewer-content" alt="">
`;
document.body.append(imageViewer);
const imageViewerContent = imageViewer.querySelector(".image-viewer-content");

function openImageViewer(image) {
  imageViewerContent.src = image.src;
  imageViewerContent.alt = image.alt;
  imageViewer.showModal();
}

function plainTextFromContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((item) => {
    if (item.type === "text") {
      return item.value;
    }
    return Array.isArray(item.children) ? plainTextFromContent(item.children) : "";
  }).join(" ");
}

imageViewer.addEventListener("click", (event) => {
  if (event.target === imageViewer || event.target.closest(".image-viewer-close")) {
    imageViewer.close();
  }
});
imageViewer.addEventListener("cancel", (event) => {
  event.preventDefault();
  imageViewer.close();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && imageViewer.open) {
    imageViewer.close();
  }
});
imageViewer.addEventListener("close", () => {
  imageViewerContent.removeAttribute("src");
  imageViewerContent.alt = "";
});
updateList.addEventListener("click", (event) => {
  const image = event.target.closest(".update-content img");
  if (image) {
    openImageViewer(image);
  }
});
updateList.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") &&
      event.target.matches(".update-content img")) {
    event.preventDefault();
    openImageViewer(event.target);
  }
});

function createUpdateCard(update) {
  const card = document.createElement("article");
  card.className = "update-card";

  const title = document.createElement("h3");
  title.textContent = update.title;

  const meta = document.createElement("p");
  meta.className = "update-meta";
  const date = new Date(update.created_at);
  const formattedDate = Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-SA");
  meta.textContent = formattedDate
    ? `${update.category || "عام"} - ${formattedDate}`
    : update.category || "عام";

  const content = document.createElement("div");
  content.className = "update-content rich-update-content";
  if (Array.isArray(update.content)) {
    content.append(contentFromData(update.content));
    content.querySelectorAll("img").forEach((image) => {
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      image.setAttribute("aria-haspopup", "dialog");
      image.setAttribute("aria-label", image.alt
        ? `تكبير الصورة: ${image.alt}`
        : "تكبير الصورة");
    });
  } else if (typeof update.content === "string") {
    content.textContent = update.content;
  } else {
    throw new Error(isAnnouncementsPage
      ? "وصل محتوى إعلان بتنسيق غير صالح."
      : "وصل محتوى تعميم بتنسيق غير صالح.");
  }
  card.append(title, content, meta);
  if (isAdmin) {
    card.append(createManagementActions({
      announcement: update,
      itemLabel: isAnnouncementsPage ? "الإعلان" : "التعميم",
      onEdit(announcement) {
        editAnnouncement(announcement);
      },
      async onDelete(announcement) {
        const itemLabel = isAnnouncementsPage ? "الإعلان" : "التعميم";
        if (!window.confirm(`هل تريد حذف ${itemLabel} «${announcement.title}»؟`)) {
          return;
        }
        try {
          await deleteAnnouncement(announcement.id, collection);
          allAnnouncements = allAnnouncements.filter((item) => item.id !== announcement.id);
          renderUpdates();
          adminStatus.textContent = "تم حذف الإعلان.";
        } catch (error) {
          adminStatus.textContent = error.message;
          adminStatus.hidden = false;
        }
      }
    }));
  }
  return card;
}

function renderUpdates() {
  const updates = filterAnnouncements(allAnnouncements, searchInput.value, categoryFilter.value);
  if (urgentBanner && urgentBannerTitle && urgentBannerMessage) {
    const urgentAnnouncement = allAnnouncements.find((announcement) => announcement.urgent === true);
    urgentBanner.hidden = !urgentAnnouncement;
    if (urgentAnnouncement) {
      urgentBannerTitle.textContent = urgentAnnouncement.title;
      const message = plainTextFromContent(urgentAnnouncement.content).replace(/\s+/g, " ").trim();
      urgentBannerMessage.textContent = message.length > 180
        ? `${message.slice(0, 177)}…`
        : message;
    }
  }
  updateList.replaceChildren();
  if (allAnnouncements.length === 0) {
    loadingState.textContent = isAnnouncementsPage
      ? "لا توجد إعلانات منشورة حالياً."
      : "لا توجد تعميمات منشورة حالياً.";
    loadingState.hidden = false;
    updateList.hidden = true;
    noUpdateResults.hidden = true;
    return;
  }

  loadingState.hidden = true;
  updateList.hidden = updates.length === 0;
  noUpdateResults.hidden = updates.length > 0;
  for (const update of updates) {
    updateList.append(createUpdateCard(update));
  }
}

await initializeAdminSession({
  status: adminStatus,
  editorButton,
  editorForm: document.getElementById("announcement-form"),
  onAuthenticationChange(authenticated) {
    isAdmin = authenticated;
    renderUpdates();
  }
});

const editor = initializeAnnouncementEditor({
  button: editorButton,
  form: document.getElementById("announcement-form"),
  emptyState: loadingState,
  collection,
  itemLabel: isAnnouncementsPage ? "الإعلان" : "التعميم",
  renderAnnouncement(announcement, wasEditing) {
    if (wasEditing) {
      allAnnouncements = allAnnouncements.map((item) =>
        item.id === announcement.id ? announcement : item);
    } else {
      allAnnouncements.unshift(announcement);
    }
    renderUpdates();
  }
});
editAnnouncement = editor.editAnnouncement;

searchInput.addEventListener("input", renderUpdates);
categoryFilter.addEventListener("change", renderUpdates);

try {
  allAnnouncements = await getUpdates(collection);
  renderUpdates();
} catch (error) {
  loadingState.textContent = isAnnouncementsPage
    ? `تعذر تحميل الإعلانات: ${error.message}`
    : error.message;
  loadingState.hidden = false;
}
