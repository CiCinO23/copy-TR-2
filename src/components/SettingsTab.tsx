import React, { useState } from 'react';
import {
  Key,
  ShieldCheck,
  BellRing,
  Power,
  Cpu,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Play,
  Sparkles,
  Fingerprint,
  KeyRound,
} from 'lucide-react';
import {
  BinanceConfig,
  BinanceConnectionState,
  MobileNotificationSettings,
  AppExitBehaviorMode,
  KuCoinSecurityLockConfig,
} from '../types';
import { BINANCE_ENVIRONMENTS } from '../services/binanceApi';
import { mobileNotifications } from '../services/mobileNotifications';
import {
  DEFAULT_KUCOIN_SECURITY_CONFIG,
  normalizePinDigits,
  validatePinChange,
  performBiometricAuthentication,
} from '../services/kucoinSecurityLock';

interface SettingsTabProps {
  config: BinanceConfig;
  connectionState: BinanceConnectionState;
  notificationSettings?: MobileNotificationSettings;
  onUpdateNotificationSettings?: (partial: Partial<MobileNotificationSettings>) => void;
  securityConfig?: KuCoinSecurityLockConfig;
  onUpdateSecurityConfig?: (partial: Partial<KuCoinSecurityLockConfig>) => void;
  onLockSecurityNow?: () => void;
  onLive: () => void;
  onOpenApiSetup: () => void;
  onOpenNotifications?: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  config,
  connectionState,
  notificationSettings,
  onUpdateNotificationSettings,
  securityConfig = DEFAULT_KUCOIN_SECURITY_CONFIG,
  onUpdateSecurityConfig,
  onLockSecurityNow,
  onLive,
  onOpenApiSetup,
  onOpenNotifications,
}) => {
  const envInfo = BINANCE_ENVIRONMENTS[config.environment];
  const currentSettings = notificationSettings || mobileNotifications.getSettings();
  const appExitBehavior: AppExitBehaviorMode =
    currentSettings.appExitBehavior || 'KEEP_ALIVE_BACKGROUND';
  const lockScreenEnabled = currentSettings.lockScreenNotificationsEnabled ?? true;
  const showSensitiveDetails = currentSettings.lockScreenShowSensitiveDetails ?? true;
  const wakeLockEnabled = currentSettings.wakeLockEnabled ?? true;

  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    mobileNotifications.getBrowserPermissionStatus()
  );
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [isStoppedByFullExit, setIsStoppedByFullExit] = useState<boolean>(() =>
    mobileNotifications.isAppStoppedByFullExit()
  );

  const handleUpdate = (partial: Partial<MobileNotificationSettings>, messageAr?: string) => {
    if (onUpdateNotificationSettings) {
      onUpdateNotificationSettings(partial);
    } else {
      mobileNotifications.updateSettings(partial);
    }
    if (messageAr) {
      setStatusFeedback(messageAr);
      setTimeout(() => setStatusFeedback(null), 4000);
    }
  };

  const handleSelectExitBehavior = (mode: AppExitBehaviorMode) => {
    if (mode === 'KEEP_ALIVE_BACKGROUND') {
      mobileNotifications.resumeFromFullExit();
      setIsStoppedByFullExit(false);
      handleUpdate(
        { appExitBehavior: 'KEEP_ALIVE_BACKGROUND' },
        '✅ تم تفعيل وضع العمل في الخلفية: سيبقى التطبيق يعمل ويرسل الإشعارات حتى وإن أُقفل نهائياً.'
      );
    } else {
      handleUpdate(
        { appExitBehavior: 'FULL_EXIT' },
        '✅ تم ضبط وضع الإغلاق الكلي: سيتم إيقاف جميع العمليات الخلفية تماماً عند إغلاق التطبيق.'
      );
    }
  };

  const handleExecuteImmediateFullExit = () => {
    handleUpdate({ appExitBehavior: 'FULL_EXIT' });
    mobileNotifications.performFullAppExit();
    setIsStoppedByFullExit(true);
    setStatusFeedback(
      '🛑 تم إيقاف جميع الخدمات والعمليات الخلفية للتطبيق بالكامل.'
    );
  };

  const handleResumeAppServices = () => {
    mobileNotifications.resumeFromFullExit();
    setIsStoppedByFullExit(false);
    setStatusFeedback('✅ تم إعادة تشغيل خدمات التطبيق والمزامنة بنجاح.');
  };

  const handleTestLockScreenNotification = async () => {
    if (browserPerm !== 'granted' && browserPerm !== 'unsupported') {
      const perm = await mobileNotifications.requestBrowserPermission();
      setBrowserPerm(perm);
    }
    handleUpdate({
      enabled: true,
      lockScreenNotificationsEnabled: true,
      browserPushEnabled: true,
    });
    mobileNotifications.triggerTestNotification('OPEN_TRADE');
    setStatusFeedback(
      '🔔 تم إرسال إشعار فوري مخصص لشاشة القفل! يمكنك قفل شاشة الهاتف لمعاينة ظهور الإشعار.'
    );
  };

  // KuCoin PIN & Biometric Security State in Settings
  const [currentPinInput, setCurrentPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);
  const [isTestingFingerprint, setIsTestingFingerprint] = useState<boolean>(false);

  const handleUpdateSec = (partial: Partial<KuCoinSecurityLockConfig>, msgAr?: string) => {
    if (onUpdateSecurityConfig) {
      onUpdateSecurityConfig(partial);
    }
    if (msgAr) {
      setStatusFeedback(msgAr);
      setTimeout(() => setStatusFeedback(null), 4500);
    }
  };

  const handleSaveNewPinInSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setPinChangeError(null);
    const validation = validatePinChange(
      currentPinInput,
      securityConfig.pinCode,
      newPinInput,
      confirmPinInput
    );
    if (!validation.valid || !validation.normalizedNewPin) {
      setPinChangeError(validation.errorAr || 'خطأ في التحقق من رمز PIN');
      return;
    }
    handleUpdateSec(
      { pinCode: validation.normalizedNewPin, enabled: true },
      '✅ تم تحديث رمز القفل الرقمي (PIN Code) لحماية تبويب التنفيذ المباشر (KuCoin) بنجاح.'
    );
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
  };

  const handleTestOrEnrollFingerprint = async () => {
    if (isTestingFingerprint) return;
    setIsTestingFingerprint(true);
    try {
      const res = await performBiometricAuthentication(securityConfig.biometricCredentialId);
      if (res.success) {
        handleUpdateSec(
          {
            biometricEnabled: true,
            biometricCredentialId: res.credentialId || securityConfig.biometricCredentialId,
          },
          `✅ ${res.messageAr}`
        );
      }
    } finally {
      setIsTestingFingerprint(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide">
          الإعدادات وإدارة المخاطر
        </h2>
        <p className="text-xs text-[#8A99AD] mt-0.5">
          ضبط سلوك إغلاق التطبيق أو عمله في الخلفية، إشعارات شاشة القفل، ومعايير الأمان والربط المباشر
        </p>
      </div>

      {statusFeedback && (
        <div
          data-testid="settings_status_feedback"
          className="bg-[#0D2B24] border border-[#01BC8D] text-[#01BC8D] px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2"
        >
          <span>{statusFeedback}</span>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            className="text-[11px] text-white/80 hover:text-white cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* 1. Background Mode vs Full Exit Card */}
      <div
        data-testid="settings_background_mode_card"
        className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#232E3A] pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                appExitBehavior === 'KEEP_ALIVE_BACKGROUND' && !isStoppedByFullExit
                  ? 'bg-[#0D2B24] border-[#01BC8D]/50 text-[#01BC8D]'
                  : 'bg-[#3A1219] border-[#F6465D]/50 text-[#F6465D]'
              }`}
            >
              {appExitBehavior === 'KEEP_ALIVE_BACKGROUND' && !isStoppedByFullExit ? (
                <Cpu className="w-5 h-5" />
              ) : (
                <Power className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                <span>وضع إغلاق التطبيق أو العمل في الخلفية</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                    isStoppedByFullExit
                      ? 'bg-[#3A1219] text-[#F6465D] border border-[#F6465D]/40'
                      : appExitBehavior === 'KEEP_ALIVE_BACKGROUND'
                      ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40'
                      : 'bg-[#3B2606] text-[#FBBF24] border border-[#F59E0B]/40'
                  }`}
                >
                  {isStoppedByFullExit
                    ? 'متوقف كلياً'
                    : appExitBehavior === 'KEEP_ALIVE_BACKGROUND'
                    ? 'يعمل في الخلفية دائماً'
                    : 'إغلاق كلي عند الخروج'}
                </span>
              </h3>
              <p className="text-[11px] text-[#8A99AD] mt-0.5">
                اختر بين ترك التطبيق يعمل في الخلفية حتى وإن أُقفل نهائياً لمتابعة الصفقات، أو الإغلاق الكلي للتطبيق
              </p>
            </div>
          </div>
        </div>

        {/* Two Choice Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Option A: Keep Alive in Background */}
          <button
            type="button"
            data-testid="mode_keep_alive_background_btn"
            onClick={() => handleSelectExitBehavior('KEEP_ALIVE_BACKGROUND')}
            className={`text-right rounded-xl p-3.5 border-2 transition-all cursor-pointer flex flex-col justify-between gap-2 ${
              appExitBehavior === 'KEEP_ALIVE_BACKGROUND' && !isStoppedByFullExit
                ? 'bg-[#0D2B24]/90 border-[#01BC8D] shadow-[0_0_18px_rgba(1,188,141,0.18)]'
                : 'bg-[#0B0E11] border-[#232E3A] hover:border-[#01BC8D]/50'
            }`}
          >
            <div className="flex items-start justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                <Cpu
                  className={`w-4 h-4 shrink-0 ${
                    appExitBehavior === 'KEEP_ALIVE_BACKGROUND' && !isStoppedByFullExit
                      ? 'text-[#01BC8D]'
                      : 'text-[#8A99AD]'
                  }`}
                />
                <span className="text-xs sm:text-sm font-bold text-white">
                  تركه يعمل في الخلفية (حتى وإن أُقفل نهائياً)
                </span>
              </div>
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                  appExitBehavior === 'KEEP_ALIVE_BACKGROUND' && !isStoppedByFullExit
                    ? 'border-[#01BC8D] bg-[#01BC8D] text-[#0B0E11]'
                    : 'border-[#8A99AD]'
                }`}
              >
                {appExitBehavior === 'KEEP_ALIVE_BACKGROUND' && !isStoppedByFullExit && (
                  <CheckCircle2 className="w-3 h-3" />
                )}
              </span>
            </div>
            <p className="text-[11px] text-[#8A99AD] leading-relaxed">
              يبقي محرك النسخ ومراقبة الصفقات ونسبة التراجع (Drawdown) نشطاً في الخلفية عبر خدمة النظام المستمرة لإرسال الإشعارات الفورية حتى بعد إغلاق التطبيق نهائياً.
            </p>
          </button>

          {/* Option B: Full App Exit */}
          <button
            type="button"
            data-testid="mode_full_exit_btn"
            onClick={() => handleSelectExitBehavior('FULL_EXIT')}
            className={`text-right rounded-xl p-3.5 border-2 transition-all cursor-pointer flex flex-col justify-between gap-2 ${
              appExitBehavior === 'FULL_EXIT' || isStoppedByFullExit
                ? 'bg-[#2B1216]/90 border-[#F6465D] shadow-[0_0_18px_rgba(246,70,93,0.18)]'
                : 'bg-[#0B0E11] border-[#232E3A] hover:border-[#F6465D]/50'
            }`}
          >
            <div className="flex items-start justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                <Power
                  className={`w-4 h-4 shrink-0 ${
                    appExitBehavior === 'FULL_EXIT' || isStoppedByFullExit
                      ? 'text-[#F6465D]'
                      : 'text-[#8A99AD]'
                  }`}
                />
                <span className="text-xs sm:text-sm font-bold text-white">
                  الإغلاق الكلي للتطبيق عند الخروج
                </span>
              </div>
              <span
                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                  appExitBehavior === 'FULL_EXIT' || isStoppedByFullExit
                    ? 'border-[#F6465D] bg-[#F6465D] text-white'
                    : 'border-[#8A99AD]'
                }`}
              >
                {(appExitBehavior === 'FULL_EXIT' || isStoppedByFullExit) && (
                  <CheckCircle2 className="w-3 h-3" />
                )}
              </span>
            </div>
            <p className="text-[11px] text-[#8A99AD] leading-relaxed">
              إيقاف شامل وفوري لجميع العمليات الخلفية والمزامنة والاتصالات بمجرد إغلاق التطبيق لتوفير البطارية والبيانات بالكامل.
            </p>
          </button>
        </div>

        {/* Sub-controls for Background Wake Lock & Immediate Full Exit Button */}
        <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              data-testid="toggle_wake_lock"
              checked={wakeLockEnabled}
              onChange={(e) =>
                handleUpdate(
                  { wakeLockEnabled: e.target.checked },
                  e.target.checked
                    ? '✅ تم تفعيل منع خمول المعالج أثناء العمل في الخلفية'
                    : 'تم إيقاف منع خمول المعالج'
                )
              }
              className="w-4 h-4 accent-[#01BC8D] cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold text-white">
                منع خمول الهاتف وتجميد العمليات أثناء العمل في الخلفية (Wake Lock)
              </div>
              <div className="text-[10px] text-[#8A99AD]">
                يضمن استمرار تدفق الأسعار اللحظية وفحص الصفقات دون انقطاع
              </div>
            </div>
          </label>

          {isStoppedByFullExit ? (
            <button
              type="button"
              data-testid="resume_app_services_btn"
              onClick={handleResumeAppServices}
              className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>إعادة تشغيل خدمات التطبيق</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="immediate_full_exit_btn"
              onClick={handleExecuteImmediateFullExit}
              className="bg-[#3A1219] hover:bg-[#F6465D] text-[#F6465D] hover:text-white border border-[#F6465D]/50 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
            >
              <Power className="w-3.5 h-3.5" />
              <span>إغلاق التطبيق كلياً الآن</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Lock Screen Notifications Card (خاصية الإشعارات في شاشة القفل) */}
      <div
        data-testid="settings_lockscreen_notifications_card"
        className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#232E3A] pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                lockScreenEnabled
                  ? 'bg-[#0D2B24] border-[#01BC8D]/50 text-[#01BC8D]'
                  : 'bg-[#1A222B] border-[#232E3A] text-[#8A99AD]'
              }`}
            >
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                <span>الإشعارات في شاشة القفل (Lock Screen Notifications)</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                    lockScreenEnabled
                      ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40'
                      : 'bg-[#3A1219] text-[#F6465D] border border-[#F6465D]/40'
                  }`}
                >
                  {lockScreenEnabled ? 'مفعّلة على شاشة القفل' : 'غير مفعّلة'}
                </span>
              </h3>
              <p className="text-[11px] text-[#8A99AD] mt-0.5">
                إظهار تنبيهات فتح الصفقات، التدعيم، الإغلاق، وتنبيه التراجع (Drawdown) مباشرة على شاشة قفل الهاتف
              </p>
            </div>
          </div>

          <input
            type="checkbox"
            data-testid="toggle_lockscreen_notifications"
            checked={lockScreenEnabled}
            onChange={(e) =>
              handleUpdate(
                { lockScreenNotificationsEnabled: e.target.checked },
                e.target.checked
                  ? '✅ تم تفعيل ظهور الإشعارات الفورية على شاشة القفل'
                  : 'تم إيقاف إشعارات شاشة القفل'
              )
            }
            className="w-5 h-5 accent-[#01BC8D] cursor-pointer shrink-0 mt-1"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Toggle: Show Full Financial Details on Lock Screen */}
          <label className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3 flex items-start justify-between gap-2.5 cursor-pointer">
            <div className="flex items-start gap-2">
              {showSensitiveDetails ? (
                <Eye className="w-4 h-4 text-[#01BC8D] shrink-0 mt-0.5" />
              ) : (
                <EyeOff className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-xs font-bold text-white">
                  إظهار التفاصيل المالية الكاملة على شاشة القفل
                </div>
                <div className="text-[10px] text-[#8A99AD] mt-0.5">
                  {showSensitiveDetails
                    ? 'يعرض السعر، قيمة الصفقة، صافي الربح/الخسارة، ونسبة التراجع على شاشة القفل'
                    : 'يخفي المبالغ المالية والرصيد على شاشة القفل لحماية الخصوصية'}
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle_lockscreen_sensitive_details"
              checked={showSensitiveDetails}
              onChange={(e) =>
                handleUpdate(
                  { lockScreenShowSensitiveDetails: e.target.checked },
                  e.target.checked
                    ? '✅ سيتم عرض التفاصيل المالية الكاملة على شاشة القفل'
                    : '🔒 تم إخفاء المبالغ الحساسة على شاشة القفل للخصوصية'
                )
              }
              className="w-4 h-4 accent-[#01BC8D] cursor-pointer shrink-0 mt-0.5"
            />
          </label>

          {/* Test Lock Screen Notification Button */}
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3 flex flex-col justify-between gap-2">
            <div className="text-[11px] text-[#8A99AD] flex items-center justify-between">
              <span>صلاحية إشعارات النظام وشاشة القفل:</span>
              <strong
                className={
                  browserPerm === 'granted' ? 'text-[#01BC8D]' : 'text-[#F59E0B]'
                }
              >
                {browserPerm === 'granted' ? 'ممنوحة وجاهزة ✅' : 'تحتاج تفعيل 🔔'}
              </strong>
            </div>

            <button
              type="button"
              data-testid="test_lockscreen_notification_btn"
              onClick={handleTestLockScreenNotification}
              className="w-full bg-[#0D2B24] hover:bg-[#01BC8D]/25 text-[#01BC8D] border border-[#01BC8D]/50 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>🔒 تجربة إشعار شاشة القفل الآن</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. KuCoin Real Wallet PIN Code & Fingerprint Security Card (قفل أمان تبويب التنفيذ المباشر KuCoin) */}
      <div
        data-testid="settings_kucoin_security_lock_card"
        className="bg-[#12171D] border border-[#01BC8D]/40 rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#232E3A] pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                securityConfig.enabled
                  ? 'bg-[#0D2B24] border-[#01BC8D]/50 text-[#01BC8D]'
                  : 'bg-[#1A222B] border-[#232E3A] text-[#8A99AD]'
              }`}
            >
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                <span>قفل أمان تبويب التنفيذ المباشر والمحفظة الحقيقية (KuCoin PIN & بصمة الإصبع)</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                    securityConfig.enabled
                      ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40'
                      : 'bg-[#3A1219] text-[#F6465D] border border-[#F6465D]/40'
                  }`}
                >
                  {securityConfig.enabled ? 'مفعّل لحماية المحفظة' : 'غير مفعّل'}
                </span>
              </h3>
              <p className="text-[11px] text-[#8A99AD] mt-0.5">
                طلب رمز قفل رقمي (PIN Code) أو تأكيد ببصمة الإصبع عند فتح تبويب التنفيذ المباشر (KuCoin) أو التبديل للتداول الحقيقي
              </p>
            </div>
          </div>

          <input
            type="checkbox"
            data-testid="toggle_kucoin_security_lock"
            checked={securityConfig.enabled}
            onChange={(e) =>
              handleUpdateSec(
                { enabled: e.target.checked },
                e.target.checked
                  ? '✅ تم تفعيل قفل الأمان (PIN + بصمة الإصبع) لتبويب التنفيذ المباشر (KuCoin)'
                  : 'تم إيقاف قفل الأمان لتبويب التنفيذ المباشر (KuCoin)'
              )
            }
            className="w-5 h-5 accent-[#01BC8D] cursor-pointer shrink-0 mt-1"
          />
        </div>

        {/* Biometric Fingerprint & Lock Scope Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Fingerprint Confirmation Toggle & Test */}
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3.5 flex flex-col justify-between gap-3">
            <label className="flex items-start justify-between gap-2.5 cursor-pointer">
              <div className="flex items-start gap-2">
                <Fingerprint className="w-4 h-4 text-[#01BC8D] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-white">
                    تأكيد ببصمة الإصبع (Fingerprint / Biometric)
                  </div>
                  <div className="text-[10px] text-[#8A99AD] mt-0.5 leading-relaxed">
                    السماح بفتح تبويب التنفيذ المباشر (KuCoin) والمحفظة الحقيقية عبر بصمة الإصبع بالإضافة إلى رمز PIN
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle_kucoin_biometric"
                checked={securityConfig.biometricEnabled}
                onChange={(e) =>
                  handleUpdateSec(
                    { biometricEnabled: e.target.checked },
                    e.target.checked
                      ? '✅ تم تفعيل خيار التأكيد ببصمة الإصبع لتبويب KuCoin'
                      : 'تم إيقاف بصمة الإصبع والاكتفاء برمز PIN الرقمي'
                  )
                }
                className="w-4 h-4 accent-[#01BC8D] cursor-pointer shrink-0 mt-0.5"
              />
            </label>

            <button
              type="button"
              onClick={handleTestOrEnrollFingerprint}
              disabled={isTestingFingerprint}
              data-testid="settings_test_fingerprint_btn"
              className="w-full bg-[#0D2B24] hover:bg-[#01BC8D]/25 text-[#01BC8D] border border-[#01BC8D]/50 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Fingerprint className="w-3.5 h-3.5" />
              <span>
                {isTestingFingerprint
                  ? 'جاري فحص مستشعر بصمة الإصبع...'
                  : 'تسجيل / تجربة بصمة الإصبع الآن'}
              </span>
            </button>
          </div>

          {/* Lock Scope & Protect Real Mode Switch */}
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-white mb-1">
                متى يُطلب رمز PIN أو بصمة الإصبع؟
              </label>
              <select
                value={securityConfig.lockScope}
                onChange={(e) =>
                  handleUpdateSec(
                    {
                      lockScope:
                        e.target.value === 'SESSION_TIMEOUT'
                          ? 'SESSION_TIMEOUT'
                          : 'ALWAYS_ON_TAB_OPEN',
                    },
                    '✅ تم تحديث سياسة إعادة قفل تبويب التنفيذ المباشر (KuCoin)'
                  )
                }
                data-testid="select_kucoin_lock_scope"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="ALWAYS_ON_TAB_OPEN">
                  عند كل فتح لتبويب التنفيذ المباشر (KuCoin) — أمان أقصى
                </option>
                <option value="SESSION_TIMEOUT">
                  بعد انتهاء مهلة الجلسة ({securityConfig.sessionTimeoutMinutes} دقائق)
                </option>
              </select>
            </div>

            <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
              <span className="text-[11px] text-[#8A99AD]">
                حماية زر التبديل إلى التداول الحقيقي (REAL) في نافذة التداول
              </span>
              <input
                type="checkbox"
                checked={securityConfig.protectRealTradingSwitch}
                onChange={(e) =>
                  handleUpdateSec(
                    { protectRealTradingSwitch: e.target.checked },
                    e.target.checked
                      ? '✅ تمت حماية زر التبديل إلى التداول الحقيقي برمز PIN والبصمة'
                      : 'تم إلغاء قفل زر التبديل للتداول الحقيقي'
                  )
                }
                className="w-4 h-4 accent-[#01BC8D] cursor-pointer shrink-0"
              />
            </label>

            {onLockSecurityNow && (
              <button
                type="button"
                onClick={() => {
                  onLockSecurityNow();
                  setStatusFeedback('🔒 تم قفل تبويب التنفيذ المباشر (KuCoin) والمحفظة الحقيقية فوراً.');
                }}
                data-testid="settings_lock_kucoin_now_btn"
                className="w-full bg-[#1A222B] hover:bg-[#232E3A] text-white border border-[#232E3A] font-bold py-1.5 px-3 rounded-lg text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Lock className="w-3.5 h-3.5 text-[#01BC8D]" />
                <span>قفل تبويب التنفيذ المباشر (KuCoin) الآن</span>
              </button>
            )}
          </div>
        </div>

        {/* Change PIN Code Form */}
        <form
          onSubmit={handleSaveNewPinInSettings}
          className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3.5 space-y-3"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs font-bold text-[#01BC8D] flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" />
              <span>تعيين أو تغيير رمز القفل الرقمي (PIN Code — من 4 إلى 6 أرقام)</span>
            </div>
            {securityConfig.pinCode === '1234' && (
              <span className="text-[10px] bg-[#1A222B] text-[#01BC8D] border border-[#01BC8D]/30 px-2 py-0.5 rounded font-mono">
                الرمز الافتراضي الحالي: 1234
              </span>
            )}
          </div>

          {pinChangeError && (
            <div className="text-xs text-[#F6465D] bg-[#2B1216] border border-[#F6465D]/40 rounded-lg px-3 py-2 font-bold">
              {pinChangeError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[10px] text-[#8A99AD] mb-1">رمز PIN الحالي</label>
              <input
                type="password"
                inputMode="numeric"
                value={currentPinInput}
                onChange={(e) => setCurrentPinInput(normalizePinDigits(e.target.value).slice(0, 6))}
                placeholder="الرمز الحالي (مثلاً 1234)"
                data-testid="settings_pin_current_input"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#8A99AD] mb-1">رمز PIN الجديد (4-6 أرقام)</label>
              <input
                type="password"
                inputMode="numeric"
                value={newPinInput}
                onChange={(e) => setNewPinInput(normalizePinDigits(e.target.value).slice(0, 6))}
                placeholder="أدخل 4 إلى 6 أرقام"
                data-testid="settings_pin_new_input"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#8A99AD] mb-1">تأكيد رمز PIN الجديد</label>
              <input
                type="password"
                inputMode="numeric"
                value={confirmPinInput}
                onChange={(e) => setConfirmPinInput(normalizePinDigits(e.target.value).slice(0, 6))}
                placeholder="أعد إدخال الرمز الجديد"
                data-testid="settings_pin_confirm_input"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            data-testid="settings_save_pin_btn"
            className="w-full sm:w-auto bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2 px-5 rounded-xl text-xs cursor-pointer transition-colors"
          >
            حفظ وتفعيل رمز القفل الرقمي (PIN)
          </button>
        </form>
      </div>

      {/* 4. Main Platform & API Settings Card */}
      <div className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <div className="text-xs sm:text-sm font-semibold text-white">
            السوق: العقود الآجلة الدائمة USDⓈ-M Futures
          </div>
          <div className="text-xs text-[#01BC8D] mt-0.5">
            البيئة النشطة: {envInfo?.titleAr || config.environment}
          </div>
          <div className="text-xs text-[#8A99AD] mt-0.5">
            حالة الاتصال:{' '}
            <span
              className={
                connectionState.isAuthenticated || connectionState.isConnected
                  ? 'text-[#01BC8D]'
                  : 'text-[#F6465D]'
              }
            >
              {connectionState.statusMessageAr}
            </span>
          </div>
        </div>

        <div className="h-px bg-[#232E3A]" />

        {/* Open Mobile Notifications button */}
        {onOpenNotifications && (
          <button
            onClick={onOpenNotifications}
            data-testid="settings_open_notifications_button"
            className="w-full bg-[#0D2B24] hover:bg-[#01BC8D]/25 border border-[#01BC8D] text-[#01BC8D] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors cursor-pointer"
          >
            <BellRing className="w-4 h-4" />
            <span>إعدادات وسجل تنبيهات الموبايل (فتح صفقات، التدعيم، الخروج، والتراجع)</span>
          </button>
        )}

        {/* Open API setup button */}
        <button
          onClick={onOpenApiSetup}
          data-testid="settings_open_api_button"
          className="w-full bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors cursor-pointer"
        >
          <Key className="w-4 h-4" />
          <span>إدارة ربط المنصات (KuCoin & Binance API)</span>
        </button>

        {/* Review Live Trading button */}
        <button
          onClick={onLive}
          data-testid="settings_live_review_button"
          className="w-full border border-[#01BC8D] hover:bg-[#01BC8D]/15 text-[#01BC8D] font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm transition-colors cursor-pointer"
        >
          مراجعة أمان التداول المباشر (Live Mode)
        </button>

        {/* Notice */}
        <p className="text-[11px] text-[#8A99AD] leading-relaxed pt-2 border-t border-[#232E3A]">
          تنبيه أمني: مفاتيح باينانس تعمل بوضع القراءة فقط (Read-Only) لجلب بيانات السوق والمتداولين، بينما يتم تنفيذ الصفقات عبر حسابك في KuCoin وفق الإعدادات الموحدة في نافذة التداول.
        </p>
      </div>

      {/* Safety Specs */}
      <div className="bg-[#1A222B] border border-[#232E3A] rounded-2xl p-4 space-y-2">
        <h3 className="font-bold text-xs text-[#01BC8D] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          <span>معايير إدارة المخاطر المفروضة</span>
        </h3>
        <div className="text-xs text-[#8A99AD] space-y-1">
          <div>• التحكم الموحد في قيمة الصفقة والرافعة والعمولة من نافذة التداول</div>
          <div>• تنبيهات فورية على الموبايل وشاشة القفل عند فتح الصفقات، التدعيم، السحب الجزئي، الإغلاق، وتجاوز حد التراجع</div>
          <div>• إمكانية الاختيار بين العمل المستمر في الخلفية أو الإغلاق الكلي للتطبيق</div>
          <div>• عدم حفظ المفاتيح في خوادم سحابية خارجية (تخزين محلي آمن في المتصفح فقط)</div>
        </div>
      </div>
    </div>
  );
};
