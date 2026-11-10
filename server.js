// server.js: the chat's server. Express sends the chat page AND answers every /api request.
// Every message, chat, and user lives in MongoDB (chatDB), and the server has the final say.
// YOU write the routes, one day at a time. Each one answers 501 "not built yet" until you build it.
import express from "express";
import { ObjectId } from "mongodb";
import { connectDB, seedDatabase } from "./mongo.js";
import { setUpChat } from "./setup/chat.js";

const PORT = 3000;
const app = express();

// Reads JSON bodies sent by the browser.
app.use(express.json());
// Sends the chat page (everything in the public folder) to the browser.
app.use(express.static("public"));

// ---------- Station U: read JSON bodies ----------

// ALREADY DONE: connects with your connectDB(), seeds with your seedDatabase(),
// adds GET /api/status and POST /api/reset.
const db = await setUpChat(app, connectDB, seedDatabase);

// ---------- Station U: Accounts ----------
// POST /api/users   body: { "username": "alan", "displayName": "Alan M." }
// Signs up a new user. 400 if the username breaks the rules, 409 if it's taken.
// Everyone who signs up joins the West-MEC Lounge.
app.post("/api/users", async (req, res) => {
  const { username, displayName } = req.body || {};

  if (typeof username !== "string" || !/^[a-z0-9-]{3,20}$/.test(username)) {
    return res.status(400).json({
      error: "A username is 3 to 20 lowercase letters, numbers, or dashes",
    });
  }

  try {
    const user = {
      _id: username,
      displayName: displayName || username,
      createdAt: new Date(),
    };

    await db.collection("users").insertOne(user);

    await db
      .collection("chats")
      .updateOne(
        { name: "West-MEC Lounge" },
        { $addToSet: { members: username } },
      );

    res.status(201).json(user);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: `The username ${username} is taken`,
      });
    }

    res.status(500).json({ error: error.message });
  }
});

