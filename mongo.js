// mongo.js: sets up the chat's database, chatDB, on MongoDB.
// YOU write both functions at Station A. Replace each throw line with your code.
import { MongoClient } from "mongodb";
import { getMongoURI } from "./setup/practice-server.js";
import { url } from "node:inspector";

const DB_NAME = "chatDB";

// ---------- Station A: Connect ----------
// Gets the connection string, connects a MongoClient to it,
// and gives back (a promise for) the chatDB database.
export async function connectDB() {
  const uri = await getMongoURI();
  const client = new MongoClient(uri)
  await client.connect();
  return client.db(DB_NAME);

}

// ---------- Station A: Set up the collections ----------
// Runs every time the server starts, but only fills chatDB when it's empty.
// Puts in the first user (WM Bot), the first chat (West-MEC Lounge), and the first message.

// Runs every time the server starts, but only fills chatDB when it's empty.
// Puts in the first user (WM Bot), the first chat (West-MEC Lounge), and the first message.
export async function seedDatabase(db) {
  const users = db.collection("users");
  const chats = db.collection("chats");
  const messages = db.collection("messages");
  const now = new Date();
  const welcome = "Welcome to WM Chat! Everyone who signs up joins the Lounge. Say hi!";

  // Step 1: Check if already seeded
  if ((await users.countDocuments()) > 0) {
    return false;
  }

  // Step 2: Insert WM Bot
  await users.insertOne({
    _id: "wm-bot",
    displayName: "WM Bot",
    createdAt: now
  });

  // Step 3: Insert the West-MEC Lounge
  const result = await chats.insertOne({
    type: "group",
    name: "West-MEC Lounge",
    members: ["wm-bot"],
    createdBy: "wm-bot",
    createdAt: now,
    updatedAt: now,
    lastMessage: {
      from: "wm-bot",
      text: welcome,
      sentAt: now
    }
  });

  // Step 4: Insert the welcome message
  await messages.insertOne({
    chatId: result.insertedId,
    from: "wm-bot",
    text: welcome,
    sentAt: now
  });

  // Step 5: Finished
  return true;
}

