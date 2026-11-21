import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  ShieldCheck,
  Delete,
  AlertTriangle,
  Settings,
  X,
  Eye,
  EyeOff,
  Clock,
} from 'lucide-react';
import { KuCoinSecurityLockConfig } from '../types';
import {
  normalizePinDigits,
  needsInitialPinSetup,
  attemptPinUnlockAsync,
  setupInitialPinAsync,
  validatePinChangeAsync,
  getPinLockoutRemainingMs,
} from '../services/kucoinSecurityLock';
import { reencryptKuCoinSecretsOnPinChange } from '../services/kucoinApi';

interface KuCoinSecurityLockScreenProps {
  config: KuCoinSecurityLockConfig;
  titleAr?: string;
  subtitleAr?: string;
  onUnlockSuccess: (
    method: 'PIN' | 'BIOMETRIC',
    updatedCredentialId?: string | null,
    verifiedPin?: string,
    updatedConfig?: KuCoinSecurityLockConfig
  ) => void;
  onConfigChange?: (updated: KuCoinSecurityLockConfig) => void;
  onCancelOrFallback?: () => void;
  cancelLabelAr?: string;
  onOpenSettingsTab?: () => void;
}

export const KuCoinSecurityLockScreen: React.FC<KuCoinSecurityLockScreenProps> = ({
  config,
  titleAr = 'قفل أمان تبويب التنفيذ المباشر (KuCoin)',
  subtitleAr = 'لحماية محفظتك الحقيقية وتشفير مفاتيح KuCoin، يرجى إدخال رمز القفل الرقمي (PIN Code) للمتابعة.',
  onUnlockSuccess,
  onConfigChange,
  onCancelOrFallback,
  cancelLabelAr = 'العودة إلى الوضع الآمن',
  onOpenSettingsTab,
}) => {
  const isFirstRunSetup = needsInitialPinSetup(config);

  const [pinInput, setPinInput] = useState<string>('');
  const [setupConfirmInput, setSetupConfirmInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPinDigits, setShowPinDigits] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [lockRemainingSec, setLockRemainingSec] = useState<number>(() =>
    Math.ceil(getPinLockoutRemainingMs(config) / 1000)
  );

  // Live countdown while brute-force lockout is active
  useEffect(() => {
    const updateCountdown = () => {
      const rem = Math.ceil(getPinLockoutRemainingMs(config) / 1000);
      setLockRemainingSec(rem);
    };
    updateCountdown();
    if (getPinLockoutRemainingMs(config) <= 0) return;
    const interval = setInterval(updateCountdown, 500);
    return () => clearInterval(interval);
  }, [config]);

  const isLockedOut = lockRemainingSec > 0;

  const handleFirstRunSetup = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (isVerifying) return;
      setIsVerifying(true);
      setErrorMsg(null);
      try {
        const res = await setupInitialPinAsync(pinInput, setupConfirmInput);
        if (!res.valid || !res.normalizedNewPin || !res.updatedConfig) {
          setErrorMsg(res.errorAr || 'تعذر إنشاء رمز PIN.');
          return;
        }
        onConfigChange?.(res.updatedConfig);
        onUnlockSuccess('PIN', null, res.normalizedNewPin, res.updatedConfig);
      } finally {
        setIsVerifying(false);
      }
    },
    [pinInput, setupConfirmInput, isVerifying, onConfigChange, onUnlockSuccess]
  );

  const handleVerifyPin = useCallback(
    async (candidatePin: string) => {
      if (isVerifying || isLockedOut) return;
      const clean = normalizePinDigits(candidatePin);
      if (clean.length < 4) return;
      setIsVerifying(true);
      setErrorMsg(null);
      try {
        const res = await attemptPinUnlockAsync(clean, config);
        onConfigChange?.(res.updatedConfig);
        if (res.success) {
          setPinInput('');
          onUnlockSuccess('PIN', null, clean, res.updatedConfig);
        } else {
          setErrorMsg(res.errorAr || 'رمز القفل الرقمي (PIN) غير صحيح.');
          setPinInput('');
          setLockRemainingSec(Math.ceil(res.lockedRemainingMs / 1000));
        }
      } finally {
        setIsVerifying(false);
      }
    },
    [config, isVerifying, isLockedOut, onConfigChange, onUnlockSuccess]
  );

  const handleAppendDigit = useCallback(
    (digit: string) => {
      if (isLockedOut || isVerifying) return;
      setErrorMsg(null);
      setPinInput((prev) => (prev.length >= 8 ? prev : prev + digit));
    },
    [isLockedOut, isVerifying]
  );

  const handleBackspace = useCallback(() => {
    setErrorMsg(null);
    setPinInput((prev) => prev.slice(0, -1));
  }, []);

  const handleClearPin = useCallback(() => {
    setErrorMsg(null);
    setPinInput('');
  }, []);

  // Support physical keyboard input for digits, Backspace, and Enter when unlocking
  useEffect(() => {
    if (isFirstRunSetup) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (/^[0-9٠-٩]$/.test(e.key)) {
        e.preventDefault();
        const normalized = normalizePinDigits(e.key);
        if (normalized) handleAppendDigit(normalized);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter' && pinInput.length >= 4) {
        e.preventDefault();
        void handleVerifyPin(pinInput);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFirstRunSetup, handleAppendDigit, handleBackspace, handleVerifyPin, pinInput]);

  return (
    <div
      data-testid="kucoin_security_lock_screen"
      className="bg-[#12171D] border border-[#01BC8D]/40 rounded-2xl p-5 sm:p-7 max-w-lg mx-auto shadow-[0_12px_40px_rgba(0,0,0,0.6)] space-y-5 animate-in fade-in zoom-in-95 duration-200"
    >
      {/* Top Security Shield Header */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-[#0D2B24] border border-[#01BC8D]/50 text-[#01BC8D] mx-auto flex items-center justify-center shadow-[0_0_24px_rgba(1,188,141,0.25)]">
          <Lock className="w-7 h-7" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#0D2B24] border border-[#01BC8D]/30 text-[#01BC8D] text-[11px] font-bold">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>خزنة التشفير AES-256-GCM · PBKDF2-SHA256</span>
        </div>
        <h3 className="text-base sm:text-lg font-bold text-white">
          {isFirstRunSetup ? 'إنشاء رمز قفل شخصي (PIN) لحماية KuCoin' : titleAr}
        </h3>
        <p className="text-xs text-[#8A99AD] leading-relaxed max-w-md mx-auto">
          {isFirstRunSetup
            ? 'لمنع أي وصول غير مصرح به أو استخراج لمفاتيحك من التخزين المحلي، قم بإنشاء رمز PIN شخصي (6 إلى 8 أرقام). يُستخدم الرمز لتشفير مفاتيح KuCoin السرية محلياً.'
            : subtitleAr}
        </p>
      </div>

      {isFirstRunSetup ? (
        <form onSubmit={handleFirstRunSetup} className="space-y-3.5">
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#EAECEF] font-bold">
                رمز PIN الجديد (6 إلى 8 أرقام)
              </label>
              <button
                type="button"
                onClick={() => setShowPinDigits(!showPinDigits)}
                className="text-[11px] text-[#8A99AD] hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {showPinDigits ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPinDigits ? 'إخفاء' : 'إظهار'}</span>
              </button>
            </div>
            <input
              type={showPinDigits ? 'text' : 'password'}
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => {
                setErrorMsg(null);
                setPinInput(normalizePinDigits(e.target.value).slice(0, 8));
              }}
              placeholder="مثال: 6 أرقام غير متكررة"
              data-testid="kucoin_setup_pin_input"
              className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-3 py-2 text-center text-sm text-white font-mono tracking-widest focus:outline-none"
            />
            <div>
              <label className="block text-xs text-[#EAECEF] font-bold mb-1.5">
                تأكيد رمز PIN
              </label>
              <input
                type={showPinDigits ? 'text' : 'password'}
                inputMode="numeric"
                value={setupConfirmInput}
                onChange={(e) => {
                  setErrorMsg(null);
                  setSetupConfirmInput(normalizePinDigits(e.target.value).slice(0, 8));
                }}
                placeholder="أعد إدخال نفس الرمز"
                data-testid="kucoin_setup_pin_confirm_input"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-3 py-2 text-center text-sm text-white font-mono tracking-widest focus:outline-none"
              />
            </div>
          </div>

          {errorMsg && (
            <div
              data-testid="kucoin_pin_error_banner"
              className="bg-[#2B1216] border border-[#F6465D]/50 text-[#F6465D] rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-2">
            <button
              type="submit"
              disabled={isVerifying || pinInput.length < 6 || setupConfirmInput.length < 6}
              data-testid="kucoin_setup_pin_submit_btn"
              className="w-full sm:flex-1 bg-[#01BC8D] hover:bg-[#00D49F] disabled:opacity-40 text-[#0B0E11] font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isVerifying ? 'جاري التشفير...' : 'إنشاء القفل وفتح خزنة KuCoin'}</span>
            </button>
            {onCancelOrFallback && (
              <button
                type="button"
                onClick={onCancelOrFallback}
                data-testid="kucoin_lock_cancel_btn"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#1A222B] hover:bg-[#232E3A] border border-[#232E3A] text-xs font-semibold text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
              >
                {cancelLabelAr}
              </button>
            )}
          </div>
        </form>
      ) : (
        /* Existing PIN Verification & Brute-Force Lockout Screen */
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-[#8A99AD] font-semibold flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[#01BC8D]" />
              <span>أدخل رمز القفل الشخصي (PIN)</span>
            </span>

            <button
              type="button"
              onClick={() => setShowPinDigits(!showPinDigits)}
              className="text-[11px] text-[#8A99AD] hover:text-white flex items-center gap-1 cursor-pointer"
            >
              {showPinDigits ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPinDigits ? 'إخفاء' : 'إظهار'}</span>
            </button>
          </div>

          {isLockedOut && (
            <div
              data-testid="kucoin_pin_lockout_banner"
              className="bg-[#2B1216] border border-[#F6465D]/60 text-[#F6465D] rounded-xl px-3.5 py-2.5 text-xs font-bold flex items-center justify-center gap-2"
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                تم تفعيل قفل الحماية من التخمين — حاول مجدداً بعد {lockRemainingSec} ثانية
              </span>
            </div>
          )}

          {/* Visual PIN Dots / Direct Input Box */}
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3 flex flex-col items-center gap-2.5">
            <div className="flex items-center justify-center gap-2" dir="ltr">
              {Array.from({ length: Math.max(6, pinInput.length) }).map((_, idx) => {
                const char = pinInput[idx];
                const isFilled = Boolean(char);
                return (
                  <div
                    key={idx}
                    className={`w-9 h-10 rounded-xl border-2 flex items-center justify-center font-mono text-base font-bold transition-all ${
                      isFilled
                        ? 'border-[#01BC8D] bg-[#0D2B24] text-[#01BC8D]'
                        : 'border-[#232E3A] bg-[#12171D] text-[#8A99AD]'
                    }`}
                  >
                    {isFilled ? (showPinDigits ? char : '●') : ''}
                  </div>
                );
              })}
            </div>

            <input
              type={showPinDigits ? 'text' : 'password'}
              inputMode="numeric"
              disabled={isLockedOut || isVerifying}
              value={pinInput}
              onChange={(e) => {
                setErrorMsg(null);
                setPinInput(normalizePinDigits(e.target.value).slice(0, 8));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pinInput.length >= 4) {
                  e.preventDefault();
                  void handleVerifyPin(pinInput);
                }
              }}
              placeholder="أدخل رمز PIN واضغط فتح..."
              data-testid="kucoin_pin_direct_input"
              className="w-full max-w-[240px] bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] disabled:opacity-40 rounded-lg px-3 py-1.5 text-center text-xs text-white font-mono tracking-widest focus:outline-none"
            />
          </div>

          {errorMsg && (
            <div
              data-testid="kucoin_pin_error_banner"
              className="bg-[#2B1216] border border-[#F6465D]/50 text-[#F6465D] rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2" dir="ltr">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={isLockedOut || isVerifying}
                onClick={() => handleAppendDigit(digit)}
                data-testid={`kucoin_pin_key_${digit}`}
                className="h-11 rounded-xl bg-[#0B0E11] hover:bg-[#1A222B] active:bg-[#0D2B24] disabled:opacity-40 border border-[#232E3A] hover:border-[#01BC8D]/50 text-white font-mono text-base font-bold transition-all cursor-pointer active:scale-95"
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              disabled={isLockedOut || isVerifying}
              onClick={handleClearPin}
              data-testid="kucoin_pin_key_clear"
              className="h-11 rounded-xl bg-[#1A222B] hover:bg-[#232E3A] disabled:opacity-40 border border-[#232E3A] text-xs font-bold text-[#8A99AD] hover:text-white transition-all cursor-pointer"
            >
              مسح
            </button>

            <button
              type="button"
              disabled={isLockedOut || isVerifying}
              onClick={() => handleAppendDigit('0')}
              data-testid="kucoin_pin_key_0"
              className="h-11 rounded-xl bg-[#0B0E11] hover:bg-[#1A222B] active:bg-[#0D2B24] disabled:opacity-40 border border-[#232E3A] hover:border-[#01BC8D]/50 text-white font-mono text-base font-bold transition-all cursor-pointer active:scale-95"
            >
              0
            </button>

            <button
              type="button"
              disabled={isLockedOut || isVerifying}
              onClick={handleBackspace}
              data-testid="kucoin_pin_key_backspace"
              className="h-11 rounded-xl bg-[#1A222B] hover:bg-[#232E3A] disabled:opacity-40 border border-[#232E3A] text-[#8A99AD] hover:text-white flex items-center justify-center transition-all cursor-pointer"
              title="حذف رقم"
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleVerifyPin(pinInput)}
              disabled={pinInput.length < 4 || isLockedOut || isVerifying}
              data-testid="kucoin_pin_unlock_submit_btn"
              className="w-full sm:flex-1 bg-[#01BC8D] hover:bg-[#00D49F] disabled:opacity-40 text-[#0B0E11] font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>{isVerifying ? 'جاري التحقق...' : 'فتح تبويب التنفيذ المباشر (KuCoin)'}</span>
            </button>

            {onCancelOrFallback && (
              <button
                type="button"
                onClick={onCancelOrFallback}
                data-testid="kucoin_lock_cancel_btn"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#1A222B] hover:bg-[#232E3A] border border-[#232E3A] text-xs font-semibold text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
              >
                {cancelLabelAr}
              </button>
            )}
          </div>

          {onOpenSettingsTab && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={onOpenSettingsTab}
                className="text-[11px] text-[#8A99AD] hover:text-[#01BC8D] underline cursor-pointer inline-flex items-center gap-1"
              >
                <Settings className="w-3 h-3" />
                <span>إدارة خيارات رمز القفل الرقمي (PIN) من الإعدادات</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface KuCoinSecurityConfigModalProps {
  isOpen: boolean;
  config: KuCoinSecurityLockConfig;
  onClose: () => void;
  onUpdateConfig: (partial: Partial<KuCoinSecurityLockConfig>) => void;
}

export const KuCoinSecurityConfigModal: React.FC<KuCoinSecurityConfigModalProps> = ({
  isOpen,
  config,
  onClose,
  onUpdateConfig,
}) => {
  const [currentPin, setCurrentPin] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const isFirstSetup = needsInitialPinSetup(config);

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setFeedback(null);

    try {
      if (isFirstSetup) {
        const res = await setupInitialPinAsync(newPin, confirmPin);
        if (!res.valid || !res.newPinHash) {
          setFeedback({ type: 'error', text: res.errorAr || 'خطأ في إنشاء رمز PIN' });
          return;
        }
        onUpdateConfig({ pinHash: res.newPinHash, isPinConfigured: true, enabled: true });
        setNewPin('');
        setConfirmPin('');
        setFeedback({
          type: 'success',
          text: 'تم إنشاء رمز PIN مشفّر بـ PBKDF2-SHA256 لحماية محفظة KuCoin بنجاح.',
        });
        return;
      }

      const res = await validatePinChangeAsync(
        currentPin,
        config.pinHash || '',
        newPin,
        confirmPin
      );
      if (!res.valid || !res.newPinHash || !res.normalizedCurrentPin || !res.normalizedNewPin) {
        setFeedback({ type: 'error', text: res.errorAr || 'خطأ في التحقق من الرمز' });
        return;
      }

      // Re-encrypt AES-256-GCM stored KuCoin secrets under the new PIN
      await reencryptKuCoinSecretsOnPinChange(res.normalizedCurrentPin, res.normalizedNewPin);
      onUpdateConfig({ pinHash: res.newPinHash, isPinConfigured: true, enabled: true });
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setFeedback({
        type: 'success',
        text: 'تم تحديث رمز PIN وإعادة تشفير مفاتيح KuCoin السرية بنجاح.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        data-testid="kucoin_security_config_modal"
        className="bg-[#12171D] border border-[#01BC8D]/40 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-[#232E3A] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#01BC8D]" />
            <h3 className="text-sm sm:text-base font-bold text-white">
              إعدادات خزنة الأمان (PIN + AES-256)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#8A99AD] hover:text-white hover:bg-[#1A222B] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {feedback && (
          <div
            className={`rounded-xl p-3 text-xs font-bold flex items-center gap-2 border ${
              feedback.type === 'success'
                ? 'bg-[#0D2B24] border-[#01BC8D]/50 text-[#01BC8D]'
                : 'bg-[#2B1216] border-[#F6465D]/50 text-[#F6465D]'
            }`}
          >
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Toggles */}
        <div className="space-y-2.5">
          <label className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">
                تفعيل قفل الأمان والتشفير (PIN) لتبويب KuCoin
              </div>
              <div className="text-[10px] text-[#8A99AD]">
                تشفير المفاتيح بـ AES-256-GCM وطلب رمز PIN مع حماية ضد التخمين
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => {
                onUpdateConfig({ enabled: e.target.checked });
                setFeedback({
                  type: 'success',
                  text: e.target.checked
                    ? 'تم تفعيل قفل الأمان الرقمي (PIN) للمحفظة الحقيقية'
                    : 'تم إيقاف قفل الأمان مؤقتاً',
                });
              }}
              className="w-4 h-4 accent-[#01BC8D] shrink-0 cursor-pointer"
            />
          </label>
        </div>

        {/* Change / Create PIN Form */}
        <form
          onSubmit={handleSaveNewPin}
          className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3.5 space-y-3"
        >
          <div className="text-xs font-bold text-[#01BC8D]">
            {isFirstSetup ? 'إنشاء رمز PIN جديد (6-8 أرقام)' : 'تغيير رمز القفل الرقمي (PIN Code)'}
          </div>

          <div className={`grid grid-cols-1 ${isFirstSetup ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-2`}>
            {!isFirstSetup && (
              <div>
                <label className="block text-[10px] text-[#8A99AD] mb-1">الرمز الحالي</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(normalizePinDigits(e.target.value).slice(0, 8))}
                  placeholder="******"
                  className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-center focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-[10px] text-[#8A99AD] mb-1">الرمز الجديد (6-8 أرقام)</label>
              <input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(normalizePinDigits(e.target.value).slice(0, 8))}
                placeholder="6-8 أرقام"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-center focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#8A99AD] mb-1">تأكيد الرمز الجديد</label>
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(normalizePinDigits(e.target.value).slice(0, 8))}
                placeholder="تأكيد الرمز"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-center focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-[#01BC8D] hover:bg-[#00D49F] disabled:opacity-50 text-[#0B0E11] font-bold py-2 rounded-lg text-xs cursor-pointer transition-colors"
          >
            {isSaving ? 'جاري التشفير...' : 'حفظ رمز PIN الجديد'}
          </button>
        </form>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#1A222B] hover:bg-[#232E3A] text-xs font-semibold text-white cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
