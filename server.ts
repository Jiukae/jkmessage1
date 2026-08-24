import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import {
  getFirestoreClient,
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  sanitizeForFirestore
} from "./src/serverFirestore";

export type UserStatusMode = 'online' | 'dnd' | 'offline';

interface UserRecord {
  id: string;
  username: string; // unique lowercase ID
  name: string;
  password?: string;
  avatarBg: string;
  avatarEmoji: string;
  customStatus?: string;
  status: UserStatusMode;
  dndUntil?: number | null; // expiration timestamp or null for indefinite
  lastSeen: number;
  createdAt: number;
}

interface FriendRequestRecord {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

interface GroupRoomRecord {
  id: string;
  name: string;
  creatorId: string;
  participantIds: string[];
  avatarBg: string;
  avatarEmoji: string;
  createdAt: number;
  updatedAt: number;
}

interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: number;
  read: boolean;
  readBy?: string[];
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
  reactions?: Record<string, string[]>;
  attachment?: {
    type: 'image' | 'file' | 'audio' | 'video' | 'document';
    url: string;
    name: string;
    size?: string;
    mimeType?: string;
  };
}

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Ensure data and uploads directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initial seed data
const initialUsers: UserRecord[] = [
  {
    id: "user_jiuk",
    username: "jiuk",
    name: "지욱 (Jiuk)",
    password: "password123",
    avatarBg: "from-blue-500 to-indigo-600",
    avatarEmoji: "⚡",
    customStatus: "새로운 프로젝트 구상 중 ✨",
    status: "online",
    lastSeen: Date.now(),
    createdAt: Date.now() - 86400000 * 5,
  },
];

const initialFriendRequests: FriendRequestRecord[] = [];
const initialMessages: MessageRecord[] = [];
const initialGroups: GroupRoomRecord[] = [];

interface DBState {
  users: UserRecord[];
  friendRequests: FriendRequestRecord[];
  messages: MessageRecord[];
  groups: GroupRoomRecord[];
}

function loadDB(): DBState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8").trim();
      if (content) {
        const data = JSON.parse(content);
        return {
          users: Array.isArray(data.users) ? data.users : initialUsers,
          friendRequests: Array.isArray(data.friendRequests) ? data.friendRequests : initialFriendRequests,
          messages: Array.isArray(data.messages) ? data.messages : initialMessages,
          groups: Array.isArray(data.groups) ? data.groups : initialGroups,
        };
      }
    }
  } catch (err) {
    console.warn("Notice: Local db.json was empty or unreadable, initializing fresh state:", err);
  }
  return {
    users: [...initialUsers],
    friendRequests: [...initialFriendRequests],
    messages: [...initialMessages],
    groups: [...initialGroups],
  };
}

let db = loadDB();

// Sync in-memory state and local db.json with Firestore
async function initFirestoreSync() {
  const firestore = getFirestoreClient();
  if (!firestore) {
    console.log("ℹ️ Running with local JSON persistence.");
    return;
  }

  try {
    console.log("☁️ Connecting to Firebase Firestore for permanent persistence...");
    const [usersSnap, requestsSnap, groupsSnap, messagesSnap] = await Promise.all([
      getDocs(collection(firestore, "users")),
      getDocs(collection(firestore, "friendRequests")),
      getDocs(collection(firestore, "groups")),
      getDocs(collection(firestore, "messages")),
    ]);

    let hasRemoteData = false;

    if (!usersSnap.empty) {
      db.users = usersSnap.docs.map((d) => d.data() as UserRecord);
      hasRemoteData = true;
    }
    if (!requestsSnap.empty) {
      db.friendRequests = requestsSnap.docs.map((d) => d.data() as FriendRequestRecord);
      hasRemoteData = true;
    }
    if (!groupsSnap.empty) {
      db.groups = groupsSnap.docs.map((d) => d.data() as GroupRoomRecord);
      hasRemoteData = true;
    }
    if (!messagesSnap.empty) {
      db.messages = messagesSnap.docs.map((d) => d.data() as MessageRecord);
      hasRemoteData = true;
    }

    if (hasRemoteData) {
      console.log(`✅ Loaded ${db.users.length} users, ${db.friendRequests.length} friend requests, ${db.groups.length} groups, ${db.messages.length} messages from Firestore.`);
      saveLocalDBOnly(db);
    } else {
      console.log("ℹ️ Firestore is empty, seeding initial data to Firestore...");
      for (const u of db.users) {
        await setDoc(doc(firestore, "users", u.id), sanitizeForFirestore(u));
      }
      for (const fr of db.friendRequests) {
        await setDoc(doc(firestore, "friendRequests", fr.id), sanitizeForFirestore(fr));
      }
      for (const g of db.groups) {
        await setDoc(doc(firestore, "groups", g.id), sanitizeForFirestore(g));
      }
      for (const m of db.messages) {
        await setDoc(doc(firestore, "messages", m.id), sanitizeForFirestore(m));
      }
    }
  } catch (err) {
    console.warn("⚠️ Error initializing Firestore sync, continuing with local DB:", err);
  }
}

function saveLocalDBOnly(state: DBState) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save local db.json:", err);
  }
}

