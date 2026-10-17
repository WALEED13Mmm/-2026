import { colorToHex, contentFromData, contentToData } from "./announcement-storage.js?v=4";
import { announcementCategories } from "./announcement-categories.js?v=1";

const isValidImageDimension = (value) => Number.isInteger(value) && value >= 1 && value <= 2000;

export function initializeAnnouncementEditor({
  button,
  form,
  emptyState,
  renderAnnouncement,
  collection = "updates",
  itemLabel = collection === "announcements" ? "الإعلان" : "التعميم"
}) {
  const titleInput = form.querySelector("#announcement-title");
  const categoryInput = form.querySelector("#announcement-category");
  const urgentInput = form.querySelector("#announcement-urgent");
  const editor = form.querySelector("#announcement-content");
  const status = form.querySelector("#editor-status");
  const imageInput = form.querySelector("#announcement-image");
  const submitButton = form.querySelector('button[type="submit"]');
  const cancelButton = form.querySelector("#cancel-announcement-edit");
  const addButtonLabel = collection === "announcements" ? "إضافة إعلان" : "إضافة تعميم";
  const closeButtonLabel = `إغلاق ${itemLabel}`;
  let savedRange = null;
  let editingId = null;
  let selectedImage = null;
  let draggedImage = null;
  const imageWidthInput = form.querySelector("#announcement-image-width");
  const imageHeightInput = form.querySelector("#announcement-image-height");
  const preserveImageRatioInput = form.querySelector("#preserve-image-ratio");

  function updateImageSizeInputs(image) {
    if (!image) {
      imageWidthInput.value = "";
      imageHeightInput.value = "";
      return;
    }
    const width = /^\d+px$/.test(image.style.width)
      ? Number.parseInt(image.style.width, 10)
      : image.width;
    const height = /^\d+px$/.test(image.style.height)
      ? Number.parseInt(image.style.height, 10)
      : image.height;
    imageWidthInput.value = String(Math.round(width));
    imageHeightInput.value = String(Math.round(height));
  }

  function resizeSelectedImage(changedDimension) {
    if (!selectedImage || !editor.contains(selectedImage)) {
      showError("حدد الصورة التي تريد تغيير مقاسها أولاً.");
      return;
    }
    const changedValue = Number(changedDimension === "width"
      ? imageWidthInput.value
      : imageHeightInput.value);
    if (!isValidImageDimension(changedValue)) {
      showError("أدخل مقاساً صحيحاً بين 1 و2000 بكسل.");
      return;
    }

    if (preserveImageRatioInput.checked) {
      const naturalWidth = selectedImage.naturalWidth || selectedImage.width;
      const naturalHeight = selectedImage.naturalHeight || selectedImage.height;
      if (!naturalWidth || !naturalHeight) {
        showError("تعذر تحديد أبعاد الصورة.");
        return;
      }
      const otherDimension = changedDimension === "width"
        ? Math.round(changedValue * naturalHeight / naturalWidth)
        : Math.round(changedValue * naturalWidth / naturalHeight);
      if (!isValidImageDimension(otherDimension)) {
        showError("المقاس الناتج خارج النطاق المسموح به (1 إلى 2000 بكسل).");
        return;
      }
      if (changedDimension === "width") {
        imageWidthInput.value = String(changedValue);
        imageHeightInput.value = String(otherDimension);
      } else {
        imageHeightInput.value = String(changedValue);
        imageWidthInput.value = String(otherDimension);
      }
    }

    selectedImage.style.width = `${imageWidthInput.value}px`;
    if (preserveImageRatioInput.checked) {
      selectedImage.style.removeProperty("height");
    } else {
      selectedImage.style.height = `${imageHeightInput.value}px`;
    }
    status.hidden = true;
  }

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

  function applyTextFormat(tagName) {
    if (!new Set(["STRONG", "EM", "U"]).has(tagName)) {
      showError("نوع تنسيق النص غير صالح.");
      return;
    }
    const range = restoreSelection();
    if (range.collapsed) {
      showError("حدد الكلمات التي تريد تنسيقها أولاً.");
      return;
    }

    const formattingTags = tagName === "STRONG"
      ? new Set(["STRONG", "B"])
      : tagName === "EM"
        ? new Set(["EM", "I"])
        : new Set(["U"]);
    const selectedTextNodes = [];
    const editorWalker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (editorWalker.nextNode()) {
      const node = editorWalker.currentNode;
      if (!node.textContent.trim() || !range.intersectsNode(node)) {
        continue;
      }
      const start = range.startContainer === node ? range.startOffset : 0;
      const end = range.endContainer === node ? range.endOffset : node.length;
      if (start < end) {
        selectedTextNodes.push(node);
      }
    }
    if (selectedTextNodes.length === 0) {
      showError("حدد كلمات نصية لتنسيقها أولاً.");
      return;
    }
    const isAlreadyFormatted = selectedTextNodes.every((node) => {
      let ancestor = node.parentElement;
      while (ancestor && ancestor !== editor) {
        if (formattingTags.has(ancestor.tagName)) {
          return true;
        }
        ancestor = ancestor.parentElement;
      }
      return false;
    });

    const fragment = range.extractContents();
    if (isAlreadyFormatted) {
      unwrapFormattingElements(fragment, formattingTags);
      moveCaretOutsideFormatting(range, formattingTags);
    } else {
      const formatted = document.createElement(tagName.toLowerCase());
      formatted.append(fragment);
      fragment.append(formatted);
    }
    const firstNode = fragment.firstChild;
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    range.setStartBefore(firstNode);
    range.setEndAfter(lastNode);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
    removeEmptyFormattingElements();
    status.hidden = true;
  }

  function unwrapFormattingElements(fragment, formattingTags) {
    const selector = [...formattingTags].map((tag) => tag.toLowerCase()).join(",");
    const elements = Array.from(fragment.querySelectorAll(selector)).reverse();
    for (const element of elements) {
      element.replaceWith(...element.childNodes);
    }
  }

  function moveCaretOutsideFormatting(range, formattingTags) {
    while (true) {
      let ancestor = range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;
      while (ancestor && ancestor !== editor && !formattingTags.has(ancestor.tagName)) {
        ancestor = ancestor.parentElement;
      }
      if (!ancestor || ancestor === editor) {
        return;
      }

      const parent = ancestor.parentNode;
      const nextSibling = ancestor.nextSibling;
      const afterRange = document.createRange();
      afterRange.setStart(range.startContainer, range.startOffset);
      if (ancestor.lastChild) {
        afterRange.setEndAfter(ancestor.lastChild);
      }
      const afterContent = afterRange.extractContents();
      let afterElement = null;
      if (afterContent.hasChildNodes()) {
        afterElement = ancestor.cloneNode(false);
        afterElement.append(afterContent);
        parent.insertBefore(afterElement, nextSibling);
      }
      if (!ancestor.hasChildNodes()) {
        ancestor.remove();
      }

      const insertionReference = afterElement || nextSibling;
      const insertionOffset = insertionReference
        ? Array.prototype.indexOf.call(parent.childNodes, insertionReference)
        : parent.childNodes.length;
      range.setStart(parent, insertionOffset);
      range.collapse(true);
    }
  }

  function removeEmptyFormattingElements() {
    const formattingElements = Array.from(
      editor.querySelectorAll("strong, b, em, i, u, span")
    ).reverse();
    for (const element of formattingElements) {
      if (element.textContent.length === 0 && !element.querySelector("img, br")) {
        element.remove();
      }
    }
  }

  function removeTextFormatting() {
    const range = restoreSelection();
    if (range.collapsed) {
      showError("حدد الكلمات التي تريد إزالة تنسيقها أولاً.");
      return;
    }

    const fragment = range.extractContents();
    const formattingTags = new Set(["STRONG", "B", "EM", "I", "U", "SPAN"]);
    unwrapFormattingElements(fragment, formattingTags);

    const firstNode = fragment.firstChild;
    const lastNode = fragment.lastChild;
    if (!firstNode || !lastNode) {
      showError("تعذر إزالة تنسيق التحديد.");
      return;
    }

    moveCaretOutsideFormatting(range, formattingTags);
    range.insertNode(fragment);
    range.setStartBefore(firstNode);
    range.setEndAfter(lastNode);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
    removeEmptyFormattingElements();
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
        const color = colorToHex(node.style.getPropertyValue("color"));
        if (color) {
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
        clean.alt = (node.getAttribute("alt") || `صورة مرفقة بـ${itemLabel}`).slice(0, 200);
        if (/^(?:25|50|75|100)%$/.test(node.style.width)) {
          clean.style.width = node.style.width;
        } else if (/^\d+px$/.test(node.style.width) &&
                   isValidImageDimension(Number.parseInt(node.style.width, 10))) {
          clean.style.width = node.style.width;
        }
        if (/^\d+px$/.test(node.style.height) &&
            isValidImageDimension(Number.parseInt(node.style.height, 10))) {
          clean.style.height = node.style.height;
        }
      }

      parent.append(clean);
      elements.set(node, clean);
    }
    return output;
  }

  function resetEditor() {
    editingId = null;
    form.reset();
    editor.replaceChildren();
    savedRange = null;
    selectedImage = null;
    draggedImage = null;
    updateImageSizeInputs(null);
    if (urgentInput) {
      urgentInput.checked = false;
    }
    status.hidden = true;
    submitButton.textContent = `نشر ${itemLabel}`;
    cancelButton.hidden = true;
    button.textContent = addButtonLabel;
  }

  function editAnnouncement(announcement) {
    editingId = announcement.id;
    titleInput.value = announcement.title;
    categoryInput.value = announcementCategories.includes(announcement.category)
      ? announcement.category
      : "عام";
    if (urgentInput) {
      urgentInput.checked = announcement.urgent === true;
    }
    editor.replaceChildren(contentFromData(announcement.content));
    editor.querySelectorAll("img").forEach((image) => {
      image.draggable = true;
    });
    submitButton.textContent = "حفظ التعديلات";
    cancelButton.hidden = false;
    status.hidden = true;
    form.hidden = false;
    button.textContent = closeButtonLabel;
    button.setAttribute("aria-expanded", "true");
    titleInput.focus();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  button.addEventListener("click", () => {
    const isOpening = form.hidden;
    if (isOpening) {
      resetEditor();
      button.textContent = closeButtonLabel;
    } else {
      button.textContent = addButtonLabel;
    }
    form.hidden = !isOpening;
    button.setAttribute("aria-expanded", String(isOpening));
    if (isOpening) {
      titleInput.focus();
    }
  });

  cancelButton.addEventListener("click", () => {
    resetEditor();
    form.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.focus();
  });

  document.addEventListener("selectionchange", saveSelection);
  editor.addEventListener("input", () => {
    status.hidden = true;
    saveSelection();
  });
  editor.addEventListener("click", (event) => {
    const image = event.target.closest("img");
    selectedImage?.classList.remove("is-selected");
    selectedImage = image && editor.contains(image) ? image : null;
    selectedImage?.classList.add("is-selected");
    const clickedImage = selectedImage;
    updateImageSizeInputs(clickedImage);
    clickedImage?.addEventListener("load", () => updateImageSizeInputs(clickedImage), { once: true });
  });
  imageWidthInput.addEventListener("change", () => resizeSelectedImage("width"));
  imageHeightInput.addEventListener("change", () => resizeSelectedImage("height"));
  preserveImageRatioInput.addEventListener("change", () => {
    if (preserveImageRatioInput.checked && selectedImage) {
      resizeSelectedImage("width");
    }
  });
  form.querySelector("#reset-announcement-image-size").addEventListener("click", () => {
    if (!selectedImage || !editor.contains(selectedImage)) {
      showError("حدد الصورة التي تريد إرجاعها لمقاسها الأصلي أولاً.");
      return;
    }
    selectedImage.style.removeProperty("width");
    selectedImage.style.removeProperty("height");
    updateImageSizeInputs(selectedImage);
    status.hidden = true;
  });
  editor.addEventListener("dragstart", (event) => {
    const image = event.target.closest("img");
    if (!image || !editor.contains(image)) {
      return;
    }
    draggedImage = image;
    selectedImage?.classList.remove("is-selected");
    selectedImage = image;
    selectedImage.classList.add("is-selected");
    updateImageSizeInputs(image);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "school-editor-image");
  });
  editor.addEventListener("dragover", (event) => {
    if (draggedImage && editor.contains(draggedImage)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  });
  editor.addEventListener("drop", (event) => {
    if (!draggedImage || !editor.contains(draggedImage)) {
      return;
    }
    event.preventDefault();
    let range;
    const targetImage = event.target.closest("img");
    if (targetImage && targetImage !== draggedImage) {
      range = document.createRange();
      const insertAfter = event.clientY >= targetImage.getBoundingClientRect().top +
        targetImage.getBoundingClientRect().height / 2;
      range[insertAfter ? "setStartAfter" : "setStartBefore"](targetImage);
      range.collapse(true);
    } else if (typeof document.caretRangeFromPoint === "function") {
      range = document.caretRangeFromPoint(event.clientX, event.clientY);
    } else if (document.caretPositionFromPoint) {
      const caret = document.caretPositionFromPoint(event.clientX, event.clientY);
      if (caret) {
        range = document.createRange();
        range.setStart(caret.offsetNode, caret.offset);
        range.collapse(true);
      }
    }
    if (!range || !editor.contains(range.commonAncestorContainer) ||
        range.commonAncestorContainer === draggedImage ||
        draggedImage.contains(range.commonAncestorContainer)) {
      draggedImage = null;
      return;
    }
    range.insertNode(draggedImage);
    range.setStartAfter(draggedImage);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
    selectedImage = draggedImage;
    selectedImage.classList.add("is-selected");
    updateImageSizeInputs(selectedImage);
    draggedImage = null;
    status.hidden = true;
  });
  editor.addEventListener("dragend", () => {
    draggedImage = null;
  });
  form.querySelector("#announcement-color").addEventListener("input", (event) => {
    applyStyle("color", event.currentTarget.value);
  });
  form.querySelector("#announcement-size").addEventListener("change", (event) => {
    applyStyle("font-size", event.currentTarget.value);
  });
  form.querySelectorAll("[data-text-format]").forEach((formatButton) => {
    formatButton.addEventListener("mousedown", (event) => event.preventDefault());
    formatButton.addEventListener("click", () => {
      applyTextFormat(formatButton.dataset.textFormat);
    });
  });
  const removeFormattingButton = form.querySelector("#remove-announcement-formatting");
  removeFormattingButton.addEventListener("mousedown", (event) => event.preventDefault());
  removeFormattingButton.addEventListener("click", removeTextFormatting);
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
          imageElement.draggable = true;
          range.deleteContents();
          range.insertNode(imageElement);
          range.setStartAfter(imageElement);
          range.collapse(true);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          savedRange = range.cloneRange();
          selectedImage = imageElement;
          selectedImage.classList.add("is-selected");
          updateImageSizeInputs(imageElement);
          imageElement.addEventListener("load", () => updateImageSizeInputs(imageElement), { once: true });
          removeEmptyFormattingElements();
          status.hidden = true;
        });
        reader.addEventListener("error", () => showError("تعذر قراءة الصورة. اختر ملفاً آخر."));
        reader.readAsDataURL(image);
      }
    }
    imageInput.value = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      return;
    }

    const title = titleInput.value.trim();
    const hasText = editor.textContent.trim().length > 0;
    const hasImage = editor.querySelector("img") !== null;
    if (!title || title.length > 100) {
      showError(`عنوان ${itemLabel} مطلوب ويجب ألا يتجاوز 100 حرف.`);
      return;
    }
    if (!hasText && !hasImage) {
      showError(`أضف نصاً أو صورة إلى ${itemLabel} قبل نشره.`);
      editor.focus();
      return;
    }

    submitButton.disabled = true;
    try {
      const response = await fetch(editingId
        ? `/api/${collection}/${encodeURIComponent(editingId)}`
        : `/api/${collection}`, {
        method: editingId ? "PUT" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          category: categoryInput.value,
          ...(urgentInput ? { urgent: urgentInput.checked } : {}),
          content: contentToData(sanitizeContent(editor))
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : `تعذر حفظ ${itemLabel}.`);
      }
      renderAnnouncement(result.announcement, Boolean(editingId));
      emptyState.hidden = true;
      resetEditor();
      form.hidden = true;
      button.setAttribute("aria-expanded", "false");
      button.focus();
    } catch (error) {
      showError(error.message);
    } finally {
      submitButton.disabled = false;
    }
  });

  return { editAnnouncement };
}
