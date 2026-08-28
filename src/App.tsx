import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { User, Conversation, Message, MessageReply, UserStatusMode, FriendRequest, GroupRoom, MessageAttachment } from './types';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { RegisterPage } from './components/RegisterPage';
import { BottomRightProfile } from './components/BottomRightProfile';
import { NewChatModal } from './components/NewChatModal';
import { ProfileModal } from './components/ProfileModal';
import { UserDetailModal } from './components/UserDetailModal';
import { NotificationPromptModal } from './components/NotificationPromptModal';
import { StatusPickerModal } from './components/StatusPickerModal';
import { AddFriendModal } from './components/AddFriendModal';
import { CreateGroupModal } from './components/CreateGroupModal';
import { GroupInfoModal } from './components/GroupInfoModal';
import { sendBrowserNotification, getNotificationPermission } from './utils/notifications';
import { sounds } from './utils/audio';
import {
  MessageSquare,
  ArrowLeft,
  Users,
  ShieldAlert,
  UserPlus,
  Radio,
  Search,
  Sparkles,
  Shield,
  X,
  Volume2,
  VolumeX,
} from 'lucide-react';

// Helper to extract partner user ID from conversationId
function getOtherUserIdFromConvId(convId: string, myId: string): string | undefined {
  if (convId === 'conv_command') return 'bot_command';
  if (convId.startsWith('group_')) return undefined;
  if (convId.includes('__')) {
    const parts = convId.replace(/^conv_/, '').split('__');
    return parts.find((p) => p !== myId);
  }
  const raw = convId.replace(/^conv_/, '');
  const parts = raw.split('_');
  if (parts.length >= 2) {
    const indices: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'user') indices.push(i);
    }
    if (indices.length === 2) {
      const u1 = parts.slice(indices[0], indices[1]).join('_');
      const u2 = parts.slice(indices[1]).join('_');
      return u1 === myId ? u2 : u1;
    }
  }
  return parts.find((p) => p !== myId);
}

