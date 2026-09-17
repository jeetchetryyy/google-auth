# ============================================================
# google-auth / fix.ps1
# Windows PowerShell version of fix.sh
# Idempotent — safe to re-run.
# ============================================================

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $Root
Write-Host "Project root: $Root" -ForegroundColor Cyan

# ------------------------------------------------------------
# Ensure folders
# ------------------------------------------------------------
New-Item -ItemType Directory -Force -Path "src"    | Out-Null
New-Item -ItemType Directory -Force -Path "public" | Out-Null

# ------------------------------------------------------------
# Helper for writing UTF-8 files
# ------------------------------------------------------------
function Write-Utf8File {
    param([string]$Path, [string]$Content)
    $full = Join-Path $Root $Path
    $dir  = Split-Path -Parent $full
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    # UTF-8 without BOM
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($full, $Content, $utf8NoBom)
    Write-Host "  wrote $Path" -ForegroundColor Green
}

# ============================================================
# 1. src/auth.js
# ============================================================
Write-Host "`nWriting src/auth.js ..." -ForegroundColor Yellow

$authJs = @'
import SuperTokens from "supertokens-web-js";
import EmailPassword from "supertokens-web-js/recipe/emailpassword";
import Session from "supertokens-web-js/recipe/session";

console.log("🔥 AUTH.JS LOADED");

const loginForm  = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

console.log("✅ FORMS FOUND", {
  loginForm:  !!loginForm,
  signupForm: !!signupForm,
});

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
'@

Write-Utf8File "src\auth.js" $authJs

# ------------------------------------------------------------
# Remove stale public/auth.js (esbuild will regenerate it)
# ------------------------------------------------------------
if (Test-Path "public\auth.js") {
    Write-Host "Removing old public/auth.js (will be regenerated)" -ForegroundColor DarkYellow
    Remove-Item "public\auth.js" -Force
}

# ============================================================
# 2. index.html
# ============================================================
Write-Host "`nWriting index.html ..." -ForegroundColor Yellow

$indexHtml = @'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Auth</title>
  <link rel="stylesheet" href="/public/style.css" />
</head>
<body>
<main class="page">
  <div class="auth-card">
    <div class="logo">✦</div>
    <h1 id="title">Welcome back</h1>
    <p id="subtitle">Sign in to continue</p>

    <div class="tabs">
      <button id="loginTab" class="tab active" type="button" onclick="showLogin()">Login</button>
      <button id="signupTab" class="tab" type="button" onclick="showSignup()">Sign Up</button>
    </div>

    <form id="loginForm">
      <div class="field">
        <label>Email</label>
        <input id="loginEmail" type="email" placeholder="you@example.com" required />
      </div>
      <div class="field">
        <label>Password</label>
        <div class="password-box">
          <input id="loginPassword" type="password" placeholder="Enter your password" required />
          <button type="button" class="show-btn" onclick="togglePassword('loginPassword', this)">Show</button>
        </div>
      </div>
      <button class="submit" type="submit">Login</button>
    </form>

    <form id="signupForm" class="hidden">
      <div class="field">
        <label>Email</label>
        <input id="signupEmail" type="email" placeholder="you@example.com" required />
      </div>
      <div class="field">
        <label>Password</label>
        <div class="password-box">
          <input id="signupPassword" type="password" placeholder="Create a password" required />
          <button type="button" class="show-btn" onclick="togglePassword('signupPassword', this)">Show</button>
        </div>
      </div>
      <button class="submit" type="submit">Create Account</button>
    </form>

    <div id="message"></div>

    <div class="footer">Secure authentication powered by SuperTokens</div>
  </div>
</main>

<script>
function showLogin() {
  document.getElementById("loginForm").classList.remove("hidden");
  document.getElementById("signupForm").classList.add("hidden");
  document.getElementById("loginTab").classList.add("active");
  document.getElementById("signupTab").classList.remove("active");
  document.getElementById("title").textContent = "Welcome back";
  document.getElementById("subtitle").textContent = "Sign in to continue";
  document.getElementById("message").textContent = "";
}
function showSignup() {
  console.log("🟢 SIGN UP CLICKED");
  document.getElementById("loginForm").classList.add("hidden");
  document.getElementById("signupForm").classList.remove("hidden");
  document.getElementById("loginTab").classList.remove("active");
  document.getElementById("signupTab").classList.add("active");
  document.getElementById("title").textContent = "Create account";
  document.getElementById("subtitle").textContent = "Create your account to get started";
  document.getElementById("message").textContent = "";
}
</script>

