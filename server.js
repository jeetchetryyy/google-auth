require("dotenv").config();
const express = require("express");
const path = require("path");
const { MongoClient } = require("mongodb");
const NodeCache = require("node-cache");
const SuperTokens = require("supertokens-node");
const EmailPassword = require("supertokens-node/recipe/emailpassword");
const Session = require("supertokens-node/recipe/session");
const { middleware, errorHandler } = require("supertokens-node/framework/express");

const app = express();
const cache = new NodeCache({ stdTTL: 30, checkperiod: 60 });

SuperTokens.init({
  framework: "express",
  supertokens: {
    connectionURI: process.env.SUPERTOKENS_CONNECTION_URI,
    apiKey: process.env.SUPERTOKENS_API_KEY,
  },
  appInfo: {
    appName: "google-auth",
    apiDomain: process.env.API_DOMAIN || "http://localhost:3000",
    websiteDomain: process.env.WEBSITE_DOMAIN || "http://localhost:3000",
    apiBasePath: "/auth",
    websiteBasePath: "/",
  },
  recipeList: [EmailPassword.init(), Session.init()],
});
console.log("SuperTokens initialized");

// ---- body parsing ----
app.use(express.json({ limit: "100kb" }));

// ---- JSON parse error handler ----
// MUST be right after express.json() and before routes/middleware that parse bodies.
app.use((err, req, res, next) => {
  if (
    err &&
    (err.type === "entity.parse.failed" ||
      (err instanceof SyntaxError && err.status === 400))
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body.",
    });
  }
  next(err);
});

// ---- SuperTokens middleware ----
app.use(middleware());

// ---- static + root ----
app.use("/public", express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.redirect("/public/auth/login.html"));

// ---- Mongo ----
const mongoUri = process.env.MONGODB_URI || "";
const isSrv = mongoUri.startsWith("mongodb+srv://");

let usersCol, onboardingCol;
let client = null;

function makeClient() {
  return new MongoClient(mongoUri, {
    ...(isSrv ? {} : { tls: true }),
    serverSelectionTimeoutMS: 60000,
    connectTimeoutMS: 60000,
    socketTimeoutMS: 60000,
  });
}

async function connectWithRetry(maxAttempts = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log("Mongo connect attempt " + attempt + "/" + maxAttempts + "...");
      const c = makeClient();
      await c.connect();
      console.log("MongoDB connected");
      return c;
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const isTls = /tlsv1 alert internal error|ERR_SSL_TLSV1|SSL alert number 80/.test(msg);
      if (attempt < maxAttempts) {
        const wait = isTls ? 2000 : 1000;
        console.log("  " + (isTls ? "TLS flake (WARP?). " : "") + "Retrying in " + (wait / 1000) + "s...");
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      console.error("Mongo connect failed after " + maxAttempts + " attempts:", err);
      throw err;
    }
  }
}

async function ensureIndexes() {
  await usersCol.createIndex({ supertokensUserId: 1 }, { unique: true });
  await onboardingCol.createIndex({ supertokensUserId: 1 }, { unique: true });
  await onboardingCol.createIndex({ updatedAt: -1 });
  console.log("Mongo indexes ensured");
}

function cacheKey(userId) {
  return "user:" + userId;
}

async function getUserData(userId) {
  const cached = cache.get(cacheKey(userId));
  if (cached) return Object.assign({}, cached, { _cacheHit: true });

  const stUser = await SuperTokens.getUser(userId);
  if (!stUser) return null;
  const email = (stUser.emails && stUser.emails[0]) || null;

  await usersCol.updateOne(
    { supertokensUserId: userId },
    {
      $set: { email: email, updatedAt: new Date() },
      $setOnInsert: { supertokensUserId: userId, createdAt: new Date() },
    },
    { upsert: true }
  );

  const mongoUser = await usersCol.findOne({ supertokensUserId: userId });
  const onboarding = await onboardingCol.findOne({ supertokensUserId: userId });

  const payload = {
    user: { id: userId, email: email, mongoId: mongoUser && mongoUser._id },
    onboarding: onboarding,
    onboardingComplete: !!onboarding,
  };
  cache.set(cacheKey(userId), payload);
  return payload;
}

const CURRENCIES = new Set(["INR", "USD", "EUR", "GBP"]);
const EMPLOYMENTS = new Set(["salaried", "self-employed", "business", "unemployed"]);
const RISKS = new Set(["low", "medium", "high"]);

