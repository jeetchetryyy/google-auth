import SuperTokens from "supertokens-web-js";
import EmailPassword from "supertokens-web-js/recipe/emailpassword";
import Session from "supertokens-web-js/recipe/session";

console.log("🔥 AUTH.JS LOADED");

const loginForm  = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

console.log("✅ FORMS FOUND", { loginForm: !!loginForm, signupForm: !!signupForm });

try {
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
  console.log("✅ SUPERTOKENS INITIALIZED");
} catch (error) {
  console.error("❌ SUPERTOKENS INIT ERROR:", error);
}

function setMessage(text, kind = "") {
  const el = document.getElementById("message");
  if (!el) return;
  el.textContent = text;
  el.className = kind;
}

async function syncWithMongo() {
  console.log("📡 NOW CALLING /api/me");
  const response = await fetch("/api/me", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  console.log("📡 /api/me STATUS:", response.status);
  const data = await response.json();
  console.log("📡 /api/me DATA:", data);
  if (!response.ok) throw new Error(data.message || "MongoDB save failed");
  return data;
}

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  console.log("🟢 SIGNUP FORM SUBMITTED");

  const email    = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;

  console.log("📧 SIGNUP EMAIL:", email);
  setMessage("Creating account…", "loading");

  try {
    const result = await EmailPassword.signUp({
      formFields: [
        { id: "email",    value: email },
        { id: "password", value: password },
      ],
    });

    console.log("📥 SIGNUP RESULT:", result);

    if (result.status === "OK") {
      console.log("✅ SUPERTOKENS SIGNUP SUCCESS");
      await syncWithMongo();
      setMessage("✅ Account created and saved to MongoDB", "success");
    } else if (result.status === "EMAIL_ALREADY_EXISTS_ERROR") {
      setMessage("Email already exists.", "error");
    } else if (result.status === "FIELD_ERROR") {
      setMessage(result.formFields?.[0]?.error || "Invalid details.", "error");
    } else {
      setMessage("Unexpected signup result. Check console.", "error");
      console.log("⚠️ UNKNOWN SIGNUP RESULT:", result);
    }
  } catch (error) {
    console.error("❌ SIGNUP ERROR:", error);
    setMessage(error.message, "error");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  console.log("🔵 LOGIN FORM SUBMITTED");

  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  console.log("📧 LOGIN EMAIL:", email);
  setMessage("Signing in…", "loading");

  try {
    const result = await EmailPassword.signIn({
      formFields: [
        { id: "email",    value: email },
        { id: "password", value: password },
      ],
    });

    console.log("📥 LOGIN RESULT:", result);

    if (result.status === "OK") {
      console.log("✅ SUPERTOKENS LOGIN SUCCESS");
      await syncWithMongo();
      setMessage("✅ Login successful", "success");
    } else if (result.status === "WRONG_CREDENTIALS_ERROR") {
      setMessage("Incorrect email or password.", "error");
    } else {
      setMessage("Unexpected login result. Check console.", "error");
      console.log("⚠️ UNKNOWN LOGIN RESULT:", result);
    }
  } catch (error) {
    console.error("❌ LOGIN ERROR:", error);
    setMessage(error.message, "error");
  }
});

window.togglePassword = function (id, button) {
  const input = document.getElementById(id);
  if (input.type === "password") {
    input.type = "text";
    button.textContent = "Hide";
  } else {
    input.type = "password";
    button.textContent = "Show";
  }
};

console.log("🚀 AUTH.JS READY");