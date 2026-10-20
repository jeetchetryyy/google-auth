import SuperTokens from "supertokens-web-js";
import EmailPassword from "supertokens-web-js/recipe/emailpassword";
import Session from "supertokens-web-js/recipe/session";

let _inited = false;

export function initSuperTokens() {
  if (_inited) return;
  SuperTokens.init({
    appInfo: {
      appName: "google-auth",
      apiDomain: window.location.origin,
      apiBasePath: "/auth",
    },
    recipeList: [
      EmailPassword.init(),
      Session.init({ tokenTransferMethod: "cookie" }),
    ],
  });
  _inited = true;
}

export { EmailPassword, Session };

export function setMessage(text, kind = "") {
  const el = document.getElementById("message");
  if (!el) return;
  el.textContent = text;
  el.className = "message" + (kind ? " " + kind : "");
}

export function setFieldError(name, text) {
  const el = document.querySelector(`[data-err="${name}"]`);
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.classList.remove("hidden");
  } else {
    el.textContent = "";
    el.classList.add("hidden");
  }
}

export function clearFieldErrors() {
  document.querySelectorAll("[data-err]").forEach(el => {
    el.textContent = "";
    el.classList.add("hidden");
  });
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Redirect after successful auth based on server state
export async function postAuthRedirect() {
  try {
    const res = await fetch("/api/auth-state", { credentials: "include" });
    const data = await res.json();
    window.location.href = data.redirect || "/public/dashboard/";
  } catch {
    window.location.href = "/public/dashboard/";
  }
}

// Redirect unauthenticated visitors to login
export async function requireAuth() {
  const res = await fetch("/api/auth-state", { credentials: "include" });
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = "/public/auth/login.html";
    return null;
  }
  return data;
}

window.togglePassword = function (id, button) {
  const input = document.getElementById(id);
  if (!input) return;
  if (input.type === "password") {
    input.type = "text";
    button.textContent = "Hide";
  } else {
    input.type = "password";
    button.textContent = "Show";
  }
};
