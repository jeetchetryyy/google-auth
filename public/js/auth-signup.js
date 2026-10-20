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

// src/auth-signup.js
var require_auth_signup = __commonJS({
  "src/auth-signup.js"() {
    init_auth_common();
    initSuperTokens();
    var form = document.getElementById("signupForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFieldErrors();
      const email = document.getElementById("signupEmail").value.trim();
      const password = document.getElementById("signupPassword").value;
      let ok = true;
      if (!validateEmail(email)) {
        setFieldError("email", "Enter a valid email.");
        ok = false;
      }
      if (!password || password.length < 8) {
        setFieldError("password", "Password must be at least 8 characters.");
        ok = false;
      }
      if (!ok) return;
      setMessage("Creating account\u2026", "loading");
      try {
        const result = await import_emailpassword.default.signUp({
          formFields: [
            { id: "email", value: email },
            { id: "password", value: password }
          ]
        });
        if (result.status === "OK") {
          setMessage("Account created \u2014 redirecting\u2026", "success");
          await postAuthRedirect();
        } else if (result.status === "EMAIL_ALREADY_EXISTS_ERROR") {
          setMessage("Email already exists. Try logging in.", "error");
        } else if (result.status === "FIELD_ERROR") {
          result.formFields.forEach((f) => setFieldError(f.id, f.error));
          setMessage("Please fix the highlighted fields.", "error");
        } else {
          setMessage("Unexpected result. Check console.", "error");
          console.warn("signup result:", result);
        }
      } catch (err) {
        console.error("signup error:", err);
        setMessage(err.message || "Signup failed.", "error");
      }
    });
  }
});
export default require_auth_signup();
