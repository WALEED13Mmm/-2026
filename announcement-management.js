export function createManagementActions({
  announcement,
  onEdit,
  onDelete,
  itemLabel = "الإعلان"
}) {
  const actions = document.createElement("div");
  actions.className = "announcement-management";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "تعديل";
  editButton.setAttribute("aria-label", `تعديل ${itemLabel}: ${announcement.title}`);
  editButton.addEventListener("click", () => onEdit(announcement));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "حذف";
  deleteButton.setAttribute("aria-label", `حذف ${itemLabel}: ${announcement.title}`);
  deleteButton.addEventListener("click", () => onDelete(announcement));

  actions.append(editButton, deleteButton);
  return actions;
}

export async function deleteAnnouncement(id, collection = "updates") {
  const response = await fetch(`/api/${collection}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "تعذر حذف الإعلان.");
  }
}
