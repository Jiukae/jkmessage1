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
export type AdminLevel = 1 | 2 | 3 | 4 | 5;

interface UserRecord {
  id: string;
  username: string; // unique lowercase ID
  name: string;
  password?: string;
  avatarBg: string;
  avatarEmoji: string;
  customStatus?: string;
  status: UserStatusMode;
  role?: 'superadmin' | 'admin' | 'user';
  adminLevel?: AdminLevel;
  moderAgreedAt?: number;
  dndUntil?: number | null; // expiration timestamp or null for indefinite
  lastSeen: number;
  createdAt: number;
}

interface NoticeApplicant {
  userId: string;
  username: string;
  name: string;
  appliedAt: number;
  reason?: string;
}

interface NoticeRecord {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorUsername: string;
  title: string;
  content: string;
  durationStr: string;
  expiresAt: number;
  createdAt: number;
  applicants: NoticeApplicant[];
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

// Initial seed data - Owner (Level 5) jiukhan0215
const initialUsers: UserRecord[] = [
  {
    id: "user_jiukhan0215",
    username: "jiukhan0215",
    name: "한지욱 (Admin)",
    password: "password123",
    avatarBg: "from-amber-500 to-red-600",
    avatarEmoji: "👑",
    customStatus: "⚡ JK Message 시스템 총괄 최고 관리자 (Owner)",
    status: "online",
    role: "superadmin",
    adminLevel: 5,
    lastSeen: Date.now(),
    createdAt: Date.now() - 86400000 * 30, // 30 days ago
  },
];

const initialFriendRequests: FriendRequestRecord[] = [];
const initialMessages: MessageRecord[] = [];
const initialGroups: GroupRoomRecord[] = [];
const initialNotices: NoticeRecord[] = [];

// Special Command Bot entity
const COMMAND_BOT: UserRecord = {
  id: "bot_command",
  username: "명령어",
  name: "⚡ 시스템 명령어 터미널",
  avatarBg: "from-amber-500 to-red-600",
  avatarEmoji: "⚡",
  customStatus: "관리자 전용 제어 콘솔",
  status: "online",
  lastSeen: Date.now(),
  createdAt: 0,
};

// Special Admin Recruitment Bot entity
const RECRUIT_BOT: UserRecord = {
  id: "bot_recruit",
  username: "모집공고",
  name: "📢 어드민 모집공고 봇",
  avatarBg: "from-amber-500 to-yellow-600",
  avatarEmoji: "📢",
  customStatus: "어드민(Admin) 지원 접수 봇 (/참여 입력)",
  status: "online",
  lastSeen: Date.now(),
  createdAt: 0,
};

export function getAdminLevel(user?: UserRecord | null): AdminLevel {
  if (!user) return 1;
  if (user.username.toLowerCase() === "jiukhan0215") return 5;
  if (user.adminLevel && user.adminLevel >= 1 && user.adminLevel <= 5) {
    return user.adminLevel as AdminLevel;
  }
  if (user.role === "superadmin") return 5;
  if (user.role === "admin") return 3;
  return 1;
}

export function getAdminRoleName(level: AdminLevel): string {
  switch (level) {
    case 5: return "Owner (최고 소유자)";
    case 4: return "Head Admin (총괄 관리자)";
    case 3: return "Admin (관리자)";
    case 2: return "Moder (모더레이터)";
    case 1:
    default:
      return "Guest/Member (일반 유저)";
  }
}

function isSuperAdmin(user?: UserRecord | null): boolean {
  if (!user) return false;
  return getAdminLevel(user) === 5;
}

function isAdmin(user?: UserRecord | null): boolean {
  if (!user) return false;
  return getAdminLevel(user) >= 2;
}

interface BanRecord {
  username: string;
  reason?: string;
  bannedAt: number;
  bannedUntil?: number | null; // null for permanent
}

interface DBState {
  users: UserRecord[];
  friendRequests: FriendRequestRecord[];
  messages: MessageRecord[];
  groups: GroupRoomRecord[];
  bans?: BanRecord[];
  notices?: NoticeRecord[];
  adminRecruitment?: {
    active: boolean;
    startedAt?: number;
    applicants?: { userId: string; username: string; name: string; appliedAt: number }[];
  };
  serverMaintenance?: {
    enabled: boolean;
    message: string;
    startedAt: number;
  };
}

function checkUserBan(username: string): { isBanned: boolean; reason?: string; untilStr?: string } {
  if (!db.bans) db.bans = [];
  const clean = username.toLowerCase();
  const banIdx = db.bans.findIndex((b) => b.username.toLowerCase() === clean);
  if (banIdx === -1) return { isBanned: false };

  const ban = db.bans[banIdx];
  if (ban.bannedUntil && ban.bannedUntil < Date.now()) {
    // Expired timeban
    db.bans.splice(banIdx, 1);
    saveDB(db);
    return { isBanned: false };
  }

  const untilStr = ban.bannedUntil
    ? new Date(ban.bannedUntil).toLocaleString('ko-KR') + '까지'
    : '영구 차단';
  return { isBanned: true, reason: ban.reason || '관리자 제재', untilStr };
}

function loadDB(): DBState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8").trim();
      if (content) {
        const data = JSON.parse(content);
        let loadedUsers = Array.isArray(data.users) ? data.users : initialUsers;
        // Purge legacy demo jiuk user
        loadedUsers = loadedUsers.filter((u: UserRecord) => u.username.toLowerCase() !== "jiuk");

        // Ensure admin user jiukhan0215 is always present
        if (!loadedUsers.some((u: UserRecord) => u.username.toLowerCase() === "jiukhan0215")) {
          loadedUsers.unshift(initialUsers[0]);
        }
        return {
          users: loadedUsers,
          friendRequests: Array.isArray(data.friendRequests) ? data.friendRequests : initialFriendRequests,
          messages: Array.isArray(data.messages) ? data.messages : initialMessages,
          groups: Array.isArray(data.groups) ? data.groups : initialGroups,
          bans: Array.isArray(data.bans) ? data.bans : [],
          notices: Array.isArray(data.notices) ? data.notices : initialNotices,
          adminRecruitment: data.adminRecruitment || { active: false, applicants: [] },
          serverMaintenance: data.serverMaintenance || { enabled: false, message: '', startedAt: 0 },
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
    bans: [],
    notices: [...initialNotices],
    adminRecruitment: { active: false, applicants: [] },
    serverMaintenance: { enabled: false, message: '', startedAt: 0 },
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
      db.users = usersSnap.docs
        .map((d) => d.data() as UserRecord)
        .filter((u) => u.username.toLowerCase() !== "jiuk");
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

  function executeAdminCommand(cmd: string, adminUser: UserRecord): string {
    const parts = cmd.trim().split(' ').filter(Boolean);
    const main = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1);
    const userLevel = getAdminLevel(adminUser);

    // 1. HELP COMMAND (/help, /도움말, /?)
    if (main === '/help' || main === '도움말' || main === '/?' || !main) {
      if (userLevel === 5) {
        // Level 5: Owner
        return [
          `👑 **[JK Message 시스템 최고 소유자(Owner) 콘솔]** (접속자: @${adminUser.username} | Level 5)`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `[ 👑 권한 및 공고 관리 ]`,
          `• \`/op <아이디> <1-5>\` : 대상 유저의 어드민 권한 레벨을 지정 (1:Guest, 2:Moder, 3:Admin, 4:HeadAdmin, 5:Owner)`,
          `• \`/vadmin\` : 📢 어드민 모집공고 봇 활성화 (유저들이 '/참여'로 지원 가능)`,
          `• \`/nadmin\` : 🛑 어드민 모집공고 봇 비활성화 (모집 공식 마감)`,
          `• \`/adminlist\` 또는 \`어드민목록\` : 1~5레벨 전체 관리자 명단 조회`,
          ``,
          `[ 🚫 계정 제재 & 보안 ]`,
          `• \`/ban <아이디> [사유]\` : 대상 유저 영구 밴 & 즉시 강제 퇴장`,
          `• \`/timeban <아이디> <시간> [사유]\` : 일정 기간 임시 밴 (예: \`/timeban user1 30m 욕설\`, \`2h\`, \`1d\`)`,
          `• \`/unban <아이디>\` : 제재된 유저 밴 해제 (차단 해제)`,
          `• \`/banlist\` 또는 \`밴목록\` : 현재 차단/타임밴 중인 모든 유저 목록`,
          ``,
          `[ 🛠️ 시스템 운영 & 제어 ]`,
          `• \`/broadcast <공지내용>\` : 전체 접속자에게 실시간 긴급 팝업 공지 전송`,
          `• \`/maintenance <on|off> [메시지]\` : 서버 긴급 점검 모드 가동/종료`,
          `• \`/kick <아이디>\` : 대상 유저의 실시간 소켓 연결 강제 종료`,
          `• \`/setname <아이디> <새이름>\` : 관리자 권한으로 특정 유저 닉네임 강제 변경`,
          `• \`/wipe <all|groups>\` : 시스템 전체 또는 단체방 메시지 대량 일괄 정화`,
          `• \`/users\` 또는 \`유저목록\` : 등록된 모든 사용자 목록 및 실시간 상태 조회`,
          `• \`/stats\` 또는 \`서버상태\` : 실시간 접속자, 소켓, DB 및 메시지 통계`,
          `• \`/info <아이디>\` : 특정 유저의 상세 정보 조회`,
          `• \`/status <online|dnd|offline> [메시지]\` : 내 관리자 상태 및 상태메시지 즉시 변경`,
          `• \`/db\` : Firestore 클라우드 동기화 상태 점검`,
          `• \`/clear\` : 관리자 명령어 대화 내역 초기화`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ].join('\n');
      } else if (userLevel === 4) {
        // Level 4: Head Admin
        return [
          `💎 **[JK Message 총괄 관리자(Head Admin) 콘솔]** (접속자: @${adminUser.username} | Level 4)`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `[ 🛠️ Head Admin 사용 가능 명령어 ]`,
          `• \`/ban <아이디> [사유]\` : 비매너 유저 영구 밴 (※ Level 4, 5는 대상 불가)`,
          `• \`/timeban <아이디> <시간> [사유]\` : 임시 밴 조치 (※ Level 4, 5는 대상 불가)`,
          `• \`/unban <아이디>\` : 밴 해제`,
          `• \`/banlist\` : 밴 목록 조회`,
          `• \`/broadcast <공지내용>\` : 실시간 긴급 공지 전송`,
          `• \`/kick <아이디>\` : 비매너 유저 강제 퇴장`,
          `• \`/setname <아이디> <새이름>\` : 닉네임 강제 변경`,
          `• \`/users\` : 전체 유저 목록 조회`,
          `• \`/stats\` : 시스템 상태 통계`,
          `• \`/info <아이디>\` : 유저 정보 조회`,
          `• \`/adminlist\` : 관리자 명단 조회`,
          `• \`/status <online|dnd|offline> [메시지]\` : 관리자 상태 변경`,
          `• \`/clear\` : 화면 초기화`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `⚠️ ※ 점검 모드(/maintenance) 및 최고관리자/총괄관리자 대상 밴은 불가능합니다.`,
        ].join('\n');
      } else if (userLevel === 3) {
        // Level 3: Admin
        return [
          `🛡️ **[JK Message 관리자(Admin) 콘솔]** (접속자: @${adminUser.username} | Level 3)`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `[ 🛠️ Admin 사용 가능 명령어 ]`,
          `• \`/kick <아이디>\` : 비매너 유저의 실시간 소켓 연결 강제 종료`,
          `• \`/setname <아이디> <새이름>\` : 부적절한 유저 닉네임 강제 수정`,
          `• \`/users\` : 전체 회원 목록 및 실시간 접속 상태 확인`,
          `• \`/stats\` : 서버 실시간 연결 및 시스템 현황 조회`,
          `• \`/info <아이디>\` : 특정 유저의 상세 정보 조회`,
          `• \`/adminlist\` : 관리자 명단 확인`,
          `• \`/status <online|dnd|offline> [메시지]\` : 내 관리자 상태 즉시 변경`,
          `• \`/clear\` : 명령어 터미널 화면 대화 내역 초기화`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `⚠️ ※ 밴, 타임밴, 점검, 공지(broadcast)는 권한에 포함되지 않습니다.`,
        ].join('\n');
      } else if (userLevel === 2) {
        // Level 2: Moder
        return [
          `🔰 **[JK Message 모더레이터(Moder) 콘솔]** (접속자: @${adminUser.username} | Level 2)`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `[ 🛠️ Moder 사용 가능 명령어 ]`,
          `• \`/users\` : 전체 회원 목록 및 실시간 접속 상태 확인`,
          `• \`/stats\` : 서버 실시간 연결 및 시스템 현황 조회`,
          `• \`/info <아이디>\` : 특정 유저의 상세 정보 조회`,
          `• \`/status <online|dnd|offline> [메시지]\` : 내 상태 및 상태메시지 변경`,
          `• \`/clear\` : 화면 초기화`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ].join('\n');
      } else {
        // Level 1: Guest / Member
        return [
          `💬 **[JK Message 일반 유저 콘솔]** (접속자: @${adminUser.username} | Level 1)`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `• \`/help\` : 도움말 확인`,
          `• \`/clear\` : 화면 초기화`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `💡 가입 10일 후 약관에 동의하면 Level 2 (Moder)로 승급하여 /users, /stats 등을 사용할 수 있습니다.`,
        ].join('\n');
      }
    }

    // 2. OP COMMAND (/op, /어드민지급) - Owner Only
    // Syntax: /op <아이디> <번호 (1-5)>
    if (main === '/op' || main === '/어드민지급' || main === '어드민지급' || main === '/grantadmin' || main === 'grantadmin') {
      if (userLevel < 5) {
        return `⛔ **[권한 제한]** \`/op\` 권한 레벨 지정은 시스템 최고 소유자(Owner - Level 5)만 사용할 수 있습니다.`;
      }
      const targetUsername = args[0]?.replace(/^@/, '').toLowerCase();
      const levelArg = parseInt(args[1], 10);

      if (!targetUsername || isNaN(levelArg) || levelArg < 1 || levelArg > 5) {
        return [
          `⚠️ 사용법: \`/op <아이디> <레벨(1-5)>\``,
          `• 1: Guest (일반 회원 - /help, /clear)`,
          `• 2: Moder (모더레이터 - /users, /stats, /info, /status)`,
          `• 3: Admin (관리자 - /kick, /setname, /users, /stats, /info 등)`,
          `• 4: Head Admin (총괄 관리자 - 점검 빼고 밴 등 모두 가능)`,
          `• 5: Owner (소유자 - 모든 권한)`,
          `예시: \`/op user1 3\` (user1에게 Admin 권한 지급)`,
        ].join('\n');
      }

      if (targetUsername === 'jiukhan0215' && levelArg !== 5) {
        return `❌ 최고 소유자(@jiukhan0215)의 권한 레벨은 낮출 수 없습니다.`;
      }

      const target = db.users.find((u) => u.username.toLowerCase() === targetUsername);
      if (!target) {
        return `❌ '@${targetUsername}' 유저를 찾을 수 없습니다. 등록된 아이디를 확인해주세요.`;
      }

      const prevLevel = getAdminLevel(target);
      target.adminLevel = levelArg as AdminLevel;
      if (levelArg === 5) {
        target.role = 'superadmin';
      } else if (levelArg >= 2) {
        target.role = 'admin';
      } else {
        target.role = 'user';
      }

      saveDB(db, { type: 'user', item: target });

      // Broadcast profile update so all clients see the badge immediately
      const { password: _, ...safeUser } = target;
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "user:profile_updated",
            payload: { user: safeUser },
          }));
        }
      }

      // Notify the target user if connected
      broadcastToUser(target.id, {
        type: "system:broadcast",
        payload: {
          id: `admin_grant_${Date.now()}`,
          title: `👑 관리자 권한 변경 알림 [Level ${levelArg}]`,
          message: `Owner(@${adminUser.username})님에 의해 회원님의 권한이 [Level ${levelArg}: ${getAdminRoleName(levelArg as AdminLevel)}](으)로 설정되었습니다.`,
          senderName: adminUser.name,
          timestamp: Date.now(),
        }
      });

      return `👑 **[권한 레벨 설정 완료]**\n대상: **${target.name}** (@${target.username})\n권한 변경: Level ${prevLevel} ➔ **Level ${levelArg} (${getAdminRoleName(levelArg as AdminLevel)})**`;
    }

    // 3. RECRUITMENT BOT COMMANDS (/vadmin, /nadmin) - Level 5 (Owner) Only
    if (main === '/vadmin' || main === '/어드민모집' || main === '어드민모집' || main === '모집시작') {
      if (userLevel < 5) {
        return `⛔ **[권한 제한]** 어드민 모집공고 봇 활성화(/vadmin)는 Owner(Level 5) 전용 명령어입니다.`;
      }

      if (!db.adminRecruitment) {
        db.adminRecruitment = { active: false, applicants: [] };
      }
      db.adminRecruitment.active = true;
      db.adminRecruitment.startedAt = Date.now();
      saveDB(db);

      // Broadcast announcement to all connected WebSocket users
      const broadcastPayload = JSON.stringify({
        type: "system:broadcast",
        payload: {
          id: `recruit_start_${Date.now()}`,
          title: `📢 [어드민 모집 활성화]`,
          message: `👑 최고관리자에 의해 어드민 모집이 공식 활성화되었습니다!\n\n👉 대화 목록의 '📢 어드민 모집공고 봇' 대화방에서 '/참여'를 입력하여 신청하세요.`,
          senderName: "어드민 모집공고 봇",
          timestamp: Date.now(),
        }
      });

      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(broadcastPayload);
        }
      }

      return [
        `📢 **[어드민 모집공고 봇 활성화 완료]**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `• 모집 상태: **🟢 활성화됨 (진행 중)**`,
        `• 신청 접수: 일반 유저가 '📢 어드민 모집공고 봇'과 대화에서 \`/참여\` 입력`,
        `• 알림 연동: 유저가 \`/참여\`를 입력하면 이곳 명령어 터미널로 실시간 알림이 도착합니다.`,
        `• 모집 마감: \`/nadmin\` 입력 시 즉시 모집이 마감(비활성화)됩니다.`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ].join('\n');
    }

    if (main === '/nadmin' || main === '/모집마감' || main === '모집마감' || main === '모집종료') {
      if (userLevel < 5) {
        return `⛔ **[권한 제한]** 어드민 모집공고 봇 비활성화(/nadmin)는 Owner(Level 5) 전용 명령어입니다.`;
      }

      if (!db.adminRecruitment) {
        db.adminRecruitment = { active: false, applicants: [] };
      }
      db.adminRecruitment.active = false;
      saveDB(db);

      // Broadcast announcement to all connected WebSocket users
      const broadcastPayload = JSON.stringify({
        type: "system:broadcast",
        payload: {
          id: `recruit_end_${Date.now()}`,
          title: `🛑 [어드민 모집 마감]`,
          message: `어드민 모집이 공식 마감(비활성화)되었습니다. 많은 참여와 관심에 감사드립니다.`,
          senderName: "어드민 모집공고 봇",
          timestamp: Date.now(),
        }
      });

      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(broadcastPayload);
        }
      }

      const totalApplicants = db.adminRecruitment.applicants?.length || 0;

      return [
        `🛑 **[어드민 모집공고 봇 비활성화 완료]**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `• 모집 상태: **🔴 비활성화 (마감됨)**`,
        `• 총 지원자 수: **${totalApplicants}명**`,
        `• 다시 모집을 시작하려면 \`/vadmin\`을 입력하세요.`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ].join('\n');
    }

    // 4. ADMIN LIST (/adminlist, /어드민목록) - Level 2+
    if (main === '/adminlist' || main === '어드민목록' || main === '관리자목록') {
      if (userLevel < 2) {
        return `⛔ **[권한 제한]** 관리자 명단 조회는 Level 2 (Moder) 이상만 사용할 수 있습니다.`;
      }

      const l5 = db.users.filter(u => getAdminLevel(u) === 5);
      const l4 = db.users.filter(u => getAdminLevel(u) === 4);
      const l3 = db.users.filter(u => getAdminLevel(u) === 3);
      const l2 = db.users.filter(u => getAdminLevel(u) === 2);

      const formatList = (users: UserRecord[], badge: string) => {
        if (users.length === 0) return '  (없음)';
        return users.map((u, i) => `  ${i + 1}. ${badge} **${u.name}** (@${u.username})`).join('\n');
      };

      return [
        `👑 **[JK Message 시스템 관리자 계층 명단]**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `[ Level 5: Owner (최고 소유자) ]`,
        formatList(l5, '👑'),
        ``,
        `[ Level 4: Head Admin (총괄 관리자) ]`,
        formatList(l4, '💎'),
        ``,
        `[ Level 3: Admin (관리자) ]`,
        formatList(l3, '🛡️'),
        ``,
        `[ Level 2: Moder (모더레이터) ]`,
        formatList(l2, '🔰'),
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        userLevel === 5 ? `💡 권한 지정: \`/op <아이디> <1-5>\` | 공고: \`/notice <기간> <내용>\`` : '',
      ].filter(Boolean).join('\n');
    }

    // 5. BAN COMMAND (/ban, 밴, 차단) - Level 4, 5 Only
    if (main === '/ban' || main === '밴' || main === '차단') {
      if (userLevel < 4) {
        return `⛔ **[권한 제한]** 영구 밴(차단) 권한은 Level 4 (Head Admin) 및 Level 5 (Owner) 전용입니다.`;
      }
      const targetUsername = args[0]?.replace(/^@/, '').toLowerCase();
      const reason = args.slice(1).join(' ').trim() || '관리자 권한으로 영구 차단되었습니다.';
      if (!targetUsername) {
        return `⚠️ 사용법: \`/ban <유저아이디> [사유]\` (예: \`/ban user1 욕설 및 도배\`)`;
      }

      const target = db.users.find((u) => u.username.toLowerCase() === targetUsername);
      const targetLevel = target ? getAdminLevel(target) : 1;

      // Level 4/5 immunity: Head Admin cannot ban Level 4 or 5
      if (targetLevel >= 4) {
        return `❌ **[보안 규칙]** Head Admin (Level 4) 및 Owner (Level 5) 대상은 밴/차단할 수 없습니다.`;
      }

      if (!db.bans) db.bans = [];
      const existingIdx = db.bans.findIndex((b) => b.username.toLowerCase() === targetUsername);
      if (existingIdx !== -1) {
        db.bans[existingIdx] = { username: targetUsername, reason, bannedAt: Date.now(), bannedUntil: null };
      } else {
        db.bans.push({ username: targetUsername, reason, bannedAt: Date.now(), bannedUntil: null });
      }

      // Force disconnect active sockets immediately
      if (target) {
        const sockets = userSockets.get(target.id);
        if (sockets && sockets.size > 0) {
          for (const ws of sockets) {
            try {
              ws.send(JSON.stringify({
                type: 'system:kicked',
                payload: { reason: `[계정 영구 차단] ${reason}` }
              }));
              ws.close();
            } catch (err) {
              console.error("Error closing socket on ban:", err);
            }
          }
          userSockets.delete(target.id);
          broadcastPresence();
        }
      }
      saveDB(db);

      return `🚫 **[영구 밴 조치 완료]**\n대상: @${targetUsername}\n사유: "${reason}"\n해당 계정은 즉시 접속이 차단되며 로그인할 수 없습니다.`;
    }

    // 6. TIMEBAN COMMAND (/timeban, 타임밴, 임시차단) - Level 4, 5 Only
    if (main === '/timeban' || main === '타임밴' || main === '임시차단') {
      if (userLevel < 4) {
        return `⛔ **[권한 제한]** 타임밴(임시 차단) 권한은 Level 4 (Head Admin) 및 Level 5 (Owner) 전용입니다.`;
      }
      const targetUsername = args[0]?.replace(/^@/, '').toLowerCase();
      const durationStr = args[1]?.toLowerCase();
      const reason = args.slice(2).join(' ').trim() || '관리자 권한으로 임시 차단되었습니다.';

      if (!targetUsername || !durationStr) {
        return `⚠️ 사용법: \`/timeban <아이디> <시간(예: 30m, 2h, 1d)> [사유]\`\n(예: \`/timeban user1 1h 비매너 행위\`)`;
      }

      const target = db.users.find((u) => u.username.toLowerCase() === targetUsername);
      const targetLevel = target ? getAdminLevel(target) : 1;

      // Level 4/5 immunity: Head Admin cannot timeban Level 4 or 5
      if (targetLevel >= 4) {
        return `❌ **[보안 규칙]** Head Admin (Level 4) 및 Owner (Level 5) 대상은 타임밴할 수 없습니다.`;
      }

      let durationMs = 0;
      if (durationStr.endsWith('s') || durationStr.endsWith('초')) {
        durationMs = parseInt(durationStr, 10) * 1000;
      } else if (durationStr.endsWith('m') || durationStr.endsWith('분')) {
        durationMs = parseInt(durationStr, 10) * 60 * 1000;
      } else if (durationStr.endsWith('h') || durationStr.endsWith('시간')) {
        durationMs = parseInt(durationStr, 10) * 3600 * 1000;
      } else if (durationStr.endsWith('d') || durationStr.endsWith('일')) {
        durationMs = parseInt(durationStr, 10) * 86400 * 1000;
      } else {
        durationMs = (parseInt(durationStr, 10) || 10) * 60 * 1000; // default minutes
      }

      if (isNaN(durationMs) || durationMs <= 0) {
        return `⚠️ 유효한 기간을 입력해주세요. (예: 10m, 2h, 1d, 30s)`;
      }

      const bannedUntil = Date.now() + durationMs;
      const untilDateStr = new Date(bannedUntil).toLocaleString('ko-KR');

      if (!db.bans) db.bans = [];
      const existingIdx = db.bans.findIndex((b) => b.username.toLowerCase() === targetUsername);
      if (existingIdx !== -1) {
        db.bans[existingIdx] = { username: targetUsername, reason, bannedAt: Date.now(), bannedUntil };
      } else {
        db.bans.push({ username: targetUsername, reason, bannedAt: Date.now(), bannedUntil });
      }

      if (target) {
        const sockets = userSockets.get(target.id);
        if (sockets && sockets.size > 0) {
          for (const ws of sockets) {
            try {
              ws.send(JSON.stringify({
                type: 'system:kicked',
                payload: { reason: `[임시 이용 제한] ${untilDateStr}까지 접속이 제한됩니다. 사유: ${reason}` }
              }));
              ws.close();
            } catch (err) {
              console.error("Error closing socket on timeban:", err);
            }
          }
          userSockets.delete(target.id);
          broadcastPresence();
        }
      }
      saveDB(db);

      return `⏳ **[타임밴 적용 완료]**\n대상: @${targetUsername}\n해제 예정: ${untilDateStr}\n사유: "${reason}"`;
    }

    // 7. UNBAN COMMAND (/unban, 밴해제) - Level 4, 5 Only
    if (main === '/unban' || main === '밴해제' || main === '차단해제') {
      if (userLevel < 4) {
        return `⛔ **[권한 제한]** 밴 해제 권한은 Level 4 (Head Admin) 및 Level 5 (Owner) 전용입니다.`;
      }
      const targetUsername = args[0]?.replace(/^@/, '').toLowerCase();
      if (!targetUsername) {
        return `⚠️ 사용법: \`/unban <유저아이디>\``;
      }
      if (!db.bans) db.bans = [];
      const beforeCount = db.bans.length;
      db.bans = db.bans.filter((b) => b.username.toLowerCase() !== targetUsername);

      if (db.bans.length === beforeCount) {
        return `ℹ️ '@${targetUsername}' 유저는 제재 목록에 등록되어 있지 않습니다.`;
      }
      saveDB(db);
      return `✨ **[밴 해제 완료]**\n@${targetUsername} 님의 차단이 성공적으로 해제되었습니다. 이제 정상적으로 로그인 및 이용이 가능합니다.`;
    }

    // 8. BANLIST COMMAND (/banlist, 밴목록) - Level 4, 5 Only
    if (main === '/banlist' || main === '밴목록' || main === '차단목록') {
      if (userLevel < 4) {
        return `⛔ **[권한 제한]** 밴 목록 조회는 Level 4 (Head Admin) 및 Level 5 (Owner) 전용입니다.`;
      }
      if (!db.bans || db.bans.length === 0) {
        return `🛡️ 현재 차단되거나 제재를 받고 있는 사용자가 없습니다.`;
      }

      const lines = db.bans.map((b, idx) => {
        const isPermanent = !b.bannedUntil;
        const expiry = isPermanent ? '영구 차단' : `${new Date(b.bannedUntil!).toLocaleString('ko-KR')}까지 (임시)`;
        return `${idx + 1}. **@${b.username}** - ${expiry}\n   └ 사유: ${b.reason || '사유 없음'} (제재일시: ${new Date(b.bannedAt).toLocaleString('ko-KR')})`;
      });

      return [
        `🚫 **[현재 제재/밴 사용자 목록 (총 ${db.bans.length}명)]**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        lines.join('\n'),
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `💡 밴 해제: \`/unban <아이디>\``,
      ].join('\n');
    }

    // 9. MAINTENANCE COMMAND (/maintenance, 점검) - Owner Only (Level 5)
    if (main === '/maintenance' || main === '점검' || main === '점검모드') {
      if (userLevel < 5) {
        return `⛔ **[권한 제한]** 서버 점검 모드는 시스템 최고 소유자(Owner - Level 5) 전용입니다. (Head Admin 사용 불가)`;
      }
      const mode = args[0]?.toLowerCase();
      const message = args.slice(1).join(' ').trim() || '서버 정기 점검 및 안정화 작업이 진행 중입니다.';

      if (mode === 'on' || mode === '켜기' || mode === '시작') {
        db.serverMaintenance = {
          enabled: true,
          message,
          startedAt: Date.now(),
        };
        saveDB(db);

        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "system:broadcast",
              payload: {
                id: `maint_${Date.now()}`,
                title: "⚠️ 서버 긴급 점검 안내",
                message: `[점검 모드 가동] ${message}`,
                senderName: "시스템",
                timestamp: Date.now(),
              }
            }));
          }
        }

        return `🚨 **[서버 점검 모드 가동]**\n일반 회원의 신규 로그인 및 접근이 차단되며 공지가 전파되었습니다.\n점검 안내 문구: "${message}"\n점검 해제: \`/maintenance off\``;
      } else if (mode === 'off' || mode === '끄기' || mode === '종료') {
        db.serverMaintenance = {
          enabled: false,
          message: '',
          startedAt: 0,
        };
        saveDB(db);

        for (const client of wss.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: "system:broadcast",
              payload: {
                id: `maint_off_${Date.now()}`,
                title: "✨ 서버 점검 종료 안내",
                message: `서버 점검이 완료되어 정상 서비스를 재개합니다.`,
                senderName: "시스템",
                timestamp: Date.now(),
              }
            }));
          }
        }

        return `✅ **[서버 점검 모드 해제]**\n서버 점검이 종료되었으며 일반 사용자의 정상 접속이 활성화되었습니다.`;
      } else {
        const isCurrentlyOn = db.serverMaintenance?.enabled;
        return `⚠️ 사용법: \`/maintenance <on|off> [안내메시지]\`\n현재 상태: ${isCurrentlyOn ? '🔴 점검 중' : '🟢 정상 운영 중'}`;
      }
    }

    // 10. WIPE COMMAND (/wipe, 대화정리) - Owner Only
    if (main === '/wipe' || main === '대화정리' || main === '정화') {
      if (userLevel < 5) {
        return `⛔ **[권한 제한]** 메시지 대량 정화 권한은 Owner(Level 5) 전용입니다.`;
      }
      const scope = args[0]?.toLowerCase() || 'all';
      if (scope === 'all' || scope === '전체') {
        const count = db.messages.length;
        db.messages = [];
        saveDB(db);
        return `🧹 **[전체 메시지 정화 완료]**\n총 ${count}개의 메시지 기록이 데이터베이스에서 완전히 삭제되었습니다.`;
      } else if (scope === 'groups' || scope === '단체방') {
        const before = db.messages.length;
        db.messages = db.messages.filter((m) => !m.conversationId.startsWith('group_'));
        saveDB(db);
        return `🧹 **[단체방 메시지 정화]** ${before - db.messages.length}개의 단체방 메시지가 정리되었습니다.`;
      } else {
        return `⚠️ 사용법: \`/wipe <all|groups>\``;
      }
    }

    // 11. DB STATUS (/db, 디비) - Owner Only
    if (main === '/db' || main === '디비') {
      if (userLevel < 5) {
        return `⛔ **[권한 제한]** 데이터베이스 상세 현황은 Owner(Level 5) 전용입니다.`;
      }
      const hasFirestore = !!getFirestoreClient();
      return [
        `💾 **[데이터베이스 현황]**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `• 저장 모드: ${hasFirestore ? '☁️ Firebase Cloud Firestore (영구 동기화)' : '📁 Local db.json'}`,
        `• 저장된 유저 수: ${db.users.length}개`,
        `• 저장된 메시지 수: ${db.messages.length}개`,
        `• 저장된 단체방 수: ${db.groups.length}개`,
        `• 저장된 친구요청 수: ${db.friendRequests.length}개`,
        `• 등록된 모집 공고: ${db.notices?.length || 0}개`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `✅ 데이터 무결성 검증 완료. 정상 작동 중입니다.`,
      ].join('\n');
    }

    // 12. BROADCAST COMMAND (/broadcast, 공지) - Level 4, 5 Only (Admin 3 cannot broadcast)
    if (main === '/broadcast' || main === '공지') {
      if (userLevel < 4) {
        return `⛔ **[권한 제한]** 긴급 팝업 공지(/broadcast)는 Level 4 (Head Admin) 및 Level 5 (Owner) 전용입니다. (Admin 사용 불가)`;
      }
      const broadcastMsg = args.join(' ').trim();
      if (!broadcastMsg) {
        return `⚠️ 사용법: \`/broadcast <공지 내용>\``;
      }

      const alertPayload = JSON.stringify({
        type: "system:broadcast",
        payload: {
          id: `bc_${Date.now()}`,
          title: `📢 시스템 공지사항 (${getAdminRoleName(userLevel)})`,
          message: broadcastMsg,
          senderName: adminUser.name,
          timestamp: Date.now(),
        }
      });

      let sentCount = 0;
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(alertPayload);
          sentCount++;
        }
      }

      return `📢 **[공지 전송 완료]**\n현재 접속 중인 ${sentCount}개의 클라이언트 화면에 공지가 실시간 송출되었습니다.\n내용: "${broadcastMsg}"`;
    }

    // 13. KICK COMMAND (/kick, 강퇴) - Level 3+ (Admin, HeadAdmin, Owner)
    if (main === '/kick' || main === '강퇴') {
      if (userLevel < 3) {
        return `⛔ **[권한 제한]** 강퇴 기능은 Level 3 (Admin) 이상부터 사용 가능합니다.`;
      }
      const targetUsername = args[0]?.replace(/^@/, '').toLowerCase();
      if (!targetUsername) {
        return `⚠️ 사용법: \`/kick <유저아이디>\``;
      }

      const target = db.users.find(u => u.username.toLowerCase() === targetUsername);
      if (!target) {
        return `❌ '@${targetUsername}' 유저를 찾을 수 없습니다.`;
      }

      const targetLevel = getAdminLevel(target);
      if (targetLevel >= userLevel && userLevel < 5) {
        return `❌ 나보다 권한 레벨이 높거나 같은 관리자는 강퇴할 수 없습니다.`;
      }
      if (targetUsername === 'jiukhan0215') {
        return `❌ 최고 소유자는 강퇴할 수 없습니다.`;
      }

      const sockets = userSockets.get(target.id);
      if (sockets && sockets.size > 0) {
        for (const ws of sockets) {
          try {
            ws.send(JSON.stringify({ type: 'system:kicked', payload: { reason: '관리자에 의해 연결이 종료되었습니다.' } }));
            ws.close();
          } catch (err) {
            console.error("Error kicking socket:", err);
          }
        }
        userSockets.delete(target.id);
        broadcastPresence();
        return `⚡ '@${target.username}' 사용자의 활성 소켓(${sockets.size}개) 연결을 강제 종료했습니다.`;
      } else {
        return `ℹ️ '@${target.username}' 사용자는 현재 접속 중이 아닙니다.`;
      }
    }

    // 14. SETNAME COMMAND (/setname, 닉네임변경) - Level 3+
    if (main === '/setname' || main === '닉네임변경' || main === '이름변경') {
      if (userLevel < 3) {
        return `⛔ **[권한 제한]** 닉네임 변경은 Level 3 (Admin) 이상부터 사용 가능합니다.`;
      }
      const targetUsername = args[0]?.replace(/^@/, '').toLowerCase();
      const newName = args.slice(1).join(' ').trim();
      if (!targetUsername || !newName) {
        return `⚠️ 사용법: \`/setname <아이디> <새이름>\``;
      }
      const target = db.users.find((u) => u.username.toLowerCase() === targetUsername);
      if (!target) {
        return `❌ '@${targetUsername}' 사용자를 찾을 수 없습니다.`;
      }
      const targetLevel = getAdminLevel(target);
      if (targetLevel >= userLevel && userLevel < 5) {
        return `❌ 나보다 권한 레벨이 높거나 같은 관리자의 닉네임은 변경할 수 없습니다.`;
      }
      const oldName = target.name;
      target.name = newName;
      saveDB(db, { type: 'user', item: target });

      const { password: _, ...safeUser } = target;
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "user:profile_updated",
            payload: { user: safeUser },
          }));
        }
      }
      return `✨ **[닉네임 강제 변경 완료]**\n@${target.username} 님의 표시 이름이 **'${oldName}'** ➔ **'${newName}'**(으)로 변경되었습니다.`;
    }

    // 15. USERS COMMAND (/users, 유저목록) - Level 2+ (Moder, Admin, HeadAdmin, Owner)
    if (main === '/users' || main === '유저목록' || main === '유저') {
      if (userLevel < 2) {
        return `⛔ **[권한 제한]** 유저 목록 조회는 Level 2 (Moder) 이상부터 사용 가능합니다.`;
      }
      const onlineSet = new Set(userSockets.keys());
      const userLines = db.users.map((u, idx) => {
        const isOnline = onlineSet.has(u.id);
        const statusIcon = u.status === 'dnd' ? '⛔ 방해금지' : isOnline ? '🟢 온라인' : '⚪ 오프라인';
        const lvl = getAdminLevel(u);
        const roleBadge = lvl === 5 ? ' [👑 Level 5: Owner]' : lvl === 4 ? ' [💎 Level 4: HeadAdmin]' : lvl === 3 ? ' [🛡️ Level 3: Admin]' : lvl === 2 ? ' [🔰 Level 2: Moder]' : '';
        const createdDate = new Date(u.createdAt).toLocaleDateString('ko-KR');
        return `${idx + 1}. **${u.name}** (@${u.username})${roleBadge} - ${statusIcon}\n   └ 가입: ${createdDate} | 최근: ${new Date(u.lastSeen).toLocaleTimeString('ko-KR')}`;
      });

      return [
        `👥 **[전체 등록 회원 목록 (총 ${db.users.length}명)]**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        userLines.join('\n'),
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🟢 실시간 활성 소켓 접속자: ${onlineSet.size}명`,
      ].join('\n');
    }

    // 16. STATS COMMAND (/stats, 서버상태) - Level 2+
    if (main === '/stats' || main === '서버상태' || main === '통계') {
      if (userLevel < 2) {
        return `⛔ **[권한 제한]** 서버 상태 조회는 Level 2 (Moder) 이상부터 사용 가능합니다.`;
      }
      const onlineSet = new Set(userSockets.keys());
      const totalMessages = db.messages.length;
      const totalGroups = db.groups.length;
      const totalFriendReqs = db.friendRequests.length;
      const uptimeSec = Math.floor(process.uptime());
      const uptimeStr = `${Math.floor(uptimeSec / 3600)}시간 ${Math.floor((uptimeSec % 3600) / 60)}분 ${uptimeSec % 60}초`;

      return [
        `📊 **[JK Message 실시간 시스템 통계]**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `• ⚡ 서버 가동 시간: ${uptimeStr}`,
        `• 🟢 온라인 연결 유저: ${onlineSet.size}명`,
        `• 👥 총 등록 회원수: ${db.users.length}명`,
        `• 💬 누적 저장 메시지: ${totalMessages}개`,
        `• 🏢 개설된 단체방: ${totalGroups}개`,
        `• 🤝 친구 요청 기록: ${totalFriendReqs}건`,
        `• 📢 진행 중인 공고: ${db.notices?.filter(n => n.expiresAt > Date.now()).length || 0}건`,
        `• 💾 DB 모드: ${getFirestoreClient() ? '☁️ Firebase Firestore (영구 동기화)' : '📁 로컬 JSON'}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `✅ 모든 시스템 프로세스가 정상 가동 중입니다.`,
      ].join('\n');
    }

    // 17. INFO COMMAND (/info, 유저정보) - Level 2+
    if (main === '/info' || main === '유저정보') {
      if (userLevel < 2) {
        return `⛔ **[권한 제한]** 유저 상세 정보 조회는 Level 2 (Moder) 이상부터 사용 가능합니다.`;
      }
      const targetUsername = args[0]?.replace(/^@/, '').toLowerCase();
      if (!targetUsername) {
        return `⚠️ 사용법: \`/info <유저아이디>\``;
      }
      const target = db.users.find(u => u.username.toLowerCase() === targetUsername);
      if (!target) {
        return `❌ '@${targetUsername}' 아이디를 가진 사용자를 찾을 수 없습니다.`;
      }
      const isOnline = userSockets.has(target.id);
      const lvl = getAdminLevel(target);
      return [
        `👤 **[사용자 상세 정보: @${target.username}]**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `• 고유 ID: \`${target.id}\``,
        `• 표시 이름: **${target.name}**`,
        `• 권한 등급: **Level ${lvl} (${getAdminRoleName(lvl)})**`,
        `• 상태 이모지: ${target.avatarEmoji}`,
        `• 접속 상태: ${isOnline ? '🟢 온라인' : '⚪ 오프라인'} (${target.status})`,
        `• 상태 메시지: ${target.customStatus || '(없음)'}`,
        `• 가입 일시: ${new Date(target.createdAt).toLocaleString('ko-KR')}`,
        `• 최근 활동: ${new Date(target.lastSeen).toLocaleString('ko-KR')}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ].join('\n');
    }

    // 18. STATUS COMMAND (/status, 상태변경) - Level 2+
    if (main === '/status' || main === '상태변경') {
      if (userLevel < 2) {
        return `⛔ **[권한 제한]** \`/status\` 명령어는 Level 2 (Moder) 이상부터 사용 가능합니다.`;
      }
      const newStatus = args[0]?.toLowerCase() as UserStatusMode;
      const newMsg = args.slice(1).join(' ').trim();
      if (!['online', 'dnd', 'offline'].includes(newStatus)) {
        return `⚠️ 사용법: \`/status <online|dnd|offline> [상태메시지]\``;
      }
      adminUser.status = newStatus;
      if (newMsg) adminUser.customStatus = newMsg;
      saveDB(db, { type: 'user', item: adminUser });
      broadcastPresence();
      return `✅ 상태가 **${newStatus.toUpperCase()}** (상태메시지: "${adminUser.customStatus || ''}")로 변경되었습니다.`;
    }

    // 19. CLEAR COMMAND (/clear, 초기화) - All Levels
    if (main === '/clear' || main === '초기화') {
      db.messages = db.messages.filter(m => m.conversationId !== 'conv_command');
      saveDB(db);
      return `🧹 명령어 터미널 대화 기록이 모두 초기화되었습니다.`;
    }

    return `❓ 알 수 없는 명령어: \`${cmd}\`\n\`/help\`를 입력하면 권한에 맞는 명령어 목록을 확인할 수 있습니다.`;
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

    if (db.serverMaintenance?.enabled && cleanUsername !== 'jiukhan0215') {
      return res.status(503).json({
        error: `[서버 점검 중] ${db.serverMaintenance.message || '현재 시스템 점검으로 인해 신규 회원가입이 불가능합니다.'}`,
      });
    }

    const banInfo = checkUserBan(cleanUsername);
    if (banInfo.isBanned) {
      return res.status(403).json({
        error: `[계정 이용 제재] 해당 아이디는 차단된 상태입니다. (${banInfo.untilStr}, 사유: ${banInfo.reason})`,
      });
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

    if (db.serverMaintenance?.enabled && clean !== 'jiukhan0215') {
      return res.status(503).json({
        error: `[서버 점검 중] ${db.serverMaintenance.message || '현재 시스템 점검이 진행 중입니다.'}`,
      });
    }

    const banInfo = checkUserBan(clean);
    if (banInfo.isBanned) {
      return res.status(403).json({
        error: `[계정 이용 제재] 접속이 차단된 계정입니다. (${banInfo.untilStr}, 사유: ${banInfo.reason})`,
      });
    }

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

  // Get conversations for user (1:1 with friends + Group chats + Admin Command Bot)
  app.get("/api/conversations", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.json({ conversations: [] });

    const currentUser = db.users.find((u) => u.id === userId);
    const isAdminUser = isAdmin(currentUser);
    const isSuper = isSuperAdmin(currentUser);
    const onlineSet = new Set(userSockets.keys());

    // 1. Direct (1:1) conversations
    const userConvs = new Map<
      string,
      { otherUserId: string; conversationId: string; lastMessage?: MessageRecord; unreadCount: number; updatedAt: number }
    >();

    for (const msg of db.messages) {
      if (msg.receiverId !== "group" && !msg.conversationId.startsWith("group_") && msg.conversationId !== "conv_command") {
        if (msg.senderId === userId || msg.receiverId === userId) {
          const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
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

    const allConversations: any[] = [...directConversations, ...groupConversations].sort(
      (a: any, b: any) => (b?.updatedAt || 0) - (a?.updatedAt || 0)
    );

    // Recruitment Bot Conversation (Accessible to all logged-in users)
    const userRecruitConvId = `conv_recruit_${userId}`;
    const recruitMsgs = db.messages.filter(
      (m) => m.conversationId === userRecruitConvId || (m.conversationId === "conv_recruit" && (m.senderId === userId || m.receiverId === userId))
    );
    const lastRecruitMsg = recruitMsgs.length > 0 ? recruitMsgs[recruitMsgs.length - 1] : undefined;
    const isRecruiting = Boolean(db.adminRecruitment?.active);

    const recruitConv = {
      id: userRecruitConvId,
      isGroup: false,
      isRecruitBot: true,
      participantIds: [userId, "bot_recruit"],
      otherUser: {
        ...RECRUIT_BOT,
        customStatus: isRecruiting ? "🟢 [모집 진행 중] '/참여' 입력 시 접수" : "🔴 [모집 마감] 현재 모집 기간 아님",
        isOnline: true,
      },
      lastMessage: lastRecruitMsg,
      unreadCount: 0,
      updatedAt: lastRecruitMsg ? lastRecruitMsg.createdAt : (db.adminRecruitment?.startedAt || Date.now()),
    };

    allConversations.unshift(recruitConv);

    // If admin, prepend the Command Bot conversation at the very top
    if (isAdminUser) {
      const cmdMsgs = db.messages.filter((m) => m.conversationId === "conv_command");
      const lastCmdMsg = cmdMsgs.length > 0 ? cmdMsgs[cmdMsgs.length - 1] : undefined;
      const cmdConv = {
        id: "conv_command",
        isGroup: false,
        isCommandBot: true,
        participantIds: [userId, "bot_command"],
        otherUser: {
          id: "bot_command",
          username: "명령어",
          name: "⚡ 시스템 명령어 터미널",
          avatarBg: "from-amber-500 to-red-600",
          avatarEmoji: "⚡",
          customStatus: isSuper ? "👑 최고 관리자 전용 제어 콘솔" : "🛡️ 부관리자 전용 제어 콘솔",
          status: "online" as UserStatusMode,
          lastSeen: Date.now(),
          createdAt: 0,
          isOnline: true,
        },
        lastMessage: lastCmdMsg,
        unreadCount: 0,
        updatedAt: lastCmdMsg ? lastCmdMsg.createdAt : Date.now(),
      };
      allConversations.unshift(cmdConv);
    }

    return res.json({ conversations: allConversations });
  });

  // Create or get direct conversation between users
  app.post("/api/conversations/create", (req, res) => {
    const { userIds } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length < 2) {
      return res.status(400).json({ error: "참여 유저 ID가 필요합니다." });
    }

    const [u1, u2] = userIds;
    const user1 = db.users.find((u) => u.id === u1);
    const user2 =
      db.users.find((u) => u.id === u2) ||
      (u2 === "bot_command" ? COMMAND_BOT : u2 === "bot_recruit" ? RECRUIT_BOT : undefined);

    if (!user1 || !user2) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    // Special command bot for admin
    if (u2 === "bot_command" || u1 === "bot_command") {
      const nonBotUser = u1 === "bot_command" ? user2 : user1;
      if (!isAdmin(nonBotUser)) {
        return res.status(403).json({ error: "관리자 전용 명령어 방입니다." });
      }
      return res.json({
        conversation: {
          id: "conv_command",
          isGroup: false,
          isCommandBot: true,
          participantIds: [u1, u2],
          otherUser: COMMAND_BOT,
          lastMessage: db.messages.filter((m) => m.conversationId === "conv_command").slice(-1)[0],
          unreadCount: 0,
          updatedAt: Date.now(),
        },
      });
    }

    // Special recruit bot for all users
    if (u2 === "bot_recruit" || u1 === "bot_recruit") {
      const nonBotUser = u1 === "bot_recruit" ? user2 : user1;
      const userRecruitConvId = `conv_recruit_${nonBotUser.id}`;
      const isRecruiting = Boolean(db.adminRecruitment?.active);
      return res.json({
        conversation: {
          id: userRecruitConvId,
          isGroup: false,
          isRecruitBot: true,
          participantIds: [u1, u2],
          otherUser: {
            ...RECRUIT_BOT,
            customStatus: isRecruiting ? "🟢 [모집 진행 중] '/참여' 입력 시 접수" : "🔴 [모집 마감] 현재 모집 기간 아님",
            isOnline: true,
          },
          lastMessage: db.messages.filter((m) => m.conversationId === userRecruitConvId).slice(-1)[0],
          unreadCount: 0,
          updatedAt: Date.now(),
        },
      });
    }

    if (u1 === u2) {
      return res.status(400).json({ error: "자기 자신과의 대화는 지원되지 않습니다." });
    }

    const onlineSet = new Set(userSockets.keys());
    const convId = getConversationId(u1, u2);
    const otherUser = u1 === user1.id ? user2 : user1;
    const { password: _, ...safeOther } = otherUser;

    const convMessages = db.messages.filter(
      (m) =>
        m.conversationId === convId ||
        ((m.senderId === u1 && m.receiverId === u2) ||
          (m.senderId === u2 && m.receiverId === u1))
    );
    const lastMsg = convMessages.length > 0 ? convMessages[convMessages.length - 1] : undefined;

    const conversation = {
      id: convId,
      isGroup: false,
      participantIds: [u1, u2],
      otherUser: {
        ...safeOther,
        isOnline: onlineSet.has(otherUser.id),
      },
      lastMessage: lastMsg,
      unreadCount: 0,
      updatedAt: lastMsg ? lastMsg.createdAt : Date.now(),
    };

    return res.json({ conversation });
  });

  // Get messages for conversation (1:1 or Group or Admin Command)
  app.get("/api/messages", (req, res) => {
    const conversationId = req.query.conversationId as string;
    const userId = req.query.userId as string;

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }

    // Admin command bot conversation
    if (conversationId === "conv_command") {
      const currentUser = db.users.find((u) => u.id === userId);
      if (!currentUser || !isAdmin(currentUser)) {
        return res.status(403).json({ error: "관리자만 접근할 수 있는 명령어 방입니다." });
      }

      const messages = db.messages
        .filter((m) => m.conversationId === "conv_command")
        .map((m) => {
          if (m.senderId === "bot_command") {
            return { ...m, sender: COMMAND_BOT };
          }
          const senderUser = db.users.find((u) => u.id === m.senderId);
          return {
            ...m,
            sender: senderUser ? (({ password: _, ...safe }) => safe)(senderUser) : undefined,
          };
        })
        .sort((a, b) => a.createdAt - b.createdAt);

      return res.json({ messages, isGroup: false });
    }

    // Recruitment Bot conversation for any user
    if (conversationId === "conv_recruit" || conversationId.startsWith("conv_recruit_")) {
      const userRecruitConvId = conversationId.startsWith("conv_recruit_") ? conversationId : `conv_recruit_${userId}`;
      const messages = db.messages
        .filter((m) => m.conversationId === userRecruitConvId || (m.conversationId === "conv_recruit" && (m.senderId === userId || m.receiverId === userId)))
        .map((m) => {
          if (m.senderId === "bot_recruit") {
            return { ...m, sender: RECRUIT_BOT };
          }
          const senderUser = db.users.find((u) => u.id === m.senderId);
          return {
            ...m,
            sender: senderUser ? (({ password: _, ...safe }) => safe)(senderUser) : undefined,
          };
        })
        .sort((a, b) => a.createdAt - b.createdAt);

      return res.json({ messages, isGroup: false });
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

  // Send message (1:1, Group, or Admin Command Bot)
  app.post("/api/messages/send", (req, res) => {
    const { senderId, receiverId, conversationId: customConvId, text, replyTo, attachment } = req.body;

    if (!senderId) {
      return res.status(400).json({ error: "senderId is required" });
    }

    if (!text && !attachment) {
      return res.status(400).json({ error: "메시지 내용이나 첨부파일을 입력해주세요." });
    }

    const senderUser = db.users.find((u) => u.id === senderId);
    if (senderUser) {
      const banCheck = checkUserBan(senderUser.username);
      if (banCheck.isBanned) {
        return res.status(403).json({ error: `[이용 제재 안내] ${banCheck.untilStr} 사유: ${banCheck.reason}`, isBanned: true });
      }
    }

    // Admin Command Bot Message
    if (customConvId === "conv_command" || receiverId === "bot_command") {
      if (!senderUser || !isAdmin(senderUser)) {
        return res.status(403).json({ error: "관리자만 명령어를 실행할 수 있습니다." });
      }

      const userMsg: MessageRecord = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        conversationId: "conv_command",
        senderId: senderUser.id,
        receiverId: "bot_command",
        text: (text || "").trim(),
        createdAt: Date.now(),
        read: true,
      };
      db.messages.push(userMsg);
      saveDB(db, { type: 'message', item: userMsg });

      const populatedUserMsg = {
        ...userMsg,
        sender: (({ password: _, ...safe }) => safe)(senderUser),
      };

      // Execute command and generate bot reply
      const botResponseText = executeAdminCommand(text || "", senderUser);

      const botMsg: MessageRecord = {
        id: `msg_bot_${Date.now() + 5}_${Math.random().toString(36).substring(2, 7)}`,
        conversationId: "conv_command",
        senderId: "bot_command",
        receiverId: senderUser.id,
        text: botResponseText,
        createdAt: Date.now() + 10,
        read: true,
      };
      db.messages.push(botMsg);
      saveDB(db, { type: 'message', item: botMsg });

      const populatedBotMsg = {
        ...botMsg,
        sender: COMMAND_BOT,
      };

      // Broadcast bot message immediately to user's active sockets
      broadcastToUser(senderUser.id, {
        type: "message:new",
        payload: { message: populatedBotMsg },
      });

      return res.json({
        message: populatedUserMsg,
        botResponse: populatedBotMsg,
      });
    }

    // Recruitment Bot Message
    if (customConvId === "conv_recruit" || customConvId?.startsWith("conv_recruit_") || receiverId === "bot_recruit") {
      if (!senderUser) {
        return res.status(401).json({ error: "로그인이 필요합니다." });
      }

      const userRecruitConvId = `conv_recruit_${senderUser.id}`;
      const userMsg: MessageRecord = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        conversationId: userRecruitConvId,
        senderId: senderUser.id,
        receiverId: "bot_recruit",
        text: (text || "").trim(),
        createdAt: Date.now(),
        read: true,
      };
      db.messages.push(userMsg);
      saveDB(db, { type: 'message', item: userMsg });

      const populatedUserMsg = {
        ...userMsg,
        sender: (({ password: _, ...safe }) => safe)(senderUser),
      };

      const rawText = (text || "").trim();
      const isApplying = rawText.startsWith("/참여") || rawText === "참여" || rawText.toLowerCase().startsWith("/apply") || rawText.startsWith("참여 ");
      let botReplyText = "";

      if (isApplying) {
        if (!db.adminRecruitment?.active) {
          botReplyText = [
            `⚠️ **[현재는 어드민 모집 기간이 아닙니다]**`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `현재 어드민 모집이 비활성화(마감)되어 있습니다.`,
            `최고관리자(Owner)가 \`/vadmin\` 명령어로 모집을 활성화한 후 다시 지원해주세요.`,
          ].join('\n');
        } else {
          const applyNote = rawText.replace(/^(\/참여|참여|\/apply)\s*/i, "").trim();
          const currentLevel = getAdminLevel(senderUser);
          const daysActive = Math.max(1, Math.floor((Date.now() - (senderUser.createdAt || Date.now())) / (1000 * 60 * 60 * 24)));

          if (!db.adminRecruitment.applicants) db.adminRecruitment.applicants = [];
          const existingIdx = db.adminRecruitment.applicants.findIndex((a) => a.userId === senderUser.id);
          const applicantRecord = {
            userId: senderUser.id,
            username: senderUser.username,
            name: senderUser.name,
            appliedAt: Date.now(),
            message: applyNote || "어드민 지원합니다.",
          };
          if (existingIdx >= 0) {
            db.adminRecruitment.applicants[existingIdx] = applicantRecord;
          } else {
            db.adminRecruitment.applicants.push(applicantRecord);
          }
          saveDB(db);

          botReplyText = [
            `✅ **[어드민 지원서 접수 완료!]**`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `• 지원자: **${senderUser.name}** (@${senderUser.username})`,
            `• 접수 시각: ${new Date().toLocaleTimeString('ko-KR')}`,
            `• 각오/메시지: "${applyNote || '어드민 지원합니다.'}"`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `회원님의 어드민 지원서가 최고관리자(Owner)의 **⚡ 명령어 터미널**로 실시간 전송되었습니다.`,
            `관리자 심사 및 승인 시 권한이 부여됩니다. 지원해주셔서 감사합니다!`,
          ].join('\n');

          // Real-time alert to Owner's Command Terminal
          const terminalAlertText = [
            `🔔 **[새로운 어드민 지원자 접수 알림]**`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `• 지원자: **${senderUser.name}** (@${senderUser.username})`,
            `• 아이디: \`${senderUser.username}\` (고유 ID: \`${senderUser.id}\`)`,
            `• 현재 권한: **${getAdminRoleName(currentLevel)}** (Level ${currentLevel})`,
            `• 활동 일수: **${daysActive}일차** (${new Date(senderUser.createdAt || Date.now()).toLocaleDateString('ko-KR')} 가입)`,
            `• 지원 메시지: "${applyNote || '어드민 지원합니다.'}"`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `💡 **[원클릭 임명 명령어]**`,
            `• Level 3 (Admin): \`/op ${senderUser.username} 3\``,
            `• Level 2 (Moder): \`/op ${senderUser.username} 2\``,
            `• Level 4 (HeadAdmin): \`/op ${senderUser.username} 4\``,
          ].join('\n');

          const ownerAlertMsg: MessageRecord = {
            id: `msg_recruit_alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            conversationId: "conv_command",
            senderId: "bot_command",
            receiverId: "owner",
            text: terminalAlertText,
            createdAt: Date.now() + 5,
            read: false,
          };
          db.messages.push(ownerAlertMsg);
          saveDB(db, { type: 'message', item: ownerAlertMsg });

          // Send real-time notification to all Level 5 Owners
          for (const owner of db.users.filter((u) => getAdminLevel(u) === 5)) {
            broadcastToUser(owner.id, {
              type: "message:new",
              payload: {
                message: {
                  ...ownerAlertMsg,
                  sender: COMMAND_BOT,
                },
              },
            });

            broadcastToUser(owner.id, {
              type: "system:broadcast",
              payload: {
                id: `recruit_popup_${Date.now()}`,
                title: "📢 새로운 어드민 지원자 도착!",
                message: `@${senderUser.username} (${senderUser.name})님이 어드민 지원(/참여)을 접수했습니다. 명령어 터미널을 확인하세요!`,
                senderName: "어드민 모집공고 봇",
                timestamp: Date.now(),
              },
            });
          }
        }
      } else {
        const isActive = Boolean(db.adminRecruitment?.active);
        botReplyText = [
          `📢 **[📢 어드민 모집공고 봇]**`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `• 현재 어드민 모집 상태: **${isActive ? '🟢 모집 진행 중' : '🔴 모집 마감'}**`,
          ``,
          `어드민(관리자)에 지원하시려면 아래와 같이 채팅창에 입력해주세요:`,
          `👉 \`/참여\``,
          `👉 \`/참여 <지원동기 및 각오>\``,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          isActive
            ? `지금 \`/참여\`를 전송하면 최고관리자의 명령어 터미널로 실시간 지원서가 전달됩니다!`
            : `현재는 모집 기간이 아닙니다. 관리자가 공고(/vadmin)를 시작하면 지원해주세요.`,
        ].join('\n');
      }

      const botMsg: MessageRecord = {
        id: `msg_bot_recruit_${Date.now() + 10}_${Math.random().toString(36).substring(2, 7)}`,
        conversationId: userRecruitConvId,
        senderId: "bot_recruit",
        receiverId: senderUser.id,
        text: botReplyText,
        createdAt: Date.now() + 10,
        read: true,
      };
      db.messages.push(botMsg);
      saveDB(db, { type: 'message', item: botMsg });

      const populatedBotMsg = {
        ...botMsg,
        sender: RECRUIT_BOT,
      };

      broadcastToUser(senderUser.id, {
        type: "message:new",
        payload: { message: populatedBotMsg },
      });

      return res.json({
        message: populatedUserMsg,
        botResponse: populatedBotMsg,
      });
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
    const effectiveReceiverId = receiverId || (customConvId ? getOtherUserIdFromConv(customConvId, senderId) : undefined);

    if (!effectiveReceiverId) {
      return res.status(400).json({ error: "수신자(receiverId) 또는 conversationId가 필요합니다." });
    }

    const receiverUser = db.users.find((u) => u.id === effectiveReceiverId);

    if (!receiverUser) {
      return res.status(404).json({ error: "상대방 사용자를 찾을 수 없습니다." });
    }

    const conversationId = customConvId || getConversationId(senderId, effectiveReceiverId);

    const newMsg: MessageRecord = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversationId,
      senderId,
      receiverId: effectiveReceiverId,
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
    broadcastToUser(effectiveReceiverId, wsPayload);
    broadcastToUser(senderId, wsPayload);

    return res.json({ message: populatedMsg });
  });

  // Direct Admin Command Endpoint
  app.post("/api/admin/command", (req, res) => {
    const { userId, command } = req.body;
    if (!userId || !command) {
      return res.status(400).json({ error: "userId and command are required" });
    }
    const senderUser = db.users.find((u) => u.id === userId);
    if (!senderUser || !isAdmin(senderUser)) {
      return res.status(403).json({ error: "관리자만 명령어를 실행할 수 있습니다." });
    }
    const result = executeAdminCommand(command, senderUser);
    return res.json({ success: true, result });
  });

  // Get active Admin Notices
  app.get("/api/admin/notices", (_req, res) => {
    if (!db.notices) db.notices = [];
    const activeNotices = db.notices.filter((n) => n.expiresAt > Date.now());
    return res.json({ notices: activeNotices });
  });

  // Apply to an Admin Notice
  app.post("/api/admin/notices/apply", (req, res) => {
    const { noticeId, userId, reason } = req.body;
    if (!noticeId || !userId) {
      return res.status(400).json({ error: "noticeId and userId are required" });
    }

    if (!db.notices) db.notices = [];
    const notice = db.notices.find((n) => n.id === noticeId);
    if (!notice) {
      return res.status(404).json({ error: "해당 모집 공고를 찾을 수 없습니다." });
    }

    if (notice.expiresAt <= Date.now()) {
      return res.status(400).json({ error: "마감된 모집 공고입니다." });
    }

    const applicantUser = db.users.find((u) => u.id === userId);
    if (!applicantUser) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    if (notice.applicants.some((a) => a.userId === userId)) {
      return res.status(400).json({ error: "이미 지원하신 공고입니다." });
    }

    const newApplicant = {
      userId: applicantUser.id,
      username: applicantUser.username,
      name: applicantUser.name,
      appliedAt: Date.now(),
      reason: reason || "",
    };

    notice.applicants.push(newApplicant);
    saveDB(db);

    // Send direct notification message to Owner's Command Terminal
    const ownerUser = db.users.find((u) => getAdminLevel(u) === 5) || db.users.find((u) => u.id === notice.creatorId);
    if (ownerUser) {
      const applyAlertText = [
        `📩 **[어드민 지원 신청서 도착]**`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `• 지원자: **${applicantUser.name}** (@${applicantUser.username})`,
        `• 지원 공고: "${notice.content.slice(0, 30)}..."`,
        `• 지원 사유: "${reason || '(작성 안 함)'}"`,
        `• 가입 일시: ${new Date(applicantUser.createdAt).toLocaleDateString('ko-KR')}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `💡 선발 및 임명: \`/op ${applicantUser.username} 3\` (Admin 지급)`,
      ].join('\n');

      const alertMsg: MessageRecord = {
        id: `msg_apply_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        conversationId: "conv_command",
        senderId: "bot_command",
        receiverId: ownerUser.id,
        text: applyAlertText,
        createdAt: Date.now(),
        read: false,
      };

      db.messages.push(alertMsg);
      saveDB(db, { type: 'message', item: alertMsg });

      broadcastToUser(ownerUser.id, {
        type: "message:new",
        payload: {
          message: {
            ...alertMsg,
            sender: COMMAND_BOT,
          },
        },
      });
    }

    return res.json({ success: true, notice });
  });

  // Moder Terms Agreement (Level 2 auto-grant if 10 days passed)
  app.post("/api/admin/moder/agree", (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    const accountAge = Date.now() - user.createdAt;
    if (accountAge < tenDaysMs) {
      const daysLeft = Math.ceil((tenDaysMs - accountAge) / (1000 * 60 * 60 * 24));
      return res.status(400).json({ error: `가입 후 10일이 경과해야 모더레이터 승급이 가능합니다. (남은 기간: 약 ${daysLeft}일)` });
    }

    const curLvl = getAdminLevel(user);
    if (curLvl < 2) {
      user.adminLevel = 2;
      user.role = 'admin';
      user.moderAgreedAt = Date.now();
      saveDB(db, { type: 'user', item: user });

      const { password: _, ...safeUser } = user;
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "user:profile_updated",
            payload: { user: safeUser },
          }));
        }
      }

      return res.json({ success: true, user: safeUser });
    }

    return res.json({ success: true, user: (({ password: _, ...s }) => s)(user) });
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
