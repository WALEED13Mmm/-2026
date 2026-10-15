const storageKey = "alnahrawan-announcements-v1";

const allowedTags = new Set(["P", "DIV", "BR", "SPAN", "A", "IMG", "B", "STRONG", "I", "EM", "U"]);
const allowedFontSizes = new Set(["14px", "16px", "20px", "24px", "32px"]);
const imageSourcePattern = /^data:image\/(?:png|jpeg|gif|webp);base64,/i;

export function contentToData(fragment) {
  return Array.from(fragment.childNodes, nodeToData);
}

function nodeToData(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return { type: "text", value: node.nodeValue };
  }

  const tag = node.tagName;
  if (!allowedTags.has(tag)) {
    return { type: "text", value: node.textContent };
  }

  const item = { type: "element", tag, attributes: {}, children: [] };
  if (tag === "A") {
    item.attributes.href = node.href;
  } else if (tag === "IMG") {
    item.attributes.src = node.src;
    item.attributes.alt = node.alt;
  } else if (tag === "SPAN") {
    const color = node.style.getPropertyValue("color");
    const fontSize = node.style.getPropertyValue("font-size");
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      item.attributes.color = color;
    }
    if (allowedFontSizes.has(fontSize)) {
      item.attributes.fontSize = fontSize;
    }
  }

  item.children = Array.from(node.childNodes, nodeToData);
  return item;
}

export function contentFromData(content) {
  const fragment = document.createDocumentFragment();
  let nodeCount = 0;

  function appendNode(parent, item, depth) {
    nodeCount += 1;
    if (nodeCount > 5000 || depth > 30 || !item || typeof item !== "object") {
      throw new Error("تعذر عرض الإعلان المحفوظ بسبب تلف بياناته.");
    }
    if (item.type === "text" && typeof item.value === "string" && item.value.length <= 1000000) {
      parent.append(document.createTextNode(item.value));
      return;
    }
    if (item.type !== "element" || !allowedTags.has(item.tag) ||
        !item.attributes || typeof item.attributes !== "object" || !Array.isArray(item.children)) {
      throw new Error("تعذر عرض الإعلان المحفوظ بسبب تلف بياناته.");
    }

    const element = document.createElement(item.tag.toLowerCase());
    if (item.tag === "A") {
      try {
        const url = new URL(item.attributes.href);
        if (url.protocol === "http:" || url.protocol === "https:") {
          element.href = url.href;
          element.target = "_blank";
          element.rel = "noopener noreferrer";
        }
      } catch {
        throw new Error("تعذر عرض الإعلان المحفوظ لاحتوائه على رابط غير صالح.");
      }
    } else if (item.tag === "IMG") {
      if (typeof item.attributes.src !== "string" || !imageSourcePattern.test(item.attributes.src) ||
          item.attributes.src.length > 8 * 1024 * 1024 ||
          typeof item.attributes.alt !== "string" || item.attributes.alt.length > 200) {
        throw new Error("تعذر عرض الإعلان المحفوظ لاحتوائه على صورة غير صالحة.");
      }
      element.src = item.attributes.src;
      element.alt = item.attributes.alt;
    } else if (item.tag === "SPAN") {
      if (typeof item.attributes.color === "string" && /^#[0-9a-f]{6}$/i.test(item.attributes.color)) {
        element.style.color = item.attributes.color;
      }
      if (allowedFontSizes.has(item.attributes.fontSize)) {
        element.style.fontSize = item.attributes.fontSize;
      }
    }

    for (const child of item.children) {
      appendNode(element, child, depth + 1);
    }
    parent.append(element);
  }

  if (!Array.isArray(content) || content.length > 5000) {
    throw new Error("تعذر عرض الإعلان المحفوظ بسبب تلف بياناته.");
  }
  for (const item of content) {
    appendNode(fragment, item, 0);
  }
  return fragment;
}

export function getSavedAnnouncements() {
  let saved;
  try {
    saved = window.localStorage.getItem(storageKey);
  } catch {
    throw new Error("تعذر الوصول إلى الإعلانات المحفوظة في هذا المتصفح.");
  }
  if (saved === null) {
    return [];
  }

  let announcements;
  try {
    announcements = JSON.parse(saved);
  } catch {
    throw new Error("تعذر قراءة الإعلانات المحفوظة؛ قد تكون بياناتها تالفة.");
  }
  if (!Array.isArray(announcements) || announcements.length > 100) {
    throw new Error("تعذر قراءة الإعلانات المحفوظة بسبب تنسيق غير صالح.");
  }
  for (const announcement of announcements) {
    if (!announcement || typeof announcement.id !== "string" ||
        typeof announcement.title !== "string" || announcement.title.length > 100 ||
        typeof announcement.created_at !== "string" ||
        !Number.isFinite(Date.parse(announcement.created_at)) || !Array.isArray(announcement.content)) {
      throw new Error("تعذر قراءة إعلان محفوظ بسبب بيانات غير صالحة.");
    }
  }
  return announcements;
}

export function saveAnnouncement(announcement) {
  const announcements = getSavedAnnouncements();
  announcements.unshift(announcement);
  if (announcements.length > 100) {
    announcements.length = 100;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(announcements));
  } catch {
    throw new Error("تعذر حفظ الإعلان في هذا المتصفح. قد تكون مساحة التخزين ممتلئة أو غير متاحة.");
  }
}
