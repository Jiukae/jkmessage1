import React, { useState } from 'react';
import { User, Conversation, UserStatusMode } from '../types';
import {
  MessageSquare,
  Users,
  Search,
  Plus,
  Volume2,
  VolumeX,
  Settings,
  LogOut,
  UserPlus,
  Sparkles,
  Check,
  Clock,
  Radio,
  Bell,
  BellRing,
  UserCheck,
} from 'lucide-react';

interface SidebarProps {
  currentUser: User;
  conversations: Conversation[];
  friends: User[];
  activeConversationId: string | null;
  onlineUserIds: Set<string>;
  userStatuses: Record<string, { status: UserStatusMode; dndUntil?: number | null }>;
  soundEnabled: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  pendingFriendRequestsCount: number;
  onToggleSound: () => void;
  onOpenNotificationPrompt: () => void;
  onOpenStatusPicker: () => void;
  onOpenAddFriendModal: () => void;
  onOpenCreateGroupModal: () => void;
  onSelectConversation: (conversationId: string) => void;
  onStartChatWithUser: (user: User) => void;
  onOpenNewChatModal: () => void;
  onOpenProfileModal: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  conversations,
  friends,
  activeConversationId,
  onlineUserIds,
  userStatuses,
  soundEnabled,
  notificationPermission,
  pendingFriendRequestsCount,
  onToggleSound,
  onOpenNotificationPrompt,
  onOpenStatusPicker,
  onOpenAddFriendModal,
  onOpenCreateGroupModal,
  onSelectConversation,
  onStartChatWithUser,
  onOpenNewChatModal,
  onOpenProfileModal,
  onLogout,
}) => {
  const [tab, setTab] = useState<'chats' | 'friends'>('chats');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter conversations (1:1 + Groups)
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    
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

  // Filter friends
  const filteredFriends = friends.filter((u) => {
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

    // If DND
    if (rawStatus === 'dnd') {
      return {
        mode: 'dnd' as const,
        label: '방해 금지',
        dotClass: 'bg-rose-500 ring-2 ring-rose-500/30',
        badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-400/20',
      };
    }

    // If online or socket connected
    if (isOnlineSocket || rawStatus === 'online') {
      return {
        mode: 'online' as const,
        label: '온라인',
        dotClass: 'bg-emerald-400 ring-2 ring-emerald-500/30 shadow-sm shadow-emerald-500/50',
        badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-400/20',
      };
    }

    // Offline (Gray)
    return {
      mode: 'offline' as const,
      label: '오프라인',
      dotClass: 'bg-white/30 ring-1 ring-white/10',
      badgeClass: 'text-white/40 bg-white/5 border-white/10',
    };
  };

  const currentStatusInfo = getUserStatusInfo(currentUser.id, currentUser.status);
  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  return (
    <aside className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-black/20 backdrop-blur-xl border-r border-white/10 shrink-0 select-none">
      
      {/* Current User Header */}
      <div className="p-4 sm:p-5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
        
        {/* Profile + Status Click */}
        <div className="flex items-center gap-3 min-w-0">
          
          <div
            onClick={onOpenProfileModal}
            className="relative shrink-0 cursor-pointer group"
            title="프로필 사진 및 정보 수정"
          >
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${currentUser.avatarBg || 'from-indigo-500 to-blue-600'} border border-white/15 flex items-center justify-center text-xl shadow-lg group-hover:scale-105 transition-transform`}>
              {currentUser.avatarEmoji || '💬'}
            </div>
            {/* Status dot on avatar */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-[#0c0e14] rounded-full ${currentStatusInfo.dotClass}`}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                onClick={onOpenProfileModal}
                className="font-semibold text-sm text-white truncate cursor-pointer hover:text-indigo-300 transition-colors"
              >
                {currentUser.name}
              </span>
            </div>
            
            {/* Interactive Status Pill */}
            <button
              id="my-status-pill-btn"
              type="button"
              onClick={onOpenStatusPicker}
              className={`mt-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium border flex items-center gap-1.5 transition-all hover:opacity-90 ${currentStatusInfo.badgeClass}`}
              title="내 접속 상태 변경 (온라인, 방해 금지)"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${currentStatusInfo.dotClass.split(' ')[0]}`} />
              <span>{currentStatusInfo.label}</span>
              <span className="text-[9px] text-white/40">▼</span>
            </button>
          </div>

        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          
          {/* Add friend button */}
          <button
            id="open-add-friend-btn"
            type="button"
            onClick={onOpenAddFriendModal}
            className="relative p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="친구 추가 및 요청 관리"
          >
            <UserPlus className="w-4 h-4 text-indigo-400" />
            {pendingFriendRequestsCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border border-black" />
            )}
          </button>

          {/* Notification prompt */}
          <button
            id="toggle-notification-btn"
            type="button"
            onClick={onOpenNotificationPrompt}
            className={`p-2 rounded-xl transition-colors ${
              notificationPermission === 'granted'
                ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10'
                : 'text-white/40 hover:text-white hover:bg-white/10'
            }`}
            title={
              notificationPermission === 'granted'
                ? '푸시 알림 켜짐'
                : '푸시 알림 설정하기'
            }
          >
            {notificationPermission === 'granted' ? (
              <BellRing className="w-4 h-4 text-indigo-400" />
            ) : (
              <Bell className="w-4 h-4" />
            )}
          </button>

          {/* Sound toggle */}
          <button
            id="toggle-sound-btn"
            type="button"
            onClick={onToggleSound}
            className={`p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors ${
              soundEnabled ? 'text-indigo-400' : 'text-white/30'
            }`}
            title={soundEnabled ? '알림음 켜짐' : '알림음 음소거'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-indigo-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Settings */}
          <button
            id="open-settings-btn"
            type="button"
            onClick={onOpenProfileModal}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="설정"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action / Add Friend, Group Chat & New Chat Bar */}
      <div className="p-3.5 pb-2 grid grid-cols-3 gap-1.5 sm:gap-2">
        <button
          id="sidebar-add-friend-action-btn"
          type="button"
          onClick={onOpenAddFriendModal}
          className="py-2 px-2 bg-white/10 hover:bg-white/15 active:scale-[0.99] text-white font-semibold rounded-2xl text-[11px] sm:text-xs border border-white/15 flex items-center justify-center gap-1 transition-all shadow-sm truncate"
          title="친구 추가"
        >
          <UserPlus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="truncate">친구 추가</span>
          {pendingFriendRequestsCount > 0 && (
            <span className="px-1 py-0.2 bg-rose-500 text-white rounded-full text-[9px] font-bold">
              {pendingFriendRequestsCount}
            </span>
          )}
        </button>

        <button
          id="sidebar-create-group-btn"
          type="button"
          onClick={onOpenCreateGroupModal}
          className="py-2 px-2 bg-indigo-600/20 hover:bg-indigo-600/30 active:scale-[0.99] text-indigo-200 font-semibold rounded-2xl text-[11px] sm:text-xs border border-indigo-500/30 flex items-center justify-center gap-1 transition-all shadow-sm truncate"
          title="단체 채팅방 개설"
        >
          <Users className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
          <span className="truncate">단체방</span>
        </button>

        <button
          id="new-chat-btn"
          type="button"
          onClick={onOpenNewChatModal}
          className="py-2 px-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 active:scale-[0.99] text-white font-semibold rounded-2xl text-[11px] sm:text-xs shadow-lg shadow-indigo-600/25 border border-indigo-400/30 flex items-center justify-center gap-1 transition-all truncate"
          title="새 1:1 대화 시작"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
          <span className="truncate">새 대화</span>
        </button>
      </div>

      {/* Incoming Friend Request Alert Banner */}
      {pendingFriendRequestsCount > 0 && (
        <div className="px-3.5 pb-1">
          <div
            id="pending-requests-banner"
            onClick={onOpenAddFriendModal}
            className="p-2.5 bg-gradient-to-r from-indigo-600/30 to-blue-600/30 border border-indigo-400/40 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-indigo-500/20 transition-all shadow-md group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
              <span className="text-xs text-white font-medium truncate">
                새로운 친구 요청 <strong className="text-indigo-300">{pendingFriendRequestsCount}건</strong>
              </span>
            </div>
            <span className="text-[11px] px-2 py-0.5 bg-indigo-500 text-white rounded-lg font-bold shrink-0 group-hover:bg-indigo-400 transition-colors">
              확인
            </span>
          </div>
        </div>
      )}

      {/* Tabs: 대화 vs 친구 */}
      <div className="px-3.5 pt-1">
        <div className="grid grid-cols-2 p-1 bg-black/30 rounded-2xl border border-white/10">
          <button
            id="tab-chats-btn"
            type="button"
            onClick={() => setTab('chats')}
            className={`py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              tab === 'chats'
                ? 'bg-white/15 text-white border border-white/10 shadow-sm'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>대화</span>
            {totalUnread > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500/90 text-white rounded-full text-[10px] font-bold border border-rose-400/30">
                {totalUnread}
              </span>
            )}
          </button>

          <button
            id="tab-friends-btn"
            type="button"
            onClick={() => setTab('friends')}
            className={`py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              tab === 'friends'
                ? 'bg-white/15 text-white border border-white/10 shadow-sm'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>친구 ({friends.length})</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-3.5 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 text-white/30 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="sidebar-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tab === 'chats' ? '단체방, 친구, 대화 검색...' : '등록된 친구 검색...'}
            className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all"
          />
        </div>
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-1.5 min-h-0">
        {tab === 'chats' ? (
          filteredConversations.length > 0 ? (
            filteredConversations.map((c) => {
              const isSelected = activeConversationId === c.id;

              if (c.isGroup && c.group) {
                // Group Chat item
                return (
                  <button
                    key={c.id}
                    id={`conversation-group-${c.group.id}`}
                    type="button"
                    onClick={() => onSelectConversation(c.id)}
                    className={`w-full p-3 rounded-2xl flex items-center gap-3 text-left transition-all relative ${
                      isSelected
                        ? 'bg-white/10 border border-white/15 text-white shadow-sm backdrop-blur-md'
                        : 'hover:bg-white/5 text-white/80 border border-transparent hover:border-white/5'
                    }`}
                  >
                    {/* Group Avatar */}
                    <div className="relative shrink-0">
                      <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${c.group.avatarBg || 'from-amber-500 to-rose-600'} border border-white/15 flex items-center justify-center text-xl shadow-md`}>
                        {c.group.avatarEmoji || '👥'}
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-indigo-500 border-2 border-[#0c0e14] flex items-center justify-center text-[9px] text-white font-bold">
                        {c.group.participantIds.length}
                      </span>
                    </div>

                    {/* Group Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-semibold text-sm text-white truncate">
                            {c.group.name}
                          </span>
                          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1 py-0.2 rounded border border-indigo-400/20 shrink-0">
                            단체
                          </span>
                        </div>
                        <span className="text-[10px] text-white/40 shrink-0 font-mono">
                          {formatTime(c.lastMessage?.createdAt || c.updatedAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs truncate ${c.unreadCount > 0 ? 'text-white font-medium' : 'text-white/50'}`}>
                          {c.lastMessage
                            ? c.lastMessage.attachment
                              ? `[파일] ${c.lastMessage.attachment.name}`
                              : c.lastMessage.text
                            : '새로운 단체 채팅방입니다.'}
                        </p>
                        {c.unreadCount > 0 && (
                          <span className="shrink-0 px-2 py-0.5 bg-indigo-600 border border-indigo-400/30 text-white rounded-full text-[10px] font-bold shadow-sm">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              }

              // 1:1 Chat item
              const other = c.otherUser;
              if (!other) return null;
              const otherStatusInfo = getUserStatusInfo(other.id, other.status);

              return (
                <button
                  key={c.id}
                  id={`conversation-item-${other.username}`}
                  type="button"
                  onClick={() => onSelectConversation(c.id)}
                  className={`w-full p-3 rounded-2xl flex items-center gap-3 text-left transition-all relative ${
                    isSelected
                      ? 'bg-white/10 border border-white/15 text-white shadow-sm backdrop-blur-md'
                      : 'hover:bg-white/5 text-white/80 border border-transparent hover:border-white/5'
                  }`}
                >
                  {/* Avatar with dynamic Status Indicator */}
                  <div className="relative shrink-0">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${other.avatarBg || 'from-indigo-500 to-blue-600'} border border-white/15 flex items-center justify-center text-xl shadow-md`}>
                      {other.avatarEmoji || '💬'}
                    </div>
                    {/* Status Dot: Online (Green), DND (Red), Offline (Gray) */}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 border-2 border-[#0c0e14] rounded-full ${otherStatusInfo.dotClass}`}
                      title={otherStatusInfo.label}
                    />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-semibold text-sm text-white truncate">
                          {other.name}
                        </span>
                        <span className="text-xs text-blue-400 font-mono shrink-0">
                          @{other.username}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/40 shrink-0 font-mono">
                        {formatTime(c.lastMessage?.createdAt || c.updatedAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs truncate ${c.unreadCount > 0 ? 'text-white font-medium' : 'text-white/50'}`}>
                        {c.lastMessage
                          ? c.lastMessage.attachment
                            ? `[파일] ${c.lastMessage.attachment.name}`
                            : c.lastMessage.text
                          : '대화를 시작해보세요.'}
                      </p>
                      {c.unreadCount > 0 && (
                        <span className="shrink-0 px-2 py-0.5 bg-indigo-600 border border-indigo-400/30 text-white rounded-full text-[10px] font-bold shadow-sm">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="py-12 px-4 text-center text-white/40">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-white/20" />
              <p className="text-sm font-medium text-white/60">대화 목록이 없습니다</p>
              <p className="text-xs text-white/40 mt-1">
                친구를 추가하거나 단체방을 만들어 대화를 시작해보세요
              </p>
            </div>
          )
        ) : (
          /* Friends View */
          filteredFriends.length > 0 ? (
            filteredFriends.map((u) => {
              const friendStatusInfo = getUserStatusInfo(u.id, u.status);

              return (
                <div
                  key={u.id}
                  id={`friend-item-${u.username}`}
                  className="p-2.5 rounded-2xl hover:bg-white/5 border border-white/5 hover:border-white/10 flex items-center justify-between gap-2 transition-all bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${u.avatarBg || 'from-indigo-500 to-blue-600'} border border-white/10 flex items-center justify-center text-lg shadow-sm`}>
                        {u.avatarEmoji || '💬'}
                      </div>
                      {/* Dynamic status dot: Green, Red, or Gray */}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-[#0c0e14] rounded-full ${friendStatusInfo.dotClass}`}
                        title={friendStatusInfo.label}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-white truncate">{u.name}</span>
                        <span className="text-[11px] text-blue-400 font-mono">@{u.username}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.2 rounded border ${friendStatusInfo.badgeClass}`}>
                          {friendStatusInfo.label}
                        </span>
                        {u.customStatus && (
                          <p className="text-[11px] text-white/50 truncate">
                            {u.customStatus}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    id={`friend-chat-btn-${u.username}`}
                    type="button"
                    onClick={() => {
                      onStartChatWithUser(u);
                      setTab('chats');
                    }}
                    className="shrink-0 px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white rounded-xl text-xs font-medium border border-indigo-400/30 transition-all shadow-sm"
                  >
                    대화하기
                  </button>
                </div>
              );
            })
          ) : (
            <div className="py-12 px-4 text-center text-white/40">
              <Users className="w-8 h-8 mx-auto mb-2 text-white/20" />
              <p className="text-sm font-medium text-white/60">등록된 친구가 없습니다</p>
              <p className="text-xs text-white/40 mt-1">
                상단의 '친구 추가' 버튼을 눌러 요청을 보내보세요
              </p>
            </div>
          )
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3.5 border-t border-white/10 bg-black/30 text-[11px] text-white/40 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-semibold text-white/70 tracking-wide">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
          JK Message
        </span>
        <button
          id="sidebar-logout-btn"
          type="button"
          onClick={onLogout}
          className="text-white/50 hover:text-rose-300 transition-colors flex items-center gap-1"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>로그아웃</span>
        </button>
      </div>

    </aside>
  );
};