<script type="module" src="/public/auth.js"></script>
</body>
</html>
'@

Write-Utf8File "index.html" $indexHtml

# ============================================================
# 3. public/style.css
# ============================================================
Write-Host "`nWriting public/style.css ..." -ForegroundColor Yellow

$styleCss = @'
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; min-height: 100%; }
body { font-family: Arial, Helvetica, sans-serif; background: #f5f5f7; color: #111; }
.page { min-height: 100vh; min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px; }
.auth-card { width: 100%; max-width: 430px; background: #fff; padding: 40px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.10); }
.logo { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; border-radius: 14px; background: #111; color: #fff; font-size: 24px; }
h1 { text-align: center; font-size: 28px; margin-bottom: 8px; }
#subtitle { text-align: center; color: #666; margin-bottom: 28px; }
.tabs { display: flex; width: 100%; margin-bottom: 28px; padding: 4px; background: #f0f0f2; border-radius: 12px; }
.tab { flex: 1; border: 0; border-radius: 9px; padding: 12px; background: transparent; color: #666; font-size: 15px; font-weight: 600; cursor: pointer; transition: 0.2s; }
.tab:hover { color: #111; }
.tab.active { background: #fff; color: #111; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.field { margin-bottom: 18px; }
label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; }
input { width: 100%; padding: 13px 14px; border: 1px solid #d7d7dc; border-radius: 10px; outline: none; font-size: 15px; background: #fff; transition: 0.2s; }
input:focus { border-color: #111; box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }
.password-box { position: relative; }
.password-box input { padding-right: 75px; }
.show-btn { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); border: 0; background: transparent; color: #555; font-size: 13px; font-weight: 600; cursor: pointer; padding: 8px; }
.show-btn:hover { color: #111; }
.submit { width: 100%; border: 0; border-radius: 10px; padding: 14px; margin-top: 6px; background: #111; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; transition: 0.2s; }
.submit:hover { background: #333; }
#message { min-height: 24px; margin-top: 18px; text-align: center; font-size: 14px; }
#message.success { color: #15803d; }
#message.error { color: #dc2626; }
#message.loading { color: #666; }
.footer { margin-top: 28px; text-align: center; color: #888; font-size: 12px; line-height: 1.5; }
.hidden { display: none !important; }
@media (max-width: 600px) { .page { padding: 16px; } .auth-card { max-width: 100%; padding: 28px 20px; border-radius: 16px; } h1 { font-size: 24px; } input { font-size: 16px; } }
'@

Write-Utf8File "public\style.css" $styleCss

# ============================================================
# 4. server.js
# ============================================================
Write-Host "`nWriting server.js ..." -ForegroundColor Yellow

$serverJs = @'
require("dotenv").config();

const express = require("express");
const path    = require("path");
const { MongoClient } = require("mongodb");

const SuperTokens   = require("supertokens-node");
const EmailPassword = require("supertokens-node/recipe/emailpassword");
const Session       = require("supertokens-node/recipe/session");
const { middleware, errorHandler } = require("supertokens-node/framework/express");

const app = express();

SuperTokens.init({
  framework: "express",
  supertokens: {
    connectionURI: process.env.SUPERTOKENS_CONNECTION_URI,
    apiKey:        process.env.SUPERTOKENS_API_KEY,
  },
  appInfo: {
    appName:         "google-auth",
    apiDomain:       "http://localhost:3000",
    websiteDomain:   "http://localhost:3000",
    apiBasePath:     "/auth",
    websiteBasePath: "/",
  },
  recipeList: [EmailPassword.init(), Session.init()],
});

console.log("🔐 SuperTokens initialized");

app.use(express.json());
app.use(middleware());
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

const client = new MongoClient(process.env.MONGODB_URI, { family: 4, tls: true });
let users;

app.get("/api/me", async (req, res) => {
  try {
    console.log("📡 /api/me called");
    const session = await Session.getSession(req, res);
    const userId  = session.getUserId();
    console.log("🔐 SuperTokens user ID:", userId);

    const user = await EmailPassword.getUserById(userId);
    if (!user) return res.status(404).json({ success: false, message: "SuperTokens user not found" });

    const email = user.emails[0];
    console.log("📧 User email:", email);

    await users.updateOne(
      { supertokensUserId: userId },
      { $set: { email, updatedAt: new Date() }, $setOnInsert: { supertokensUserId: userId, createdAt: new Date() } },
      { upsert: true },
    );
    console.log("✅ USER SAVED TO MONGODB:", email);

    const mongoUser = await users.findOne({ supertokensUserId: userId });
    return res.json({ success: true, user: { id: userId, email, mongoId: mongoUser._id } });
  } catch (error) {
    console.error("❌ /api/me ERROR:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/test-user", async (req, res) => {
  try {
    const { email, name } = req.body;
    const user = { email, name, testUser: true, createdAt: new Date() };
    const result = await users.insertOne(user);
    return res.status(201).json({ success: true, id: result.insertedId, user });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/test-users", async (_req, res) => {
  try {
    const data = await users.find({ testUser: true }).toArray();
    return res.json({ success: true, count: data.length, users: data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.use(errorHandler());

async function startServer() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected successfully!");
    users = client.db("google_auth").collection("users");
    console.log("✅ MongoDB users collection ready");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log("🚀 Server running on http://localhost:" + PORT);
      console.log("🔐 SuperTokens enabled");
      console.log("👤 /api/me ready");
    });
  } catch (error) {
    console.error("❌ SERVER START ERROR:", error);
    process.exit(1);
  }
}
startServer();
'@

Write-Utf8File "server.js" $serverJs

# ============================================================
# 5. Update package.json scripts
# ============================================================
Write-Host "`nUpdating package.json scripts ..." -ForegroundColor Yellow

$pkgPath = Join-Path $Root "package.json"
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json

if (-not $pkg.scripts) {
    $pkg | Add-Member -MemberType NoteProperty -Name scripts -Value ([pscustomobject]@{})
}

$newScripts = [ordered]@{
    build = "esbuild src/auth.js --bundle --format=esm --outfile=public/auth.js"
    watch = "esbuild src/auth.js --bundle --format=esm --outfile=public/auth.js --watch"
    dev   = "npm run build && node server.js"
    start = "npm run build && node server.js"
    test  = "echo \"Error: no test specified\" && exit 1"
}
$pkg.scripts = [pscustomobject]$newScripts

$pkg | ConvertTo-Json -Depth 20 | Set-Content -Path $pkgPath -Encoding UTF8
Write-Host "  package.json updated" -ForegroundColor Green

# ============================================================
# 6. Make sure esbuild is installed
# ============================================================
Write-Host "`nChecking esbuild ..." -ForegroundColor Yellow
$esbuildCheck = & npx --no-install esbuild --version 2>$null
if (-not $esbuildCheck) {
    Write-Host "  installing esbuild ..." -ForegroundColor DarkYellow
    npm install --save-dev esbuild
} else {
    Write-Host "  esbuild already present ($esbuildCheck)" -ForegroundColor Green
}

# ============================================================
# 7. Build the bundle
# ============================================================
Write-Host "`nBundling src/auth.js -> public/auth.js ..." -ForegroundColor Yellow
& npx esbuild src/auth.js --bundle --format=esm --outfile=public/auth.js
if ($LASTEXITCODE -ne 0) {
    throw "esbuild failed"
}

# ============================================================
# 8. Verify
# ============================================================
Write-Host "`nVerifying layout ..." -ForegroundColor Cyan
$required = @(
    "server.js",
    "index.html",
    "package.json",
    ".env",
    "src\auth.js",
    "public\auth.js",
    "public\style.css"
)
foreach ($f in $required) {
    if (Test-Path $f) {
        Write-Host "  OK      $f" -ForegroundColor Green
    } else {
        Write-Host "  MISSING $f" -ForegroundColor Red
    }
}

Write-Host "`nFIX COMPLETE" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next:"
Write-Host "  1) npm run dev"
Write-Host "  2) open http://localhost:3000"
Write-Host "  3) hard reload: Ctrl + Shift + R"
Write-Host "  4) sign up with a real email + password"
Write-Host "  5) verify in mongosh:"
Write-Host "       use google_auth"
Write-Host "       db.users.find().pretty()"
Write-Host ""
Write-Host "While developing the frontend, run this in a 2nd terminal:"
Write-Host "       npm run watch"