const themeStorageKey = "school-site-theme";
const darkTheme = "dark";
const lightTheme = "light";

let currentTheme;
try {
  currentTheme = localStorage.getItem(themeStorageKey) === darkTheme ? darkTheme : lightTheme;
} catch {
  currentTheme = lightTheme;
}

document.documentElement.dataset.theme = currentTheme;

function initializeThemeButton() {
  const themeButton = document.createElement("button");
  themeButton.className = "theme-toggle";
  themeButton.type = "button";
  themeButton.addEventListener("click", () => {
    currentTheme = currentTheme === darkTheme ? lightTheme : darkTheme;
    document.documentElement.dataset.theme = currentTheme;
    try {
      localStorage.setItem(themeStorageKey, currentTheme);
    } catch {
      // Keep the theme switch usable when storage is unavailable.
    }
    updateThemeButton();
  });

  function updateThemeButton() {
    const nextTheme = currentTheme === darkTheme ? lightTheme : darkTheme;
    const label = nextTheme === darkTheme ? "تفعيل الوضع الداكن" : "تفعيل الوضع الفاتح";
    themeButton.textContent = nextTheme === darkTheme ? "☾ الوضع الداكن" : "☀ الوضع الفاتح";
    themeButton.setAttribute("aria-label", label);
    themeButton.setAttribute("aria-pressed", String(currentTheme === darkTheme));
    themeButton.title = label;
  }

  updateThemeButton();
  document.body.prepend(themeButton);
}

document.addEventListener("DOMContentLoaded", initializeThemeButton, { once: true });
