import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { X, Search, MessageSquare, UserCheck, AlertCircle, ArrowRight } from 'lucide-react';

interface NewChatModalProps {
  currentUserId: string;
  onClose: () => void;
  onSelectUser: (user: User) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  currentUserId,
  onClose,
  onSelectUser,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchUsers = async (searchQuery: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(searchQuery)}&currentUserId=${currentUserId}`
      );
      const data = await res.json();
      setResults(data.users || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  };

  useEffect(() => {
    fetchUsers(query);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col bg-[#121622]/90 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              아이디로 대화 시작하기
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              상대방의 고유 아이디(@ID) 또는 이름을 검색해보세요
            </p>
          </div>
          <button
            id="close-new-chat-modal-btn"
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="shrink-0 p-4 border-b border-white/10 bg-white/5">
          <div className="relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="new-chat-search-input"
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="아이디(@) 또는 이름으로 검색 (예: minseo)"
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-500/30 transition-all backdrop-blur-sm"
            />
          </div>
        </div>

        {/* User Results List */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-white/50 text-sm">
              <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mb-2" />
              <span>사용자 검색 중...</span>
            </div>
          ) : results.length > 0 ? (
            results.map((targetUser) => (
              <button
                key={targetUser.id}
                id={`start-chat-user-${targetUser.username}-btn`}
                type="button"
                onClick={() => {
                  onSelectUser(targetUser);
                  onClose();
                }}
                className="w-full p-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/40 rounded-2xl flex items-center justify-between text-left transition-all group backdrop-blur-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${targetUser.avatarBg || 'from-blue-500 to-purple-500'} border border-white/15 flex items-center justify-center text-xl shadow-md shrink-0`}>
                      {targetUser.avatarEmoji || '💬'}
                    </div>
                    {targetUser.status === 'online' && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#0c0e14] rounded-full" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors truncate">
                        {targetUser.name}
                      </span>
                      <span className="text-xs text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded-md border border-blue-400/20 shrink-0">
                        @{targetUser.username}
                      </span>
                    </div>
                    <p className="text-xs text-white/50 truncate mt-0.5">
                      {targetUser.customStatus || (targetUser.status === 'online' ? '온라인 접속 중' : '오프라인')}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1 text-xs font-medium text-blue-300 bg-blue-500/20 px-3 py-1.5 rounded-xl border border-blue-400/30 group-hover:bg-blue-600 group-hover:text-white transition-all ml-2">
                  <span>대화하기</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))
          ) : hasSearched ? (
            <div className="py-12 text-center text-white/40">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-white/30" />
              <p className="text-sm font-semibold text-white/70">일치하는 사용자가 없습니다</p>
              <p className="text-xs text-white/40 mt-1">
                아이디 스펠링을 다시 한 번 확인해주세요
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-black/20 border-t border-white/10 text-[11px] text-white/40 flex items-center justify-between backdrop-blur-md">
          <span>모든 가입 유저는 고유 아이디로 즉시 대화가 가능합니다.</span>
        </div>

      </div>
    </div>
  );
};
