import React, { useState } from 'react';
import { User } from '../types';
import { X, Copy, Check, Calendar, MessageSquare, Shield, Clock } from 'lucide-react';

interface UserDetailModalProps {
  user: User;
  isOnline: boolean;
  onClose: () => void;
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user,
  isOnline,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(`@${user.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '최근';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-sm max-h-[92vh] flex flex-col bg-[#121622]/90 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Banner */}
        <div className={`shrink-0 h-24 bg-gradient-to-r ${user.avatarBg || 'from-blue-600 to-purple-600'} relative p-4 flex justify-end border-b border-white/10`}>
          <button
            id="close-user-detail-btn"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-md transition-colors border border-white/15"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Card Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-0 relative">
          
          {/* Avatar floating */}
          <div className="-mt-12 mb-3 relative inline-block">
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-tr ${user.avatarBg || 'from-blue-500 to-purple-600'} border border-white/20 flex items-center justify-center text-4xl shadow-xl ring-4 ring-[#121622]`}>
              {user.avatarEmoji || '💬'}
            </div>
            <span
              className={`absolute bottom-0 right-0 w-5 h-5 rounded-full border-4 border-[#121622] ${
                isOnline ? 'bg-emerald-400' : 'bg-white/30'
              }`}
            />
          </div>

          <div className="space-y-1">
            <h3 className="text-xl font-bold text-white">{user.name}</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-400 font-mono font-medium">
                @{user.username}
              </span>
              <button
                id="copy-partner-id-btn"
                type="button"
                onClick={handleCopyId}
                className="text-xs text-white/50 hover:text-white flex items-center gap-1 bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-md border border-white/10 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? '복사됨' : '복사'}</span>
              </button>
            </div>
          </div>

          {/* Status message */}
          {user.customStatus && (
            <div className="mt-4 p-3 bg-black/20 rounded-2xl border border-white/10 text-sm text-white/80 backdrop-blur-md">
              <span className="text-xs text-white/40 block mb-0.5">상태 메시지</span>
              {user.customStatus}
            </div>
          )}

          {/* Details list */}
          <div className="mt-4 space-y-2 text-xs text-white/70">
            <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
              <span className="flex items-center gap-2 text-white/50">
                <Clock className="w-4 h-4 text-blue-400" />
                현재 상태
              </span>
              <span className={`font-semibold ${isOnline ? 'text-emerald-400' : 'text-white/40'}`}>
                {isOnline ? '실시간 온라인 접속 중' : '오프라인'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
              <span className="flex items-center gap-2 text-white/50">
                <Calendar className="w-4 h-4 text-blue-400" />
                가입일
              </span>
              <span className="text-white/80">{formattedDate}</span>
            </div>
          </div>

          <div className="mt-5">
            <button
              id="confirm-user-detail-btn"
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl text-sm shadow-lg shadow-blue-600/30 border border-blue-400/30 transition-colors"
            >
              확인
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
