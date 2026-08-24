import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { User, Conversation, Message, MessageReply, UserStatusMode, FriendRequest, GroupRoom, MessageAttachment } from './types';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
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
import { MessageSquare, ArrowLeft, Users, ShieldAlert, UserPlus } from 'lucide-react';

// Helper to extract partner user ID from conversationId
function getOtherUserIdFromConvId(convId: string, myId: string): string | undefined {
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
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('id_messenger_user');
    return saved ? JSON.parse(saved) : null;
  });

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

  // Modals state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPartnerDetailModal, setShowPartnerDetailModal] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);

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
  const handleLoginSuccess = (user: User, token: string, isNewRegistration?: boolean) => {
    localStorage.setItem('id_messenger_user', JSON.stringify(user));
    localStorage.setItem('id_messenger_token', token);
    setCurrentUser(user);
    setActiveConversationId(null);
    setMobileView('sidebar');

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

  // Fetch all users
  const fetchAllUsers = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/users/search?currentUserId=${userId}`);
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

  // Initialize data on user change
  const currentUserId = currentUser?.id;
  useEffect(() => {
    if (!currentUserId) return;
    fetchFriends(currentUserId);
    fetchPendingFriendRequests(currentUserId);
    fetchConversations(currentUserId);
    fetchAllUsers(currentUserId);
  }, [currentUserId, fetchFriends, fetchPendingFriendRequests, fetchConversations, fetchAllUsers]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!currentUserId || !activeConversationId) return;
    fetchMessages(activeConversationId, currentUserId);
  }, [activeConversationId, currentUserId, fetchMessages]);

  // Setup WebSocket connection - with Heartbeat, Auto-reconnect, and Real-time event handling
  useEffect(() => {
    if (!currentUserId) return;

    let isUnmounted = false;
    let ws: WebSocket | null = null;
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
                sendBrowserNotification('새 친구 요청', {
                  body: `${msg.payload?.request?.sender?.name || '새 사용자'}님이 친구 요청을 보냈습니다!`,
                });
              }
              break;
            }

            case 'friend:response': {
              if (me) {
                fetchFriends(me.id);
                fetchConversations(me.id);
                fetchPendingFriendRequests(me.id);
              }
              if (msg.payload?.accepted && me && me.status !== 'dnd') {
                sounds.playIncomingMessage();
                sendBrowserNotification('친구 수락 완료', {
                  body: `친구 요청이 수락되어 대화를 시작할 수 있습니다 🎉`,
                });
              }
              break;
            }

            case 'group:created':
            case 'group:updated': {
              if (me) {
                fetchConversations(me.id);
                if (curActiveConvId === msg.payload?.group?.id) {
                  fetchMessages(curActiveConvId, me.id);
                }
              }
              break;
            }

            case 'group:left': {
              if (me) {
                fetchConversations(me.id);
                if (curActiveConvId === msg.payload?.groupId) {
                  setActiveConversationId(null);
                }
              }
              break;
            }

            case 'message:new': {
              const incoming: Message = msg.payload?.message;
              if (!incoming || !me) break;

              const isCurrentChat = curActiveConvId === incoming.conversationId;

              if (isCurrentChat) {
                setCurrentMessages((prev) => {
                  if (prev.some((m) => m.id === incoming.id)) return prev;

                  if (incoming.senderId === me.id) {
                    const tempIdx = prev.findIndex(
                      (m) => m.id.startsWith('temp_') && m.senderId === incoming.senderId && (m.text === incoming.text || m.attachment?.name === incoming.attachment?.name)
                    );
                    if (tempIdx !== -1) {
                      const next = [...prev];
                      next[tempIdx] = incoming;
                      return next;
                    }
                  }

                  return [...prev, incoming];
                });

                if (incoming.senderId !== me.id) {
                  if (me.status !== 'dnd') {
                    sounds.playIncomingMessage();
                  }
                  fetch(`/api/messages?conversationId=${incoming.conversationId}&userId=${me.id}`);
                }
              } else {
                if (incoming.senderId !== me.id && me.status !== 'dnd') {
                  sounds.playIncomingMessage();
                }
              }

              // Trigger push notification if not looking at chat
              if (incoming.senderId !== me.id && me.status !== 'dnd' && incoming.senderId !== 'system') {
                const isGroup = incoming.conversationId.startsWith('group_');
                const senderName = incoming.sender?.name || '새 메시지';
                const notifTitle = isGroup ? `[단체방] ${senderName}` : `${senderName} (@${incoming.sender?.username || ''})`;
                const notifBody = incoming.text || (incoming.attachment ? `[파일] ${incoming.attachment.name}` : '새 메시지');

                sendBrowserNotification(notifTitle, {
                  body: notifBody,
                  onClick: () => {
                    setActiveConversationId(incoming.conversationId);
                    setMobileView('chat');
                    if (me) {
                      fetchMessages(incoming.conversationId, me.id);
                    }
                  },
                });
              }

              // Update conversation list item
              setConversations((prev) => {
                const exists = prev.some((c) => c.id === incoming.conversationId);
                if (exists) {
                  return prev
                    .map((c) => {
                      if (c.id === incoming.conversationId) {
                        return {
                          ...c,
                          lastMessage: incoming,
                          updatedAt: incoming.createdAt,
                          unreadCount:
                            isCurrentChat || incoming.senderId === me.id
                              ? 0
                              : c.unreadCount + 1,
                        };
                      }
                      return c;
                    })
                    .sort((a, b) => b.updatedAt - a.updatedAt);
                } else {
                  if (me) fetchConversations(me.id);
                  return prev;
                }
              });

              break;
            }

            case 'message:read': {
              const { conversationId, readerId } = msg.payload;
              const me = currentUserRef.current;
              if (me && readerId !== me.id) {
                setCurrentMessages((prev) =>
                  prev.map((m) =>
                    m.conversationId === conversationId && m.senderId === me.id
                      ? { ...m, read: true }
                      : m
                  )
                );
              }
              break;
            }

            case 'message:react': {
              const { messageId, emoji, userId, action } = msg.payload;
              setCurrentMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== messageId) return m;
                  const reactions = { ...(m.reactions || {}) };
                  const userList = [...(reactions[emoji] || [])];
                  if (action === 'add' && !userList.includes(userId)) {
                    userList.push(userId);
                    reactions[emoji] = userList;
                  } else if (action === 'remove') {
                    const filtered = userList.filter((u) => u !== userId);
                    if (filtered.length > 0) {
                      reactions[emoji] = filtered;
                    } else {
                      delete reactions[emoji];
                    }
                  }
                  return { ...m, reactions };
                })
              );
              break;
            }

            case 'typing:start': {
              if (msg.payload?.senderId) {
                setTypingUsers((prev) => new Set(prev).add(msg.payload.senderId));
                if (partnerTypingTimerRef.current) clearTimeout(partnerTypingTimerRef.current);
                partnerTypingTimerRef.current = setTimeout(() => {
                  setTypingUsers((prev) => {
                    const next = new Set(prev);
                    next.delete(msg.payload.senderId);
                    return next;
                  });
                }, 2500);
              }
              break;
            }

            case 'typing:stop': {
              if (msg.payload?.senderId) {
                setTypingUsers((prev) => {
                  const next = new Set(prev);
                  next.delete(msg.payload.senderId);
                  return next;
                });
              }
              break;
            }
          }
        } catch (e) {
          console.error('WS message error:', e);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        if (!isUnmounted && currentUserRef.current) {
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            connect();
          }, 1500);
        }
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [currentUserId, fetchConversations, fetchFriends, fetchPendingFriendRequests, fetchMessages]);

  // Periodic gentle polling fallback
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && currentUserRef.current) {
        const uid = currentUserRef.current.id;
        fetchConversations(uid);
        fetchFriends(uid);
        fetchPendingFriendRequests(uid);
        fetchAllUsers(uid);
        const activeConvId = activeConversationIdRef.current;
        if (activeConvId) {
          fetchMessages(activeConvId, uid);
        }
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [currentUser, fetchConversations, fetchFriends, fetchPendingFriendRequests, fetchAllUsers, fetchMessages]);

  // Send message handler (1:1 or Group with attachment support)
  const handleSendMessage = async (text: string, replyTo?: MessageReply, attachment?: MessageAttachment) => {
    if (!currentUser || !activeConversationId) return;

    sounds.playSentMessage();

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const isGroup = isGroupActive;
    const receiverId = isGroup ? 'group' : (partnerUser?.id || '');

    const optimisticMsg: Message = {
      id: tempId,
      conversationId: activeConversationId,
      senderId: currentUser.id,
      receiverId,
      text: text.trim(),
      createdAt: Date.now(),
      read: false,
      replyTo,
      attachment,
      sender: currentUser,
    };

    setCurrentMessages((prev) => [...prev, optimisticMsg]);

    setConversations((prev) => {
      const exists = prev.some((c) => c.id === activeConversationId);
      if (exists) {
        return prev
          .map((c) => (c.id === activeConversationId ? { ...c, lastMessage: optimisticMsg, updatedAt: Date.now() } : c))
          .sort((a, b) => b.updatedAt - a.updatedAt);
      }
      return prev;
    });

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId,
          conversationId: activeConversationId,
          text,
          replyTo,
          attachment,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.notFriends || data.error) {
        setCurrentMessages((prev) => prev.filter((m) => m.id !== tempId));
        alert(data.error || '메시지 전송에 실패했습니다.');
        return;
      }
      if (data.message) {
        const realMsg: Message = data.message;
        setCurrentMessages((prev) => {
          const alreadyHasReal = prev.some((m) => m.id === realMsg.id);
          if (alreadyHasReal) {
            return prev.filter((m) => m.id !== tempId);
          }
          return prev.map((m) => (m.id === tempId ? realMsg : m));
        });

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'typing:stop',
              payload: {
                senderId: currentUser.id,
                receiverId,
                conversationId: activeConversationId,
              },
            })
          );
        }
      }
    } catch (e) {
      console.error('Send message failed:', e);
      setCurrentMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert('네트워크 오류로 메시지 전송에 실패했습니다.');
    }
  };

  // React to message handler
  const handleReactMessage = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    try {
      await fetch('/api/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          emoji,
          userId: currentUser.id,
        }),
      });
    } catch (e) {
      console.error('Reaction failed:', e);
    }
  };

  // Group invite member handler
  const handleInviteGroupMembers = async (newMemberIds: string[]) => {
    if (!currentUser || !activeConversationId) return;
    const res = await fetch(`/api/groups/${activeConversationId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        newMemberIds,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '멤버 초대에 실패했습니다.');
    }
    fetchConversations(currentUser.id);
    fetchMessages(activeConversationId, currentUser.id);
  };

  // Group leave handler
  const handleLeaveGroup = async () => {
    if (!currentUser || !activeConversationId) return;
    const res = await fetch(`/api/groups/${activeConversationId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '채팅방 나가기에 실패했습니다.');
    }
    setActiveConversationId(null);
    fetchConversations(currentUser.id);
  };

  // Accept Friend Request
  const handleAcceptFriendRequest = async (requestId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          userId: currentUser.id,
          accept: true,
        }),
      });
      if (res.ok) {
        fetchFriends(currentUser.id);
        fetchConversations(currentUser.id);
        fetchPendingFriendRequests(currentUser.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Reject Friend Request
  const handleRejectFriendRequest = async (requestId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          userId: currentUser.id,
          accept: false,
        }),
      });
      if (res.ok) {
        fetchPendingFriendRequests(currentUser.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Typing event trigger
  const handleTyping = () => {
    if (!currentUser || !activeConversationId || !wsRef.current) return;
    if (wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'typing:start',
        payload: {
          senderId: currentUser.id,
          receiverId: isGroupActive ? 'group' : (partnerUser?.id || ''),
          conversationId: activeConversationId,
        },
      })
    );

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'typing:stop',
            payload: {
              senderId: currentUser.id,
              receiverId: isGroupActive ? 'group' : (partnerUser?.id || ''),
              conversationId: activeConversationId,
            },
          })
        );
      }
    }, 1500);
  };

  // Start chat with a friend
  const handleStartChatWithUser = (targetUser: User) => {
    if (!currentUser) return;
    const sorted = [currentUser.id, targetUser.id].sort();
    const convId = `conv_${sorted[0]}__${sorted[1]}`;

    setCurrentMessages([]);

    if (!conversations.some((c) => c.id === convId)) {
      const newConv: Conversation = {
        id: convId,
        isGroup: false,
        participantIds: [currentUser.id, targetUser.id],
        otherUser: targetUser,
        unreadCount: 0,
        updatedAt: Date.now(),
      };
      setConversations((prev) => [newConv, ...prev]);
    }

    setActiveConversationId(convId);
    setMobileView('chat');
    fetchMessages(convId, currentUser.id);
  };

  const handleSelectConversation = (convId: string) => {
    setCurrentMessages([]);
    setActiveConversationId(convId);
    setMobileView('chat');
    if (currentUser) {
      fetchMessages(convId, currentUser.id);
    }
  };

  if (!currentUser) {
    return <AuthModal onLoginSuccess={handleLoginSuccess} />;
  }

  // Calculate typing text in group
  const groupTypingNames = isGroupActive
    ? Array.from(typingUsers)
        .filter((uid) => uid !== currentUser.id && activeGroup?.participantIds.includes(uid))
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

  return (
    <div className="relative flex h-[100dvh] w-full bg-[#0c0e14] text-slate-100 overflow-hidden font-sans select-none antialiased md:p-3 lg:p-5">
      {/* Ambient Glowing Background Orbs */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[55%] h-[55%] bg-indigo-600/20 rounded-full blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[55%] h-[55%] bg-blue-600/20 rounded-full blur-[130px]" />
        <div className="absolute top-[40%] left-[30%] w-[35%] h-[35%] bg-purple-500/10 rounded-full blur-[110px]" />
      </div>

      {/* Main Glass App Frame */}
      <div className="relative z-10 w-full h-full flex bg-white/5 backdrop-blur-2xl md:border md:border-white/10 md:rounded-3xl shadow-2xl overflow-hidden">
        {/* Sidebar Component */}
        <div
          className={`h-full w-full md:w-auto shrink-0 md:flex ${
            mobileView === 'sidebar' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <Sidebar
            currentUser={currentUser}
            conversations={conversations}
            friends={friends}
            activeConversationId={activeConversationId}
            onlineUserIds={onlineUserIds}
            userStatuses={userStatuses}
            soundEnabled={soundEnabled}
            notificationPermission={notificationPermission}
            pendingFriendRequestsCount={pendingFriendRequestsCount}
            onToggleSound={() => {
              const next = sounds.toggleSound();
              setSoundEnabled(next);
            }}
            onOpenNotificationPrompt={() => setShowNotificationPrompt(true)}
            onOpenStatusPicker={() => setShowStatusPicker(true)}
            onOpenAddFriendModal={() => setShowAddFriendModal(true)}
            onOpenCreateGroupModal={() => setShowCreateGroupModal(true)}
            onSelectConversation={handleSelectConversation}
            onStartChatWithUser={handleStartChatWithUser}
            onOpenNewChatModal={() => setShowAddFriendModal(true)}
            onOpenProfileModal={() => setShowProfileModal(true)}
            onLogout={handleLogout}
          />
        </div>

        {/* Chat Area Component */}
        <div
          className={`h-full flex-1 flex flex-col min-w-0 bg-white/[0.02] ${
            mobileView === 'chat' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {activeConversationId && (isGroupActive || partnerUser) ? (
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
          ) : (
            /* Empty Chat State */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-black/10">
              <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-indigo-400 mb-5 shadow-2xl backdrop-blur-xl">
                <MessageSquare className="w-9 h-9" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">대화를 시작해보세요</h2>
              <p className="text-sm text-white/50 max-w-sm mb-6 leading-relaxed">
                친구와의 1:1 대화 또는 친구들을 한곳에 모아 단체 채팅방을 개설할 수 있습니다.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  id="empty-state-new-friend-btn"
                  type="button"
                  onClick={() => setShowAddFriendModal(true)}
                  className="py-2.5 px-5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-2xl text-xs border border-white/15 transition-all flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4 text-indigo-400" />
                  <span>친구 추가하기</span>
                </button>
                <button
                  id="empty-state-create-group-btn"
                  type="button"
                  onClick={() => setShowCreateGroupModal(true)}
                  className="py-2.5 px-5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-semibold rounded-2xl text-xs shadow-lg shadow-indigo-600/30 border border-indigo-400/30 transition-all flex items-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  <span>단체 채팅방 만들기</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateGroupModal && (
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
      {showGroupInfoModal && activeGroup && (
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
      {showAddFriendModal && (
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
      {showStatusPicker && (
        <StatusPickerModal
          user={currentUser}
          onClose={() => setShowStatusPicker(false)}
          onStatusUpdated={(updated) => {
            setCurrentUser(updated);
            localStorage.setItem('id_messenger_user', JSON.stringify(updated));
          }}
        />
      )}

      {/* New Chat Modal (fallback) */}
      {showNewChatModal && (
        <NewChatModal
          currentUserId={currentUser.id}
          onClose={() => setShowNewChatModal(false)}
          onSelectUser={handleStartChatWithUser}
        />
      )}

      {/* Profile Settings Modal */}
      {showProfileModal && (
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
