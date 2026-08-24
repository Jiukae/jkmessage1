import React, { useState } from 'react';
import { User, UserStatusMode } from '../types';
import { X, Check, Clock, BellOff, ShieldAlert, Sparkles } from 'lucide-react';

interface StatusPickerModalProps {
  user: User;
  onClose: () => void;
  onStatusUpdated: (updatedUser: User) => void;
}

const DND_DURATIONS = [
  { label: '계속 (직접 해제할 때까지)', minutes: 0 },
  { label: '30분 동안', minutes: 30 },
  { label: '1시간 동안', minutes: 60 },
  { label: '2시간 동안', minutes: 120 },
  { label: '4시간 동안', minutes: 240 },
  { label: '8시간 동안', minutes: 480 },
  { label: '내일 오전 9시까지', minutes: 720 },
];

export const StatusPickerModal: React.FC<StatusPickerModalProps> = ({
  user,
  onClose,
  onStatusUpdated,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<UserStatusMode>(user.status || 'online');
  const [selectedDndMinutes, setSelectedDndMinutes] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          status: selectedStatus,
          durationMinutes: selectedStatus === 'dnd' ? selectedDndMinutes : null,
          dndDurationMinutes: selectedStatus === 'dnd' ? selectedDndMinutes : null,
        }),
      });
      const data = await res.json();
      if (data.user) {
        onStatusUpdated(data.user);
        onClose();
      } else {
        // Fallback local update if network succeeded
        const updated = {
          ...user,
          status: selectedStatus,
          dndUntil: selectedStatus === 'dnd' && selectedDndMinutes > 0 ? Date.now() + selectedDndMinutes * 60 * 1000 : null,
        };
        onStatusUpdated(updated);
        onClose();
      }
    } catch (e) {
      console.error(e);
      // Fallback local update
      const updated = {
        ...user,
        status: selectedStatus,
        dndUntil: selectedStatus === 'dnd' && selectedDndMinutes > 0 ? Date.now() + selectedDndMinutes * 60 * 1000 : null,
      };
      onStatusUpdated(updated);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md max-h-[92vh] flex flex-col bg-[#121622]/95 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-400 inline-block animate-pulse" />
            내 상태 설정
          </h2>
          <button
            id="close-status-modal-btn"
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          
          <div className="text-xs text-white/50 mb-1">
            다른 사람에게 표시될 내 접속 상태를 선택하세요.
          </div>

          {/* Status Options */}
          <div className="space-y-2.5">
            
            {/* 1. Online (Green) */}
            <button
              id="status-option-online-btn"
              type="button"
              onClick={() => setSelectedStatus('online')}
              className={`w-full p-3.5 rounded-2xl border text-left flex items-start gap-3.5 transition-all ${
                selectedStatus === 'online'
                  ? 'bg-emerald-500/15 border-emerald-400/50 shadow-lg shadow-emerald-950/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="mt-0.5 relative shrink-0">
                <span className="w-4 h-4 rounded-full bg-emerald-400 inline-block shadow-sm shadow-emerald-400/50 ring-2 ring-emerald-500/30" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white flex items-center gap-1.5">
                    온라인 (초록색)
                  </span>
                  {selectedStatus === 'online' && (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-white/50 mt-0.5">
                  현재 접속 중으로 표시되며 모든 알림을 정상적으로 받습니다.
                </p>
              </div>
            </button>

            {/* 2. DND (Red) with Time Picker */}
            <div
              className={`rounded-2xl border transition-all ${
                selectedStatus === 'dnd'
                  ? 'bg-rose-500/15 border-rose-400/50 shadow-lg shadow-rose-950/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <button
                id="status-option-dnd-btn"
                type="button"
                onClick={() => setSelectedStatus('dnd')}
                className="w-full p-3.5 text-left flex items-start gap-3.5"
              >
                <div className="mt-0.5 relative shrink-0">
                  <span className="w-4 h-4 rounded-full bg-rose-500 inline-block shadow-sm shadow-rose-500/50 ring-2 ring-rose-500/30" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white flex items-center gap-1.5">
                      방해 금지 (빨간색)
                    </span>
                    {selectedStatus === 'dnd' && (
                      <Check className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-white/50 mt-0.5">
                    집중 또는 휴식 중임을 나타내며, 원하는 시간 동안 지속할 수 있습니다.
                  </p>
                </div>
              </button>

              {/* DND Duration Selection (when DND selected) */}
              {selectedStatus === 'dnd' && (
                <div className="px-4 pb-4 pt-1 border-t border-rose-500/20 mt-1 space-y-2 animate-in fade-in duration-150">
                  <label className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    방해 금지 시간 설정
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {DND_DURATIONS.map((dur) => (
                      <button
                        key={dur.minutes}
                        type="button"
                        onClick={() => setSelectedDndMinutes(dur.minutes)}
                        className={`px-3 py-2 rounded-xl text-xs text-left font-medium transition-all ${
                          selectedDndMinutes === dur.minutes
                            ? 'bg-rose-500 text-white font-bold shadow-md shadow-rose-900/40'
                            : 'bg-black/30 text-white/70 hover:bg-black/50 hover:text-white border border-white/5'
                        }`}
                      >
                        {dur.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Footer Actions */}
        <div className="shrink-0 p-4 px-6 border-t border-white/10 bg-black/30 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white/60 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
          >
            취소
          </button>
          <button
            id="apply-status-btn"
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-blue-600/30 border border-blue-400/30 transition-all flex items-center gap-1.5"
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            상태 적용하기
          </button>
        </div>

      </div>
    </div>
  );
};
