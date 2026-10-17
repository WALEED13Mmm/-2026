export async function getUpdates(collection = "updates") {
  const response = await fetch(`/api/${collection}`, { credentials: "same-origin" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "تعذر تحميل الإعلانات.");
  }
  if (!Array.isArray(result.updates)) {
    throw new Error("وصلت بيانات إعلانات بتنسيق غير صالح.");
  }
  return result.updates;
}
