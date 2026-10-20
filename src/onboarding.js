import { initSuperTokens, setMessage, setFieldError, clearFieldErrors, requireAuth } from "./auth-common.js";

initSuperTokens();

(async () => {
  const state = await requireAuth();
  if (!state) return;
  if (state.onboardingComplete) {
    window.location.href = "/public/dashboard/";
  }
})();

const form = document.getElementById("onboardingForm");
const NUMERIC = ["monthlyIncome", "monthlyExpenses", "savingsBalance", "investmentBalance"];

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFieldErrors();

  const payload = {};
  let ok = true;

  for (const id of NUMERIC) {
    const raw = document.getElementById(id).value.trim();
    if (raw === "") {
      setFieldError(id, "Required.");
      ok = false;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      setFieldError(id, "Must be a non-negative number.");
      ok = false;
      continue;
    }
    payload[id] = n;
  }

  const currency = document.getElementById("primaryCurrency").value;
  if (!currency) { setFieldError("primaryCurrency", "Required."); ok = false; }
  else payload.primaryCurrency = currency;

  const employment = document.getElementById("employmentType").value;
  if (!employment) { setFieldError("employmentType", "Required."); ok = false; }
  else payload.employmentType = employment;

  const risk = document.querySelector('input[name="riskTolerance"]:checked');
  if (!risk) { setFieldError("riskTolerance", "Pick one."); ok = false; }
  else payload.riskTolerance = risk.value;

  if (!ok) { setMessage("Please fix the highlighted fields.", "error"); return; }

  setMessage("Saving…", "loading");
  try {
    const res = await fetch("/api/onboarding", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (data.fields) Object.entries(data.fields).forEach(([k, v]) => setFieldError(k, v));
      setMessage(data.message || "Save failed.", "error");
      return;
    }
    setMessage("Saved! Redirecting to dashboard…", "success");
    window.location.href = "/public/dashboard/";
  } catch (err) {
    console.error("onboarding error:", err);
    setMessage(err.message || "Save failed.", "error");
  }
});
