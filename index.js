import { initializeAdminPageShortcut } from "./auth-client.js?v=3";

const reduceMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const menuTrigger = document.getElementById("admin-menu-trigger");
const sidebar = menuTrigger.closest(".sidebar");
const sidebarNavigation = document.getElementById("sidebar-navigation");
const menuBackdrop = document.getElementById("sidebar-menu-backdrop");
const mobileMenu = window.matchMedia("(max-width: 600px)");
initializeAdminPageShortcut(menuTrigger);

function setMobileMenuOpen(isOpen) {
  sidebar.classList.toggle("sidebar-menu-open", isOpen);
  menuTrigger.setAttribute("aria-expanded", String(isOpen));
  sidebarNavigation.setAttribute("aria-hidden", String(mobileMenu.matches && !isOpen));
  sidebarNavigation.inert = mobileMenu.matches && !isOpen;
  menuBackdrop.hidden = !mobileMenu.matches || !isOpen;
}

setMobileMenuOpen(!mobileMenu.matches);
menuTrigger.addEventListener("click", () => {
  if (mobileMenu.matches) {
    setMobileMenuOpen(!sidebar.classList.contains("sidebar-menu-open"));
  }
});
sidebarNavigation.addEventListener("click", (event) => {
  if (mobileMenu.matches && event.target.closest("a")) {
    setMobileMenuOpen(false);
  }
});
menuBackdrop.addEventListener("click", () => setMobileMenuOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileMenu.matches && sidebar.classList.contains("sidebar-menu-open")) {
    setMobileMenuOpen(false);
    menuTrigger.focus();
  }
});
mobileMenu.addEventListener("change", (event) => {
  setMobileMenuOpen(!event.matches);
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