function saveDB(state: DBState, entityChanged?: { type: 'user' | 'friendRequest' | 'group' | 'message'; item: any }) {
  saveLocalDBOnly(state);

  const firestore = getFirestoreClient();
  if (!firestore) return;

  // Asynchronously push change or snapshot to Firestore without blocking the main event loop
  (async () => {
    try {
      if (entityChanged) {
        const { type, item } = entityChanged;
        const sanitized = sanitizeForFirestore(item);
        if (type === 'user' && item?.id) {
          await setDoc(doc(firestore, "users", item.id), sanitized, { merge: true });
        } else if (type === 'friendRequest' && item?.id) {
          await setDoc(doc(firestore, "friendRequests", item.id), sanitized, { merge: true });
        } else if (type === 'group' && item?.id) {
          await setDoc(doc(firestore, "groups", item.id), sanitized, { merge: true });
        } else if (type === 'message' && item?.id) {
          await setDoc(doc(firestore, "messages", item.id), sanitized, { merge: true });
        }
      } else {
        // Batch backup state when multiple records update
        const batch = writeBatch(firestore);
        for (const u of state.users.slice(0, 100)) {
          batch.set(doc(firestore, "users", u.id), sanitizeForFirestore(u), { merge: true });
        }
        for (const g of state.groups.slice(0, 50)) {
          batch.set(doc(firestore, "groups", g.id), sanitizeForFirestore(g), { merge: true });
        }
        for (const fr of state.friendRequests.slice(0, 100)) {
          batch.set(doc(firestore, "friendRequests", fr.id), sanitizeForFirestore(fr), { merge: true });
        }
        for (const m of state.messages.slice(-100)) {
          batch.set(doc(firestore, "messages", m.id), sanitizeForFirestore(m), { merge: true });
        }
        await batch.commit();
      }
    } catch (e) {
      console.warn("Firestore sync error:", e);
    }
  })();
}

// Helper to check if two users are accepted friends
function areFriends(userId1: string, userId2: string): boolean {
  if (userId1 === userId2) return true;
  return db.friendRequests.some(
    (fr) =>
      fr.status === "accepted" &&
      ((fr.senderId === userId1 && fr.receiverId === userId2) ||
        (fr.senderId === userId2 && fr.receiverId === userId1))
  );
}

// Helper to get normalized conversation ID for two users (sorted)
function getConversationId(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  return `conv_${sorted[0]}__${sorted[1]}`;
}

// Robust helper to extract the partner user ID from conversationId
function getOtherUserIdFromConv(conversationId: string, currentUserId: string): string | undefined {
  if (conversationId.startsWith("group_")) {
    return undefined;
  }
  // Check if conversation ID uses double underscore separator
  if (conversationId.includes('__')) {
    const raw = conversationId.replace(/^conv_/, '');
    const parts = raw.split('__');
    const match = parts.find((p) => p !== currentUserId);
    if (match) return match;
  }

  // Check from messages in DB
  const msg = db.messages.find((m) => m.conversationId === conversationId);
  if (msg && msg.receiverId !== 'group') {
    return msg.senderId === currentUserId ? msg.receiverId : msg.senderId;
  }

  // Check matching friend or user IDs
  for (const u of db.users) {
    if (u.id !== currentUserId) {
      if (
        getConversationId(currentUserId, u.id) === conversationId ||
        `conv_${[currentUserId, u.id].sort().join('_')}` === conversationId ||
        `conv_${[currentUserId, u.id].sort().join('__')}` === conversationId
      ) {
        return u.id;
      }
    }
  }

  return undefined;
}

