import { initSuperTokens, requireAuth } from "./auth-common.js";

initSuperTokens();

const $ = (id) => document.getElementById(id);

function fmtMoney(n, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency || ""} ${Math.round(n).toLocaleString()}`;
  }
}

(async () => {
  const state = await requireAuth();
  if (!state) return;
  if (!state.onboardingComplete) {
    window.location.href = "/public/onboarding/";
    return;
  }

  try {
    const res = await fetch("/api/me", { credentials: "include" });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || "Failed to load profile");

    const { user, onboarding } = data;
    $("userEmail").textContent = user.email;
    $("loading").classList.add("hidden");
    $("content").classList.remove("hidden");

    const c = onboarding.primaryCurrency;
    const surplus = onboarding.monthlyIncome - onboarding.monthlyExpenses;
    const savingsRate = onboarding.monthlyIncome > 0
      ? Math.max(0, Math.round((surplus / onboarding.monthlyIncome) * 100))
      : 0;
    const netWorth = onboarding.savingsBalance + onboarding.investmentBalance;
    const emergencyMonths = onboarding.monthlyExpenses > 0
      ? Math.round((onboarding.savingsBalance / onboarding.monthlyExpenses) * 10) / 10
      : Infinity;

    $("kpiSurplus").textContent = fmtMoney(surplus, c);
    $("kpiSavingsRate").textContent = savingsRate + "%";
    $("kpiNetWorth").textContent = fmtMoney(netWorth, c);
    $("kpiEmergency").textContent = isFinite(emergencyMonths) ? emergencyMonths + " mo" : "∞";

    const rows = [
      ["Monthly income",     fmtMoney(onboarding.monthlyIncome, c)],
      ["Monthly expenses",   fmtMoney(onboarding.monthlyExpenses, c)],
      ["Savings balance",    fmtMoney(onboarding.savingsBalance, c)],
      ["Investment balance", fmtMoney(onboarding.investmentBalance, c)],
      ["Primary currency",   onboarding.primaryCurrency],
      ["Employment type",    onboarding.employmentType],
      ["Risk tolerance",     onboarding.riskTolerance],
      ["Onboarded at",       new Date(onboarding.createdAt).toLocaleString()],
    ];
    $("details").innerHTML = rows
      .map(([k, v]) => `<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`)
      .join("");
  } catch (err) {
    console.error("dashboard error:", err);
    $("loading").classList.add("hidden");
    $("errorBox").classList.remove("hidden");
    $("errorBox").textContent = err.message || "Failed to load dashboard.";
  }

  $("logoutBtn").addEventListener("click", async () => {
    const { Session } = await import("./auth-common.js");
    await Session.signOut();
    window.location.href = "/public/auth/login.html";
  });
})();