export default function App() {
  // Current user & app view state
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('id_messenger_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [appView, setAppView] = useState<'messenger' | 'register'>('messenger');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [userStatuses, setUserStatuses] = useState<Record<string, { status: UserStatusMode; dndUntil?: number | null }>>({});
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => getNotificationPermission());
  const [pendingFriendRequestsCount, setPendingFriendRequestsCount] = useState<number>(0);

  // Broadcast banner
  const [broadcastAlert, setBroadcastAlert] = useState<string | null>(null);

  // Modals state
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPartnerDetailModal, setShowPartnerDetailModal] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [selectedExploreUser, setSelectedExploreUser] = useState<User | null>(null);

  // Mobile navigation state
  const [mobileView, setMobileView] = useState<'sidebar' | 'chat'>('sidebar');

  const wsRef = useRef<WebSocket | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const partnerTypingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stable references for WebSocket event handling
  const currentUserRef = useRef<User | null>(currentUser);
  currentUserRef.current = currentUser;

  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  const friendsRef = useRef<User[]>(friends);
  friendsRef.current = friends;

  const allUsersRef = useRef<User[]>(allUsers);
  allUsersRef.current = allUsers;

  const conversationsRef = useRef<Conversation[]>(conversations);
  conversationsRef.current = conversations;

  // Identify active conversation object
  const activeConversation = useMemo(() => {
    if (!activeConversationId || !currentUser) return null;
    const found = conversations.find((c) => c.id === activeConversationId);
    if (found) return found;

    // Special Command Bot fallback
    if (activeConversationId === 'conv_command') {
      return {
        id: 'conv_command',
        isGroup: false,
        isCommandBot: true,
        participantIds: [currentUser.id, 'bot_command'],
        unreadCount: 0,
        updatedAt: Date.now(),
      } as Conversation;
    }

    // Direct fallback
    if (!activeConversationId.startsWith('group_')) {
      const otherId = getOtherUserIdFromConvId(activeConversationId, currentUser.id);
      if (otherId) {
        const otherUser = friends.find((f) => f.id === otherId) || allUsers.find((u) => u.id === otherId);
        if (otherUser) {
          return {
            id: activeConversationId,
            isGroup: false,
            participantIds: [currentUser.id, otherId],
            otherUser,
            unreadCount: 0,
            updatedAt: Date.now(),
          } as Conversation;
        }
      }
    }

    return null;
  }, [activeConversationId, currentUser, conversations, friends, allUsers]);

  // Is current active conversation a group chat?
  const isGroupActive = Boolean(activeConversation?.isGroup || (activeConversationId && activeConversationId.startsWith('group_')));
  const activeGroup = isGroupActive ? activeConversation?.group : undefined;

  // Active Partner user object (for 1:1)
  const partnerUser = useMemo(() => {
    if (isGroupActive || !activeConversationId || !currentUser) return null;
    if (activeConversationId === 'conv_command') {
      return {
        id: 'bot_command',
        username: 'command_bot',
        name: '시스템 관리자 터미널',
        avatarBg: 'from-amber-500 to-red-600',
        avatarEmoji: '⚡',
        status: 'online',
        customStatus: '관리자 전용 명령어 콘솔',
      } as User;
    }
    if (activeConversation?.otherUser) return activeConversation.otherUser;

    const otherId = getOtherUserIdFromConvId(activeConversationId, currentUser.id);
    if (otherId) {
      return friends.find((f) => f.id === otherId) || allUsers.find((u) => u.id === otherId) || null;
    }
    return null;
  }, [isGroupActive, activeConversationId, currentUser, activeConversation, friends, allUsers]);

  const partnerUserRef = useRef<User | null>(partnerUser);
  partnerUserRef.current = partnerUser;

  // Active Group members
  const activeGroupMembers = useMemo(() => {
    if (!isGroupActive || !activeGroup || !currentUser) return [];
    return activeGroup.participantIds
      .map((pid) => {
        if (pid === currentUser.id) return currentUser;
        return friends.find((f) => f.id === pid) || allUsers.find((u) => u.id === pid);
      })
      .filter(Boolean) as User[];
  }, [isGroupActive, activeGroup, currentUser, friends, allUsers]);

  // Save currentUser to localStorage
  const handleLoginSuccess = (user: User, token: string = 'demo_token', isNewRegistration?: boolean) => {
    localStorage.setItem('id_messenger_user', JSON.stringify(user));
    localStorage.setItem('id_messenger_token', token);
    setCurrentUser(user);
    setActiveConversationId(null);
    setMobileView('sidebar');
    setAppView('messenger');

    if (isNewRegistration || getNotificationPermission() === 'default') {
      setTimeout(() => {
        setShowNotificationPrompt(true);
      }, 400);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('id_messenger_user');
    localStorage.removeItem('id_messenger_token');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setCurrentUser(null);
    setActiveConversationId(null);
    setConversations([]);
    setFriends([]);
    setCurrentMessages([]);
  };

  // Fetch friends
  const fetchFriends = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/friends?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setFriends(data.friends || []);
    } catch (e) {
      console.warn('Friends fetch paused:', e);
    }
  }, []);

  // Fetch pending friend requests
  const fetchPendingFriendRequests = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/friends/requests?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPendingFriendRequestsCount((data.incoming || []).length);
    } catch (e) {
      console.warn('Friend requests fetch paused:', e);
    }
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/conversations?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.warn('Conversations fetch paused:', e);
    }
  }, []);

  // Fetch all users (works for both guests and authenticated users)
  const fetchAllUsers = useCallback(async (userId?: string) => {
    try {
      const res = await fetch(`/api/users/search?currentUserId=${encodeURIComponent(userId || '')}`);
      if (!res.ok) return;
      const data = await res.json();
      setAllUsers(data.users || []);
    } catch (e) {
      console.warn('Users fetch paused:', e);
    }
  }, []);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (convId: string, userId: string) => {
    try {
      const res = await fetch(`/api/messages?conversationId=${convId}&userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.notFriends) {
        alert(data.error || '친구 사이에서만 대화할 수 있습니다.');
        setActiveConversationId(null);
        return;
      }
      setCurrentMessages(data.messages || []);

      // Decrement unread count locally
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (e) {
      console.warn('Messages fetch paused:', e);
    }
  }, []);

  // Fetch initial data when user changes
  useEffect(() => {
    if (currentUser?.id) {
      fetchFriends(currentUser.id);
      fetchPendingFriendRequests(currentUser.id);
      fetchConversations(currentUser.id);
      fetchAllUsers(currentUser.id);
    } else {
      // Guest mode: fetch user list for directory
      fetchAllUsers('');
    }
  }, [currentUser, fetchFriends, fetchPendingFriendRequests, fetchConversations, fetchAllUsers]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!currentUser?.id || !activeConversationId) return;
    fetchMessages(activeConversationId, currentUser.id);
  }, [currentUser, activeConversationId, fetchMessages]);

  // WebSocket Connection
  useEffect(() => {
    const currentUserId = currentUser?.id;
    if (!currentUserId) return;

    let ws: WebSocket | null = null;
    let isUnmounted = false;
    let pingInterval: NodeJS.Timeout | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      if (isUnmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmounted) {
          ws?.close();
          return;
        }
        ws?.send(JSON.stringify({ type: 'auth', payload: { userId: currentUserId } }));

        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);

        if (currentUserRef.current) {
          fetchConversations(currentUserRef.current.id);
          fetchFriends(currentUserRef.current.id);
          fetchPendingFriendRequests(currentUserRef.current.id);
          const activeId = activeConversationIdRef.current;
          if (activeId) {
            fetchMessages(activeId, currentUserRef.current.id);
          }
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') return;

          const me = currentUserRef.current;
          const curActiveConvId = activeConversationIdRef.current;

          switch (msg.type) {
            case 'presence:sync': {
              setOnlineUserIds(new Set(msg.payload.onlineUserIds));
              if (msg.payload.userStatuses) {
                setUserStatuses(msg.payload.userStatuses);
                if (me && msg.payload.userStatuses[me.id]) {
                  const syncedStatus = msg.payload.userStatuses[me.id].status;
                  const syncedDndUntil = msg.payload.userStatuses[me.id].dndUntil;
                  if (me.status !== syncedStatus || me.dndUntil !== syncedDndUntil) {
                    const updated = { ...me, status: syncedStatus, dndUntil: syncedDndUntil };
                    setCurrentUser(updated);
                    localStorage.setItem('id_messenger_user', JSON.stringify(updated));
                  }
                }
              }
              break;
            }

            case 'system:broadcast': {
              const bText = msg.payload?.text;
              if (bText) {
                sounds.playIncomingMessage();
                setBroadcastAlert(bText);
                sendBrowserNotification('📢 시스템 전체 공지', {
                  body: bText,
                });
              }
              break;
            }

            case 'user:profile_updated': {
              const updatedUser: User = msg.payload?.user;
              if (!updatedUser) break;

              if (me && updatedUser.id === me.id) {
                setCurrentUser((prev) => (prev ? { ...prev, ...updatedUser } : updatedUser));
                localStorage.setItem('id_messenger_user', JSON.stringify(updatedUser));
              }

              setFriends((prev) =>
                prev.map((f) => (f.id === updatedUser.id ? { ...f, ...updatedUser } : f))
              );
              setAllUsers((prev) =>
                prev.map((u) => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u))
              );
              setConversations((prev) =>
                prev.map((c) =>
                  c.otherUser?.id === updatedUser.id
                    ? { ...c, otherUser: { ...c.otherUser, ...updatedUser } }
                    : c
                )
              );
              break;
            }

            case 'friend:request': {
              if (me) fetchPendingFriendRequests(me.id);
              if (me && me.status !== 'dnd') {
                sounds.playIncomingMessage();
              }
              break;
            }

            case 'friend:response': {
              if (me) {
                fetchFriends(me.id);
                fetchPendingFriendRequests(me.id);
                fetchAllUsers(me.id);
              }
              break;
            }

            case 'chat:created': {
              const newConv: Conversation = msg.payload.conversation;
              setConversations((prev) => {
                const exists = prev.some((c) => c.id === newConv.id);
                if (exists) return prev;
                return [newConv, ...prev];
              });
              break;
            }

            case 'message:receive': {
              const newMsg: Message = msg.payload.message;
              const isCurrentChat = curActiveConvId === newMsg.conversationId;

              if (isCurrentChat) {
                setCurrentMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id)) return prev;
                  return [...prev, newMsg];
                });

                if (me && newMsg.senderId !== me.id) {
                  fetch('/api/messages/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      conversationId: newMsg.conversationId,
                      userId: me.id,
                    }),
                  }).catch(() => {});
                }
              }

              if (me && newMsg.senderId !== me.id) {
                if (me.status !== 'dnd') {
                  sounds.playIncomingMessage();
                }
                const senderName = allUsers.find((u) => u.id === newMsg.senderId)?.name || '새 메시지';
                sendBrowserNotification(senderName, {
                  body: newMsg.text || '새 메시지가 도착했습니다.',
                });
              }

              if (me) fetchConversations(me.id);
              break;
            }

            case 'message:reaction': {
              const { messageId, reactions } = msg.payload;
              setCurrentMessages((prev) =>
                prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
              );
              break;
            }

            case 'message:read': {
              const { conversationId, readerId } = msg.payload;
              if (curActiveConvId === conversationId) {
                setCurrentMessages((prev) =>
                  prev.map((m) => {
                    const existingReadBy = m.readBy || [];
                    const updatedReadBy = existingReadBy.includes(readerId)
                      ? existingReadBy
                      : [...existingReadBy, readerId];
                    return { ...m, read: true, readBy: updatedReadBy };
                  })
                );
              }
              break;
            }

            case 'user:typing': {
              const { userId, isTyping, conversationId } = msg.payload;
              if (conversationId === curActiveConvId && userId !== me?.id) {
                if (isTyping) {
                  setTypingUsers((prev) => new Set([...prev, userId]));
                  if (partnerTypingTimerRef.current) clearTimeout(partnerTypingTimerRef.current);
                  partnerTypingTimerRef.current = setTimeout(() => {
                    setTypingUsers((prev) => {
                      const next = new Set(prev);
                      next.delete(userId);
                      return next;
                    });
                  }, 3000);
                } else {
                  setTypingUsers((prev) => {
                    const next = new Set(prev);
                    next.delete(userId);
                    return next;
                  });
                }
              }
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.warn('WS message parse err:', err);
        }
      };

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [currentUser?.id, fetchConversations, fetchFriends, fetchPendingFriendRequests, fetchAllUsers, fetchMessages]);

  // Send message
  const handleSendMessage = async (
    text: string,
    replyTo?: MessageReply,
    attachment?: MessageAttachment
  ) => {
    if (!currentUser || !activeConversationId) return;

    sounds.playSentMessage();

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConversationId,
          senderId: currentUser.id,
          senderName: currentUser.name,
          text,
          replyTo,
          attachment,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setCurrentMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev;
            return [...prev, data.message];
          });
        }
        fetchConversations(currentUser.id);
      }
    } catch (e) {
      console.error('Failed to send message:', e);
    }
  };

  // Add reaction
  const handleReactMessage = async (messageId: string, emoji: string) => {
    if (!currentUser || !activeConversationId) return;

    try {
      await fetch('/api/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          userId: currentUser.id,
          emoji,
        }),
      });
    } catch (e) {
      console.error('Failed to react:', e);
    }
  };

  // Typing emitter
  const handleTyping = () => {
    if (!currentUser || !activeConversationId || !wsRef.current) return;
    if (wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'typing',
        payload: {
          conversationId: activeConversationId,
          userId: currentUser.id,
          isTyping: true,
        },
      })
    );

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'typing',
            payload: {
              conversationId: activeConversationId,
              userId: currentUser.id,
              isTyping: false,
            },
          })
        );
      }
    }, 2000);
  };

  // Start chat with user
  const handleStartChatWithUser = async (targetUser: User) => {
    if (!currentUser) {
      setSelectedExploreUser(targetUser);
      return;
    }

    try {
      const res = await fetch('/api/conversations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: [currentUser.id, targetUser.id],
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        alert(errData.error || '대화방을 생성할 수 없습니다.');
        return;
      }

      const data = await res.json();
      const newConv: Conversation = data.conversation;

      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== newConv.id);
        return [newConv, ...filtered];
      });

      setActiveConversationId(newConv.id);
      setMobileView('chat');
      fetchMessages(newConv.id, currentUser.id);
    } catch (e) {
      console.error('Failed to create chat:', e);
    }
  };

  const handleSelectConversation = (convId: string) => {
    setCurrentMessages([]);
    setActiveConversationId(convId);
    setMobileView('chat');
    if (currentUser) {
      fetchMessages(convId, currentUser.id);
    }
  };

  // Accept/Reject friend request
  const handleAcceptFriendRequest = async (requestId: string) => {
    if (!currentUser) return;
    try {
      await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, userId: currentUser.id, accept: true }),
      });
      fetchFriends(currentUser.id);
      fetchPendingFriendRequests(currentUser.id);
      fetchAllUsers(currentUser.id);
    } catch (e) {
      console.error('Failed to accept request:', e);
    }
  };

  const handleRejectFriendRequest = async (requestId: string) => {
    if (!currentUser) return;
    try {
      await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, userId: currentUser.id, accept: false }),
      });
      fetchPendingFriendRequests(currentUser.id);
    } catch (e) {
      console.error('Failed to reject request:', e);
    }
  };

  // Group actions
  const handleInviteGroupMembers = async (newMemberIds: string[]) => {
    if (!currentUser || !activeGroup) return;
    try {
      const res = await fetch(`/api/groups/${activeGroup.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          memberIds: newMemberIds,
        }),
      });
      if (res.ok) {
        fetchConversations(currentUser.id);
        setShowGroupInfoModal(false);
      }
    } catch (e) {
      console.error('Failed to invite:', e);
    }
  };

  const handleLeaveGroup = async () => {
    if (!currentUser || !activeGroup) return;
    try {
      const res = await fetch(`/api/groups/${activeGroup.id}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      if (res.ok) {
        setShowGroupInfoModal(false);
        setActiveConversationId(null);
        fetchConversations(currentUser.id);
      }
    } catch (e) {
      console.error('Failed to leave group:', e);
    }
  };

  // Typing display in group
  const groupTypingNames = isGroupActive
    ? Array.from(typingUsers)
        .filter((uid) => uid !== currentUser?.id && activeGroup?.participantIds.includes(uid))
        .map((uid) => allUsers.find((u) => u.id === uid)?.name || '멤버')
    : [];

  const typingDisplay = groupTypingNames.length > 0
    ? `${groupTypingNames.join(', ')}님이 입력 중입니다...`
    : undefined;

  const partnerStatusData = partnerUser ? userStatuses[partnerUser.id] : null;
  const isPartnerConnected = partnerUser ? onlineUserIds.has(partnerUser.id) : false;
  const partnerStatusMode: UserStatusMode =
    partnerStatusData?.status === 'dnd'
      ? 'dnd'
      : isPartnerConnected
      ? 'online'
      : 'offline';

  // 1. Full Page Centered Register View
  if (appView === 'register') {
    return (
      <RegisterPage
        onBack={() => setAppView('messenger')}
        onRegisterSuccess={(user) => handleLoginSuccess(user, 'token', true)}
      />
    );
  }

  // 2. Main Messenger View (Sidebar on Left, Chat in Middle, Profile on Bottom Right)
  return (
    <div className="relative flex h-[100dvh] w-full bg-[#080711] text-slate-100 overflow-hidden font-sans select-none antialiased md:p-3 lg:p-4">
      
      {/* Ambient Lighting Background (Rich Purple/Violet Aura) */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Top-left purple/violet glow */}
        <div className="absolute -top-32 -left-32 w-[550px] h-[550px] bg-gradient-to-br from-purple-600/40 via-violet-600/30 to-indigo-700/20 rounded-full blur-[130px] animate-pulse" style={{ animationDuration: '8s' }} />
        {/* Bottom-right fuchsia/purple glow */}
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] bg-gradient-to-tl from-purple-700/45 via-fuchsia-600/30 to-indigo-600/25 rounded-full blur-[140px] animate-pulse" style={{ animationDuration: '10s' }} />
        {/* Center ambient violet aura */}
        <div className="absolute top-[30%] left-[25%] w-[450px] h-[450px] bg-violet-600/20 rounded-full blur-[110px]" />
        {/* Bottom-left deep indigo glow */}
        <div className="absolute -bottom-20 left-[20%] w-[400px] h-[400px] bg-indigo-700/25 rounded-full blur-[120px]" />
      </div>

      {/* Broadcast Alert Toast */}
      {broadcastAlert && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full px-4 animate-in slide-in-from-top-4">
          <div className="p-3.5 bg-amber-500/20 border border-amber-400/40 rounded-2xl shadow-2xl backdrop-blur-2xl text-amber-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Radio className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
              <div className="text-xs">
                <span className="font-bold text-amber-300 mr-1.5">[전체 공지]</span>
                <span>{broadcastAlert}</span>
              </div>
            </div>
            <button
              onClick={() => setBroadcastAlert(null)}
              className="p-1 text-amber-300/60 hover:text-amber-200 rounded-lg hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Glass App Container with purple aura reflection */}
      <div className="relative z-10 w-full h-full flex bg-[#0c0d18]/75 backdrop-blur-3xl md:border md:border-purple-500/20 md:rounded-3xl shadow-[0_0_80px_rgba(139,92,246,0.18)] overflow-hidden">
        
        {/* ================= MAIN CHAT / CONTENT AREA (LEFT) ================= */}
        <div
          className={`h-full flex-1 flex flex-col min-w-0 bg-white/[0.01] ${
            mobileView === 'chat' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {activeConversationId && (isGroupActive || partnerUser) && currentUser ? (
            <div className="h-full flex flex-col min-w-0">
              <ChatArea
                currentUser={currentUser}
                partner={partnerUser || undefined}
                group={activeGroup}
                isGroup={isGroupActive}
                groupMembers={activeGroupMembers}
                messages={currentMessages}
                conversationId={activeConversationId}
                isPartnerOnline={isPartnerConnected}
                partnerStatusMode={partnerStatusMode}
                isPartnerTyping={partnerUser ? typingUsers.has(partnerUser.id) : false}
                typingText={typingDisplay}
                onSendMessage={handleSendMessage}
                onReactMessage={handleReactMessage}
                onTyping={handleTyping}
                onOpenPartnerDetails={() => setShowPartnerDetailModal(true)}
                onOpenGroupInfo={() => setShowGroupInfoModal(true)}
                onBack={() => setMobileView('sidebar')}
              />
            </div>
          ) : currentUser ? (
            /* Logged In Empty Chat View */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-white/50 bg-black/10">
              <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-blue-400 mb-4 shadow-2xl backdrop-blur-xl">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1.5">대화를 선택하거나 시작해보세요</h2>
              <p className="text-xs text-white/50 max-w-sm mb-5 leading-relaxed">
                오른쪽 목록에서 대화방을 선택하거나, 친구 추가 및 단체방을 개설하여 대화를 나눠보세요.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  id="empty-chat-add-friend-btn"
                  type="button"
                  onClick={() => setShowAddFriendModal(true)}
                  className="py-2 px-4 bg-white/10 hover:bg-white/15 text-white font-medium rounded-xl text-xs border border-white/15 transition-all flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5 text-blue-400" />
                  <span>친구 추가하기</span>
                </button>
                <button
                  id="empty-chat-create-group-btn"
                  type="button"
                  onClick={() => setShowCreateGroupModal(true)}
                  className="py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-xs shadow-md shadow-blue-600/30 border border-blue-400/30 transition-all flex items-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>단체 채팅방 만들기</span>
                </button>
              </div>
            </div>
          ) : (
            /* Guest Explorer Home View */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-white/60 bg-black/15">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600/20 via-indigo-600/20 to-blue-600/20 border border-purple-400/20 flex items-center justify-center text-4xl mb-5 shadow-2xl backdrop-blur-xl">
                ⚡
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                실시간 JK Message 메신저
              </h2>
              <p className="text-xs sm:text-sm text-white/50 max-w-md mb-6 leading-relaxed">
                오른쪽 사이드바에서 전체 가입 유저를 검색하고 프로필을 조회할 수 있습니다.
                실시간 대화와 그룹 채팅을 이용하시려면 오른쪽 하단에서 간편 로그인 또는 회원가입을 진행해주세요.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  id="guest-main-register-btn"
                  type="button"
                  onClick={() => setAppView('register')}
                  className="py-2.5 px-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-2xl text-xs shadow-lg shadow-purple-600/30 border border-purple-400/30 transition-all flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>새 계정 만들기 (회원가입)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ================= RIGHT SIDEBAR (JK Message & 대화 목록) ================= */}
        <div
          className={`h-full w-full md:w-80 lg:w-96 shrink-0 md:flex ${
            mobileView === 'sidebar' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <Sidebar
            currentUser={currentUser}
            conversations={conversations}
            friends={friends}
            allUsers={allUsers}
            activeConversationId={activeConversationId}
            onlineUserIds={onlineUserIds}
            userStatuses={userStatuses}
            pendingFriendRequestsCount={pendingFriendRequestsCount}
            soundEnabled={soundEnabled}
            onToggleSound={() => {
              const next = sounds.toggleSound();
              setSoundEnabled(next);
            }}
            onOpenProfileSettings={() => setShowProfileModal(true)}
            onOpenStatusPicker={() => setShowStatusPicker(true)}
            onLogout={handleLogout}
            onNavigateToRegister={() => setAppView('register')}
            onLoginSuccess={(user) => handleLoginSuccess(user, 'token', false)}
            onOpenAddFriendModal={() => setShowAddFriendModal(true)}
            onOpenCreateGroupModal={() => setShowCreateGroupModal(true)}
            onSelectConversation={handleSelectConversation}
            onStartChatWithUser={handleStartChatWithUser}
            onOpenUserDetail={(u) => setSelectedExploreUser(u)}
            onPromptLogin={() => {}}
          />
        </div>

      </div>

      {/* ================= MODALS ================= */}
      
      {/* Create Group Modal */}
      {showCreateGroupModal && currentUser && (
        <CreateGroupModal
          currentUser={currentUser}
          friends={friends}
          onClose={() => setShowCreateGroupModal(false)}
          onGroupCreated={(newGroup) => {
            fetchConversations(currentUser.id);
            setActiveConversationId(newGroup.id);
            setMobileView('chat');
            fetchMessages(newGroup.id, currentUser.id);
          }}
        />
      )}

      {/* Group Info & Members Modal */}
      {showGroupInfoModal && activeGroup && currentUser && (
        <GroupInfoModal
          group={activeGroup}
          currentUser={currentUser}
          allFriends={friends}
          onlineUserIds={onlineUserIds}
          userStatuses={userStatuses}
          onClose={() => setShowGroupInfoModal(false)}
          onInviteMembers={handleInviteGroupMembers}
          onLeaveGroup={handleLeaveGroup}
        />
      )}

      {/* Add Friend & Requests Modal */}
      {showAddFriendModal && currentUser && (
        <AddFriendModal
          currentUser={currentUser}
          onClose={() => setShowAddFriendModal(false)}
          onRequestSent={() => {
            fetchFriends(currentUser.id);
            fetchPendingFriendRequests(currentUser.id);
          }}
          onAcceptRequest={handleAcceptFriendRequest}
          onRejectRequest={handleRejectFriendRequest}
        />
      )}

      {/* Status Picker Modal */}
      {showStatusPicker && currentUser && (
        <StatusPickerModal
          user={currentUser}
          onClose={() => setShowStatusPicker(false)}
          onStatusUpdated={(updated) => {
            setCurrentUser(updated);
            localStorage.setItem('id_messenger_user', JSON.stringify(updated));
          }}
        />
      )}

      {/* Profile Settings Modal */}
      {showProfileModal && currentUser && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfileModal(false)}
          onUpdate={(updated) => {
            setCurrentUser(updated);
            localStorage.setItem('id_messenger_user', JSON.stringify(updated));
            fetchAllUsers(currentUser.id);
            fetchFriends(currentUser.id);
          }}
          onLogout={handleLogout}
        />
      )}

      {/* Partner User Details Modal */}
      {showPartnerDetailModal && partnerUser && (
        <UserDetailModal
          user={partnerUser}
          isOnline={isPartnerConnected}
          onClose={() => setShowPartnerDetailModal(false)}
          onStartChat={currentUser ? (u) => handleStartChatWithUser(u) : undefined}
        />
      )}

      {/* Selected Explore User Details Modal (for Guest or Explorers) */}
      {selectedExploreUser && (
        <UserDetailModal
          user={selectedExploreUser}
          isOnline={onlineUserIds.has(selectedExploreUser.id)}
          onClose={() => setSelectedExploreUser(null)}
          onStartChat={currentUser ? (u) => {
            setSelectedExploreUser(null);
            handleStartChatWithUser(u);
          } : undefined}
        />
      )}

      {/* Notification Prompt Modal */}
      <NotificationPromptModal
        isOpen={showNotificationPrompt}
        onClose={() => setShowNotificationPrompt(false)}
        onEnabled={() => {
          setNotificationPermission(getNotificationPermission());
        }}
      />

    </div>
  );
}
