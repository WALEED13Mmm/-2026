const allowedTags = new Set(["P", "DIV", "BR", "SPAN", "A", "IMG", "B", "STRONG", "I", "EM", "U"]);
const allowedFontSizes = new Set(["14px", "16px", "20px", "24px", "32px"]);
const allowedImageWidths = new Set(["25%", "50%", "75%", "100%"]);
const isValidImageDimension = (value) => Number.isInteger(value) && value >= 1 && value <= 2000;
const imageSourcePattern = /^data:image\/(?:png|jpeg|gif|webp);base64,/i;

export function colorToHex(color) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }
  const match = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([01](?:\.\d+)?))?\s*\)$/i);
  if (!match || (match[4] !== undefined && Number(match[4]) !== 1)) {
    return null;
  }
  const channels = match.slice(1, 4).map(Number);
  if (channels.some((channel) => channel > 255)) {
    return null;
  }
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function contentToData(fragment) {
  return Array.from(fragment.childNodes).flatMap((node) => nodeToData(node));
}

function nodeToData(node, inheritedStyles = {}) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = { type: "text", value: node.nodeValue };
    if (Object.keys(inheritedStyles).length === 0) {
      return [text];
    }
    return [{
      type: "element",
      tag: "SPAN",
      attributes: { ...inheritedStyles },
      children: [text]
    }];
  }

  const tag = node.tagName;
  if (!allowedTags.has(tag)) {
    return nodeToData(document.createTextNode(node.textContent), inheritedStyles);
  }

  const styles = { ...inheritedStyles };
  if (tag === "SPAN") {
    const color = colorToHex(node.style.getPropertyValue("color"));
    const fontSize = node.style.getPropertyValue("font-size");
    if (color) {
      styles.color = color;
    }
    if (allowedFontSizes.has(fontSize)) {
      styles.fontSize = fontSize;
    }
    return Array.from(node.childNodes).flatMap((child) => nodeToData(child, styles));
  }

  const item = { type: "element", tag, attributes: {}, children: [] };
  if (tag === "A") {
    item.attributes.href = node.href;
  } else if (tag === "IMG") {
    item.attributes.src = node.src;
    item.attributes.alt = node.alt;
    if (allowedImageWidths.has(node.style.width)) {
      item.attributes.width = node.style.width;
    }
    const widthPx = Number.parseInt(node.style.width, 10);
    const heightPx = Number.parseInt(node.style.height, 10);
    if (node.style.width.endsWith("px") && isValidImageDimension(widthPx)) {
      item.attributes.widthPx = widthPx;
    }
    if (node.style.height.endsWith("px") && isValidImageDimension(heightPx)) {
      item.attributes.heightPx = heightPx;
    }
  }

  item.children = Array.from(node.childNodes)
    .flatMap((child) => nodeToData(child, tag === "IMG" ? {} : styles));
  return [item];
}

export function contentFromData(content) {
  const fragment = document.createDocumentFragment();
  let nodeCount = 0;

  function appendNode(parent, item, depth) {
    nodeCount += 1;
    if (nodeCount > 5000 || depth > 30 || !item || typeof item !== "object") {
      throw new Error("تعذر عرض الإعلان بسبب تلف بياناته.");
    }
    if (item.type === "text" && typeof item.value === "string" && item.value.length <= 1000000) {
      parent.append(document.createTextNode(item.value));
      return;
    }
    if (item.type !== "element" || !allowedTags.has(item.tag) ||
        !item.attributes || typeof item.attributes !== "object" || !Array.isArray(item.children)) {
      throw new Error("تعذر عرض الإعلان بسبب تلف بياناته.");
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
        throw new Error("تعذر عرض الإعلان لاحتوائه على رابط غير صالح.");
      }
    } else if (item.tag === "IMG") {
      if (typeof item.attributes.src !== "string" || !imageSourcePattern.test(item.attributes.src) ||
          item.attributes.src.length > 8 * 1024 * 1024 ||
          typeof item.attributes.alt !== "string" || item.attributes.alt.length > 200) {
        throw new Error("تعذر عرض الإعلان لاحتوائه على صورة غير صالحة.");
      }
      element.src = item.attributes.src;
      element.alt = item.attributes.alt;
      if (allowedImageWidths.has(item.attributes.width)) {
        element.style.width = item.attributes.width;
      }
      if (isValidImageDimension(item.attributes.widthPx)) {
        element.style.width = `${item.attributes.widthPx}px`;
      }
      if (isValidImageDimension(item.attributes.heightPx)) {
        element.style.height = `${item.attributes.heightPx}px`;
      }
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
    throw new Error("تعذر عرض الإعلان بسبب تلف بياناته.");
  }
  for (const item of content) {
    appendNode(fragment, item, 0);
  }
  return fragment;
}
