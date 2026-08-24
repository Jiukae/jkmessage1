import React, { useState } from 'react';
import { User, GroupRoom, UserStatusMode } from '../types';
import { X, Users, UserPlus, LogOut, Check, Shield, Search, AlertCircle } from 'lucide-react';

interface GroupInfoModalProps {
  group: GroupRoom;
  currentUser: User;
  allFriends: User[];
  onlineUserIds: Set<string>;
  userStatuses: Record<string, { status: UserStatusMode; dndUntil?: number | null }>;
  onClose: () => void;
  onInviteMembers: (newMemberIds: string[]) => Promise<void>;
  onLeaveGroup: () => Promise<void>;
}

export const GroupInfoModal: React.FC<GroupInfoModalProps> = ({
  group,
  currentUser,
  allFriends,
  onlineUserIds,
  userStatuses,
  onClose,
  onInviteMembers,
  onLeaveGroup,
}) => {
  const [showInviteSection, setShowInviteSection] = useState(false);
  const [selectedToInvite, setSelectedToInvite] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [loadingLeave, setLoadingLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available friends not in this group
  const invitableFriends = allFriends.filter(
    (f) => !group.participantIds.includes(f.id)
  );

  const filteredInvitable = invitableFriends.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return f.username.toLowerCase().includes(q) || f.name.toLowerCase().includes(q);
  });

  const toggleInviteSelection = (userId: string) => {
    setSelectedToInvite((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleInviteSubmit = async () => {
    if (selectedToInvite.length === 0) return;
    setLoadingInvite(true);
    setError(null);
    try {
      await onInviteMembers(selectedToInvite);
      setSelectedToInvite([]);
      setShowInviteSection(false);
    } catch (err: any) {
      setError(err.message || '초대에 실패했습니다.');
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleLeaveSubmit = async () => {
    if (!window.confirm(`'${group.name}' 단체 채팅방을 정말 나가시겠습니까?`)) {
      return;
    }
    setLoadingLeave(true);
    try {
      await onLeaveGroup();
      onClose();
    } catch (err: any) {
      setError(err.message || '채팅방 나가기에 실패했습니다.');
    } finally {
      setLoadingLeave(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-[#121622]/95 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${group.avatarBg || 'from-indigo-500 to-blue-600'} flex items-center justify-center text-xl shadow`}>
              {group.avatarEmoji || '👥'}
            </div>
            <div>
              <h2 className="text-base font-bold text-white truncate max-w-[200px]">
                {group.name}
              </h2>
              <p className="text-xs text-white/50">
                멤버 {group.participantIds.length}명
              </p>
            </div>
          </div>
          <button
            id="close-group-info-modal-btn"
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">
          
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setShowInviteSection(!showInviteSection)}
              className={`p-3 rounded-2xl border flex items-center justify-center gap-2 text-xs font-semibold transition-all ${
                showInviteSection
                  ? 'bg-indigo-600/30 border-indigo-400/50 text-indigo-300'
                  : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
              }`}
            >
              <UserPlus className="w-4 h-4 text-indigo-400" />
              <span>친구 초대하기</span>
            </button>

            <button
              type="button"
              onClick={handleLeaveSubmit}
              disabled={loadingLeave}
              className="p-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-2xl flex items-center justify-center gap-2 text-xs font-semibold text-rose-400 transition-all"
            >
              <LogOut className="w-4 h-4 text-rose-400" />
              <span>그룹 나가기</span>
            </button>
          </div>

          {/* Invite Section (collapsible) */}
          {showInviteSection && (
            <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/20 rounded-2xl space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300">
                  초대할 친구 선택 ({selectedToInvite.length}명)
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="친구 검색..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-xs focus:outline-none focus:border-indigo-400/50"
                />
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1">
                {invitableFriends.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-3">
                    초대 가능한 다른 친구가 없습니다.
                  </p>
                ) : filteredInvitable.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-3">
                    일치하는 친구가 없습니다.
                  </p>
                ) : (
                  filteredInvitable.map((friend) => {
                    const isSelected = selectedToInvite.includes(friend.id);
                    return (
                      <div
                        key={friend.id}
                        onClick={() => toggleInviteSelection(friend.id)}
                        className={`p-2 rounded-xl flex items-center justify-between cursor-pointer text-xs transition-all ${
                          isSelected
                            ? 'bg-indigo-500/30 border border-indigo-400/40 text-white'
                            : 'bg-white/5 hover:bg-white/10 text-white/70'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{friend.avatarEmoji}</span>
                          <span className="font-semibold text-white">{friend.name}</span>
                          <span className="text-blue-400 font-mono text-[10px]">@{friend.username}</span>
                        </div>
                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                          isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-white/20'
                        }`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {selectedToInvite.length > 0 && (
                <button
                  type="button"
                  onClick={handleInviteSubmit}
                  disabled={loadingInvite}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all shadow"
                >
                  {loadingInvite ? '초대 중...' : `${selectedToInvite.length}명 단체방에 초대하기`}
                </button>
              )}
            </div>
          )}

          {/* Member List */}
          <div>
            <span className="block text-xs font-semibold text-white/60 mb-2.5">
              참여 멤버 목록 ({group.participantIds.length}명)
            </span>
            <div className="space-y-2">
              {group.participantIds.map((pid) => {
                const isMe = pid === currentUser.id;
                const friendObj = allFriends.find((f) => f.id === pid);
                const userObj = isMe ? currentUser : friendObj;
                const isCreator = pid === group.creatorId;
                const isOnline = onlineUserIds.has(pid);
                const statusMode = userStatuses[pid]?.status || (isOnline ? 'online' : 'offline');

                return (
                  <div
                    key={pid}
                    className="p-2.5 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${userObj?.avatarBg || 'from-slate-600 to-slate-800'} flex items-center justify-center text-sm shadow shrink-0`}>
                          {userObj?.avatarEmoji || '👤'}
                        </div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#121622] ${
                          statusMode === 'dnd' ? 'bg-rose-500' : isOnline || statusMode === 'online' ? 'bg-emerald-400' : 'bg-white/30'
                        }`} />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {userObj?.name || (isMe ? currentUser.name : '알 수 없는 사용자')}
                          </span>
                          {isMe && (
                            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded border border-blue-400/30">
                              나
                            </span>
                          )}
                          {isCreator && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-400/30 flex items-center gap-0.5">
                              <Shield className="w-2.5 h-2.5" /> 방장
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-white/40 font-mono">
                          @{userObj?.username || (isMe ? currentUser.username : '')}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-white/40">
                      {statusMode === 'dnd' ? (
                        <span className="text-rose-400 font-medium">방해금지</span>
                      ) : isOnline || statusMode === 'online' ? (
                        <span className="text-emerald-400 font-medium">접속 중</span>
                      ) : (
                        <span>오프라인</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
