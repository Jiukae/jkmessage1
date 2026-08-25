import React, { useState } from 'react';
import { User } from '../types';
import {
  ArrowLeft,
  Sparkles,
  UserPlus,
  Lock,
  User as UserIcon,
  Smile,
  ShieldCheck,
  Check,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface RegisterPageProps {
  onBack: () => void;
  onRegisterSuccess: (user: User) => void;
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-pink-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-red-600',
  'from-cyan-500 to-blue-600',
  'from-fuchsia-500 to-purple-600',
  'from-lime-500 to-emerald-600',
];

const EMOJI_LIST = ['⚡', '👑', '🔥', '✨', '🚀', '🌟', '💎', '🦊', '🐱', '🎮', '☕', '🎨', '🪐', '🍀', '💡', '🎵'];

export const RegisterPage: React.FC<RegisterPageProps> = ({ onBack, onRegisterSuccess }) => {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [customStatus, setCustomStatus] = useState('');
  const [avatarBg, setAvatarBg] = useState(AVATAR_GRADIENTS[0]);
  const [avatarEmoji, setAvatarEmoji] = useState('⚡');

  const [loading, setLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check username availability
  const handleCheckUsername = async (val: string) => {
    const clean = val.trim().toLowerCase();
    setUsername(clean);
    if (!clean || clean.length < 2) {
      setUsernameAvailable(null);
      return;
    }

    setCheckingUsername(true);
    try {
      const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(clean)}`);
      const data = await res.json();
      setUsernameAvailable(data.available);
    } catch {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanUsername || cleanUsername.length < 2) {
      setError('아이디는 영문, 숫자 조합 최소 2자 이상 입력해주세요.');
      return;
    }
    if (!cleanName) {
      setError('이름(닉네임)을 입력해주세요.');
      return;
    }
    if (!password || password.length < 4) {
      setError('비밀번호는 최소 4자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          name: cleanName,
          password,
          avatarBg,
          avatarEmoji,
          customStatus: customStatus.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '회원가입에 실패했습니다.');
      }

      onRegisterSuccess(data.user);
    } catch (err: any) {
      setError(err.message || '회원가입 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0d14] text-white flex flex-col items-center justify-center p-4 relative overflow-y-auto">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Centered Container */}
      <div className="w-full max-w-lg my-8 relative z-10">
        
        {/* Back Button */}
        <div className="mb-4">
          <button
            id="register-back-to-app-btn"
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 backdrop-blur-md transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>메신저로 돌아가기</span>
          </button>
        </div>

        {/* Card */}
        <div className="bg-[#121724]/90 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
          
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 shadow-lg shadow-blue-500/25 mb-3 border border-white/20">
              <UserPlus className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              JK Message 계정 만들기
            </h1>
            <p className="text-sm text-white/60 mt-1">
              새로운 프로필을 생성하고 친구들과 대화를 시작하세요
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-red-500/15 border border-red-500/30 rounded-2xl flex items-center gap-2.5 text-red-300 text-sm animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-5">
            
            {/* Avatar & Emoji Preview */}
            <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center">
              <div className="text-xs font-semibold text-white/60 mb-2">내 프로필 아바타 선택</div>
              
              <div className={`w-20 h-20 rounded-2xl bg-gradient-to-tr ${avatarBg} border-2 border-white/30 flex items-center justify-center text-4xl shadow-xl mb-3`}>
                {avatarEmoji}
              </div>

              {/* Emoji Selector Chips */}
              <div className="w-full">
                <div className="text-[11px] text-white/50 mb-1 text-center">이모지 선택</div>
                <div className="flex flex-wrap items-center justify-center gap-1.5 max-h-24 overflow-y-auto p-1">
                  {EMOJI_LIST.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setAvatarEmoji(emoji)}
                      className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all ${
                        avatarEmoji === emoji
                          ? 'bg-blue-600 ring-2 ring-white scale-110 shadow-md'
                          : 'bg-white/5 hover:bg-white/15'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gradient Color Selector */}
              <div className="w-full mt-3 pt-3 border-t border-white/10">
                <div className="text-[11px] text-white/50 mb-1.5 text-center">배경 그라데이션 선택</div>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {AVATAR_GRADIENTS.map((bg) => (
                    <button
                      key={bg}
                      type="button"
                      onClick={() => setAvatarBg(bg)}
                      className={`w-7 h-7 rounded-full bg-gradient-to-tr ${bg} transition-all ${
                        avatarBg === bg
                          ? 'ring-2 ring-white scale-125 shadow-lg'
                          : 'opacity-70 hover:opacity-100 hover:scale-105'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Username Input with Availability */}
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1.5">
                아이디 (고유 식별자) *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/40">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  id="register-username-input"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => handleCheckUsername(e.target.value)}
                  placeholder="아이디 입력 (예: jiuk_dev)"
                  className="w-full pl-10 pr-24 py-2.5 bg-black/40 border border-white/15 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  {checkingUsername ? (
                    <Loader2 className="w-4 h-4 text-white/40 animate-spin" />
                  ) : usernameAvailable === true ? (
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> 사용가능
                    </span>
                  ) : usernameAvailable === false ? (
                    <span className="text-xs font-semibold text-red-400 flex items-center gap-1">
                      <X className="w-3.5 h-3.5" /> 중복됨
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1.5">
                표시 이름 (닉네임) *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/40">
                  <Smile className="w-4 h-4" />
                </div>
                <input
                  id="register-name-input"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="대화방에 표시될 이름 (예: 한지욱)"
                  className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/15 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Status Message */}
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1.5">
                상태 메시지 (소개글)
              </label>
              <input
                id="register-status-input"
                type="text"
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value)}
                placeholder="현재 기분이나 한마디를 적어보세요 ✨"
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/15 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            {/* Password & Confirm */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1.5">
                  비밀번호 *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/40">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="register-password-input"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="최소 4자 이상"
                    className="w-full pl-10 pr-3 py-2.5 bg-black/40 border border-white/15 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1.5">
                  비밀번호 확인 *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/40">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <input
                    id="register-password-confirm-input"
                    type="password"
                    required
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="비밀번호 재입력"
                    className="w-full pl-10 pr-3 py-2.5 bg-black/40 border border-white/15 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                id="submit-register-btn"
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-600/30 border border-blue-400/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>회원가입 처리 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>회원가입 완료 & 메신저 시작</span>
                  </>
                )}
              </button>
            </div>

          </form>

        </div>

      </div>
    </div>
  );
};
