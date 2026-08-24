export type UserStatusMode = 'online' | 'dnd' | 'offline';

export interface User {
  id: string;
  username: string; // Unique User ID (e.g., 'jiuk', 'alex123')
  name: string; // Display Name
  password?: string;
  avatarBg: string;
  avatarEmoji: string;
  customStatus?: string;
  status: UserStatusMode;
  dndUntil?: number | null; // timestamp when DND expires (null means indefinitely until changed)
  lastSeen: number;
  createdAt: number;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
  sender?: User;
  receiver?: User;
}

export interface MessageReaction {
  emoji: string;
  users: string[]; // list of userIds
}

export interface MessageReply {
  id: string;
  senderName: string;
  text: string;
}

export interface MessageAttachment {
  type: 'image' | 'file' | 'audio' | 'video' | 'document';
  url: string;
  name: string;
  size?: string; // e.g. "1.4 MB"
  mimeType?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string; // userId or 'group'
  sender?: User; // Populated sender object for group chats
  text: string;
  createdAt: number;
  read: boolean;
  readBy?: string[]; // Array of userIds who have read this message (for groups)
  replyTo?: MessageReply;
  reactions?: Record<string, string[]>; // emoji -> array of userIds
  attachment?: MessageAttachment;
}

export interface GroupRoom {
  id: string;
  name: string;
  creatorId: string;
  participantIds: string[];
  avatarBg: string;
  avatarEmoji: string;
  createdAt: number;
  updatedAt: number;
}

export interface Conversation {
  id: string;
  isGroup?: boolean;
  group?: GroupRoom;
  participantIds: string[];
  otherUser?: User; // for 1:1 chats
  participants?: User[]; // for group chats
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: number;
}

export type WSEvent =
  | { type: 'auth'; payload: { userId: string } }
  | { type: 'presence:sync'; payload: { onlineUserIds: string[]; userStatuses: Record<string, { status: UserStatusMode; dndUntil?: number | null }> } }
  | { type: 'presence:update'; payload: { userId: string; status: UserStatusMode; dndUntil?: number | null; lastSeen: number } }
  | { type: 'message:send'; payload: { message: Message } }
  | { type: 'message:new'; payload: { message: Message } }
  | { type: 'message:read'; payload: { conversationId: string; readerId: string } }
  | { type: 'message:react'; payload: { messageId: string; conversationId: string; emoji: string; userId: string; action: 'add' | 'remove' } }
  | { type: 'typing:start'; payload: { senderId: string; senderUsername: string; senderName: string; receiverId: string; conversationId: string } }
  | { type: 'typing:stop'; payload: { senderId: string; receiverId: string; conversationId: string } }
  | { type: 'friend:request'; payload: { request: FriendRequest } }
  | { type: 'friend:response'; payload: { request: FriendRequest; accepted: boolean } }
  | { type: 'group:created'; payload: { group: GroupRoom } }
  | { type: 'group:updated'; payload: { group: GroupRoom } }
  | { type: 'group:left'; payload: { groupId: string; userId: string } };

