import React, { useState } from 'react';
import { User, UserStatusMode } from '../types';
import {
  LogIn,
  UserPlus,
  Settings,
  LogOut,
  Volume2,
  VolumeX,
  Shield,
  ChevronUp,
  ChevronDown,
  Lock,
  User as UserIcon,
  AlertCircle,
  Loader2,
  Sparkles,
  Circle,
  X,
} from 'lucide-react';

interface BottomRightProfileProps {
  currentUser: User | null;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenProfileSettings: () => void;
  onOpenStatusPicker: () => void;
  onLogout: () => void;
  onNavigateToRegister: () => void;
  onLoginSuccess: (user: User) => void;
}

export const BottomRightProfile: React.FC<BottomRightProfileProps> = ({
  currentUser,
  soundEnabled,
  onToggleSound,
  onOpenProfileSettings,
  onOpenStatusPicker,
  onLogout,
  onNavigateToRegister,
  onLoginSuccess,
}) => {
  // Guest inline login state
  const [isLoginExpanded, setIsLoginExpanded] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const isAdmin = currentUser?.username.toLowerCase() === 'jiukhan0215';

  const handleInlineLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const cleanUsername = loginUsername.trim().toLowerCase();
    if (!cleanUsername || !loginPassword) {
      setLoginError('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          password: loginPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '로그인에 실패했습니다.');
      }

      setIsLoginExpanded(false);
      setLoginUsername('');
      setLoginPassword('');
      onLoginSuccess(data.user);
    } catch (err: any) {
      setLoginError(err.message || '로그인 중 오류가 발생했습니다.');
    } finally {
      setLoginLoading(false);
    }
  };

  const getStatusColor = (status?: UserStatusMode) => {
    switch (status) {
      case 'online':
        return 'bg-emerald-400';
      case 'dnd':
        return 'bg-red-400';
      default:
        return 'bg-white/40';
    }
  };

  const getStatusLabel = (status?: UserStatusMode) => {
    switch (status) {
      case 'online':
        return '온라인';
      case 'dnd':
        return '방해 금지';
      default:
        return '오프라인';
    }
  };

  // If Logged in: Render user profile widget in bottom-right
  if (currentUser) {
    return (
      <div className="fixed bottom-3 right-3 z-40 max-w-sm w-auto">
        <div className="bg-[#121622]/95 border border-white/15 rounded-2xl p-2.5 shadow-2xl backdrop-blur-2xl flex items-center gap-3 transition-all hover:border-white/25">
          
          {/* Avatar with live status dot */}
          <button
            id="bottom-profile-avatar-btn"
            type="button"
            onClick={onOpenProfileSettings}
            className="relative group shrink-0"
            title="프로필 설정 열기"
          >
            <div
              className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${
                currentUser.avatarBg || 'from-blue-500 to-indigo-600'
              } border border-white/20 flex items-center justify-center text-xl shadow-md transition-transform group-hover:scale-105`}
            >
              {currentUser.avatarEmoji || '💬'}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#121622] ${getStatusColor(
                currentUser.status
              )}`}
            />
          </button>

          {/* User Info & Status Pill */}
          <div className="min-w-0 pr-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-xs sm:text-sm text-white truncate max-w-[110px]">
                {currentUser.name}
              </span>
              {isAdmin && (
                <span className="px-1.5 py-0.2 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded flex items-center gap-0.5 shrink-0">
                  <Shield className="w-2.5 h-2.5" />
                  <span>관리자</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-white/50 font-mono truncate max-w-[80px]">
                @{currentUser.username}
              </span>

              {/* Status Switcher Button */}
              <button
                id="bottom-profile-status-pill-btn"
                type="button"
                onClick={onOpenStatusPicker}
                className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 hover:bg-white/15 text-white/70 hover:text-white border border-white/10 flex items-center gap-1 transition-colors"
                title="상태 모드 변경"
              >
                <Circle className={`w-1.5 h-1.5 fill-current ${currentUser.status === 'online' ? 'text-emerald-400' : currentUser.status === 'dnd' ? 'text-red-400' : 'text-white/40'}`} />
                <span>{getStatusLabel(currentUser.status)}</span>
              </button>
            </div>
          </div>

          {/* Quick Action Icons */}
          <div className="flex items-center gap-1 border-l border-white/10 pl-2">
            <button
              id="bottom-profile-sound-btn"
              type="button"
              onClick={onToggleSound}
              className={`p-1.5 rounded-lg border transition-colors ${
                soundEnabled
                  ? 'bg-blue-500/15 border-blue-500/30 text-blue-300 hover:bg-blue-500/25'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70 hover:bg-white/10'
              }`}
              title={soundEnabled ? '효과음 끄기' : '효과음 켜기'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            <button
              id="bottom-profile-settings-btn"
              type="button"
              onClick={onOpenProfileSettings}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition-colors"
              title="내 프로필 및 테마 설정"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            <button
              id="bottom-profile-logout-btn"
              type="button"
              onClick={onLogout}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-300 transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </div>
    );
  }

  // Guest Mode: Render Guest Card or Expanded Inline Login
  return (
    <div className="fixed bottom-3 right-3 z-40 max-w-sm w-auto">
      {isLoginExpanded ? (
        /* Expanded Inline Login Card in bottom right */
        <div className="w-80 bg-[#121622]/95 border border-blue-500/30 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
            <div className="flex items-center gap-1.5 text-sm font-bold text-white">
              <LogIn className="w-4 h-4 text-blue-400" />
              <span>간편 로그인</span>
            </div>
            <button
              id="close-inline-login-btn"
              type="button"
              onClick={() => {
                setIsLoginExpanded(false);
                setLoginError(null);
              }}
              className="p-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {loginError && (
            <div className="mb-3 p-2 bg-red-500/15 border border-red-500/30 rounded-xl flex items-center gap-1.5 text-red-300 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleInlineLogin} className="space-y-2.5">
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-white/40">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
                <input
                  id="inline-login-username"
                  type="text"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="아이디 입력 (예: jiukhan0215)"
                  className="w-full pl-8 pr-3 py-2 bg-black/40 border border-white/15 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-white/40">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <input
                  id="inline-login-password"
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="비밀번호"
                  className="w-full pl-8 pr-3 py-2 bg-black/40 border border-white/15 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                id="submit-inline-login-btn"
                type="submit"
                disabled={loginLoading}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-blue-600/30 border border-blue-400/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {loginLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>로그인 중...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-3.5 h-3.5" />
                    <span>로그인하기</span>
                  </>
                )}
              </button>

              <button
                id="inline-to-register-btn"
                type="button"
                onClick={() => {
                  setIsLoginExpanded(false);
                  onNavigateToRegister();
                }}
                className="px-2.5 py-2 bg-white/5 hover:bg-white/15 text-white/80 hover:text-white rounded-xl text-xs border border-white/10 transition-colors whitespace-nowrap"
              >
                회원가입
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Compact Guest Banner in bottom right */
        <div className="bg-[#121622]/95 border border-white/15 rounded-2xl p-2.5 shadow-2xl backdrop-blur-2xl flex items-center gap-2.5 transition-all hover:border-white/25">
          
          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-base shrink-0">
            👋
          </div>

          <div className="pr-1 text-left">
            <div className="text-xs font-bold text-white flex items-center gap-1">
              <span>게스트 모드</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-normal">탐색 중</span>
            </div>
            <div className="text-[10px] text-white/50 truncate max-w-[120px]">
              유저 검색 및 프로필 조회 가능
            </div>
          </div>

          <div className="flex items-center gap-1.5 border-l border-white/10 pl-2">
            <button
              id="expand-bottom-login-btn"
              type="button"
              onClick={() => setIsLoginExpanded(true)}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs shadow-md shadow-blue-600/30 border border-blue-400/30 transition-all flex items-center gap-1 whitespace-nowrap"
            >
              <LogIn className="w-3 h-3" />
              <span>로그인</span>
            </button>

            <button
              id="bottom-register-nav-btn"
              type="button"
              onClick={onNavigateToRegister}
              className="px-2.5 py-1.5 bg-white/5 hover:bg-white/15 text-white/80 hover:text-white rounded-xl text-xs border border-white/10 transition-colors flex items-center gap-1 whitespace-nowrap"
            >
              <UserPlus className="w-3 h-3" />
              <span>회원가입</span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
};
