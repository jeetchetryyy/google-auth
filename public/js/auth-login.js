import {
  __commonJS,
  clearFieldErrors,
  import_emailpassword,
  initSuperTokens,
  init_auth_common,
  postAuthRedirect,
  setFieldError,
  setMessage,
  validateEmail
} from "./chunks/chunk-O6IEPIO4.js";

// src/auth-login.js
var require_auth_login = __commonJS({
  "src/auth-login.js"() {
    init_auth_common();
    initSuperTokens();
    var form = document.getElementById("loginForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFieldErrors();
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      let ok = true;
      if (!validateEmail(email)) {
        setFieldError("email", "Enter a valid email.");
        ok = false;
      }
      if (!password) {
        setFieldError("password", "Password is required.");
        ok = false;
      }
      if (!ok) return;
      setMessage("Signing in\u2026", "loading");
      try {
        const result = await import_emailpassword.default.signIn({
          formFields: [
            { id: "email", value: email },
            { id: "password", value: password }
          ]
        });
        if (result.status === "OK") {
          setMessage("Login successful \u2014 redirecting\u2026", "success");
          await postAuthRedirect();
        } else if (result.status === "WRONG_CREDENTIALS_ERROR") {
          setMessage("Incorrect email or password.", "error");
        } else if (result.status === "FIELD_ERROR") {
          result.formFields.forEach((f) => setFieldError(f.id, f.error));
          setMessage("Please fix the highlighted fields.", "error");
        } else {
          setMessage("Unexpected result. Check console.", "error");
          console.warn("login result:", result);
        }
      } catch (err) {
        console.error("login error:", err);
        setMessage(err.message || "Login failed.", "error");
      }
    });
  }
});
export default require_auth_login();
