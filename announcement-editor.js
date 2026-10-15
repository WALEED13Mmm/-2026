import { contentToData, saveAnnouncement } from "./announcement-storage.js?v=1";

export function initializeAnnouncementEditor({ button, form, emptyState, renderAnnouncement }) {
  const titleInput = form.querySelector("#announcement-title");
  const editor = form.querySelector("#announcement-content");
  const status = form.querySelector("#editor-status");
  const imageInput = form.querySelector("#announcement-image");
  let savedRange = null;

  function showError(message) {
    status.textContent = message;
    status.hidden = false;
  }

  function saveSelection() {
    const selection = window.getSelection();
    if (selection.rangeCount && editor.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    editor.focus();
    if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedRange);
      return selection.getRangeAt(0);
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
    return range;
  }

  function applyStyle(property, value) {
    const validValue = property === "color"
      ? /^#[0-9a-f]{6}$/i.test(value)
      : new Set(["14px", "16px", "20px", "24px", "32px"]).has(value);
    if (!validValue) {
      showError("قيمة التنسيق غير صالحة.");
      return;
    }

    const range = restoreSelection();
    if (range.collapsed) {
      showError("حدد الكلمات التي تريد تنسيقها أولاً.");
      return;
    }

    const textNodes = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.length > 0 && range.intersectsNode(walker.currentNode)) {
        textNodes.push(walker.currentNode);
      }
    }

    let firstSpan = null;
    let lastSpan = null;
    for (const node of textNodes) {
      const start = range.startContainer === node ? range.startOffset : 0;
      const end = range.endContainer === node ? range.endOffset : node.length;
      if (start >= end) {
        continue;
      }
      const textRange = document.createRange();
      textRange.setStart(node, start);
      textRange.setEnd(node, end);
      const span = document.createElement("span");
      span.style.setProperty(property, value);
      span.append(textRange.extractContents());
      textRange.insertNode(span);
      firstSpan ||= span;
      lastSpan = span;
    }

    if (firstSpan && lastSpan) {
      const selection = window.getSelection();
      const nextRange = document.createRange();
      nextRange.setStartBefore(firstSpan);
      nextRange.setEndAfter(lastSpan);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      savedRange = nextRange.cloneRange();
    }
    status.hidden = true;
  }

  function sanitizeContent(source) {
    const allowedTags = new Set(["P", "DIV", "BR", "SPAN", "A", "IMG", "B", "STRONG", "I", "EM", "U"]);
    const output = document.createDocumentFragment();
    const elements = new Map([[source, output]]);
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = elements.get(node.parentNode);
      if (!parent) {
        continue;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        parent.append(document.createTextNode(node.nodeValue));
        continue;
      }
      if (!allowedTags.has(node.tagName)) {
        elements.set(node, parent);
        continue;
      }
      if (node.tagName === "IMG" &&
          !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(node.getAttribute("src") || "")) {
        continue;
      }

      const clean = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === "SPAN") {
        const color = node.style.getPropertyValue("color");
        if (/^#[0-9a-f]{6}$/i.test(color)) {
          clean.style.color = color;
        }
        const fontSize = node.style.getPropertyValue("font-size");
        if (new Set(["14px", "16px", "20px", "24px", "32px"]).has(fontSize)) {
          clean.style.fontSize = fontSize;
        }
      } else if (node.tagName === "A") {
        try {
          const url = new URL(node.getAttribute("href"));
          if (url.protocol === "https:" || url.protocol === "http:") {
            clean.href = url.href;
            clean.target = "_blank";
            clean.rel = "noopener noreferrer";
          }
        } catch {
          // Invalid pasted links remain plain text.
        }
      } else if (node.tagName === "IMG") {
        clean.src = node.getAttribute("src");
        clean.alt = (node.getAttribute("alt") || "صورة مرفقة بالإعلان").slice(0, 200);
      }

      parent.append(clean);
      elements.set(node, clean);
    }
    return output;
  }

  button.addEventListener("click", () => {
    const isOpening = form.hidden;
    form.hidden = !isOpening;
    button.setAttribute("aria-expanded", String(isOpening));
    if (isOpening) {
      titleInput.focus();
    }
  });

  document.addEventListener("selectionchange", saveSelection);
  editor.addEventListener("input", () => {
    status.hidden = true;
    saveSelection();
  });
  form.querySelector("#announcement-color").addEventListener("input", (event) => {
    applyStyle("color", event.currentTarget.value);
  });
  form.querySelector("#announcement-size").addEventListener("change", (event) => {
    applyStyle("font-size", event.currentTarget.value);
  });
  form.querySelector("#add-announcement-link").addEventListener("click", () => {
    const input = form.querySelector("#announcement-link-url");
    let url;
    try {
      url = new URL(input.value.trim());
    } catch {
      showError("أدخل رابطاً صحيحاً يبدأ بـ http:// أو https://.");
      input.focus();
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      showError("يسمح فقط بالروابط التي تبدأ بـ http:// أو https://.");
      input.focus();
      return;
    }

    const range = restoreSelection();
    const link = document.createElement("a");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (range.collapsed) {
      link.textContent = url.href;
    } else {
      link.append(range.extractContents());
    }
    range.insertNode(link);
    range.selectNodeContents(link);
    savedRange = range.cloneRange();
    input.value = "";
    status.hidden = true;
  });

  form.querySelector("#choose-announcement-image").addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", () => {
    const image = imageInput.files[0];
    if (image) {
      if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(image.type) ||
          image.size > 5 * 1024 * 1024) {
        showError("اختر صورة بصيغة PNG أو JPG أو GIF أو WebP، وبحجم لا يتجاوز 5 ميغابايت.");
      } else {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
          if (typeof reader.result !== "string" ||
              !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(reader.result)) {
            showError("تعذر قراءة الصورة بصيغة آمنة.");
            return;
          }
          const range = restoreSelection();
          const imageElement = document.createElement("img");
          imageElement.src = reader.result;
          imageElement.alt = image.name.slice(0, 200);
          range.deleteContents();
          range.insertNode(imageElement);
          range.setStartAfter(imageElement);
          range.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          savedRange = range.cloneRange();
          status.hidden = true;
        });
        reader.addEventListener("error", () => showError("تعذر قراءة الصورة. اختر ملفاً آخر."));
        reader.readAsDataURL(image);
      }
    }
    imageInput.value = "";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      return;
    }

    const title = titleInput.value.trim();
    const hasText = editor.textContent.trim().length > 0;
    const hasImage = editor.querySelector("img") !== null;
    if (!title || title.length > 100) {
      showError("عنوان الإعلان مطلوب ويجب ألا يتجاوز 100 حرف.");
      return;
    }
    if (!hasText && !hasImage) {
      showError("أضف نصاً أو صورة إلى الإعلان قبل نشره.");
      editor.focus();
      return;
    }

    const announcement = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      created_at: new Date().toISOString(),
      content: contentToData(sanitizeContent(editor))
    };
    try {
      saveAnnouncement(announcement);
    } catch (error) {
      showError(error.message);
      return;
    }
    renderAnnouncement(announcement);
    emptyState.hidden = true;
    form.reset();
    editor.replaceChildren();
    savedRange = null;
    status.hidden = true;
    form.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.focus();
  });
}
