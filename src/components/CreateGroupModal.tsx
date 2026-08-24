import React, { useState } from 'react';
import { User, GroupRoom } from '../types';
import { X, Users, Search, Check, Sparkles, AlertCircle } from 'lucide-react';

interface CreateGroupModalProps {
  currentUser: User;
  friends: User[];
  onClose: () => void;
  onGroupCreated: (group: GroupRoom) => void;
}

const EMOJI_OPTIONS = ['👥', '🚀', '🔥', '💡', '🎉', '☕', '⚡', '🎨', '📱', '🎮', '💼', '🍕', '🏆', '💎', '🍿', '🏖️'];

const BG_OPTIONS = [
  { id: 'indigo', class: 'from-blue-500 to-indigo-600', name: '인디고' },
  { id: 'rose', class: 'from-rose-500 to-pink-600', name: '로즈' },
  { id: 'amber', class: 'from-amber-500 to-orange-600', name: '앰버' },
  { id: 'emerald', class: 'from-emerald-500 to-teal-600', name: '에메랄드' },
  { id: 'purple', class: 'from-purple-500 to-violet-700', name: '퍼플' },
  { id: 'cyan', class: 'from-cyan-500 to-blue-600', name: '시안' },
];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  currentUser,
  friends,
  onClose,
  onGroupCreated,
}) => {
  const [name, setName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('👥');
  const [selectedBg, setSelectedBg] = useState(BG_OPTIONS[0].class);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const filteredFriends = friends.filter((f) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      f.username.toLowerCase().includes(q) ||
      f.name.toLowerCase().includes(q) ||
      (f.customStatus && f.customStatus.toLowerCase().includes(q))
    );
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('채팅방 이름을 입력해주세요.');
      return;
    }

    if (selectedUserIds.length === 0) {
      setError('함께 대화할 친구를 1명 이상 선택해주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          creatorId: currentUser.id,
          participantIds: [currentUser.id, ...selectedUserIds],
          avatarBg: selectedBg,
          avatarEmoji: selectedEmoji,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '단체 채팅방 생성에 실패했습니다.');
      }

      onGroupCreated(data.group);
      onClose();
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col bg-[#121622]/95 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              단체 채팅방 만들기
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              친구들을 초대하여 다함께 이야기할 방을 만듭니다
            </p>
          </div>
          <button
            id="close-create-group-modal-btn"
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="flex-1 overflow-y-auto min-h-0 p-5 space-y-5">
          
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Group Icon & Name */}
          <div className="flex items-center gap-4 bg-white/5 p-3.5 rounded-2xl border border-white/10">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${selectedBg} border border-white/20 flex items-center justify-center text-2xl shadow-lg shrink-0`}>
              {selectedEmoji}
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-white/60 mb-1">
                채팅방 이름
              </label>
              <input
                id="group-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 프로젝트 팀, 주말 모임"
                maxLength={30}
                required
                className="w-full px-3.5 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-400/30"
              />
            </div>
          </div>

          {/* Icon & Theme Selector */}
          <div className="space-y-3">
            <div>
              <span className="block text-xs font-semibold text-white/60 mb-2">
                방 아이콘 선택
              </span>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedEmoji(emoji)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all ${
                      selectedEmoji === emoji
                        ? 'bg-indigo-600 text-white scale-110 shadow-md ring-2 ring-indigo-400/40'
                        : 'bg-white/5 hover:bg-white/10 text-white/80'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-white/60 mb-2">
                배경 테마
              </span>
              <div className="flex gap-2.5">
                {BG_OPTIONS.map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setSelectedBg(bg.class)}
                    className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${bg.class} border transition-all ${
                      selectedBg === bg.class
                        ? 'border-white scale-110 ring-2 ring-white/50 shadow-md'
                        : 'border-white/20 opacity-60 hover:opacity-100'
                    }`}
                    title={bg.name}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Member Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-white/60">
                대화 상대 선택 ({selectedUserIds.length}명 선택됨)
              </span>
              {selectedUserIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedUserIds([])}
                  className="text-xs text-white/40 hover:text-white"
                >
                  선택 초기화
                </button>
              )}
            </div>

            {/* Friend search */}
            <div className="relative mb-2">
              <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="group-friend-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="친구 검색..."
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 text-xs focus:outline-none focus:border-indigo-400/50"
              />
            </div>

            {/* Friends list */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 p-1">
              {friends.length === 0 ? (
                <div className="py-8 text-center text-white/40 text-xs">
                  <p>친구 목록이 비어 있습니다.</p>
                  <p className="mt-1">먼저 친구를 추가하면 단체 채팅방에 초대할 수 있습니다!</p>
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="py-6 text-center text-white/40 text-xs">
                  검색 결과가 없습니다
                </div>
              ) : (
                filteredFriends.map((friend) => {
                  const isSelected = selectedUserIds.includes(friend.id);
                  return (
                    <div
                      key={friend.id}
                      onClick={() => toggleUserSelection(friend.id)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-indigo-500/20 border-indigo-400/40 text-white'
                          : 'bg-white/5 border-white/5 hover:bg-white/10 text-white/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${friend.avatarBg} flex items-center justify-center text-sm shadow shrink-0`}>
                          {friend.avatarEmoji}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-white truncate">
                              {friend.name}
                            </span>
                            <span className="text-[10px] text-blue-400 font-mono">
                              @{friend.username}
                            </span>
                          </div>
                          {friend.customStatus && (
                            <p className="text-[10px] text-white/40 truncate">
                              {friend.customStatus}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-400 text-white'
                          : 'border-white/20 bg-white/5'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              id="submit-create-group-btn"
              type="submit"
              disabled={loading || selectedUserIds.length === 0 || !name.trim()}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-600/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>채팅방 생성 중...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>단체 채팅방 개설하기 ({selectedUserIds.length + 1}명)</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