// GET /api/users/:username: signs in. Sends back ONE user, or 404 if there's no one with that username.
app.get("/api/users/:username", async (req, res) => {
  try {
    const user = await db.collection("users").findOne({
      _id: req.params.username,
    });

    if (!user) {
      return res.status(404).json({
        error: `There is no user named ${req.params.username}`,
      });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/users: sends back an array of every user, A to Z (the People list).
app.get("/api/users", async (req, res) => {
  try {
    const users = await db
      .collection("users")
      .find({})
      .sort({ _id: 1 })
      .toArray();

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Day 3: Conversations ----------
// GET /api/chats?user=alan: sends back every chat that user is a member of, newest first.
app.get("/api/chats", async (req, res) => {
  try {
    const username = req.query.user;

    if (!username) {
      return res.status(400).json({ error: "A username is required" });
    }

    const chats = await db
      .collection("chats")
      .find({ members: username })
      .sort({ updatedAt: -1 })
      .toArray();

    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chats/direct   body: { "from": "alan", "to": "maria" }
// Opens a direct message between two people. Already have one? Sends that one back (200).
// New one? 201. 400 if someone is missing or it's yourself, 404 if either user doesn't exist.
app.post("/api/chats/direct", async (req, res) => {
  const { from, to } = req.body || {};

  if (!from || !to || from === to) {
    return res.status(400).json({
      error: "Two different users are required",
    });
  }

  try {
    const users = await db
      .collection("users")
      .find({
        _id: { $in: [from, to] },
      })
      .toArray();

    if (users.length !== 2) {
      return res.status(404).json({
        error: "One or both users do not exist",
      });
    }

    const existingChat = await db.collection("chats").findOne({
      type: "direct",
      members: { $all: [from, to], $size: 2 },
    });

    if (existingChat) {
      return res.status(200).json(existingChat);
    }

    const chat = {
      type: "direct",
      members: [from, to],
      createdBy: from,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("chats").insertOne(chat);

    chat._id = result.insertedId;

    res.status(201).json(chat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chats/group   body: { "from": "alan", "name": "Study Group", "members": ["maria", "jay"] }
// Starts a group chat. The person who starts it is in it too.
// 400 if there's no name or no one else, 404 if anyone isn't a user.
app.post("/api/chats/group", async (req, res) => {
  const { from, name, members } = req.body || {};

  if (
    !from ||
    typeof name !== "string" ||
    !name.trim() ||
    !Array.isArray(members) ||
    members.length === 0
  ) {
    return res.status(400).json({
      error: "A group name and at least one other member are required",
    });
  }

  try {
    const chatMembers = [...new Set([from, ...members])];

    if (chatMembers.length < 2) {
      return res.status(400).json({
        error: "A group needs at least one other member",
      });
    }

    const users = await db
      .collection("users")
      .find({
        _id: { $in: chatMembers },
      })
      .toArray();

    if (users.length !== chatMembers.length) {
      return res.status(404).json({
        error: "One or more users do not exist",
      });
    }

    const chat = {
      type: "group",
      name: name.trim(),
      members: chatMembers,
      createdBy: from,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("chats").insertOne(chat);

    chat._id = result.insertedId;

    res.status(201).json(chat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Day 4: Messages ----------
// GET /api/chats/:id/messages?user=alan&after=2026-10-12T18:00:00.000Z
// Sends back the chat's messages, oldest first. With after: only the ones sent after that time.
// 400 bad id, 404 no chat, 403 if user isn't a member.
app.get("/api/chats/:id/messages", async (req, res) => {
  const id = req.params.id;
  const username = req.query.user;
  const after = req.query.after;

  if (!ObjectId.isValid(id) || !username) {
    return res.status(400).json({
      error: "A valid chat ID and username are required"
    });
  }

  try {
    const chat = await db.collection("chats").findOne({
      _id: new ObjectId(id)
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (!chat.members.includes(username)) {
      return res.status(403).json({
        error: "You are not a member of this chat"
      });
    }

    const filter = {
      chatId: new ObjectId(id)
    };

    if (after) {
      const afterDate = new Date(after);

      if (isNaN(afterDate.getTime())) {
        return res.status(400).json({
          error: "Invalid date"
        });
      }

      filter.sentAt = { $gt: afterDate };
    }

    const messages = await db.collection("messages")
      .find(filter)
      .sort({ sentAt: 1 })
      .toArray();

    res.json(messages);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chats/:id/messages   body: { "from": "alan", "text": "hey!" }
// Sends a message. Also saves it on the chat as lastMessage, so the chat list can show it.
// 400 bad id or bad text, 404 no chat, 403 if from isn't a member.
app.post("/api/chats/:id/messages", async (req, res) => {
  const id = req.params.id;
  const { from, text } = req.body || {};

  if (
    !ObjectId.isValid(id) ||
    !from ||
    typeof text !== "string" ||
    !text.trim()
  ) {
    return res.status(400).json({
      error: "A valid chat ID, username, and message are required"
    });
  }

  try {
    const chat = await db.collection("chats").findOne({
      _id: new ObjectId(id)
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (!chat.members.includes(from)) {
      return res.status(403).json({
        error: "You are not a member of this chat"
      });
    }

    const message = {
      chatId: new ObjectId(id),
      from: from,
      text: text.trim(),
      sentAt: new Date()
    };

    const result = await db.collection("messages").insertOne(message);

    message._id = result.insertedId;

    await db.collection("chats").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          updatedAt: message.sentAt,
          lastMessage: {
            from: message.from,
            text: message.text,
            sentAt: message.sentAt
          }
        }
      }
    );

    res.status(201).json(message);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Day 3: Conversations (adding people) ----------
// ALREADY DONE (you use it in add people): saves a gray "system" line in the chat, like "alan added maria",
// and makes it the chat's lastMessage.
async function systemMessage(chatId, text) {
  const message = {
    chatId: chatId,
    from: "system",
    text: text,
    sentAt: new Date(),
  };
  await db.collection("messages").insertOne(message);
  await db
    .collection("chats")
    .updateOne(
      { _id: chatId },
      {
        $set: {
          updatedAt: message.sentAt,
          lastMessage: { from: "system", text: text, sentAt: message.sentAt },
        },
      },
    );
}

// PATCH /api/chats/:id/members   body: { "by": "alan", "username": "jay" }
// Adds someone to a group. 400 bad id or a direct message, 404 no chat or no user,
// 403 if by isn't a member, 409 if they're already in it.
app.patch("/api/chats/:id/members", async (req, res) => {
  const { by, username } = req.body || {};
  const id = req.params.id;

  if (!ObjectId.isValid(id) || !by || !username) {
    return res.status(400).json({
      error: "A valid chat ID, username, and member are required"
    });
  }

  try {
    const chat = await db.collection("chats").findOne({
      _id: new ObjectId(id)
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.type !== "group") {
      return res.status(400).json({
        error: "People can only be added to group chats"
      });
    }

    if (!chat.members.includes(by)) {
      return res.status(403).json({
        error: "You must be a member to add someone"
      });
    }

    const user = await db.collection("users").findOne({
      _id: username
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    if (chat.members.includes(username)) {
      return res.status(409).json({
        error: "That user is already in the chat"
      });
    }

    await db.collection("chats").updateOne(
      { _id: new ObjectId(id) },
      { $addToSet: { members: username } }
    );

    await systemMessage(chat._id, `${by} added ${username}`);

    const updatedChat = await db.collection("chats").findOne({
      _id: new ObjectId(id)
    });

    res.json(updatedChat);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------- Extension (done early): Leave and Rename ----------
// DELETE /api/chats/:id/members/:username: leaves a group.
app.delete("/api/chats/:id/members/:username", async (req, res) => {
  const id = req.params.id;
  const username = req.params.username;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid chat ID" });
  }

  try {
    const chat = await db.collection("chats").findOne({
      _id: new ObjectId(id),
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.type !== "group") {
      return res.status(400).json({
        error: "You cannot leave a direct message",
      });
    }

    if (!chat.members.includes(username)) {
      return res.status(404).json({
        error: "User is not a member of this chat",
      });
    }

    if (chat.members.length === 1) {
      await db.collection("chats").deleteOne({
        _id: new ObjectId(id),
      });

      await db.collection("messages").deleteMany({
        chatId: new ObjectId(id),
      });

      return res.json({ message: "Chat deleted" });
    }

    await db
      .collection("chats")
      .updateOne({ _id: new ObjectId(id) }, { $pull: { members: username } });

    res.json({ message: `${username} left the chat` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// The last one out deletes the chat AND its messages. 400 bad id or a direct message, 404 no chat or not a member.
app.patch("/api/chats/:id/members", async (req, res) => {
  const { by, username } = req.body || {};
  const id = req.params.id;

  if (!ObjectId.isValid(id) || !by || !username) {
    return res.status(400).json({
      error: "A valid chat ID, username, and member are required",
    });
  }

  try {
    const chat = await db.collection("chats").findOne({
      _id: new ObjectId(id),
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.type !== "group") {
      return res.status(400).json({
        error: "People can only be added to group chats",
      });
    }

    if (!chat.members.includes(by)) {
      return res.status(403).json({
        error: "You must be a member to add someone",
      });
    }

    const user = await db.collection("users").findOne({
      _id: username,
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    if (chat.members.includes(username)) {
      return res.status(409).json({
        error: "That user is already in the chat",
      });
    }

    await db
      .collection("chats")
      .updateOne(
        { _id: new ObjectId(id) },
        { $addToSet: { members: username } },
      );

    await systemMessage(chat._id, `${by} added ${username}`);

    const updatedChat = await db.collection("chats").findOne({
      _id: new ObjectId(id),
    });

    res.json(updatedChat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/chats/:id   body: { "by": "alan", "name": "Study Squad" }
// Renames a group. 400 bad id, no name, or a direct message, 404 no chat, 403 if by isn't a member.
app.patch("/api/chats/:id", async (req, res) => {
  const { by, name } = req.body || {};
  const id = req.params.id;

  if (
    !ObjectId.isValid(id) ||
    !by ||
    typeof name !== "string" ||
    !name.trim()
  ) {
    return res.status(400).json({
      error: "A valid chat ID and group name are required"
    });
  }

  try {
    const chat = await db.collection("chats").findOne({
      _id: new ObjectId(id)
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    if (chat.type !== "group") {
      return res.status(400).json({
        error: "Direct messages cannot be renamed"
      });
    }

    if (!chat.members.includes(by)) {
      return res.status(403).json({
        error: "You must be a member to rename this chat"
      });
    }

    await db.collection("chats").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          name: name.trim(),
          updatedAt: new Date()
        }
      }
    );

    const updatedChat = await db.collection("chats").findOne({
      _id: new ObjectId(id)
    });

    res.json(updatedChat);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Starts the server. Already running in another terminal? You get EADDRINUSE: Ctrl+C there first.
app.listen(PORT, (error) => {
  if (error) throw error;
  console.log(`WM Chat running at http://localhost:${PORT}`);
});