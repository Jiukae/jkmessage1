import React, { useState } from 'react';
import { User } from '../types';
import { X, Copy, Check, Sparkles, User as UserIcon, LogOut } from 'lucide-react';

interface ProfileModalProps {
  user: User;
  onClose: () => void;
  onUpdate: (updated: User) => void;
  onLogout: () => void;
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-rose-500 to-pink-600',
  'from-amber-400 to-orange-500',
  'from-emerald-400 to-teal-600',
  'from-violet-500 to-purple-700',
  'from-cyan-500 to-blue-600',
];

const AVATAR_EMOJIS = ['💬', '⚡', '🌸', '🚀', '🌿', '🐱', '🦊', '💡', '🔥', '🎧', '🌟', '🎯'];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  user,
  onClose,
  onUpdate,
  onLogout,
}) => {
  const [name, setName] = useState(user.name);
  const [avatarBg, setAvatarBg] = useState(user.avatarBg || AVATAR_GRADIENTS[0]);
  const [avatarEmoji, setAvatarEmoji] = useState(user.avatarEmoji || '💬');
  const [customStatus, setCustomStatus] = useState(user.customStatus || '');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(`@${user.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          name: name.trim(),
          avatarBg,
          avatarEmoji,
          customStatus: customStatus.trim(),
        }),
      });
      const data = await res.json();
      if (data.user) {
        onUpdate(data.user);
        onClose();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md max-h-[92vh] flex flex-col bg-[#121622]/90 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-blue-400" />
            내 프로필 설정
          </h2>
          <button
            id="close-profile-modal-btn"
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          
          {/* Avatar Preview */}
          <div className="flex items-center gap-4 p-3.5 bg-black/20 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-tr ${avatarBg} border border-white/15 flex items-center justify-center text-2xl shadow-lg shrink-0`}>
              {avatarEmoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold truncate">{name || user.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-blue-400 font-mono bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-400/20">
                  @{user.username}
                </span>
                <button
                  id="copy-my-id-btn"
                  type="button"
                  onClick={handleCopyId}
                  className="text-xs text-white/50 hover:text-white flex items-center gap-1 transition-colors"
                  title="아이디 복사"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '복사됨' : '복사'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Emoji choices */}
          <div>
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
              이모지 선택
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatarEmoji(emoji)}
                  className={`w-9 h-9 rounded-xl text-base flex items-center justify-center transition-transform ${
                    avatarEmoji === emoji
                      ? 'bg-blue-600 text-white scale-110 shadow-md border border-blue-400/40'
                      : 'bg-white/5 hover:bg-white/10 text-white border border-white/5'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Color choices */}
          <div>
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
              배경 색상
            </label>
            <div className="flex gap-2.5">
              {AVATAR_GRADIENTS.map((gradient) => (
                <button
                  key={gradient}
                  type="button"
                  onClick={() => setAvatarBg(gradient)}
                  className={`w-8 h-8 rounded-full bg-gradient-to-tr ${gradient} border border-white/15 transition-transform ${
                    avatarBg === gradient ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Name input */}
          <div>
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
              이름 (닉네임)
            </label>
            <input
              id="profile-name-input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-white text-sm focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-500/30 transition-all backdrop-blur-sm"
            />
          </div>

          {/* Custom Status */}
          <div>
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
              상태 메시지
            </label>
            <input
              id="profile-status-input"
              type="text"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              placeholder="상태 메시지를 적어주세요"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 text-sm focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-500/30 transition-all backdrop-blur-sm"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-between">
            <button
              id="logout-btn"
              type="button"
              onClick={onLogout}
              className="px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>

            <div className="flex gap-2">
              <button
                id="cancel-profile-btn"
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-semibold rounded-2xl transition-colors"
              >
                취소
              </button>
              <button
                id="save-profile-btn"
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-2xl shadow-lg shadow-blue-600/30 border border-blue-400/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {saving ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
};
