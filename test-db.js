require("dotenv").config();

const { MongoClient } = require("mongodb");

async function testDB() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.error("? MONGODB_URI is missing from .env");
        process.exit(1);
    }

    if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
        console.error("? Invalid MONGODB_URI");
        console.error("It must start with mongodb:// or mongodb+srv://");
        process.exit(1);
    }

    const client = new MongoClient(uri, {
        family: 4,
        tls: true
    });

    try {
        console.log("?? Connecting to MongoDB...");

        await client.connect();

        await client.db("admin").command({ ping: 1 });

        console.log("? MongoDB connection successful!");

        const db = client.db("google_auth");
        const users = db.collection("users");

        const testUser = {
            test: true,
            name: "Jeet Test User",
            email: "jeet.test@example.com",
            createdAt: new Date()
        };

        console.log("?? Inserting test data...");

        const insertResult = await users.insertOne(testUser);

        console.log("? Inserted ID:", insertResult.insertedId);

        console.log("?? Reading data back...");

        const foundUser = await users.findOne({
            _id: insertResult.insertedId
        });

        console.log("? Data fetched from MongoDB:");
        console.log(foundUser);

        console.log("");
        console.log("?? DATABASE TEST PASSED!");

    } catch (error) {

        console.error("? DATABASE TEST FAILED");
        console.error(error);

    } finally {

        await client.close();
        console.log("?? MongoDB connection closed");

    }
}

testDB();
