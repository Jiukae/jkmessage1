import React, { useState, useEffect } from 'react';
import { User, FriendRequest } from '../types';
import {
  X,
  Search,
  UserPlus,
  Check,
  Clock,
  UserCheck,
  AlertCircle,
  Sparkles,
  Inbox,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface AddFriendModalProps {
  currentUser: User;
  onClose: () => void;
  onRequestSent: () => void;
  onAcceptRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
}

export const AddFriendModal: React.FC<AddFriendModalProps> = ({
  currentUser,
  onClose,
  onRequestSent,
  onAcceptRequest,
  onRejectRequest,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'requests'>('search');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [sendingUserId, setSendingUserId] = useState<string | null>(null);

  // Fetch pending requests
  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await fetch(`/api/friends/requests?userId=${currentUser.id}`);
      const data = await res.json();
      const incoming = data.incoming || [];
      const outgoing = data.outgoing || [];
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);

      // If user has incoming pending requests and hasn't started searching, switch to requests tab
      if (incoming.length > 0 && !query.trim()) {
        setActiveTab('requests');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRequests(false);
    }
  };

  // Search users
  const searchUsers = async (q: string) => {
    setLoadingSearch(true);
    try {
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(q)}&currentUserId=${currentUser.id}`
      );
      const data = await res.json();
      setSearchResults(data.users || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSearch(false);
      setHasSearched(true);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    searchUsers(query);
  }, [query]);

  // Send friend request handler
  const handleSendRequest = async (targetUser: any) => {
    setSendingUserId(targetUser.id);
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          targetUserId: targetUser.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMsg(data.message || '친구 요청을 성공적으로 보냈습니다!');
        searchUsers(query);
        fetchRequests();
        onRequestSent();
      } else {
        setFeedbackMsg(data.error || '친구 요청 전송 실패');
      }
    } catch (e) {
      console.error(e);
      setFeedbackMsg('오류가 발생했습니다.');
    } finally {
      setSendingUserId(null);
      setTimeout(() => setFeedbackMsg(null), 3500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col bg-[#121622]/95 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-400" />
              친구 추가 및 요청 관리
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              상대방과 친구가 되면 1:1 대화를 시작할 수 있습니다
            </p>
          </div>
          <button
            id="close-add-friend-modal-btn"
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="shrink-0 px-6 pt-3 pb-2 border-b border-white/10 bg-black/10">
          <div className="grid grid-cols-2 p-1 bg-black/30 rounded-2xl border border-white/10">
            <button
              id="add-friend-tab-search-btn"
              type="button"
              onClick={() => setActiveTab('search')}
              className={`py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'search'
                  ? 'bg-white/15 text-white border border-white/10 shadow-sm'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>아이디로 친구 찾기</span>
            </button>

            <button
              id="add-friend-tab-requests-btn"
              type="button"
              onClick={() => {
                setActiveTab('requests');
                fetchRequests();
              }}
              className={`py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'requests'
                  ? 'bg-white/15 text-white border border-white/10 shadow-sm'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>받은/보낸 요청</span>
              {incomingRequests.length > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-bold border border-rose-400/30">
                  {incomingRequests.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Feedback alert if any */}
        {feedbackMsg && (
          <div className="shrink-0 mx-6 mt-3 p-3 bg-blue-500/20 border border-blue-400/30 rounded-2xl text-xs text-blue-200 flex items-center gap-2 animate-in fade-in duration-200">
            <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-5 sm:p-6 space-y-3">
          
          {activeTab === 'search' ? (
            <>
              {/* Search Bar */}
              <div className="relative mb-3">
                <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="friend-search-input"
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="친구의 아이디(@) 또는 이름 검색 (예: minseo)"
                  className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-500/30 transition-all backdrop-blur-sm"
                />
              </div>

              {/* Search Results */}
              <div className="space-y-2">
                {loadingSearch ? (
                  <div className="py-12 flex flex-col items-center justify-center text-white/50 text-sm">
                    <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mb-2" />
                    <span>사용자 검색 중...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((targetUser) => {
                    const isFriend = targetUser.isFriend;
                    const hasPending = targetUser.hasPendingRequest;
                    const isSending = sendingUserId === targetUser.id;

                    return (
                      <div
                        key={targetUser.id}
                        id={`search-user-${targetUser.username}`}
                        className="p-3 bg-white/5 border border-white/10 hover:border-white/20 rounded-2xl flex items-center justify-between gap-3 backdrop-blur-sm transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${targetUser.avatarBg || 'from-blue-500 to-purple-500'} border border-white/15 flex items-center justify-center text-xl shadow-md`}>
                              {targetUser.avatarEmoji || '💬'}
                            </div>
                            {targetUser.status === 'online' && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-[#0c0e14] rounded-full" />
                            )}
                            {targetUser.status === 'dnd' && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-rose-500 border-2 border-[#0c0e14] rounded-full" />
                            )}
                            {targetUser.status === 'offline' && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-white/30 border-2 border-[#0c0e14] rounded-full" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white truncate">
                                {targetUser.name}
                              </span>
                              <span className="text-xs text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded-md border border-blue-400/20 shrink-0">
                                @{targetUser.username}
                              </span>
                            </div>
                            <p className="text-xs text-white/50 truncate mt-0.5">
                              {targetUser.customStatus || (targetUser.status === 'online' ? '온라인' : targetUser.status === 'dnd' ? '방해 금지' : '오프라인')}
                            </p>
                          </div>
                        </div>

                        {/* Friend status / action */}
                        <div className="shrink-0">
                          {isFriend ? (
                            <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-xl text-xs font-semibold border border-emerald-400/30 flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5" />
                              친구
                            </span>
                          ) : targetUser.pendingDirection === 'incoming' && targetUser.pendingRequestId ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                id={`accept-search-req-${targetUser.username}-btn`}
                                type="button"
                                onClick={async () => {
                                  await onAcceptRequest(targetUser.pendingRequestId);
                                  setFeedbackMsg(`@${targetUser.username} 님의 친구 요청을 수락했습니다 🎉`);
                                  searchUsers(query);
                                  fetchRequests();
                                  setTimeout(() => setFeedbackMsg(null), 3500);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1 shadow-emerald-600/30"
                              >
                                <Check className="w-3.5 h-3.5" />
                                수락
                              </button>
                              <button
                                id={`reject-search-req-${targetUser.username}-btn`}
                                type="button"
                                onClick={async () => {
                                  await onRejectRequest(targetUser.pendingRequestId);
                                  setFeedbackMsg(`@${targetUser.username} 님의 친구 요청을 거절했습니다.`);
                                  searchUsers(query);
                                  fetchRequests();
                                  setTimeout(() => setFeedbackMsg(null), 3500);
                                }}
                                className="px-2.5 py-1.5 bg-white/10 hover:bg-rose-500/20 hover:text-rose-300 text-white/60 rounded-xl text-xs font-medium transition-all"
                              >
                                거절
                              </button>
                            </div>
                          ) : hasPending ? (
                            <span className="px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-xl text-xs font-semibold border border-amber-400/30 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              보낸 요청 대기중
                            </span>
                          ) : (
                            <button
                              id={`send-friend-req-${targetUser.username}-btn`}
                              type="button"
                              onClick={() => handleSendRequest(targetUser)}
                              disabled={isSending}
                              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold border border-blue-400/30 transition-all flex items-center gap-1.5 shadow-sm shadow-blue-600/30"
                            >
                              {isSending ? (
                                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <UserPlus className="w-3.5 h-3.5" />
                              )}
                              친구 추가
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : hasSearched ? (
                  <div className="py-12 text-center text-white/40">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-white/30" />
                    <p className="text-sm font-semibold text-white/70">일치하는 사용자가 없습니다</p>
                    <p className="text-xs text-white/40 mt-1">
                      아이디 스펠링(@ID)을 다시 확인해보세요
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            /* Requests Tab */
            <div className="space-y-4">
              
              {/* Incoming Requests */}
              <div>
                <div className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>받은 친구 요청 ({incomingRequests.length})</span>
                </div>

                {incomingRequests.length > 0 ? (
                  <div className="space-y-2">
                    {incomingRequests.map((req) => {
                      const sender = req.sender;
                      if (!sender) return null;

                      return (
                        <div
                          key={req.id}
                          id={`incoming-request-${req.id}`}
                          className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${sender.avatarBg || 'from-blue-500 to-purple-500'} border border-white/15 flex items-center justify-center text-lg shadow-sm shrink-0`}>
                              {sender.avatarEmoji || '💬'}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-white truncate">
                                  {sender.name}
                                </span>
                                <span className="text-xs text-blue-400 font-mono">
                                  @{sender.username}
                                </span>
                              </div>
                              <span className="text-[11px] text-white/40">
                                친구 요청을 보냈습니다.
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              id={`accept-request-${req.id}-btn`}
                              type="button"
                              onClick={() => {
                                onAcceptRequest(req.id);
                                setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id));
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              수락
                            </button>
                            <button
                              id={`reject-request-${req.id}-btn`}
                              type="button"
                              onClick={() => {
                                onRejectRequest(req.id);
                                setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id));
                              }}
                              className="px-2.5 py-1.5 bg-white/10 hover:bg-rose-500/20 hover:text-rose-300 text-white/60 rounded-xl text-xs font-medium transition-all"
                            >
                              거절
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center text-white/30 text-xs bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                    받은 친구 요청이 없습니다.
                  </div>
                )}
              </div>

              {/* Outgoing Requests */}
              <div>
                <div className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">
                  <span>내가 보낸 친구 요청 ({outgoingRequests.length})</span>
                </div>

                {outgoingRequests.length > 0 ? (
                  <div className="space-y-2">
                    {outgoingRequests.map((req) => {
                      const receiver = req.receiver;
                      if (!receiver) return null;

                      return (
                        <div
                          key={req.id}
                          className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${receiver.avatarBg || 'from-blue-500 to-purple-500'} border border-white/15 flex items-center justify-center text-lg shadow-sm shrink-0`}>
                              {receiver.avatarEmoji || '💬'}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-white truncate">
                                  {receiver.name}
                                </span>
                                <span className="text-xs text-blue-400 font-mono">
                                  @{receiver.username}
                                </span>
                              </div>
                              <span className="text-[11px] text-amber-400/80 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                상대방의 수락 대기 중
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center text-white/30 text-xs bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                    보낸 친구 요청이 없습니다.
                  </div>
                )}
              </div>

            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="shrink-0 px-6 py-3 bg-black/20 border-t border-white/10 text-[11px] text-white/40 flex items-center justify-between backdrop-blur-md">
          <span className="flex items-center gap-1 text-white/60">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            친구로 연결된 사람끼리만 1:1 대화가 가능합니다.
          </span>
        </div>

      </div>
    </div>
  );
};