async function startServer() {
  await initFirestoreSync();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));
  app.use("/uploads", express.static(UPLOADS_DIR));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // Connected sockets mapped by userId -> Set<WebSocket>
  const userSockets = new Map<string, Set<WebSocket>>();

  function broadcastToUser(userId: string, data: any) {
    const sockets = userSockets.get(userId);
    if (sockets) {
      const payload = JSON.stringify(data);
      const toDelete: WebSocket[] = [];
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        } else {
          toDelete.push(ws);
        }
      }
      for (const ws of toDelete) {
        sockets.delete(ws);
      }
      if (sockets.size === 0) {
        userSockets.delete(userId);
      }
    }
  }

  function broadcastPresence() {
    const onlineUserIds = Array.from(userSockets.keys()).filter((uid) => {
      const sockets = userSockets.get(uid);
      return sockets && sockets.size > 0;
    });

    const userStatuses: Record<string, { status: UserStatusMode; dndUntil?: number | null }> = {};
    const now = Date.now();

    for (const u of db.users) {
      let currentStatus: UserStatusMode = u.status || "offline";
      // Check if DND has expired
      if (currentStatus === "dnd" && u.dndUntil && u.dndUntil < now) {
        currentStatus = onlineUserIds.includes(u.id) ? "online" : "offline";
        u.status = currentStatus;
        u.dndUntil = null;
        saveDB(db);
      }

      userStatuses[u.id] = {
        status: currentStatus,
        dndUntil: u.dndUntil,
      };
    }

    const payload = JSON.stringify({
      type: "presence:sync",
      payload: { onlineUserIds, userStatuses },
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on("connection", (ws: WebSocket) => {
    let currentUserId: string | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          return;
        }

        if (msg.type === "auth") {
          const newUserId = msg.payload?.userId;
          if (newUserId) {
            for (const [uid, sockets] of userSockets.entries()) {
              sockets.delete(ws);
              if (sockets.size === 0) {
                userSockets.delete(uid);
              }
            }

            currentUserId = newUserId;
            if (!userSockets.has(newUserId)) {
              userSockets.set(newUserId, new Set());
            }
            userSockets.get(newUserId)!.add(ws);

            const u = db.users.find((x) => x.id === newUserId);
            if (u) {
              if (u.status === "offline") {
                u.status = "online";
              }
              u.lastSeen = Date.now();
              saveDB(db);
            }
            broadcastPresence();
          }
        } else if (msg.type === "typing:start" || msg.type === "typing:stop") {
          const conversationId = msg.payload?.conversationId;
          if (conversationId && conversationId.startsWith("group_")) {
            const grp = db.groups.find((g) => g.id === conversationId);
            if (grp && currentUserId && grp.participantIds.includes(currentUserId)) {
              for (const pid of grp.participantIds) {
                if (pid !== currentUserId) {
                  broadcastToUser(pid, msg);
                }
              }
            }
          } else if (msg.payload?.receiverId && msg.payload?.senderId === currentUserId) {
            broadcastToUser(msg.payload.receiverId, msg);
          }
        }
      } catch (e) {
        console.error("WS parse error", e);
      }
    });

    ws.on("close", () => {
      for (const [uid, sockets] of userSockets.entries()) {
        sockets.delete(ws);
        if (sockets.size === 0) {
          userSockets.delete(uid);
          const u = db.users.find((x) => x.id === uid);
          if (u && u.status !== "dnd") {
            u.status = "offline";
            u.lastSeen = Date.now();
            saveDB(db);
          }
        }
      }
      broadcastPresence();
    });
  });

  // Periodically check expired DND timers
  setInterval(() => {
    const now = Date.now();
    let updated = false;
    for (const u of db.users) {
      if (u.status === "dnd" && u.dndUntil && u.dndUntil < now) {
        const isOnline = userSockets.has(u.id) && userSockets.get(u.id)!.size > 0;
        u.status = isOnline ? "online" : "offline";
        u.dndUntil = null;
        updated = true;
      }
    }
    if (updated) {
      saveDB(db);
      broadcastPresence();
    }
  }, 10000);

  // REST API Routes

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: Date.now() });
  });

  // Upload file or image
  app.post("/api/upload", (req, res) => {
    try {
      const { fileName, fileType, fileData, fileSize } = req.body;
      if (!fileName || !fileData) {
        return res.status(400).json({ error: "fileName and fileData are required" });
      }

      let finalUrl = fileData;
      if (fileData.startsWith("data:")) {
        const matches = fileData.match(/^data:([A-Za-z0-9\-\+\/\.]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          const ext = path.extname(fileName) || (mimeType.includes("image/png") ? ".png" : mimeType.includes("image/jpeg") ? ".jpg" : ".bin");
          const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
          const filePath = path.join(UPLOADS_DIR, safeName);
          fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
          finalUrl = `/uploads/${safeName}`;
        }
      }

      let detectedType: 'image' | 'file' | 'audio' | 'video' | 'document' = 'file';
      const lower = fileName.toLowerCase();
      if (lower.match(/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i)) {
        detectedType = 'image';
      } else if (lower.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i)) {
        detectedType = 'audio';
      } else if (lower.match(/\.(mp4|webm|mov|mkv|avi)$/i)) {
        detectedType = 'video';
      } else if (lower.match(/\.(pdf|docx?|xlsx?|pptx?|txt|csv|hwp|zip|tar|gz|7z|rar)$/i)) {
        detectedType = 'document';
      }

      return res.json({
        attachment: {
          type: detectedType,
          url: finalUrl,
          name: fileName,
          size: fileSize,
          mimeType: fileType,
        },
      });
    } catch (err: any) {
      console.error("Upload error:", err);
      return res.status(500).json({ error: "파일 업로드에 실패했습니다." });
    }
  });

  // Get current user profile
  app.get("/api/auth/me", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const { password: _, ...safeUser } = user;
    return res.json({ user: safeUser });
  });

  // Check username availability
  app.get("/api/auth/check-username", (req, res) => {
    const raw = req.query.username as string;
    if (!raw) return res.json({ available: false });
    const clean = raw.trim().toLowerCase();
    const exists = db.users.some((u) => u.username.toLowerCase() === clean);
    return res.json({ available: !exists });
  });

  // Register new user
  app.post("/api/auth/register", (req, res) => {
    const { username, name, password, avatarBg, avatarEmoji, customStatus } = req.body;

    if (!username || !name || !password) {
      return res.status(400).json({ error: "아이디, 이름, 비밀번호는 필수 입력 항목입니다." });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      return res.status(400).json({ error: "아이디는 3~20자의 영문 소문자, 숫자, 밑줄(_)만 가능합니다." });
    }

    if (db.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return res.status(400).json({ error: "이미 사용 중인 아이디입니다." });
    }

    const newUser: UserRecord = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      username: cleanUsername,
      name: name.trim(),
      password,
      avatarBg: avatarBg || "from-blue-500 to-indigo-600",
      avatarEmoji: avatarEmoji || "✨",
      customStatus: customStatus?.trim() || "안녕하세요! JK Message에 오신 것을 환영합니다.",
      status: "online",
      dndUntil: null,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };

    db.users.push(newUser);
    saveDB(db, { type: 'user', item: newUser });

    const { password: _, ...safeUser } = newUser;
    return res.json({
      message: "회원가입이 완료되었습니다.",
      user: safeUser,
      token: `token_${newUser.id}`,
    });
  });

  // Login
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "아이디와 비밀번호를 모두 입력해주세요." });
    }

    const clean = username.trim().toLowerCase();
    const user = db.users.find((u) => u.username.toLowerCase() === clean);

    if (!user || user.password !== password) {
      return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }

    user.lastSeen = Date.now();
    saveDB(db);

    const { password: _, ...safeUser } = user;
    return res.json({
      message: "로그인 성공",
      user: safeUser,
      token: `token_${user.id}`,
    });
  });

  // Update profile
  const handleProfileUpdate = (req: express.Request, res: express.Response) => {
    const { userId, name, customStatus, avatarBg, avatarEmoji } = req.body;
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (name) user.name = name.trim();
    if (customStatus !== undefined) user.customStatus = customStatus.trim();
    if (avatarBg) user.avatarBg = avatarBg;
    if (avatarEmoji) user.avatarEmoji = avatarEmoji;

    saveDB(db, { type: 'user', item: user });

    const { password: _, ...safeUser } = user;

    // Broadcast profile change to all clients in real-time
    const updatePayload = JSON.stringify({
      type: "user:profile_updated",
      payload: { user: safeUser },
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(updatePayload);
      }
    }

    return res.json({ user: safeUser });
  };

  app.put("/api/auth/profile", handleProfileUpdate);
  app.post("/api/auth/profile", handleProfileUpdate);
  app.put("/api/user/profile", handleProfileUpdate);
  app.post("/api/user/profile", handleProfileUpdate);

  // Update status (online, dnd, offline + DND duration)
  const handleStatusUpdate = (req: express.Request, res: express.Response) => {
    const { userId, status } = req.body;
    const durationMinutes = req.body.durationMinutes ?? req.body.dndDurationMinutes ?? null;

    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.status = status;
    if (status === "dnd") {
      if (durationMinutes && Number(durationMinutes) > 0) {
        user.dndUntil = Date.now() + Number(durationMinutes) * 60 * 1000;
      } else {
        user.dndUntil = null;
      }
    } else {
      user.dndUntil = null;
    }

    user.lastSeen = Date.now();
    saveDB(db, { type: 'user', item: user });

    broadcastPresence();

    const { password: _, ...safeUser } = user;

    // Also broadcast profile update so all lists reflect new status mode
    const updatePayload = JSON.stringify({
      type: "user:profile_updated",
      payload: { user: safeUser },
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(updatePayload);
      }
    }

    return res.json({ user: safeUser });
  };

  app.post("/api/auth/status", handleStatusUpdate);
  app.post("/api/user/status", handleStatusUpdate);
  app.put("/api/auth/status", handleStatusUpdate);
  app.put("/api/user/status", handleStatusUpdate);

  // Get friends list for user
  app.get("/api/friends", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.json({ friends: [] });

    const onlineSet = new Set(userSockets.keys());

    const friendUserIds = db.friendRequests
      .filter(
        (fr) =>
          fr.status === "accepted" &&
          (fr.senderId === userId || fr.receiverId === userId)
      )
      .map((fr) => (fr.senderId === userId ? fr.receiverId : fr.senderId));

    const uniqueFriendIds = Array.from(new Set(friendUserIds));

    const friends = uniqueFriendIds
      .map((fid) => {
        const u = db.users.find((user) => user.id === fid);
        if (!u) return null;
        const { password: _, ...safe } = u;
        return {
          ...safe,
          isOnline: onlineSet.has(u.id),
        };
      })
      .filter(Boolean);

    return res.json({ friends });
  });

  // Get incoming & outgoing friend requests
  app.get("/api/friends/requests", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.json({ incoming: [], outgoing: [] });

    const incoming = db.friendRequests
      .filter((fr) => fr.receiverId === userId && fr.status === "pending")
      .map((fr) => {
        const sender = db.users.find((u) => u.id === fr.senderId);
        const { password: _, ...safeSender } = sender || ({} as any);
        return {
          ...fr,
          sender: safeSender,
        };
      });

    const outgoing = db.friendRequests
      .filter((fr) => fr.senderId === userId && fr.status === "pending")
      .map((fr) => {
        const receiver = db.users.find((u) => u.id === fr.receiverId);
        const { password: _, ...safeReceiver } = receiver || ({} as any);
        return {
          ...fr,
          receiver: safeReceiver,
        };
      });

    return res.json({ incoming, outgoing });
  });

  // Send a friend request by username or ID
  app.post("/api/friends/request", (req, res) => {
    const { senderId, targetUsername, targetUserId } = req.body;

    const sender = db.users.find((u) => u.id === senderId);
    if (!sender) {
      return res.status(401).json({ error: "발신자를 찾을 수 없습니다." });
    }

    let targetUser: UserRecord | undefined;
    if (targetUserId) {
      targetUser = db.users.find((u) => u.id === targetUserId);
    } else if (targetUsername) {
      const clean = targetUsername.replace(/^@/, "").trim().toLowerCase();
      targetUser = db.users.find((u) => u.username.toLowerCase() === clean);
    }

    if (!targetUser) {
      return res.status(404).json({ error: "해당 아이디의 사용자를 찾을 수 없습니다." });
    }

    if (targetUser.id === senderId) {
      return res.status(400).json({ error: "자기 자신에게는 친구 요청을 보낼 수 없습니다." });
    }

    if (areFriends(senderId, targetUser.id)) {
      return res.status(400).json({ error: "이미 친구로 등록된 사용자입니다." });
    }

    const existingReq = db.friendRequests.find(
      (fr) =>
        fr.status === "pending" &&
        ((fr.senderId === senderId && fr.receiverId === targetUser.id) ||
          (fr.senderId === targetUser.id && fr.receiverId === senderId))
    );

    if (existingReq) {
      if (existingReq.senderId === targetUser.id) {
        existingReq.status = "accepted";
        saveDB(db, { type: 'friendRequest', item: existingReq });

        const { password: _, ...safeSender } = sender;
        const { password: __, ...safeTarget } = targetUser;

        const payload = {
          type: "friend:response",
          payload: { request: existingReq, accepted: true },
        };
        broadcastToUser(senderId, payload);
        broadcastToUser(targetUser.id, payload);

        return res.json({ message: "상대방의 요청을 수락하여 친구가 되었습니다!", request: existingReq, autoAccepted: true });
      }
      return res.status(400).json({ error: "이미 친구 요청을 보냈거나 대기 중입니다." });
    }

    const newReq: FriendRequestRecord = {
      id: `freq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId,
      receiverId: targetUser.id,
      status: "pending",
      createdAt: Date.now(),
    };

    db.friendRequests.push(newReq);
    saveDB(db, { type: 'friendRequest', item: newReq });

    const { password: _, ...safeSender } = sender;
    const { password: __, ...safeTarget } = targetUser;

    const populatedReq = {
      ...newReq,
      sender: safeSender,
      receiver: safeTarget,
    };

    broadcastToUser(targetUser.id, {
      type: "friend:request",
      payload: { request: populatedReq },
    });

    return res.json({ message: `@${targetUser.username} 님에게 친구 요청을 보냈습니다.`, request: populatedReq });
  });

  // Respond to friend request (Accept or Reject)
  app.post("/api/friends/respond", (req, res) => {
    const { requestId, userId, accept } = req.body;

    const request = db.friendRequests.find((fr) => fr.id === requestId);
    if (!request) {
      return res.status(404).json({ error: "친구 요청을 찾을 수 없습니다." });
    }

    if (request.receiverId !== userId) {
      return res.status(403).json({ error: "요청을 처리할 권한이 없습니다." });
    }

    request.status = accept ? "accepted" : "rejected";
    saveDB(db, { type: 'friendRequest', item: request });

    const sender = db.users.find((u) => u.id === request.senderId);
    const receiver = db.users.find((u) => u.id === request.receiverId);

    const populatedReq = {
      ...request,
      sender: sender ? (({ password: _, ...safe }) => safe)(sender) : undefined,
      receiver: receiver ? (({ password: _, ...safe }) => safe)(receiver) : undefined,
    };

    const wsPayload = {
      type: "friend:response",
      payload: { request: populatedReq, accepted: accept },
    };

    broadcastToUser(request.senderId, wsPayload);
    broadcastToUser(request.receiverId, wsPayload);

    return res.json({ request: populatedReq, accepted: accept });
  });

  // Search users to add as friend
  app.get("/api/users/search", (req, res) => {
    const query = ((req.query.q as string) || "").trim().toLowerCase();
    const currentUserId = req.query.currentUserId as string;
    const onlineSet = new Set(userSockets.keys());

    const results = db.users
      .filter((u) => {
        if (u.id === currentUserId) return false;
        if (!query) return true;
        return (
          u.username.toLowerCase().includes(query) ||
          u.name.toLowerCase().includes(query) ||
          (u.customStatus && u.customStatus.toLowerCase().includes(query))
        );
      })
      .map((u) => {
        const { password: _, ...safe } = u;
        const isFriend = areFriends(currentUserId, u.id);
        const incomingReq = db.friendRequests.find(
          (fr) =>
            fr.status === "pending" &&
            fr.senderId === u.id &&
            fr.receiverId === currentUserId
        );
        const outgoingReq = db.friendRequests.find(
          (fr) =>
            fr.status === "pending" &&
            fr.senderId === currentUserId &&
            fr.receiverId === u.id
        );
        const pendingDirection = incomingReq
          ? "incoming"
          : outgoingReq
          ? "outgoing"
          : null;
        const pendingRequestId = incomingReq
          ? incomingReq.id
          : outgoingReq
          ? outgoingReq.id
          : null;

        return {
          ...safe,
          isOnline: onlineSet.has(u.id),
          isFriend,
          hasPendingRequest: Boolean(pendingDirection),
          pendingDirection,
          pendingRequestId,
        };
      });

    return res.json({ users: results });
  });

  // ===================== GROUP CHAT ENDPOINTS =====================

  // Create a new group room
  app.post("/api/groups/create", (req, res) => {
    const { name, creatorId, participantIds, avatarBg, avatarEmoji } = req.body;

    if (!name || !creatorId || !participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({ error: "그룹 이름 및 참여자 목록이 필요합니다." });
    }

    const uniqueParticipants = Array.from(new Set([creatorId, ...participantIds]));
    if (uniqueParticipants.length < 2) {
      return res.status(400).json({ error: "단체 채팅방은 최소 2명 이상의 멤버가 필요합니다." });
    }

    const newGroup: GroupRoomRecord = {
      id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      creatorId,
      participantIds: uniqueParticipants,
      avatarBg: avatarBg || "from-amber-500 to-rose-600",
      avatarEmoji: avatarEmoji || "👥",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    db.groups.push(newGroup);

    // Initial system notice message
    const creatorUser = db.users.find((u) => u.id === creatorId);
    const creatorName = creatorUser ? creatorUser.name : "멤버";

    const systemMsg: MessageRecord = {
      id: `msg_sys_${Date.now()}`,
      conversationId: newGroup.id,
      senderId: "system",
      receiverId: "group",
      text: `📢 ${creatorName}님이 '${newGroup.name}' 단체 채팅방을 개설했습니다. (${uniqueParticipants.length}명 참여)`,
      createdAt: Date.now(),
      read: true,
      readBy: uniqueParticipants,
    };
    db.messages.push(systemMsg);

    saveDB(db, { type: 'group', item: newGroup });
    saveDB(db, { type: 'message', item: systemMsg });

    // Broadcast to all group members
    for (const pid of uniqueParticipants) {
      broadcastToUser(pid, {
        type: "group:created",
        payload: { group: newGroup },
      });
      broadcastToUser(pid, {
        type: "message:new",
        payload: { message: systemMsg },
      });
    }

    return res.json({ group: newGroup });
  });

  // Invite members to an existing group
  app.post("/api/groups/:id/invite", (req, res) => {
    const groupId = req.params.id;
    const { userId, newMemberIds } = req.body;

    const group = db.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({ error: "단체 채팅방을 찾을 수 없습니다." });
    }

    if (!group.participantIds.includes(userId)) {
      return res.status(403).json({ error: "그룹 멤버만 새 멤버를 초대할 수 있습니다." });
    }

    if (!newMemberIds || !Array.isArray(newMemberIds) || newMemberIds.length === 0) {
      return res.status(400).json({ error: "초대할 멤버를 선택해주세요." });
    }

    const added: string[] = [];
    for (const nid of newMemberIds) {
      if (!group.participantIds.includes(nid)) {
        group.participantIds.push(nid);
        added.push(nid);
      }
    }

    if (added.length === 0) {
      return res.status(400).json({ error: "이미 모든 사용자가 그룹에 참여 중입니다." });
    }

    group.updatedAt = Date.now();

    const inviter = db.users.find((u) => u.id === userId);
    const addedNames = added
      .map((aid) => db.users.find((u) => u.id === aid)?.name || "새 멤버")
      .join(", ");

    const noticeMsg: MessageRecord = {
      id: `msg_sys_${Date.now()}`,
      conversationId: group.id,
      senderId: "system",
      receiverId: "group",
      text: `📢 ${inviter?.name || "멤버"}님이 ${addedNames}님을 초대했습니다.`,
      createdAt: Date.now(),
      read: true,
      readBy: group.participantIds,
    };
    db.messages.push(noticeMsg);
    saveDB(db, { type: 'message', item: noticeMsg });
    saveDB(db, { type: 'group', item: group });

    for (const pid of group.participantIds) {
      broadcastToUser(pid, {
        type: "group:updated",
        payload: { group },
      });
      broadcastToUser(pid, {
        type: "message:new",
        payload: { message: noticeMsg },
      });
    }

    return res.json({ group, addedMembers: added });
  });

  // Leave group
  app.post("/api/groups/:id/leave", (req, res) => {
    const groupId = req.params.id;
    const { userId } = req.body;

    const group = db.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({ error: "단체 채팅방을 찾을 수 없습니다." });
    }

    const idx = group.participantIds.indexOf(userId);
    if (idx === -1) {
      return res.status(400).json({ error: "참여 중이지 않은 그룹입니다." });
    }

    group.participantIds.splice(idx, 1);
    group.updatedAt = Date.now();

    const leaver = db.users.find((u) => u.id === userId);
    const noticeMsg: MessageRecord = {
      id: `msg_sys_${Date.now()}`,
      conversationId: group.id,
      senderId: "system",
      receiverId: "group",
      text: `👋 ${leaver?.name || "멤버"}님이 채팅방을 나갔습니다.`,
      createdAt: Date.now(),
      read: true,
      readBy: group.participantIds,
    };
    db.messages.push(noticeMsg);
    saveDB(db, { type: 'message', item: noticeMsg });
    saveDB(db, { type: 'group', item: group });

    for (const pid of group.participantIds) {
      broadcastToUser(pid, {
        type: "group:updated",
        payload: { group },
      });
      broadcastToUser(pid, {
        type: "message:new",
        payload: { message: noticeMsg },
      });
    }

    broadcastToUser(userId, {
      type: "group:left",
      payload: { groupId, userId },
    });

    return res.json({ success: true, group });
  });

  // Get conversations for user (1:1 with friends + Group chats)
  app.get("/api/conversations", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.json({ conversations: [] });

    const onlineSet = new Set(userSockets.keys());

    // 1. Direct (1:1) conversations
    const userConvs = new Map<
      string,
      { otherUserId: string; conversationId: string; lastMessage?: MessageRecord; unreadCount: number; updatedAt: number }
    >();

    for (const msg of db.messages) {
      if (msg.receiverId !== "group" && !msg.conversationId.startsWith("group_")) {
        if (msg.senderId === userId || msg.receiverId === userId) {
          const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
          
          if (!areFriends(userId, otherUserId)) {
            continue;
          }

          const convId = msg.conversationId;

          if (!userConvs.has(convId)) {
            userConvs.set(convId, {
              otherUserId,
              conversationId: convId,
              unreadCount: 0,
              updatedAt: msg.createdAt,
            });
          }

          const item = userConvs.get(convId)!;
          if (!item.lastMessage || msg.createdAt > item.lastMessage.createdAt) {
            item.lastMessage = msg;
            item.updatedAt = msg.createdAt;
          }
          if (msg.receiverId === userId && !msg.read) {
            item.unreadCount += 1;
          }
        }
      }
    }

    const directConversations = Array.from(userConvs.values())
      .map((item) => {
        const other = db.users.find((u) => u.id === item.otherUserId);
        if (!other) return null;
        const { password: _, ...safeOther } = other;
        return {
          id: item.conversationId,
          isGroup: false,
          participantIds: [userId, item.otherUserId],
          otherUser: {
            ...safeOther,
            isOnline: onlineSet.has(other.id),
          },
          lastMessage: item.lastMessage,
          unreadCount: item.unreadCount,
          updatedAt: item.updatedAt,
        };
      })
      .filter(Boolean);

    // 2. Group conversations
    const userGroups = db.groups.filter((g) => g.participantIds.includes(userId));
    const groupConversations = userGroups.map((grp) => {
      const groupMsgs = db.messages.filter((m) => m.conversationId === grp.id);
      const lastMessage = groupMsgs.length > 0 ? groupMsgs[groupMsgs.length - 1] : undefined;
      const unreadCount = groupMsgs.filter(
        (m) => m.senderId !== userId && (!m.readBy || !m.readBy.includes(userId))
      ).length;

      const participants = grp.participantIds
        .map((pid) => db.users.find((u) => u.id === pid))
        .filter(Boolean)
        .map((u) => {
          const { password: _, ...safe } = u!;
          return {
            ...safe,
            isOnline: onlineSet.has(u!.id),
          };
        });

      return {
        id: grp.id,
        isGroup: true,
        group: grp,
        participantIds: grp.participantIds,
        participants,
        lastMessage,
        unreadCount,
        updatedAt: lastMessage ? lastMessage.createdAt : grp.updatedAt,
      };
    });

    const allConversations = [...directConversations, ...groupConversations].sort(
      (a: any, b: any) => (b?.updatedAt || 0) - (a?.updatedAt || 0)
    );

    return res.json({ conversations: allConversations });
  });

  // Get messages for conversation (1:1 or Group)
  app.get("/api/messages", (req, res) => {
    const conversationId = req.query.conversationId as string;
    const userId = req.query.userId as string;

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }

    const isGroup = conversationId.startsWith("group_");

    if (isGroup) {
      const group = db.groups.find((g) => g.id === conversationId);
      if (!group || !group.participantIds.includes(userId)) {
        return res.status(403).json({ error: "단체 채팅방 참여자가 아닙니다." });
      }

      // Mark unread group messages as read by this user
      let updated = false;
      db.messages.forEach((m) => {
        if (m.conversationId === conversationId && m.senderId !== userId) {
          if (!m.readBy) m.readBy = [];
          if (!m.readBy.includes(userId)) {
            m.readBy.push(userId);
            updated = true;
          }
        }
      });

      if (updated) {
        saveDB(db);
      }

      const messages = db.messages
        .filter((m) => m.conversationId === conversationId)
        .map((m) => {
          const senderUser = db.users.find((u) => u.id === m.senderId);
          return {
            ...m,
            sender: senderUser ? (({ password: _, ...safe }) => safe)(senderUser) : undefined,
          };
        })
        .sort((a, b) => a.createdAt - b.createdAt);

      return res.json({ messages, isGroup: true, group });
    }

    // 1:1 conversation check
    const otherId = getOtherUserIdFromConv(conversationId, userId);

    if (otherId && !areFriends(userId, otherId)) {
      return res.status(403).json({ error: "친구 사이에서만 대화 내역을 조회할 수 있습니다.", notFriends: true });
    }

    // Mark unread messages sent to current user as read
    let updated = false;
    db.messages.forEach((m) => {
      const isTargetConv =
        m.conversationId === conversationId ||
        (otherId &&
          ((m.senderId === userId && m.receiverId === otherId) ||
            (m.senderId === otherId && m.receiverId === userId)));

      if (isTargetConv && m.receiverId === userId && !m.read) {
        m.read = true;
        updated = true;
      }
    });

    if (updated) {
      saveDB(db);
      if (otherId) {
        broadcastToUser(otherId, {
          type: "message:read",
          payload: { conversationId, readerId: userId },
        });
      }
    }

    const messages = db.messages
      .filter((m) => {
        if (m.conversationId === conversationId) return true;
        if (
          otherId &&
          ((m.senderId === userId && m.receiverId === otherId) ||
            (m.senderId === otherId && m.receiverId === userId))
        ) {
          return true;
        }
        return false;
      })
      .map((m) => {
        const senderUser = db.users.find((u) => u.id === m.senderId);
        return {
          ...m,
          sender: senderUser ? (({ password: _, ...safe }) => safe)(senderUser) : undefined,
        };
      })
      .sort((a, b) => a.createdAt - b.createdAt);

    return res.json({ messages, isGroup: false });
  });

  // Send message (1:1 or Group)
  app.post("/api/messages/send", (req, res) => {
    const { senderId, receiverId, conversationId: customConvId, text, replyTo, attachment } = req.body;

    if (!senderId) {
      return res.status(400).json({ error: "senderId is required" });
    }

    if (!text && !attachment) {
      return res.status(400).json({ error: "메시지 내용이나 첨부파일을 입력해주세요." });
    }

    const isGroup = (customConvId && customConvId.startsWith("group_")) || receiverId === "group";

    if (isGroup) {
      const targetGroupId = customConvId || receiverId;
      const group = db.groups.find((g) => g.id === targetGroupId);
      if (!group) {
        return res.status(404).json({ error: "단체 채팅방을 찾을 수 없습니다." });
      }

      if (!group.participantIds.includes(senderId)) {
        return res.status(403).json({ error: "해당 단체 채팅방의 멤버가 아닙니다." });
      }

      const senderUser = db.users.find((u) => u.id === senderId);
      const newMsg: MessageRecord = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        conversationId: group.id,
        senderId,
        receiverId: "group",
        text: (text || "").trim(),
        createdAt: Date.now(),
        read: true,
        readBy: [senderId],
        replyTo,
        attachment,
      };

      db.messages.push(newMsg);
      group.updatedAt = Date.now();
      saveDB(db, { type: 'message', item: newMsg });
      saveDB(db, { type: 'group', item: group });

      const populatedMsg = {
        ...newMsg,
        sender: senderUser ? (({ password: _, ...safe }) => safe)(senderUser) : undefined,
      };

      const wsPayload = {
        type: "message:new",
        payload: { message: populatedMsg },
      };

      // Broadcast to ALL members in this group
      for (const pid of group.participantIds) {
        broadcastToUser(pid, wsPayload);
      }

      return res.json({ message: populatedMsg });
    }

    // 1:1 message
    if (!receiverId) {
      return res.status(400).json({ error: "receiverId is required for 1:1 chat" });
    }

    if (!areFriends(senderId, receiverId)) {
      return res.status(403).json({
        error: "상대방과 친구가 되어야만 대화를 나눌 수 있습니다. 먼저 친구 요청을 보내주세요!",
        notFriends: true,
      });
    }

    const conversationId = getConversationId(senderId, receiverId);
    const senderUser = db.users.find((u) => u.id === senderId);

    const newMsg: MessageRecord = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversationId,
      senderId,
      receiverId,
      text: (text || "").trim(),
      createdAt: Date.now(),
      read: false,
      replyTo,
      attachment,
    };

    db.messages.push(newMsg);
    saveDB(db, { type: 'message', item: newMsg });

    const populatedMsg = {
      ...newMsg,
      sender: senderUser ? (({ password: _, ...safe }) => safe)(senderUser) : undefined,
    };

    const wsPayload = {
      type: "message:new",
      payload: { message: populatedMsg },
    };

    // Broadcast to receiver & sender
    broadcastToUser(receiverId, wsPayload);
    broadcastToUser(senderId, wsPayload);

    return res.json({ message: populatedMsg });
  });

  // React to message (1:1 or Group)
  app.post("/api/messages/react", (req, res) => {
    const { messageId, emoji, userId } = req.body;
    const msg = db.messages.find((m) => m.id === messageId);
    if (!msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (!msg.reactions) {
      msg.reactions = {};
    }

    if (!msg.reactions[emoji]) {
      msg.reactions[emoji] = [];
    }

    const userList = msg.reactions[emoji];
    const idx = userList.indexOf(userId);
    let action: 'add' | 'remove' = 'add';

    if (idx >= 0) {
      userList.splice(idx, 1);
      if (userList.length === 0) {
        delete msg.reactions[emoji];
      }
      action = 'remove';
    } else {
      userList.push(userId);
      action = 'add';
    }

    saveDB(db, { type: 'message', item: msg });

    const wsPayload = {
      type: "message:react",
      payload: {
        messageId,
        conversationId: msg.conversationId,
        emoji,
        userId,
        action,
      },
    };

    if (msg.conversationId.startsWith("group_")) {
      const grp = db.groups.find((g) => g.id === msg.conversationId);
      if (grp) {
        for (const pid of grp.participantIds) {
          broadcastToUser(pid, wsPayload);
        }
      }
    } else {
      broadcastToUser(msg.senderId, wsPayload);
      broadcastToUser(msg.receiverId, wsPayload);
    }

    return res.json({ reactions: msg.reactions });
  });

  // Vite middleware for development vs static production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`ID Messenger Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
