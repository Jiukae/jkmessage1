import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { MessageSquare, UserCheck, ShieldCheck, Sparkles, Check, AlertCircle, ArrowRight, UserPlus, LogIn, Users } from 'lucide-react';

interface AuthModalProps {
  onLoginSuccess: (user: User, token: string, isNewRegistration?: boolean) => void;
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

export const AuthModal: React.FC<AuthModalProps> = ({ onLoginSuccess }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  
  // Login Form State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register Form State
  const [regUsername, setRegUsername] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAvatarBg, setRegAvatarBg] = useState(AVATAR_GRADIENTS[0]);
  const [regAvatarEmoji, setRegAvatarEmoji] = useState(AVATAR_EMOJIS[0]);
  const [regStatus, setRegStatus] = useState('반가워요! 메시지 남겨주세요 👋');

  // Username validation state
  const [idChecking, setIdChecking] = useState(false);
  const [idAvailable, setIdAvailable] = useState<boolean | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced ID availability check
  useEffect(() => {
    if (tab !== 'register') return;
    const clean = regUsername.trim().toLowerCase();
    if (!clean || clean.length < 2) {
      setIdAvailable(null);
      return;
    }

    if (!/^[a-z0-9_.-]+$/.test(clean)) {
      setIdAvailable(false);
      return;
    }

    setIdChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/check?username=${encodeURIComponent(clean)}`);
        const data = await res.json();
        setIdAvailable(data.available);
      } catch {
        setIdAvailable(null);
      } finally {
        setIdChecking(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [regUsername, tab]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim()) {
      setError('아이디를 입력해주세요.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim().toLowerCase(),
          password: loginPassword,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = regUsername.trim().toLowerCase();
    if (!cleanUser || cleanUser.length < 2) {
      setError('아이디는 최소 2글자 이상이어야 합니다.');
      return;
    }
    if (!/^[a-z0-9_.-]+$/.test(cleanUser)) {
      setError('아이디는 영문 소문자, 숫자, 밑줄(_), 하이픈(-), 점(.)만 가능합니다.');
      return;
    }
    if (!regName.trim()) {
      setError('이름(닉네임)을 입력해주세요.');
      return;
    }
    if (idAvailable === false) {
      setError('이미 사용 중인 아이디입니다.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          name: regName.trim(),
          password: regPassword || 'password123',
          avatarBg: regAvatarBg,
          avatarEmoji: regAvatarEmoji,
          customStatus: regStatus.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '회원가입에 실패했습니다.');
      }

      onLoginSuccess(data.user, data.token, true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-[#0c0e14] relative overflow-hidden flex items-center justify-center p-2.5 sm:p-6 text-white font-sans selection:bg-blue-500 selection:text-white">
      {/* Ambient background light orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2" />
      <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-pink-600/15 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />

      <div className="relative w-full max-w-md max-h-[calc(100dvh-1.25rem)] sm:max-h-[92vh] flex flex-col bg-[#121622]/90 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden z-10 my-auto">
        
        {/* Header (fixed at top) */}
        <div className="shrink-0 pt-5 pb-3.5 px-6 text-center border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-gradient-to-tr from-blue-500 to-purple-600 border border-white/20 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">JK Message</h1>
          <p className="text-xs text-white/50 mt-0.5">
            아이디로 간편하게 연결되는 1:1 실시간 메신저
          </p>
        </div>

        {/* Tab Selector (fixed under header) */}
        <div className="shrink-0 grid grid-cols-2 p-1.5 mx-4 sm:mx-6 mt-3 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
          <button
            id="tab-login-btn"
            type="button"
            onClick={() => { setTab('login'); setError(null); }}
            className={`py-2 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
              tab === 'login'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/30'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <LogIn className="w-4 h-4" />
            로그인
          </button>
          <button
            id="tab-register-btn"
            type="button"
            onClick={() => { setTab('register'); setError(null); }}
            className={`py-2 text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2 ${
              tab === 'register'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-400/30'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            회원가입
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="shrink-0 mx-4 sm:mx-6 mt-3 p-2.5 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2 backdrop-blur-sm">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                  사용자 아이디 (ID)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm font-mono">
                    @
                  </span>
                  <input
                    id="login-username-input"
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="아이디를 입력하세요 (예: jiuk)"
                    className="w-full pl-8 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-500/30 text-sm transition-all backdrop-blur-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                  비밀번호
                </label>
                <input
                  id="login-password-input"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-500/30 text-sm transition-all backdrop-blur-sm"
                />
              </div>

              <button
                id="login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-semibold rounded-2xl text-sm shadow-lg shadow-blue-600/30 border border-blue-400/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>로그인하기</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                  사용할 아이디 (ID) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm font-mono">
                    @
                  </span>
                  <input
                    id="register-username-input"
                    type="text"
                    required
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value.toLowerCase())}
                    placeholder="영문 소문자/숫자 (예: jiuk)"
                    className="w-full pl-8 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-500/30 text-sm transition-all backdrop-blur-sm"
                  />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    {idChecking ? (
                      <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                    ) : idAvailable === true ? (
                      <span className="text-emerald-400 flex items-center gap-1 text-xs font-medium">
                        <Check className="w-4 h-4" />
                      </span>
                    ) : idAvailable === false ? (
                      <span className="text-rose-400 text-xs font-medium">중복</span>
                    ) : null}
                  </div>
                </div>
                <p className="text-[11px] text-white/40 mt-1">
                  다른 사용자가 이 아이디를 검색하여 친구 요청 및 메시지를 보냅니다.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                  이름 또는 닉네임 <span className="text-rose-400">*</span>
                </label>
                <input
                  id="register-name-input"
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="예: 홍길동"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-500/30 text-sm transition-all backdrop-blur-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                  비밀번호
                </label>
                <input
                  id="register-password-input"
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="비밀번호 (미입력 시 기본값)"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-500/30 text-sm transition-all backdrop-blur-sm"
                />
              </div>

              {/* Avatar Selector */}
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
                  프로필 아바타 & 테마
                </label>
                
                {/* Preview */}
                <div className="flex items-center gap-3.5 p-2.5 bg-black/20 rounded-2xl border border-white/10 mb-3 backdrop-blur-md">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${regAvatarBg} border border-white/15 flex items-center justify-center text-xl shadow-md`}>
                    {regAvatarEmoji}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-white">
                      {regName || '이름 미리보기'}
                    </div>
                    <div className="text-xs text-blue-400 font-mono">
                      @{regUsername || 'id_preview'}
                    </div>
                  </div>
                </div>

                {/* Emoji choices */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {AVATAR_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setRegAvatarEmoji(emoji)}
                      className={`w-8 h-8 rounded-xl text-sm flex items-center justify-center transition-transform ${
                        regAvatarEmoji === emoji
                          ? 'bg-blue-600 text-white scale-110 shadow-md border border-blue-400/40'
                          : 'bg-white/5 hover:bg-white/10 text-white border border-white/5'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Color choices */}
                <div className="flex gap-2">
                  {AVATAR_GRADIENTS.map((gradient) => (
                    <button
                      key={gradient}
                      type="button"
                      onClick={() => setRegAvatarBg(gradient)}
                      className={`w-7 h-7 rounded-full bg-gradient-to-tr ${gradient} border border-white/15 transition-transform ${
                        regAvatarBg === gradient ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-1.5">
                  상태 메시지
                </label>
                <input
                  id="register-status-input"
                  type="text"
                  value={regStatus}
                  onChange={(e) => setRegStatus(e.target.value)}
                  placeholder="예: 오늘 기분 최고! ✨"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-500/30 text-sm transition-all backdrop-blur-sm"
                />
              </div>

              <button
                id="register-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-semibold rounded-2xl text-sm shadow-lg shadow-blue-600/30 border border-blue-400/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>회원가입 완료하고 시작하기</span>
                    <Sparkles className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
