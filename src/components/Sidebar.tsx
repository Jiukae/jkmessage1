import React, { useState } from 'react';
import { User, Conversation, UserStatusMode } from '../types';
import {
  MessageSquare,
  Users,
  Search,
  Plus,
  UserPlus,
  Sparkles,
  Shield,
  Clock,
  Terminal,
  Info,
  LogIn,
  CheckCheck,
} from 'lucide-react';
import { BottomRightProfile } from './BottomRightProfile';

interface SidebarProps {
  currentUser: User | null;
  conversations: Conversation[];
  friends: User[];
  allUsers?: User[];
  activeConversationId: string | null;
  onlineUserIds: Set<string>;
  userStatuses: Record<string, { status: UserStatusMode; dndUntil?: number | null }>;
  pendingFriendRequestsCount?: number;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onOpenProfileSettings?: () => void;
  onOpenStatusPicker?: () => void;
  onLogout?: () => void;
  onNavigateToRegister?: () => void;
  onLoginSuccess?: (user: User) => void;
  onOpenAddFriendModal?: () => void;
  onOpenCreateGroupModal?: () => void;
  onSelectConversation: (conversationId: string) => void;
  onStartChatWithUser: (user: User) => void;
  onOpenUserDetail?: (user: User) => void;
  onPromptLogin?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  conversations,
  friends,
  allUsers = [],
  activeConversationId,
  onlineUserIds,
  userStatuses,
  pendingFriendRequestsCount = 0,
  soundEnabled = true,
  onToggleSound = () => {},
  onOpenProfileSettings = () => {},
  onOpenStatusPicker = () => {},
  onLogout = () => {},
  onNavigateToRegister = () => {},
  onLoginSuccess = () => {},
  onOpenAddFriendModal,
  onOpenCreateGroupModal,
  onSelectConversation,
  onStartChatWithUser,
  onOpenUserDetail,
  onPromptLogin,
}) => {
  const [tab, setTab] = useState<'chats' | 'friends' | 'explore'>('chats');
  const [searchQuery, setSearchQuery] = useState('');

  const isGuest = !currentUser;

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();

    if (c.isCommandBot) {
      return '명령어'.includes(q) || 'command'.includes(q) || '터미널'.includes(q);
    }

    if (c.isGroup && c.group) {
      return (
        c.group.name.toLowerCase().includes(q) ||
        (c.lastMessage && c.lastMessage.text.toLowerCase().includes(q))
      );
    }

    const other = c.otherUser;
    if (!other) return false;
    return (
      other.username.toLowerCase().includes(q) ||
      other.name.toLowerCase().includes(q) ||
      (c.lastMessage && c.lastMessage.text.toLowerCase().includes(q))
    );
  });

  // Filter friends (if logged in)
  const filteredFriends = friends.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      (u.customStatus && u.customStatus.toLowerCase().includes(q))
    );
  });

  // Filter all users (for guest search / explore)
  const filteredAllUsers = allUsers.filter((u) => {
    if (currentUser && u.id === currentUser.id) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      (u.customStatus && u.customStatus.toLowerCase().includes(q))
    );
  });

  // Format relative timestamp
  const formatTime = (ts?: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return d.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return '어제';

    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };

  // Helper to get effective status badge for any user
  const getUserStatusInfo = (userId: string, defaultStatus?: UserStatusMode) => {
    const statusData = userStatuses[userId];
    const rawStatus = statusData?.status || defaultStatus || 'offline';
    const isOnlineSocket = onlineUserIds.has(userId);

    if (rawStatus === 'dnd') {
      return {
        mode: 'dnd' as const,
        label: '방해 금지',
        dotClass: 'bg-rose-500 ring-2 ring-rose-500/30',
        badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-400/20',
      };
    }

    if (isOnlineSocket || rawStatus === 'online') {
      return {
        mode: 'online' as const,
        label: '온라인',
        dotClass: 'bg-emerald-400 ring-2 ring-emerald-500/30 shadow-sm shadow-emerald-500/50',
        badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-400/20',
      };
    }

    return {
      mode: 'offline' as const,
      label: '오프라인',
      dotClass: 'bg-white/30 ring-1 ring-white/10',
      badgeClass: 'text-white/40 bg-white/5 border-white/10',
    };
  };

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  return (
    <aside className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-[#0b0c16]/80 backdrop-blur-2xl border-l border-purple-500/15 shrink-0 select-none z-20">
      
      {/* Top Brand Header */}
      <div className="p-4 sm:p-5 border-b border-purple-500/15 bg-purple-950/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 border border-purple-400/30 flex items-center justify-center text-xl shadow-lg shadow-purple-500/25">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base text-white tracking-tight">JK Message</span>
              {isGuest ? (
                <span className="text-[10px] px-1.5 py-0.2 bg-white/10 text-white/70 rounded-md border border-white/10">
                  게스트 모드
                </span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </div>
            <p className="text-[11px] text-white/50">
              {isGuest ? '유저 탐색 및 프로필 조회 가능' : '실시간 메신저'}
            </p>
          </div>
        </div>

        {/* Action icons for logged in users */}
        {!isGuest && (
          <div className="flex items-center gap-1">
            {onOpenCreateGroupModal && (
              <button
                id="sidebar-create-group-btn"
                type="button"
                onClick={onOpenCreateGroupModal}
                className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                title="새 단체방 만들기"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}

            {onOpenAddFriendModal && (
              <button
                id="sidebar-add-friend-btn"
                type="button"
                onClick={onOpenAddFriendModal}
                className="relative p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                title="친구 추가 및 요청 목록"
              >
                <UserPlus className="w-4 h-4 text-blue-400" />
                {pendingFriendRequestsCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border border-black" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="sidebar-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isGuest ? "유저 아이디 또는 닉네임 검색..." : "대화, 친구, 메시지 검색..."}
            className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-white/40 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="px-3 pt-3 pb-1">
        <div className="grid grid-cols-2 p-1 bg-black/30 rounded-xl border border-white/10 text-xs">
          
          {/* Tab 1 */}
          <button
            id="sidebar-tab-chats"
            type="button"
            onClick={() => setTab('chats')}
            className={`py-1.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              tab === 'chats'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>대화</span>
            {!isGuest && totalUnread > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold bg-rose-500 text-white rounded-full">
                {totalUnread}
              </span>
            )}
          </button>

          {/* Tab 2 */}
          <button
            id="sidebar-tab-friends-users"
            type="button"
            onClick={() => setTab(isGuest ? 'explore' : 'friends')}
            className={`py-1.5 px-3 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
              tab === (isGuest ? 'explore' : 'friends')
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{isGuest ? '유저 탐색' : '친구'}</span>
            {!isGuest && friends.length > 0 && (
              <span className="text-[10px] opacity-70">({friends.length})</span>
            )}
          </button>

        </div>
      </div>

      {/* Tab Content List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        
        {/* ===================== CHATS TAB ===================== */}
        {tab === 'chats' && (
          <>
            {isGuest ? (
              /* Guest Empty State for Chats */
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-white/60 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl">
                  💬
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-white">대화 목록</h4>
                  <p className="text-xs text-white/50 leading-relaxed">
                    로그인하시면 친구들과 나눈 실시간 대화가 여기에 표시됩니다.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    id="guest-prompt-login-btn"
                    type="button"
                    onClick={() => {
                      if (onPromptLogin) onPromptLogin();
                      setTab('explore');
                    }}
                    className="px-3.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-400/30 rounded-xl text-xs font-medium transition-colors"
                  >
                    유저 목록 둘러보기 👉
                  </button>
                </div>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center p-4 text-center text-white/50">
                <p className="text-xs">진행 중인 대화가 없습니다.</p>
                <button
                  id="empty-chat-to-friends-btn"
                  type="button"
                  onClick={() => setTab('friends')}
                  className="mt-2 text-xs text-blue-400 hover:underline"
                >
                  친구 목록에서 대화 시작하기
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isActive = activeConversationId === conv.id;

                // SPECIAL: Command Bot Conversation (Admin Only)
                if (conv.isCommandBot) {
                  return (
                    <button
                      key={conv.id}
                      id={`conv-command-bot-btn`}
                      type="button"
                      onClick={() => onSelectConversation(conv.id)}
                      className={`w-full p-2.5 rounded-2xl flex items-center gap-3 text-left transition-all border ${
                        isActive
                          ? 'bg-gradient-to-r from-amber-500/20 to-red-500/20 border-amber-500/40 shadow-lg shadow-amber-500/10'
                          : 'bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/20'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 border border-amber-400/40 flex items-center justify-center text-xl shadow-md">
                          ⚡
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0d111a]" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs sm:text-sm text-amber-300 truncate flex items-center gap-1">
                            <Terminal className="w-3.5 h-3.5" />
                            <span>명령어 터미널</span>
                          </span>
                          <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-500/30 text-amber-200 border border-amber-400/30 rounded">
                            ADMIN
                          </span>
                        </div>
                        <p className="text-xs text-amber-200/60 truncate mt-0.5 font-mono">
                          {conv.lastMessage?.text || '/help 입력하여 제어 콘솔 열기'}
                        </p>
                      </div>
                    </button>
                  );
                }

                // Group conversation
                if (conv.isGroup && conv.group) {
                  return (
                    <button
                      key={conv.id}
                      id={`conv-group-${conv.id}`}
                      type="button"
                      onClick={() => onSelectConversation(conv.id)}
                      className={`w-full p-2.5 rounded-2xl flex items-center gap-3 text-left transition-all border ${
                        isActive
                          ? 'bg-blue-600/20 border-blue-500/40 shadow-md'
                          : 'hover:bg-white/5 border-transparent'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${conv.group.avatarBg || 'from-indigo-600 to-purple-600'} border border-white/15 flex items-center justify-center text-xl shadow-md`}>
                          {conv.group.avatarEmoji || '🏢'}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs sm:text-sm text-white truncate">
                            {conv.group.name}
                          </span>
                          <span className="text-[10px] text-white/40 shrink-0">
                            {formatTime(conv.updatedAt)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <p className="text-xs text-white/60 truncate">
                            {conv.lastMessage?.text || '대화를 시작해보세요'}
                          </p>
                          {conv.unreadCount > 0 && (
                            <span className="px-1.5 py-0.2 text-[10px] font-bold bg-blue-600 text-white rounded-full shrink-0">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                }

                // 1:1 Direct Conversation
                const other = conv.otherUser;
                if (!other) return null;
                const statusInfo = getUserStatusInfo(other.id, other.status);

                return (
                  <button
                    key={conv.id}
                    id={`conv-direct-${conv.id}`}
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    className={`w-full p-2.5 rounded-2xl flex items-center gap-3 text-left transition-all border ${
                      isActive
                        ? 'bg-blue-600/20 border-blue-500/40 shadow-md'
                        : 'hover:bg-white/5 border-transparent'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${other.avatarBg || 'from-blue-500 to-indigo-600'} border border-white/15 flex items-center justify-center text-xl shadow-md`}>
                        {other.avatarEmoji || '💬'}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0d111a] ${statusInfo.dotClass}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs sm:text-sm text-white truncate">
                          {other.name}
                        </span>
                        <span className="text-[10px] text-white/40 shrink-0">
                          {formatTime(conv.updatedAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className="text-xs text-white/60 truncate">
                          {conv.lastMessage?.text || '대화를 시작해보세요'}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="px-1.5 py-0.2 text-[10px] font-bold bg-blue-600 text-white rounded-full shrink-0">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </>
        )}

        {/* ===================== FRIENDS TAB (Logged In) ===================== */}
        {tab === 'friends' && !isGuest && (
          <>
            {filteredFriends.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center p-4 text-center text-white/50">
                <p className="text-xs">등록된 친구가 없습니다.</p>
                {onOpenAddFriendModal && (
                  <button
                    id="empty-friends-add-btn"
                    type="button"
                    onClick={onOpenAddFriendModal}
                    className="mt-2 text-xs text-blue-400 hover:underline"
                  >
                    + 친구 추가하러 가기
                  </button>
                )}
              </div>
            ) : (
              filteredFriends.map((f) => {
                const statusInfo = getUserStatusInfo(f.id, f.status);
                return (
                  <div
                    key={f.id}
                    className="p-2.5 rounded-2xl bg-white/[0.02] hover:bg-white/5 border border-white/5 flex items-center justify-between gap-3 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenUserDetail && onOpenUserDetail(f)}
                      className="flex items-center gap-3 min-w-0 text-left flex-1"
                    >
                      <div className="relative shrink-0">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${f.avatarBg || 'from-blue-500 to-indigo-600'} border border-white/15 flex items-center justify-center text-lg`}>
                          {f.avatarEmoji || '💬'}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0d111a] ${statusInfo.dotClass}`} />
                      </div>

                      <div className="min-w-0">
                        <div className="font-semibold text-xs sm:text-sm text-white truncate">
                          {f.name}
                        </div>
                        <div className="text-[11px] text-white/50 font-mono truncate">
                          @{f.username}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onStartChatWithUser(f)}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-400/30 text-xs font-medium transition-colors shrink-0"
                    >
                      대화
                    </button>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* ===================== EXPLORE TAB (Guest or Explorer) ===================== */}
        {(tab === 'explore' || (isGuest && tab !== 'chats')) && (
          <div className="space-y-1.5">
            <div className="px-2 py-1 flex items-center justify-between text-[11px] text-white/50">
              <span>전체 등록 유저 ({filteredAllUsers.length}명)</span>
              <span>클릭하여 프로필 보기</span>
            </div>

            {filteredAllUsers.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-white/40">
                검색된 유저가 없습니다.
              </div>
            ) : (
              filteredAllUsers.map((u) => {
                const statusInfo = getUserStatusInfo(u.id, u.status);
                const isAdmin = u.username.toLowerCase() === 'jiukhan0215';

                return (
                  <button
                    key={u.id}
                    id={`guest-user-item-${u.id}`}
                    type="button"
                    onClick={() => {
                      if (onOpenUserDetail) onOpenUserDetail(u);
                    }}
                    className="w-full p-2.5 rounded-2xl bg-white/[0.02] hover:bg-white/5 border border-white/5 flex items-center gap-3 text-left transition-colors group"
                  >
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${u.avatarBg || 'from-blue-500 to-indigo-600'} border border-white/15 flex items-center justify-center text-lg group-hover:scale-105 transition-transform`}>
                        {u.avatarEmoji || '💬'}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0d111a] ${statusInfo.dotClass}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs sm:text-sm text-white truncate group-hover:text-blue-300 transition-colors">
                          {u.name}
                        </span>
                        {isAdmin && (
                          <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded flex items-center gap-0.5 shrink-0">
                            <Shield className="w-2.5 h-2.5" />
                            <span>관리자</span>
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-white/50 font-mono truncate">
                        @{u.username}
                      </div>
                      {u.customStatus && (
                        <p className="text-[10px] text-white/40 truncate mt-0.5">
                          "{u.customStatus}"
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-xs text-white/40 group-hover:text-white transition-colors">
                      프로필 ↗
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

      </div>

      {/* ===================== BOTTOM USER / GUEST FOOTER ===================== */}
      <BottomRightProfile
        currentUser={currentUser}
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
        onOpenProfileSettings={onOpenProfileSettings}
        onOpenStatusPicker={onOpenStatusPicker}
        onLogout={onLogout}
        onNavigateToRegister={onNavigateToRegister}
        onLoginSuccess={onLoginSuccess}
        isDocked={true}
      />

    </aside>
  );
};
