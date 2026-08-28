import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, Sparkles, X, ArrowRight, BookOpen } from 'lucide-react';
import { User } from '../types';

interface ModerAgreementModalProps {
  currentUser: User;
  onClose: () => void;
  onAgreed: (updatedUser: User) => void;
}

export const ModerAgreementModal: React.FC<ModerAgreementModalProps> = ({
  currentUser,
  onClose,
  onAgreed,
}) => {
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountAgeDays = Math.floor((Date.now() - currentUser.createdAt) / (1000 * 60 * 60 * 24));
  const isEligible = accountAgeDays >= 10;

  const handleSubmit = async () => {
    if (!isEligible || !agreed) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/moder/agree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '권한 취득에 실패했습니다.');
      }
      onAgreed(data.user);
      onClose();
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#121622] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">모더레이터 (Level 2 Moder) 승급</h3>
              <p className="text-xs text-cyan-400 font-mono">가입 10일 경과 및 약관 동의 필요</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Condition Check */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/60">내 가입 경과일:</span>
            <span className={`font-bold ${isEligible ? 'text-emerald-400' : 'text-amber-400'}`}>
              {accountAgeDays}일 / 10일 {isEligible ? '✅ (조건 충족)' : '⏳ (부족)'}
            </span>
          </div>
          {!isEligible && (
            <p className="text-[11px] text-amber-300/80">
              모더레이터 권한은 계정 생성 후 최소 10일이 경과해야 취득할 수 있습니다.
            </p>
          )}
        </div>

        {/* Moder Permissions */}
        <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/20 space-y-1.5">
          <p className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            모더레이터(Level 2) 제공 권한
          </p>
          <ul className="text-[11px] text-white/70 space-y-1 list-disc list-inside">
            <li>전체 사용자 목록 조회 (<code className="text-cyan-300 font-mono">/users</code>)</li>
            <li>실시간 서버 시스템 통계 (<code className="text-cyan-300 font-mono">/stats</code>)</li>
            <li>유저 상세 정보 조회 (<code className="text-cyan-300 font-mono">/info</code>)</li>
            <li>관리자 상태 및 상태메시지 제어 (<code className="text-cyan-300 font-mono">/status</code>)</li>
            <li>도움말 및 화면 초기화 (<code className="text-cyan-300 font-mono">/help</code>, <code className="text-cyan-300 font-mono">/clear</code>)</li>
          </ul>
        </div>

        {/* Terms Box */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-[11px] text-white/60 space-y-1 max-h-28 overflow-y-auto">
          <p className="font-semibold text-white/80">📜 모더레이터 활동 서약 및 약관</p>
          <p>1. 사용자의 개인정보를 타인에게 유출하거나 악용하지 않습니다.</p>
          <p>2. 커뮤니티의 매너와 질서를 유지하며 모범적으로 행동합니다.</p>
          <p>3. 권한 남용 적발 시 예고 없이 즉시 권한이 영구 박탈될 수 있습니다.</p>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center gap-2 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Agreement Checkbox */}
        <label className="flex items-center gap-2.5 cursor-pointer p-1">
          <input
            type="checkbox"
            disabled={!isEligible}
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 text-cyan-500 focus:ring-cyan-500 bg-white/5"
          />
          <span className="text-xs text-white/90">
            위 모더레이터 활동 약관을 모두 읽었으며 이에 동의합니다.
          </span>
        </label>

        {/* Submit */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold transition-colors"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={!isEligible || !agreed || isSubmitting}
            onClick={handleSubmit}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-600/20 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? '처리 중...' : (
              <>
                <span>모더레이터 승급하기</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
