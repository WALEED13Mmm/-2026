export function initializeAdminPageShortcut(trigger) {
  let clickCount = 0;
  let resetTimer;
  trigger.addEventListener("click", () => {
    clickCount += 1;
    clearTimeout(resetTimer);
    if (clickCount < 7) {
      resetTimer = setTimeout(() => {
        clickCount = 0;
      }, 2500);
      return;
    }

    clickCount = 0;
    window.location.assign("admin.html");
  });
}

export async function initializeAdminSession({
  status,
  editorButton,
  editorForm,
  onAuthenticationChange = () => {}
}) {
  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const result = await response.json();
    status.hidden = true;
    const authenticated = Boolean(result.authenticated);
    if (editorButton) {
      editorButton.hidden = !authenticated;
    }
    if (!authenticated && editorForm) {
      editorForm.hidden = true;
    }
    onAuthenticationChange(authenticated);
  } catch (error) {
    if (editorButton) {
      editorButton.hidden = true;
    }
    if (editorForm) {
      editorForm.hidden = true;
    }
    status.textContent = error.message;
    status.hidden = false;
    onAuthenticationChange(false);
  }
}

async function readError(response) {
  const result = await response.json().catch(() => ({}));
  return typeof result.error === "string" ? result.error : "تعذر إكمال الطلب. حاول مرة أخرى.";
}

export async function initializeAdminAccess({
  toggle,
  form,
  logout,
  editorButton,
  editorForm,
  status,
  onAuthenticationChange = () => {}
}) {
  function setAuthenticated() {
    if (editorButton) {
      editorButton.hidden = false;
    }
    if (toggle) {
      toggle.hidden = true;
    }
    form.hidden = true;
    logout.hidden = false;
    status.textContent = "تم تسجيل الدخول بنجاح.";
    status.hidden = false;
    onAuthenticationChange(true);
  }

  function setGuest() {
    if (editorButton) {
      editorButton.hidden = true;
      editorButton.setAttribute("aria-expanded", "false");
    }
    if (editorForm) {
      editorForm.hidden = true;
    }
    if (toggle) {
      toggle.hidden = false;
      form.hidden = true;
    } else {
      form.hidden = false;
    }
    logout.hidden = true;
    status.textContent = "سجّل الدخول بحساب الإدارة لإدارة إعلانات الموقع.";
    status.hidden = false;
    onAuthenticationChange(false);
  }

  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const result = await response.json();
    if (result.authenticated) {
      setAuthenticated();
    } else {
      setGuest();
    }
  } catch (error) {
    setGuest();
    status.textContent = error.message;
  }

  if (toggle) {
    toggle.addEventListener("click", () => {
      form.hidden = !form.hidden;
      if (!form.hidden) {
        form.querySelector("#admin-username").focus();
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    status.textContent = "جارٍ التحقق من بيانات الدخول...";
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.querySelector("#admin-username").value,
          password: form.querySelector("#admin-password").value
        })
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const result = await response.json();
      form.reset();
      setAuthenticated();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      setGuest();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      logout.disabled = false;
    }
  });
}
