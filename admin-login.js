const loginForm = document.querySelector("#admin-login-form");
const loginFeedback = document.querySelector("#admin-login-feedback");
const adminTokenKey = "skillnest_admin_token";
const apiBase = String(window.SKILLNEST_CONFIG?.apiBase || "").replace(/\/$/, "");
const apiUrl = (pathname) => (apiBase ? `${apiBase}${pathname}` : pathname);

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(loginForm);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();

    try {
      const response = await fetch(apiUrl("/api/admin/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to login.");
      }

      if (payload.token) {
        window.localStorage.setItem(adminTokenKey, payload.token);
      }

      window.location.href = "/admin.html";
    } catch (error) {
      if (loginFeedback) {
        loginFeedback.hidden = false;
        loginFeedback.textContent =
          error instanceof Error ? error.message : "Unable to login.";
      }
    }
  });
}
