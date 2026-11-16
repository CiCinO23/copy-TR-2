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
} from '../services/kucoinSecurityLock';
import {
  memoryCleanupService,
  MemoryTelemetrySnapshot,
} from '../services/memoryCleanup';
import { formatDateTimeWestern } from '../utils/formatters';
import {
  APP_MAJOR_VERSION,
  APP_VERSION,
  APP_PROMPT_REVISION,
  PROMPT_VERSION_HISTORY,
} from '../constants/appVersion';

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
  const [memorySnapshot, setMemorySnapshot] = useState<MemoryTelemetrySnapshot>(() =>
    memoryCleanupService.getSnapshot()
  );

  React.useEffect(() => {
    setMemorySnapshot(memoryCleanupService.getSnapshot());
    const unsub = memoryCleanupService.subscribe((snap) => {
      setMemorySnapshot(snap);
    });
    const refreshId = setInterval(() => {
      setMemorySnapshot(memoryCleanupService.getSnapshot());
    }, 5000);
    return () => {
      unsub();
      clearInterval(refreshId);
    };
  }, []);

  const handleManualMemoryCleanup = () => {
    const res = memoryCleanupService.performCleanup('MANUAL');
    setMemorySnapshot(memoryCleanupService.getSnapshot());
    setStatusFeedback(
      `تم تنفيذ تنظيف الذاكرة بنجاح: تم تفريغ ${res.freedItemsCount} سجل مؤقت (${res.freedEstimatedKb} KB) مع الحفاظ الكامل على الصفقات المفتوحة والحسابات.`
    );
    setTimeout(() => setStatusFeedback(null), 5000);
  };

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
        'تم تفعيل وضع العمل في الخلفية: سيبقى التطبيق يعمل ويرسل الإشعارات حتى وإن أُقفل نهائياً.'
      );
    } else {
      handleUpdate(
        { appExitBehavior: 'FULL_EXIT' },
        'تم ضبط وضع الإغلاق الكلي: سيتم إيقاف جميع العمليات الخلفية تماماً عند إغلاق التطبيق.'
      );
    }
  };

  const handleExecuteImmediateFullExit = () => {
    handleUpdate({ appExitBehavior: 'FULL_EXIT' });
    mobileNotifications.performFullAppExit();
    setIsStoppedByFullExit(true);
    setStatusFeedback(
      'تم إيقاف جميع الخدمات والعمليات الخلفية للتطبيق بالكامل.'
    );
  };

  const handleResumeAppServices = () => {
    mobileNotifications.resumeFromFullExit();
    setIsStoppedByFullExit(false);
    setStatusFeedback('تم إعادة تشغيل خدمات التطبيق والمزامنة بنجاح.');
  };

  const handleTestLockScreenNotification = async () => {
    if (browserPerm !== 'granted' && browserPerm !== 'unsupported') {
      const perm = await mobileNotifications.requestBrowserPermission();
      setBrowserPerm(perm);
    }
    await mobileNotifications.syncBackgroundAndLockScreenMode();
    handleUpdate({
      enabled: true,
      lockScreenNotificationsEnabled: true,
      browserPushEnabled: true,
    });
    mobileNotifications.triggerTestNotification('OPEN_TRADE');
    setStatusFeedback(
      'تم إرسال إشعار فوري مخصص لشاشة القفل وتنشيط محرك الخلفية بنجاح.'
    );
  };

  const handleActivateBackgroundProtection = async () => {
    if (browserPerm !== 'granted' && browserPerm !== 'unsupported') {
      const perm = await mobileNotifications.requestBrowserPermission();
      setBrowserPerm(perm);
    }
    mobileNotifications.resumeFromFullExit();
    setIsStoppedByFullExit(false);
    mobileNotifications.requestAndroidBatteryOptimizationExemption();
    await mobileNotifications.syncBackgroundAndLockScreenMode();
    handleUpdate(
      {
        enabled: true,
        appExitBehavior: 'KEEP_ALIVE_BACKGROUND',
        wakeLockEnabled: true,
        lockScreenNotificationsEnabled: true,
        browserPushEnabled: true,
      },
      'تم تنشيط جميع طبقات العمل المستمر (عند قفل الشاشة وعند تصغير التطبيق وفتح تطبيق آخر) وتفعيل إشعارات شاشة القفل.'
    );
  };

  // KuCoin PIN Security State in Settings
  const [currentPinInput, setCurrentPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);

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
      'تم تحديث رمز القفل الرقمي (PIN) لحماية تبويب التنفيذ المباشر بنجاح.'
    );
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Title + Version Badge */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide">
              الإعدادات وإدارة المخاطر
            </h2>
            <span
              dir="ltr"
              data-testid="settings_version_badge"
              className="px-2.5 py-0.5 rounded-lg bg-[#0D2B24] border border-[#01BC8D]/50 text-[#01BC8D] text-xs font-mono font-extrabold tabular-nums"
            >
              v{APP_VERSION}
            </span>
          </div>
          <p className="text-xs text-[#8A99AD] mt-0.5">
            ضبط سلوك إغلاق التطبيق أو عمله في الخلفية، إشعارات شاشة القفل، ومعايير الأمان والربط المباشر
          </p>
        </div>
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
        className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1E2733] pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                appExitBehavior === 'KEEP_ALIVE_BACKGROUND' && !isStoppedByFullExit
                  ? 'bg-[#0D2B24] border-[#01BC8D]/40 text-[#01BC8D]'
                  : 'bg-[#3A1219] border-[#F6465D]/40 text-[#F6465D]'
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
                  className={`text-[11px] font-semibold ${
                    isStoppedByFullExit
                      ? 'text-[#F6465D]'
                      : appExitBehavior === 'KEEP_ALIVE_BACKGROUND'
                      ? 'text-[#01BC8D]'
                      : 'text-[#FBBF24]'
                  }`}
                >
                  ·{' '}
                  {isStoppedByFullExit
                    ? 'متوقف كلياً'
                    : appExitBehavior === 'KEEP_ALIVE_BACKGROUND'
                    ? 'يعمل في الخلفية دائماً'
                    : 'إغلاق كلي عند الخروج'}
                </span>
              </h3>
              <p className="text-xs text-[#8A99AD] mt-0.5">
                اختر بين ترك التطبيق يعمل في الخلفية لمتابعة الصفقات، أو الإغلاق الكلي للتطبيق
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
            className={`text-right rounded-xl p-3.5 border transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
              appExitBehavior === 'KEEP_ALIVE_BACKGROUND' && !isStoppedByFullExit
                ? 'bg-[#161D26] border-[#01BC8D]'
                : 'bg-[#0B0E11] border-[#1E2733] hover:border-[#2C394A]'
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
                  تركه يعمل في الخلفية
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
              يبقي محرك النسخ ومراقبة الصفقات ونسبة التراجع نشطاً في الخلفية لإرسال الإشعارات الفورية حتى بعد إغلاق التطبيق.
            </p>
          </button>

          {/* Option B: Full App Exit */}
          <button
            type="button"
            data-testid="mode_full_exit_btn"
            onClick={() => handleSelectExitBehavior('FULL_EXIT')}
            className={`text-right rounded-xl p-3.5 border transition-colors cursor-pointer flex flex-col justify-between gap-2 ${
              appExitBehavior === 'FULL_EXIT' || isStoppedByFullExit
                ? 'bg-[#2B1216]/70 border-[#F6465D]'
                : 'bg-[#0B0E11] border-[#1E2733] hover:border-[#F6465D]/40'
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
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="activate_bg_protection_btn"
                onClick={handleActivateBackgroundProtection}
                className="bg-[#0D2B24] hover:bg-[#01BC8D] text-[#01BC8D] hover:text-[#0B0E11] border border-[#01BC8D]/50 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>تثبيت العمل عند قفل الشاشة وتصغير التطبيق</span>
              </button>
              <button
                type="button"
                data-testid="immediate_full_exit_btn"
                onClick={handleExecuteImmediateFullExit}
                className="bg-[#3A1219] hover:bg-[#F6465D] text-[#F6465D] hover:text-white border border-[#F6465D]/50 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Power className="w-3.5 h-3.5" />
                <span>إغلاق التطبيق كلياً الآن</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Lock Screen Notifications Card */}
      <div
        data-testid="settings_lockscreen_notifications_card"
        className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1E2733] pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                lockScreenEnabled
                  ? 'bg-[#0D2B24] border-[#01BC8D]/40 text-[#01BC8D]'
                  : 'bg-[#161D26] border-[#1E2733] text-[#8A99AD]'
              }`}
            >
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                <span>الإشعارات في شاشة القفل</span>
                <span
                  className={`text-[11px] font-semibold ${
                    lockScreenEnabled ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                  }`}
                >
                  · {lockScreenEnabled ? 'مفعّلة' : 'غير مفعّلة'}
                </span>
              </h3>
              <p className="text-xs text-[#8A99AD] mt-0.5">
                إظهار تنبيهات فتح الصفقات والتدعيم والإغلاق والتراجع مباشرة على شاشة قفل الهاتف
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
                  ? 'تم تفعيل ظهور الإشعارات الفورية على شاشة القفل.'
                  : 'تم إيقاف إشعارات شاشة القفل.'
              )
            }
            className="w-5 h-5 accent-[#01BC8D] cursor-pointer shrink-0 mt-1"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Toggle: Show Full Financial Details on Lock Screen */}
          <label className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-3 flex items-start justify-between gap-2.5 cursor-pointer">
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
                <div className="text-[11px] text-[#8A99AD] mt-0.5">
                  {showSensitiveDetails
                    ? 'يعرض السعر وقيمة الصفقة وصافي الربح ونسبة التراجع على شاشة القفل'
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
                    ? 'سيتم عرض التفاصيل المالية الكاملة على شاشة القفل.'
                    : 'تم إخفاء المبالغ الحساسة على شاشة القفل للخصوصية.'
                )
              }
              className="w-4 h-4 accent-[#01BC8D] cursor-pointer shrink-0 mt-0.5"
            />
          </label>

          {/* Test Lock Screen Notification Button */}
          <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-3 flex flex-col justify-between gap-2">
            <div className="text-[11px] text-[#8A99AD] flex items-center justify-between">
              <span>صلاحية إشعارات النظام وشاشة القفل:</span>
              <strong
                className={
                  browserPerm === 'granted' ? 'text-[#01BC8D]' : 'text-[#F59E0B]'
                }
              >
                {browserPerm === 'granted' ? 'ممنوحة وجاهزة' : 'تحتاج تفعيل'}
              </strong>
            </div>

            <button
              type="button"
              data-testid="test_lockscreen_notification_btn"
              onClick={handleTestLockScreenNotification}
              className="w-full bg-[#161D26] hover:bg-[#1E2733] text-[#01BC8D] border border-[#1E2733] font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>تجربة إشعار شاشة القفل الآن</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2.5. Memory Cleanup & Low-End Device Protection Card */}
      <div
        data-testid="settings_memory_cleanup_card"
        className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1E2733] pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                memorySnapshot.config.enabled
                  ? 'bg-[#0D2B24] border-[#01BC8D]/40 text-[#01BC8D]'
                  : 'bg-[#161D26] border-[#1E2733] text-[#8A99AD]'
              }`}
            >
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                <span>تنظيف الذاكرة التلقائي (Memory Cleanup)</span>
                <span
                  className={`text-[11px] font-semibold ${
                    memorySnapshot.config.enabled ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                  }`}
                >
                  · {memorySnapshot.config.enabled ? 'مفعّل لحماية الذاكرة' : 'متوقف'}
                </span>
              </h3>
              <p className="text-xs text-[#8A99AD] mt-0.5">
                مسح البيانات المخزنة مؤقتاً (Cache) دورياً وعند وصول استهلاك الذاكرة لحدود معينة لمنع الانهيارات في الأجهزة محدودة الإمكانيات
              </p>
            </div>
          </div>

          <input
            type="checkbox"
            data-testid="toggle_memory_cleanup_enabled"
            checked={memorySnapshot.config.enabled}
            onChange={(e) => {
              memoryCleanupService.updateConfig({ enabled: e.target.checked });
              setStatusFeedback(
                e.target.checked
                  ? 'تم تفعيل التنظيف الدوري التلقائي للذاكرة والكاش.'
                  : 'تم إيقاف التنظيف التلقائي للذاكرة.'
              );
              setTimeout(() => setStatusFeedback(null), 4000);
            }}
            className="w-5 h-5 accent-[#01BC8D] cursor-pointer shrink-0 mt-1"
          />
        </div>

        {/* Live Memory & Cache Footprint Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-2.5">
            <span className="text-[10px] text-[#8A99AD] block">حجم الكاش المؤقت حالياً</span>
            <span dir="ltr" className="text-sm font-bold font-mono text-white tabular-nums">
              {memorySnapshot.totalEstimatedCacheKb} KB{' '}
              <span className="text-[10px] text-[#8A99AD]">
                / {memorySnapshot.effectiveMaxCacheKb} KB
              </span>
            </span>
          </div>

          <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-2.5">
            <span className="text-[10px] text-[#8A99AD] block">نسبة امتلاء الكاش والذاكرة</span>
            <span
              dir="ltr"
              className={`text-sm font-bold font-mono tabular-nums ${
                memorySnapshot.utilizationPercent >= memorySnapshot.config.heapThresholdPercent
                  ? 'text-[#F59E0B]'
                  : 'text-[#01BC8D]'
              }`}
            >
              {memorySnapshot.utilizationPercent}%{' '}
              <span className="text-[10px] text-[#8A99AD]">
                (الحد: {memorySnapshot.config.heapThresholdPercent}%)
              </span>
            </span>
          </div>

          <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-2.5">
            <span className="text-[10px] text-[#8A99AD] block">السجلات المؤقتة في الذاكرة</span>
            <span dir="ltr" className="text-sm font-bold font-mono text-white tabular-nums">
              {memorySnapshot.totalCachedItems}{' '}
              <span className="text-[10px] text-[#8A99AD]">سجل</span>
            </span>
          </div>

          <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-2.5">
            <span className="text-[10px] text-[#8A99AD] block">عمليات التنظيف المنفذة</span>
            <span dir="ltr" className="text-sm font-bold font-mono text-[#01BC8D] tabular-nums">
              {memorySnapshot.cleanupRunCount}{' '}
              <span className="text-[10px] text-[#8A99AD]">
                ({memorySnapshot.totalItemsFreed} مفرّغ)
              </span>
            </span>
          </div>
        </div>

        {/* Threshold & Low-End Device Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-3 space-y-2">
            <label className="text-xs font-bold text-white block">
              حد استهلاك الذاكرة لبدء المسح التلقائي (Threshold)
            </label>
            <select
              data-testid="select_memory_threshold"
              value={memorySnapshot.config.heapThresholdPercent}
              onChange={(e) => {
                const nextPct = Number(e.target.value) || 70;
                memoryCleanupService.updateConfig({ heapThresholdPercent: nextPct });
                setStatusFeedback(`تم ضبط حد التنظيف التلقائي للذاكرة عند ${nextPct}%.`);
                setTimeout(() => setStatusFeedback(null), 3500);
              }}
              className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value={60}>60% — تنظيف مبكر ومكثف (للأجهزة الضعيفة جداً)</option>
              <option value={70}>70% — توازن مثالي للأداء والذاكرة (موصى به)</option>
              <option value={80}>80% — تنظيف عند الاقتراب من امتلاء الذاكرة</option>
            </select>
          </div>

          <label className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-3 flex items-start justify-between gap-2.5 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">
                وضع الأجهزة محدودة الموارد (Low-RAM Mode)
              </div>
              <div className="text-[11px] text-[#8A99AD] mt-0.5">
                يقلل سقف الكاش الأقصى بنسبة 35% ويمسح بيانات المتداولين غير المنسوخين كل 25 ثانية
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle_low_end_device_mode"
              checked={memorySnapshot.config.lowEndDeviceMode}
              onChange={(e) => {
                memoryCleanupService.updateConfig({ lowEndDeviceMode: e.target.checked });
                setStatusFeedback(
                  e.target.checked
                    ? 'تم تفعيل وضع الأجهزة محدودة الموارد لتقليل استهلاك الذاكرة.'
                    : 'تم إيقاف وضع الأجهزة محدودة الموارد.'
                );
                setTimeout(() => setStatusFeedback(null), 3500);
              }}
              className="w-4 h-4 accent-[#01BC8D] cursor-pointer shrink-0 mt-0.5"
            />
          </label>
        </div>

        {/* Manual Memory Cleanup Action Row */}
        <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-[11px] text-[#8A99AD] space-y-0.5">
            <div>
              آخر عملية تنظيف:{' '}
              <strong dir="ltr" className="text-white font-mono tabular-nums">
                {memorySnapshot.lastCleanupAt
                  ? formatDateTimeWestern(memorySnapshot.lastCleanupAt)
                  : 'لم يتم بعد'}
              </strong>
            </div>
            {memorySnapshot.lastCleanupReasonAr && (
              <div className="text-[10px] text-[#01BC8D]">
                {memorySnapshot.lastCleanupReasonAr}
              </div>
            )}
          </div>

          <button
            type="button"
            data-testid="trigger_memory_cleanup_btn"
            onClick={handleManualMemoryCleanup}
            className="bg-[#0D2B24] hover:bg-[#01BC8D] text-[#01BC8D] hover:text-[#0B0E11] border border-[#01BC8D]/50 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>مسح البيانات المؤقتة (Cache) وتفريغ الذاكرة الآن</span>
          </button>
        </div>
      </div>

      {/* 3. KuCoin Real Wallet PIN Code Security Card */}
      <div
        data-testid="settings_kucoin_security_lock_card"
        className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#1E2733] pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                securityConfig.enabled
                  ? 'bg-[#0D2B24] border-[#01BC8D]/40 text-[#01BC8D]'
                  : 'bg-[#161D26] border-[#1E2733] text-[#8A99AD]'
              }`}
            >
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                <span>قفل أمان التنفيذ المباشر والمحفظة الحقيقية</span>
                <span
                  className={`text-[11px] font-semibold ${
                    securityConfig.enabled ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                  }`}
                >
                  · {securityConfig.enabled ? 'مفعّل' : 'غير مفعّل'}
                </span>
              </h3>
              <p className="text-xs text-[#8A99AD] mt-0.5">
                طلب رمز قفل رقمي (PIN) عند فتح تبويب كوكوين أو التبديل للتداول الحقيقي
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
                  ? 'تم تفعيل رمز القفل الرقمي (PIN) لتبويب التنفيذ المباشر.'
                  : 'تم إيقاف قفل الأمان لتبويب التنفيذ المباشر.'
              )
            }
            className="w-5 h-5 accent-[#01BC8D] cursor-pointer shrink-0 mt-1"
          />
        </div>

        {/* Lock Scope & Protect Real Mode Switch */}
        <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
          <div>
            <label className="block text-[11px] font-bold text-white mb-1">
              متى يُطلب رمز القفل الرقمي (PIN)؟
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
                  'تم تحديث سياسة إعادة قفل تبويب التنفيذ المباشر.'
                )
              }
              data-testid="select_kucoin_lock_scope"
              className="w-full bg-[#12171D] border border-[#1E2733] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
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
                    ? 'تمت حماية زر التبديل إلى التداول الحقيقي برمز PIN الرقمي.'
                    : 'تم إلغاء قفل زر التبديل للتداول الحقيقي.'
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
                setStatusFeedback('تم قفل تبويب التنفيذ المباشر والمحفظة الحقيقية فوراً.');
              }}
              data-testid="settings_lock_kucoin_now_btn"
              className="w-full bg-[#161D26] hover:bg-[#1E2733] text-white border border-[#1E2733] font-bold py-2 px-3 rounded-lg text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Lock className="w-3.5 h-3.5 text-[#01BC8D]" />
              <span>قفل تبويب التنفيذ المباشر الآن</span>
            </button>
          )}
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
      <div className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4">
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

        <div className="h-px bg-[#1E2733]" />

        {/* Open Mobile Notifications button */}
        {onOpenNotifications && (
          <button
            type="button"
            onClick={onOpenNotifications}
            data-testid="settings_open_notifications_button"
            className="w-full bg-[#161D26] hover:bg-[#1E2733] border border-[#1E2733] text-[#01BC8D] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors cursor-pointer"
          >
            <BellRing className="w-4 h-4" />
            <span>إعدادات وسجل تنبيهات الموبايل</span>
          </button>
        )}

        {/* Open API setup button */}
        <button
          type="button"
          onClick={onOpenApiSetup}
          data-testid="settings_open_api_button"
          className="w-full bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors cursor-pointer"
        >
          <Key className="w-4 h-4" />
          <span>إدارة ربط المنصات</span>
        </button>

        {/* Review Live Trading button */}
        <button
          type="button"
          onClick={onLive}
          data-testid="settings_live_review_button"
          className="w-full border border-[#1E2733] hover:border-[#01BC8D]/60 bg-[#161D26] text-[#01BC8D] font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm transition-colors cursor-pointer"
        >
          مراجعة أمان التداول المباشر
        </button>

        {/* Notice */}
        <p className="text-[11px] text-[#8A99AD] leading-relaxed pt-2 border-t border-[#1E2733]">
          تنبيه أمني: مفاتيح باينانس تعمل بوضع القراءة فقط لجلب بيانات السوق والمتداولين، بينما يتم تنفيذ الصفقات عبر حسابك في كوكوين وفق الإعدادات الموحدة في نافذة التداول.
        </p>
      </div>

      {/* Safety Specs */}
      <div className="bg-[#161D26] border border-[#1E2733] rounded-2xl p-4 space-y-2">
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

      {/* 5. App Version & Cumulative Prompt History Card */}
      <div
        data-testid="settings_version_history_card"
        className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-3.5"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[#1E2733] pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#01BC8D]" />
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white">
                سجل إصدار التطبيق وأوامر التعديل التراكمية
              </h3>
              <p className="text-[11px] text-[#8A99AD] mt-0.5">
                البداية من الإصدار{' '}
                <span dir="ltr" className="font-mono text-white">
                  {APP_MAJOR_VERSION}.0
                </span>{' '}
                +{' '}
                <span dir="ltr" className="font-mono text-[#01BC8D] font-bold">
                  {APP_PROMPT_REVISION}
                </span>{' '}
                أوامر تعديل (برومبت) = الإصدار الحالي{' '}
                <span dir="ltr" className="font-mono text-[#01BC8D] font-bold">
                  {APP_VERSION}
                </span>
              </p>
            </div>
          </div>
          <span
            dir="ltr"
            className="px-3 py-1 rounded-xl bg-[#0D2B24] border border-[#01BC8D] text-[#01BC8D] font-mono text-xs font-extrabold tabular-nums"
          >
            Version {APP_VERSION}
          </span>
        </div>

        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {PROMPT_VERSION_HISTORY.slice()
            .reverse()
            .map((item) => (
              <div
                key={item.version}
                className="flex items-start justify-between gap-2 bg-[#0B0E11] border border-[#1E2733] rounded-xl px-3 py-2 text-xs"
              >
                <div className="text-[#F0F4F8] leading-relaxed">
                  <span className="text-[#8A99AD] ml-1.5">أمر #{item.promptNumber}:</span>
                  <span>{item.summaryAr}</span>
                </div>
                <span
                  dir="ltr"
                  className="px-2 py-0.5 rounded bg-[#161D26] border border-[#232E3A] text-[#01BC8D] font-mono text-[11px] font-bold shrink-0 tabular-nums"
                >
                  v{item.version}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
