require("dotenv").config();

const express = require("express");
const path    = require("path");
const { MongoClient } = require("mongodb");

const SuperTokens   = require("supertokens-node");
const EmailPassword = require("supertokens-node/recipe/emailpassword");
const Session       = require("supertokens-node/recipe/session");
const { middleware, errorHandler } = require("supertokens-node/framework/express");

const app = express();

// ========================================
// SUPERTOKENS INIT
// ========================================
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

  recipeList: [
    EmailPassword.init(),
    Session.init(),
  ],
});

console.log("🔐 SuperTokens initialized");

// ========================================
// MIDDLEWARE (order matters)
// ========================================
app.use(express.json());

// SuperTokens Express middleware — REQUIRED
app.use(middleware());

// Static assets
app.use("/public", express.static(path.join(__dirname, "public")));

// Serve HTML
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ========================================
// MONGODB
// ========================================
const client = new MongoClient(process.env.MONGODB_URI, {
  family: 4,
  tls: true,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
});


let users;

// ========================================
// /api/me — read session, upsert user
// ========================================
app.get("/api/me", async (req, res) => {
  try {
    console.log("📡 /api/me called");

    const session = await Session.getSession(req, res);
    const userId  = session.getUserId();
    console.log("🔐 SuperTokens user ID:", userId);

    // FIX: v24 removed EmailPassword.getUserById → use SuperTokens.getUser
    const user = await SuperTokens.getUser(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "SuperTokens user not found",
      });
    }

    const email = user.emails[0];
    console.log("📧 User email:", email);

    await users.updateOne(
      { supertokensUserId: userId },
      {
        $set:         { email, updatedAt: new Date() },
        $setOnInsert: { supertokensUserId: userId, createdAt: new Date() },
      },
      { upsert: true },
    );
    console.log("✅ USER SAVED TO MONGODB:", email);

    const mongoUser = await users.findOne({ supertokensUserId: userId });

    return res.json({
      success: true,
      user: {
        id:      userId,
        email,
        mongoId: mongoUser._id,
      },
    });
  } catch (error) {
    console.error("❌ /api/me ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ========================================
// OPTIONAL TEST ENDPOINTS
// ========================================
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

// ========================================
// SUPERTOKENS ERROR HANDLER (must be last)
// ========================================
app.use(errorHandler());

// ========================================
// START
// ========================================
async function startServer() {
  try {
    await client.connect();
    console.log("✅ MongoDB connected successfully!");

    users = client.db("google_auth").collection("users");
    console.log("✅ MongoDB users collection ready");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log("🔐 SuperTokens enabled");
      console.log("👤 /api/me ready");
    });
  } catch (error) {
    console.error("❌ SERVER START ERROR:", error);
    process.exit(1);
  }
}

startServer();