function validateOnboarding(body) {
  const fields = {}, clean = {};
  const numeric = ["monthlyIncome", "monthlyExpenses", "savingsBalance", "investmentBalance"];
  for (let i = 0; i < numeric.length; i++) {
    const k = numeric[i];
    const v = body && body[k];
    if (v === undefined || v === null || v === "") fields[k] = "Required.";
    else if (typeof v !== "number" || !isFinite(v) || v < 0) fields[k] = "Must be a non-negative number.";
    else clean[k] = v;
  }
  if (!CURRENCIES.has(body && body.primaryCurrency)) fields.primaryCurrency = "Invalid currency.";
  else clean.primaryCurrency = body.primaryCurrency;

  if (!EMPLOYMENTS.has(body && body.employmentType)) fields.employmentType = "Invalid employment type.";
  else clean.employmentType = body.employmentType;

  if (!RISKS.has(body && body.riskTolerance)) fields.riskTolerance = "Invalid risk tolerance.";
  else clean.riskTolerance = body.riskTolerance;

  return { ok: Object.keys(fields).length === 0, fields: fields, clean: clean };
}

// ---- routes ----

app.get("/api/auth-state", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: false });
    if (!session) {
      return res.json({ authenticated: false, redirect: "/public/auth/login.html" });
    }
    const userId = session.getUserId();
    const onboarding = await onboardingCol.findOne(
      { supertokensUserId: userId },
      { projection: { _id: 1 } }
    );
    if (!onboarding) {
      return res.json({
        authenticated: true,
        onboardingComplete: false,
        redirect: "/public/onboarding/",
      });
    }
    return res.json({
      authenticated: true,
      onboardingComplete: true,
      redirect: "/public/dashboard/",
    });
  } catch (err) {
    console.error("/api/auth-state ERROR:", err);
    return res.json({ authenticated: false, redirect: "/public/auth/login.html" });
  }
});

app.get("/api/me", async (req, res) => {
  try {
    const session = await Session.getSession(req, res);
    const userId = session.getUserId();
    const data = await getUserData(userId);
    if (!data) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({
      success: true,
      user: data.user,
      onboarding: data.onboarding,
      onboardingComplete: data.onboardingComplete,
      _cacheHit: !!data._cacheHit,
    });
  } catch (err) {
    console.error("/api/me ERROR:", err.message);
    return res.status(err.type === "UNAUTHORISED" ? 401 : 500).json({
      success: false,
      message: err.message,
    });
  }
});

app.post("/api/onboarding", async (req, res) => {
  try {
    const session = await Session.getSession(req, res);
    const userId = session.getUserId();

    const result = validateOnboarding(req.body);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: "Validation failed.", fields: result.fields });
    }

    const now = new Date();
    await onboardingCol.updateOne(
      { supertokensUserId: userId },
      {
        $set: Object.assign({}, result.clean, { updatedAt: now }),
        $setOnInsert: { supertokensUserId: userId, createdAt: now },
      },
      { upsert: true }
    );

    cache.del(cacheKey(userId));
    console.log("Onboarding saved:", userId);
    return res.json({ success: true });
  } catch (err) {
    console.error("/api/onboarding ERROR:", err.message);
    return res
      .status(err.type === "UNAUTHORISED" ? 401 : 500)
      .json({ success: false, message: err.message });
  }
});

app.post("/api/logout", async (req, res) => {
  try {
    const session = await Session.getSession(req, res, { sessionRequired: false });
    if (session) {
      const userId = session.getUserId();
      await session.revokeSession();
      cache.del(cacheKey(userId));
    }
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

if (process.env.NODE_ENV !== "production") {
  app.get("/api/debug/cache", (_req, res) => res.json({ keys: cache.keys(), stats: cache.getStats() }));
}

// ---- SuperTokens error handler (must be last) ----
app.use(errorHandler());

async function startServer() {
  try {
    client = await connectWithRetry(10);
    const db = client.db("google_auth");
    usersCol = db.collection("users");
    onboardingCol = db.collection("onboarding");
    await ensureIndexes();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log("Server running on http://localhost:" + PORT);
      console.log("  login:      http://localhost:" + PORT + "/public/auth/login.html");
      console.log("  signup:     http://localhost:" + PORT + "/public/auth/signup.html");
      console.log("  onboarding: http://localhost:" + PORT + "/public/onboarding/");
      console.log("  dashboard:  http://localhost:" + PORT + "/public/dashboard/");
    });
  } catch (err) {
    console.error("START ERROR:", err);
    process.exit(1);
  }
}
startServer();