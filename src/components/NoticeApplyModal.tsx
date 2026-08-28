import React, { useState } from 'react';
import { Shield, Sparkles, X, CheckCircle2, AlertCircle, Bell, ArrowRight } from 'lucide-react';
import { User, AdminNotice } from '../types';

interface NoticeApplyModalProps {
  notice: AdminNotice;
  currentUser: User;
  onClose: () => void;
  onApplySuccess: () => void;
}

export const NoticeApplyModal: React.FC<NoticeApplyModalProps> = ({
  notice,
  currentUser,
  onClose,
  onApplySuccess,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasApplied = notice.applicants.some((a) => a.userId === currentUser.id);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasApplied) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/notices/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noticeId: notice.id,
          userId: currentUser.id,
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '신청에 실패했습니다.');
      }

      setSuccess(true);
      setTimeout(() => {
        onApplySuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || '신청 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const timeLeft = Math.max(0, notice.expiresAt - Date.now());
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const minsLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#121622] border border-amber-500/30 rounded-3xl p-6 shadow-2xl space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-300">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">어드민(Admin) 모집 공고</h3>
              <p className="text-xs text-amber-300/80 font-mono">
                {notice.expiresAt > Date.now() ? `⏳ 남은 시간: ${hoursLeft}시간 ${minsLeft}분` : '마감됨'}
              </p>
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

        {/* Notice Content Box */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
          <div className="text-xs font-semibold text-white/50 flex items-center justify-between">
            <span>작성자: @{notice.creatorUsername} ({notice.creatorName})</span>
            <span className="text-amber-400 font-bold">지원자 {notice.applicants.length}명</span>
          </div>
          <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
            {notice.content}
          </p>
        </div>

        {/* Status / Form */}
        {hasApplied ? (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-xs">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <div>
              <p className="font-bold">이미 지원 신청을 완료하셨습니다.</p>
              <p className="text-emerald-300/70 mt-0.5">
                Owner가 신청자를 대상으로 단체방을 생성하여 심사 후 1명을 선발합니다.
              </p>
            </div>
          </div>
        ) : success ? (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-xs">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            <div>
              <p className="font-bold">지원 신청서가 성공적으로 전송되었습니다!</p>
              <p className="text-emerald-300/70 mt-0.5">Owner의 시스템 터미널로 알림이 전달되었습니다.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleApply} className="space-y-3">
            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center gap-2 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">
                지원 동기 및 각오 (선택)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="어드민 지원 이유나 각오를 간단히 적어주세요."
                rows={2}
                className="w-full p-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-xs focus:outline-none focus:border-amber-400/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold transition-colors"
              >
                닫기
              </button>
              <button
                type="submit"
                disabled={isSubmitting || notice.expiresAt <= Date.now()}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold shadow-lg shadow-amber-500/20 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? '전송 중...' : (
                  <>
                    <span>어드민 지원하기</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
