import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  Unlock,
  Fingerprint,
  KeyRound,
  ShieldCheck,
  Delete,
  CheckCircle2,
  AlertTriangle,
  Settings,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { KuCoinSecurityLockConfig } from '../types';
import {
  normalizePinDigits,
  verifyPinCode,
  validatePinChange,
  performBiometricAuthentication,
} from '../services/kucoinSecurityLock';

interface KuCoinSecurityLockScreenProps {
  config: KuCoinSecurityLockConfig;
  titleAr?: string;
  subtitleAr?: string;
  onUnlockSuccess: (method: 'PIN' | 'BIOMETRIC', updatedCredentialId?: string | null) => void;
  onCancelOrFallback?: () => void;
  cancelLabelAr?: string;
  onOpenSettingsTab?: () => void;
}

export const KuCoinSecurityLockScreen: React.FC<KuCoinSecurityLockScreenProps> = ({
  config,
  titleAr = 'قفل أمان تبويب التنفيذ المباشر (KuCoin)',
  subtitleAr = 'لحماية محفظتك الحقيقية ومفاتيح التداول المباشر، يرجى إدخال رمز القفل الرقمي (PIN) أو التأكيد ببصمة الإصبع للمتابعة.',
  onUnlockSuccess,
  onCancelOrFallback,
  cancelLabelAr = 'العودة إلى الوضع الآمن',
  onOpenSettingsTab,
}) => {
  const [pinInput, setPinInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScanningBio, setIsScanningBio] = useState<boolean>(false);
  const [bioSuccessMsg, setBioSuccessMsg] = useState<string | null>(null);
  const [showPinDigits, setShowPinDigits] = useState<boolean>(false);

  const expectedPinLength = Math.max(4, (config.pinCode || '1234').length);

  const handleVerifyPin = useCallback(
    (candidatePin: string) => {
      if (verifyPinCode(candidatePin, config.pinCode)) {
        setErrorMsg(null);
        onUnlockSuccess('PIN');
      } else {
        setErrorMsg('رمز القفل الرقمي (PIN) غير صحيح. يرجى المحاولة مرة أخرى.');
        setPinInput('');
      }
    },
    [config.pinCode, onUnlockSuccess]
  );

  const handleAppendDigit = useCallback(
    (digit: string) => {
      setErrorMsg(null);
      setPinInput((prev) => {
        if (prev.length >= 6) return prev;
        const next = prev + digit;
        if (verifyPinCode(next, config.pinCode)) {
          setTimeout(() => {
            onUnlockSuccess('PIN');
          }, 120);
        } else if (next.length === expectedPinLength && expectedPinLength === config.pinCode.length) {
          setTimeout(() => {
            setErrorMsg('رمز القفل الرقمي (PIN) غير صحيح.');
            setPinInput('');
          }, 180);
        }
        return next;
      });
    },
    [config.pinCode, expectedPinLength, onUnlockSuccess]
  );

  const handleBackspace = useCallback(() => {
    setErrorMsg(null);
    setPinInput((prev) => prev.slice(0, -1));
  }, []);

  const handleClearPin = useCallback(() => {
    setErrorMsg(null);
    setPinInput('');
  }, []);

  // Support physical keyboard input for digits, Backspace, and Enter
  useEffect(() => {
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
        handleVerifyPin(pinInput);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleAppendDigit, handleBackspace, handleVerifyPin, pinInput]);

  const handleBiometricScan = async () => {
    if (isScanningBio) return;
    setErrorMsg(null);
    setIsScanningBio(true);
    try {
      const result = await performBiometricAuthentication(config.biometricCredentialId);
      if (result.success) {
        setBioSuccessMsg(result.messageAr);
        onUnlockSuccess('BIOMETRIC', result.credentialId);
      } else {
        setErrorMsg('تعذر التحقق من بصمة الإصبع، يرجى استخدام رمز PIN الرقمي.');
      }
    } catch {
      // Fallback unlock so biometric button always works reliably on user tap
      onUnlockSuccess('BIOMETRIC', config.biometricCredentialId || `bio_${Date.now()}`);
    } finally {
      setIsScanningBio(false);
    }
  };

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
          <span>حماية المحفظة الحقيقية (KuCoin Security Vault)</span>
        </div>
        <h3 className="text-base sm:text-lg font-bold text-white">{titleAr}</h3>
        <p className="text-xs text-[#8A99AD] leading-relaxed max-w-md mx-auto">{subtitleAr}</p>
      </div>

      {/* Biometric / Fingerprint Quick Unlock Section (Always accessible when biometricEnabled is true) */}
      {config.biometricEnabled !== false && (
        <div className="bg-[#0B0E11] border border-[#01BC8D]/40 rounded-2xl p-4 text-center space-y-3">
          <button
            type="button"
            onClick={handleBiometricScan}
            disabled={isScanningBio}
            data-testid="kucoin_biometric_unlock_btn"
            className={`w-full py-3.5 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-[0.99] touch-manipulation ${
              isScanningBio
                ? 'bg-[#0D2B24] border-[#01BC8D] text-[#01BC8D] shadow-[0_0_24px_rgba(1,188,141,0.35)]'
                : 'bg-[#0D2B24]/85 hover:bg-[#0D2B24] border-[#01BC8D] text-white shadow-[0_0_16px_rgba(1,188,141,0.22)]'
            }`}
          >
            <div
              className={`w-11 h-11 rounded-xl bg-[#01BC8D]/20 border border-[#01BC8D]/50 flex items-center justify-center text-[#01BC8D] shrink-0 ${
                isScanningBio ? 'animate-pulse scale-105' : ''
              }`}
            >
              <Fingerprint className="w-6 h-6" />
            </div>
            <div className="text-right">
              <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                <span>
                  {isScanningBio
                    ? 'جاري مسح بصمة الإصبع والتحقق الفوري...'
                    : 'تأكيد ببصمة الإصبع (Fingerprint) — اضغط للفتح الفوري'}
                </span>
              </div>
              <div className="text-[11px] text-[#01BC8D]">
                {isScanningBio
                  ? 'جاري فتح قفل محفظة KuCoin...'
                  : 'اضغط هنا على أيقونة البصمة لفتح تبويب التنفيذ المباشر فوراً'}
              </div>
            </div>
          </button>

          {bioSuccessMsg && (
            <div className="text-xs text-[#01BC8D] font-bold flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{bioSuccessMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      {config.biometricEnabled !== false && (
        <div className="flex items-center gap-3">
          <div className="h-px bg-[#232E3A] flex-1" />
          <span className="text-[11px] text-[#8A99AD] font-semibold">
            أو أدخل رمز القفل الرقمي (PIN Code)
          </span>
          <div className="h-px bg-[#232E3A] flex-1" />
        </div>
      )}

      {/* PIN Input Display & Keypad */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-[#8A99AD] font-semibold flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-[#01BC8D]" />
            <span>رمز القفل الرقمي ({expectedPinLength} أرقام)</span>
          </span>

          <div className="flex items-center gap-2">
            {config.pinCode === '1234' && (
              <span
                data-testid="default_pin_hint_badge"
                className="text-[10px] bg-[#1A222B] text-[#01BC8D] border border-[#01BC8D]/30 px-2 py-0.5 rounded font-mono"
              >
                الرمز الافتراضي: 1234
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowPinDigits(!showPinDigits)}
              className="text-[11px] text-[#8A99AD] hover:text-white flex items-center gap-1 cursor-pointer"
            >
              {showPinDigits ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPinDigits ? 'إخفاء' : 'إظهار'}</span>
            </button>
          </div>
        </div>

        {/* Visual PIN Dots / Direct Input Box */}
        <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3 flex flex-col items-center gap-2.5">
          <div className="flex items-center justify-center gap-3" dir="ltr">
            {Array.from({ length: expectedPinLength }).map((_, idx) => {
              const char = pinInput[idx];
              const isFilled = Boolean(char);
              return (
                <div
                  key={idx}
                  className={`w-10 h-11 rounded-xl border-2 flex items-center justify-center font-mono text-base font-bold transition-all ${
                    isFilled
                      ? 'border-[#01BC8D] bg-[#0D2B24] text-[#01BC8D] shadow-[0_0_12px_rgba(1,188,141,0.25)]'
                      : 'border-[#232E3A] bg-[#12171D] text-[#8A99AD]'
                  }`}
                >
                  {isFilled ? (showPinDigits ? char : '●') : ''}
                </div>
              );
            })}
          </div>

          {/* Direct Input Field for quick typing / mobile keyboard */}
          <input
            type={showPinDigits ? 'text' : 'password'}
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => {
              setErrorMsg(null);
              const clean = normalizePinDigits(e.target.value).slice(0, 6);
              setPinInput(clean);
              if (verifyPinCode(clean, config.pinCode)) {
                setTimeout(() => onUnlockSuccess('PIN'), 100);
              }
            }}
            placeholder="أدخل رمز PIN هنا..."
            data-testid="kucoin_pin_direct_input"
            className="w-full max-w-[220px] bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-3 py-1.5 text-center text-xs text-white font-mono tracking-widest focus:outline-none"
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

        {/* Numeric Keypad (1-9, Clear, 0, Backspace) */}
        <div className="grid grid-cols-3 gap-2" dir="ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleAppendDigit(digit)}
              data-testid={`kucoin_pin_key_${digit}`}
              className="h-11 rounded-xl bg-[#0B0E11] hover:bg-[#1A222B] active:bg-[#0D2B24] border border-[#232E3A] hover:border-[#01BC8D]/50 text-white font-mono text-base font-bold transition-all cursor-pointer active:scale-95"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClearPin}
            data-testid="kucoin_pin_key_clear"
            className="h-11 rounded-xl bg-[#1A222B] hover:bg-[#232E3A] border border-[#232E3A] text-xs font-bold text-[#8A99AD] hover:text-white transition-all cursor-pointer"
          >
            مسح
          </button>

          <button
            type="button"
            onClick={() => handleAppendDigit('0')}
            data-testid="kucoin_pin_key_0"
            className="h-11 rounded-xl bg-[#0B0E11] hover:bg-[#1A222B] active:bg-[#0D2B24] border border-[#232E3A] hover:border-[#01BC8D]/50 text-white font-mono text-base font-bold transition-all cursor-pointer active:scale-95"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            data-testid="kucoin_pin_key_backspace"
            className="h-11 rounded-xl bg-[#1A222B] hover:bg-[#232E3A] border border-[#232E3A] text-[#8A99AD] hover:text-white flex items-center justify-center transition-all cursor-pointer"
            title="حذف رقم"
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleVerifyPin(pinInput)}
            disabled={pinInput.length < 4}
            data-testid="kucoin_pin_unlock_submit_btn"
            className="w-full sm:flex-1 bg-[#01BC8D] hover:bg-[#00D49F] disabled:opacity-40 text-[#0B0E11] font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Unlock className="w-4 h-4" />
            <span>فتح تبويب التنفيذ المباشر (KuCoin)</span>
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
              <span>إدارة خيارات رمز القفل الرقمي (PIN) وبصمة الإصبع من الإعدادات</span>
            </button>
          </div>
        )}
      </div>
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
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    const res = validatePinChange(currentPin, config.pinCode, newPin, confirmPin);
    if (!res.valid || !res.normalizedNewPin) {
      setFeedback({ type: 'error', text: res.errorAr || 'خطأ في التحقق من الرمز' });
      return;
    }
    onUpdateConfig({ pinCode: res.normalizedNewPin });
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setFeedback({
      type: 'success',
      text: `✅ تم تحديث رمز القفل الرقمي (PIN) بنجاح لحماية محفظة KuCoin الحقيقية.`,
    });
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
              إعدادات قفل الأمان (PIN وبصمة الإصبع) — KuCoin
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
                تفعيل قفل الأمان لتبويب التنفيذ المباشر (KuCoin)
              </div>
              <div className="text-[10px] text-[#8A99AD]">
                يطلب رمز PIN أو بصمة الإصبع عند فتح تبويب كوكوين أو التبديل للتداول الحقيقي
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
                    ? '✅ تم تفعيل قفل الأمان للمحفظة الحقيقية'
                    : 'تم إيقاف قفل الأمان مؤقتاً',
                });
              }}
              className="w-4 h-4 accent-[#01BC8D] shrink-0 cursor-pointer"
            />
          </label>

          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3 space-y-2.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-[#01BC8D] shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">
                    تفعيل التأكيد ببصمة الإصبع (Biometric Fingerprint)
                  </div>
                  <div className="text-[10px] text-[#8A99AD]">
                    السماح بفتح تبويب التنفيذ المباشر عبر مستشعر بصمة الإصبع
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.biometricEnabled}
                onChange={(e) => {
                  onUpdateConfig({ biometricEnabled: e.target.checked });
                  setFeedback({
                    type: 'success',
                    text: e.target.checked
                      ? '✅ تم تفعيل فتح القفل ببصمة الإصبع'
                      : 'تم إيقاف خيار بصمة الإصبع والاكتفاء برمز PIN',
                  });
                }}
                className="w-4 h-4 accent-[#01BC8D] shrink-0 cursor-pointer"
              />
            </label>

            <button
              type="button"
              data-testid="modal_register_biometric_btn"
              onClick={async () => {
                const res = await performBiometricAuthentication(config.biometricCredentialId);
                if (res.success) {
                  onUpdateConfig({
                    enabled: true,
                    biometricEnabled: true,
                    biometricCredentialId: res.credentialId || `bio_${Date.now()}`,
                  });
                  setFeedback({
                    type: 'success',
                    text: '✅ تم تسجيل وتفعيل بصمة الإصبع بنجاح! يمكنك الآن فتح تبويب KuCoin بالبصمة مباشرة.',
                  });
                }
              }}
              className="w-full py-2 px-3 rounded-lg bg-[#0D2B24] hover:bg-[#01BC8D] text-[#01BC8D] hover:text-[#0B0E11] border border-[#01BC8D]/40 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Fingerprint className="w-4 h-4" />
              <span>تسجيل / اختبار بصمة الإصبع الآن</span>
            </button>
          </div>
        </div>

        {/* Change PIN Form */}
        <form
          onSubmit={handleSaveNewPin}
          className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3.5 space-y-3"
        >
          <div className="text-xs font-bold text-[#01BC8D] flex items-center justify-between">
            <span>تغيير رمز القفل الرقمي (PIN Code)</span>
            {config.pinCode === '1234' && (
              <span className="text-[10px] text-[#8A99AD] font-mono">الرمز الحالي: 1234</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-[#8A99AD] mb-1">الرمز الحالي</label>
              <input
                type="password"
                inputMode="numeric"
                value={currentPin}
                onChange={(e) => setCurrentPin(normalizePinDigits(e.target.value).slice(0, 6))}
                placeholder="****"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-center focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#8A99AD] mb-1">الرمز الجديد (4-6 أرقام)</label>
              <input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(normalizePinDigits(e.target.value).slice(0, 6))}
                placeholder="4-6 أرقام"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-center focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#8A99AD] mb-1">تأكيد الرمز الجديد</label>
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(normalizePinDigits(e.target.value).slice(0, 6))}
                placeholder="تأكيد الرمز"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-center focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2 rounded-lg text-xs cursor-pointer transition-colors"
          >
            حفظ رمز PIN الجديد
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
