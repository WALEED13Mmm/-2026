function contentText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((item) => {
    if (item?.type === "text" && typeof item.value === "string") {
      return item.value;
    }
    return contentText(item?.children);
  }).join(" ");
}

export function filterAnnouncements(announcements, query, category) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ar");
  return announcements.filter((announcement) => {
    const matchesCategory = !category || announcement.category === category;
    const searchableText = `${announcement.title} ${contentText(announcement.content)}`.toLocaleLowerCase("ar");
    return matchesCategory && (!normalizedQuery || searchableText.includes(normalizedQuery));
  });
}
