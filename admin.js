import { initializeAdminAccess } from "./auth-client.js?v=3";

await initializeAdminAccess({
  form: document.getElementById("admin-login-form"),
  logout: document.getElementById("admin-logout"),
  status: document.getElementById("admin-access-status")
});
