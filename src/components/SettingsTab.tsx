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
  ChevronDown,
  Info,
} from 'lucide-react';
import {
  BinanceConfig,
  BinanceConnectionState,
  KuCoinConfig,
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
  isDefaultPinActive,
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
  kucoinConfig?: KuCoinConfig;
  onSaveKuCoinSecrets?: (secrets: { apiSecret: string; passphrase: string }) => void;
  onSaveBinanceSecret?: (apiSecret: string) => void;
  notificationSettings?: MobileNotificationSettings;
  onUpdateNotificationSettings?: (partial: Partial<MobileNotificationSettings>) => void;
  securityConfig?: KuCoinSecurityLockConfig;
  onUpdateSecurityConfig?: (partial: Partial<KuCoinSecurityLockConfig>) => void;
  onLockSecurityNow?: () => void;
  onLive: () => void;
  onOpenApiSetup: () => void;
  onOpenNotifications?: () => void;
}

type SettingsGroupKey = 'security' | 'runtime' | 'memory' | 'about';

export const SettingsTab: React.FC<SettingsTabProps> = ({
  config,
  connectionState,
  kucoinConfig,
  onSaveKuCoinSecrets,
  onSaveBinanceSecret,
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

  // KuCoin-style Grouped Accordions: Security & API Vault open by default
  const [openGroups, setOpenGroups] = useState<Record<SettingsGroupKey, boolean>>({
    security: true,
    runtime: false,
    memory: false,
    about: false,
  });

  const toggleGroup = (group: SettingsGroupKey) => {
    setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

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
      if (typeof document !== 'undefined' && document.hidden) return;
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
      `تم تنظيف الذاكرة: تفريغ ${res.freedItemsCount} سجل مؤقت (${res.freedEstimatedKb} KB) مع حفظ جميع الصفقات والحسابات.`
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
        'تم تفعيل العمل بالخلفية لاستمرار المراقبة والإشعارات.'
      );
    } else {
      handleUpdate(
        { appExitBehavior: 'FULL_EXIT' },
        'تم ضبط الإغلاق الكلي عند الخروج لتوفير البطارية والبيانات.'
      );
    }
  };

  const handleExecuteImmediateFullExit = () => {
    handleUpdate({ appExitBehavior: 'FULL_EXIT' });
    mobileNotifications.performFullAppExit();
    setIsStoppedByFullExit(true);
    setStatusFeedback('تم إيقاف جميع العمليات الخلفية للتطبيق.');
  };

  const handleResumeAppServices = () => {
    mobileNotifications.resumeFromFullExit();
    setIsStoppedByFullExit(false);
    setStatusFeedback('تمت إعادة تشغيل خدمات التطبيق والمزامنة.');
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
    setStatusFeedback('تم إرسال إشعار تجريبي لشاشة القفل.');
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
      'تم تثبيت العمل بالخلفية وتفعيل إشعارات شاشة القفل.'
    );
  };

  // Exclusive API Secrets State (v2.1 / v2.24 — managed solely in Settings)
  const [kcSecretInput, setKcSecretInput] = useState<string>(kucoinConfig?.apiSecret || '');
  const [kcPassphraseInput, setKcPassphraseInput] = useState<string>(kucoinConfig?.passphrase || '');
  const [bnSecretInput, setBnSecretInput] = useState<string>(config.apiSecret || '');
  const [showKcSecret, setShowKcSecret] = useState<boolean>(false);
  const [showKcPass, setShowKcPass] = useState<boolean>(false);
  const [showBnSecret, setShowBnSecret] = useState<boolean>(false);

  React.useEffect(() => {
    setKcSecretInput(kucoinConfig?.apiSecret || '');
    setKcPassphraseInput(kucoinConfig?.passphrase || '');
  }, [kucoinConfig?.apiSecret, kucoinConfig?.passphrase]);

  React.useEffect(() => {
    setBnSecretInput(config.apiSecret || '');
  }, [config.apiSecret]);

  const handleSaveSecretsVault = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSaveKuCoinSecrets) {
      onSaveKuCoinSecrets({
        apiSecret: kcSecretInput.trim(),
        passphrase: kcPassphraseInput.trim(),
      });
    }
    if (onSaveBinanceSecret) {
      onSaveBinanceSecret(bnSecretInput.trim());
    }
    setStatusFeedback('تم حفظ المفاتيح السرية في التخزين المحلي الآمن بنجاح.');
    setTimeout(() => setStatusFeedback(null), 4500);
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
      securityConfig.pinHash || securityConfig.pinCode || '',
      newPinInput,
      confirmPinInput
    );
    if (!validation.valid || !validation.normalizedNewPin) {
      setPinChangeError(validation.errorAr || 'خطأ في التحقق من رمز PIN');
      return;
    }
    handleUpdateSec(
      { pinCode: validation.normalizedNewPin, enabled: true },
      'تم تحديث رمز PIN وتشفيره بنجاح.'
    );
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
  };

  const hasSavedSecrets = Boolean(
    kucoinConfig?.apiSecret || kucoinConfig?.passphrase || config.apiSecret
  );

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      {/* Clean KuCoin Settings Header */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">الإعدادات</h2>
          <p className="text-[11px] text-[#848E9C] mt-0.5">
            الأمان والمفاتيح السرية، الخلفية والإشعارات، وإدارة الذاكرة
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenApiSetup}
            data-testid="settings_open_api_button"
            className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 text-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Key className="w-3.5 h-3.5" />
            <span>ربط المنصات</span>
          </button>
          {onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              data-testid="settings_open_notifications_button"
              className="bg-[#12161C] hover:bg-[#1A2029] border border-[#1C232D] text-[#EAECEF] font-semibold py-1.5 px-2.5 rounded-lg flex items-center gap-1 text-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <BellRing className="w-3.5 h-3.5 text-[#01BC8D]" />
              <span>التنبيهات</span>
            </button>
          )}
        </div>
      </div>

      {statusFeedback && (
        <div
          data-testid="settings_status_feedback"
          className="bg-[#0D2B24] border border-[#01BC8D]/60 text-[#01BC8D] px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2"
        >
          <span>{statusFeedback}</span>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            className="text-[11px] text-white/80 hover:text-white cursor-pointer shrink-0"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* GROUP 1: الأمان والمفاتيح (Open by Default) */}
      <section className="bg-[#12161C] border border-[#1C232D] rounded-xl overflow-hidden">
        <button
          type="button"
          data-testid="settings_group_security_toggle"
          onClick={() => toggleGroup('security')}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#161B22] transition-colors cursor-pointer text-right"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0D2B24] border border-[#01BC8D]/30 text-[#01BC8D] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">الأمان والمفاتيح السرية</div>
              <div className="text-[11px] text-[#848E9C] truncate">
                قفل PIN {securityConfig.enabled ? 'مفعّل' : 'متوقف'} · خزنة المفاتيح{' '}
                {hasSavedSecrets ? 'محفوظة' : 'غير مضبوطة'}
              </div>
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-[#848E9C] shrink-0 transition-transform ${
              openGroups.security ? 'rotate-180 text-[#01BC8D]' : ''
            }`}
          />
        </button>

        {openGroups.security && (
          <div className="border-t border-[#1C232D] divide-y divide-[#1C232D]">
            {/* 1A. Exclusive API Secrets Vault (v2.1) */}
            <form
              onSubmit={handleSaveSecretsVault}
              data-testid="settings_api_secrets_card"
              className="p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#01BC8D]" />
                  <h3 className="text-xs sm:text-sm font-bold text-white">
                    خزنة المفاتيح السرية (API Secrets)
                  </h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#0D2B24] text-[#01BC8D] font-semibold">
                  تخزين محلي فقط
                </span>
              </div>
              <p className="text-[11px] text-[#848E9C]">
                تُخفى المفاتيح السرية من صفحات المنصات وتُدار حصرياً من هنا على جهازك فقط.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-[#EAECEF]">
                    KuCoin API Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showKcSecret ? 'text' : 'password'}
                      dir="ltr"
                      data-testid="settings_kucoin_api_secret_input"
                      value={kcSecretInput}
                      onChange={(e) => setKcSecretInput(e.target.value)}
                      placeholder="KuCoin API Secret"
                      className="w-full bg-[#0B0E11] border border-[#1C232D] focus:border-[#01BC8D] rounded-lg pr-3 pl-9 py-2 text-xs text-white font-mono text-left focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKcSecret((v) => !v)}
                      className="absolute left-2.5 top-2 text-[#848E9C] hover:text-white cursor-pointer"
                      title="إظهار / إخفاء"
                    >
                      {showKcSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-[#EAECEF]">
                    KuCoin Passphrase
                  </label>
                  <div className="relative">
                    <input
                      type={showKcPass ? 'text' : 'password'}
                      dir="ltr"
                      data-testid="settings_kucoin_passphrase_input"
                      value={kcPassphraseInput}
                      onChange={(e) => setKcPassphraseInput(e.target.value)}
                      placeholder="KuCoin Passphrase"
                      className="w-full bg-[#0B0E11] border border-[#1C232D] focus:border-[#01BC8D] rounded-lg pr-3 pl-9 py-2 text-xs text-white font-mono text-left focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKcPass((v) => !v)}
                      className="absolute left-2.5 top-2 text-[#848E9C] hover:text-white cursor-pointer"
                      title="إظهار / إخفاء"
                    >
                      {showKcPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-[#EAECEF]">
                    Binance API Secret (قراءة فقط)
                  </label>
                  <div className="relative">
                    <input
                      type={showBnSecret ? 'text' : 'password'}
                      dir="ltr"
                      data-testid="settings_binance_api_secret_input"
                      value={bnSecretInput}
                      onChange={(e) => setBnSecretInput(e.target.value)}
                      placeholder="Binance API Secret"
                      className="w-full bg-[#0B0E11] border border-[#1C232D] focus:border-[#01BC8D] rounded-lg pr-3 pl-9 py-2 text-xs text-white font-mono text-left focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBnSecret((v) => !v)}
                      className="absolute left-2.5 top-2 text-[#848E9C] hover:text-white cursor-pointer"
                      title="إظهار / إخفاء"
                    >
                      {showBnSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                data-testid="settings_save_api_secrets_btn"
                className="w-full sm:w-auto bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2 px-4 rounded-lg text-xs cursor-pointer transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>حفظ المفاتيح السرية</span>
              </button>
            </form>

            {/* 1B. KuCoin PIN Security Lock */}
            <div data-testid="settings_kucoin_security_lock_card" className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#01BC8D]" />
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-white">
                      قفل رمز PIN للتداول الحقيقي
                    </h3>
                    <p className="text-[11px] text-[#848E9C]">
                      حماية تبويب كوكوين والتبديل للوضع الحقيقي
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
                      e.target.checked ? 'تم تفعيل قفل PIN.' : 'تم إيقاف قفل PIN.'
                    )
                  }
                  className="w-4 h-4 accent-[#01BC8D] cursor-pointer shrink-0"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
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
                      'تم تحديث سياسة إعادة القفل.'
                    )
                  }
                  data-testid="select_kucoin_lock_scope"
                  className="w-full bg-[#0B0E11] border border-[#1C232D] focus:border-[#01BC8D] rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="ALWAYS_ON_TAB_OPEN">القفل عند كل فتح لتبويب KuCoin</option>
                  <option value="SESSION_TIMEOUT">
                    بعد انتهاء الجلسة ({securityConfig.sessionTimeoutMinutes} دقائق)
                  </option>
                </select>

                <div className="flex items-center justify-between gap-2 bg-[#0B0E11] border border-[#1C232D] rounded-lg px-3 py-2">
                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-[#EAECEF]">
                    <input
                      type="checkbox"
                      checked={securityConfig.protectRealTradingSwitch}
                      onChange={(e) =>
                        handleUpdateSec(
                          { protectRealTradingSwitch: e.target.checked },
                          e.target.checked
                            ? 'تمت حماية زر التداول الحقيقي.'
                            : 'تم إلغاء قفل زر التداول الحقيقي.'
                        )
                      }
                      className="w-3.5 h-3.5 accent-[#01BC8D] cursor-pointer"
                    />
                    <span>حماية التبديل للحقيقي</span>
                  </label>
                  {onLockSecurityNow && (
                    <button
                      type="button"
                      onClick={() => {
                        onLockSecurityNow();
                        setStatusFeedback('تم قفل المحفظة الحقيقية فوراً.');
                      }}
                      data-testid="settings_lock_kucoin_now_btn"
                      className="bg-[#161B22] hover:bg-[#1E2530] text-[#01BC8D] border border-[#1C232D] font-bold py-1 px-2.5 rounded text-[11px] flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <Lock className="w-3 h-3" />
                      <span>قفل الآن</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Change PIN Form */}
              <form onSubmit={handleSaveNewPinInSettings} className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-[#EAECEF] flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#01BC8D]" />
                    <span>تغيير رمز PIN (4-6 أرقام)</span>
                  </span>
                  {isDefaultPinActive(securityConfig) && (
                    <span className="text-[10px] bg-[#0B0E11] text-[#01BC8D] border border-[#01BC8D]/30 px-2 py-0.5 rounded font-mono">
                      الافتراضي: 1234
                    </span>
                  )}
                </div>

                {pinChangeError && (
                  <div className="text-xs text-[#F65454] bg-[#2B1216] border border-[#F65454]/40 rounded-lg px-3 py-1.5 font-semibold">
                    {pinChangeError}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    value={currentPinInput}
                    onChange={(e) => setCurrentPinInput(normalizePinDigits(e.target.value).slice(0, 6))}
                    placeholder="PIN الحالي"
                    data-testid="settings_pin_current_input"
                    className="w-full bg-[#0B0E11] border border-[#1C232D] focus:border-[#01BC8D] rounded-lg px-2.5 py-2 text-xs text-white font-mono focus:outline-none"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    value={newPinInput}
                    onChange={(e) => setNewPinInput(normalizePinDigits(e.target.value).slice(0, 6))}
                    placeholder="PIN الجديد"
                    data-testid="settings_pin_new_input"
                    className="w-full bg-[#0B0E11] border border-[#1C232D] focus:border-[#01BC8D] rounded-lg px-2.5 py-2 text-xs text-white font-mono focus:outline-none"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    value={confirmPinInput}
                    onChange={(e) => setConfirmPinInput(normalizePinDigits(e.target.value).slice(0, 6))}
                    placeholder="تأكيد PIN"
                    data-testid="settings_pin_confirm_input"
                    className="w-full bg-[#0B0E11] border border-[#1C232D] focus:border-[#01BC8D] rounded-lg px-2.5 py-2 text-xs text-white font-mono focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  data-testid="settings_save_pin_btn"
                  className="bg-[#161B22] hover:bg-[#01BC8D] text-[#01BC8D] hover:text-[#0B0E11] border border-[#01BC8D]/40 font-bold py-1.5 px-4 rounded-lg text-xs cursor-pointer transition-colors"
                >
                  حفظ رمز PIN
                </button>
              </form>
            </div>
          </div>
        )}
      </section>

      {/* GROUP 2: التشغيل والإشعارات */}
      <section className="bg-[#12161C] border border-[#1C232D] rounded-xl overflow-hidden">
        <button
          type="button"
          data-testid="settings_group_runtime_toggle"
          onClick={() => toggleGroup('runtime')}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#161B22] transition-colors cursor-pointer text-right"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#161B22] border border-[#1C232D] text-[#01BC8D] flex items-center justify-center shrink-0">
              <BellRing className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">التشغيل بالخلفية والإشعارات</div>
              <div className="text-[11px] text-[#848E9C] truncate">
                {isStoppedByFullExit
                  ? 'متوقف كلياً'
                  : appExitBehavior === 'KEEP_ALIVE_BACKGROUND'
                  ? 'يعمل بالخلفية'
                  : 'إغلاق عند الخروج'}{' '}
                · شاشة القفل {lockScreenEnabled ? 'مفعّلة' : 'متوقفة'}
              </div>
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-[#848E9C] shrink-0 transition-transform ${
              openGroups.runtime ? 'rotate-180 text-[#01BC8D]' : ''
            }`}
          />
        </button>

        {openGroups.runtime && (
          <div className="border-t border-[#1C232D] divide-y divide-[#1C232D]">
            {/* Background vs Full Exit */}
            <div data-testid="settings_background_mode_card" className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="mode_keep_alive_background_btn"
                  onClick={() => handleSelectExitBehavior('KEEP_ALIVE_BACKGROUND')}
                  className={`text-right rounded-lg p-3 border transition-colors cursor-pointer space-y-1 ${
                    appExitBehavior === 'KEEP_ALIVE_BACKGROUND' && !isStoppedByFullExit
                      ? 'bg-[#0D2B24]/50 border-[#01BC8D]'
                      : 'bg-[#0B0E11] border-[#1C232D] hover:border-[#2B3544]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-[#01BC8D]" />
                      <span>العمل بالخلفية</span>
                    </span>
                    {appExitBehavior === 'KEEP_ALIVE_BACKGROUND' && !isStoppedByFullExit && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#01BC8D] shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-[#848E9C]">
                    استمرار المراقبة والإشعارات بعد الخروج
                  </p>
                </button>

                <button
                  type="button"
                  data-testid="mode_full_exit_btn"
                  onClick={() => handleSelectExitBehavior('FULL_EXIT')}
                  className={`text-right rounded-lg p-3 border transition-colors cursor-pointer space-y-1 ${
                    appExitBehavior === 'FULL_EXIT' || isStoppedByFullExit
                      ? 'bg-[#2B1216]/70 border-[#F65454]'
                      : 'bg-[#0B0E11] border-[#1C232D] hover:border-[#F65454]/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Power className="w-3.5 h-3.5 text-[#F65454]" />
                      <span>الإغلاق عند الخروج</span>
                    </span>
                    {(appExitBehavior === 'FULL_EXIT' || isStoppedByFullExit) && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#F65454] shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-[#848E9C]">
                    إيقاف جميع العمليات لتوفير البطارية
                  </p>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#EAECEF]">
                  <input
                    type="checkbox"
                    data-testid="toggle_wake_lock"
                    checked={wakeLockEnabled}
                    onChange={(e) =>
                      handleUpdate(
                        { wakeLockEnabled: e.target.checked },
                        e.target.checked ? 'تم تفعيل منع الخمول (Wake Lock).' : 'تم إيقاف Wake Lock.'
                      )
                    }
                    className="w-4 h-4 accent-[#01BC8D] cursor-pointer"
                  />
                  <span>منع خمول الهاتف (Wake Lock)</span>
                </label>

                {isStoppedByFullExit ? (
                  <button
                    type="button"
                    data-testid="resume_app_services_btn"
                    onClick={handleResumeAppServices}
                    className="bg-[#01BC8D] text-[#0B0E11] font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>تشغيل الخدمات</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="activate_bg_protection_btn"
                      onClick={handleActivateBackgroundProtection}
                      className="bg-[#0D2B24] hover:bg-[#01BC8D] text-[#01BC8D] hover:text-[#0B0E11] border border-[#01BC8D]/40 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>تثبيت بالخلفية</span>
                    </button>
                    <button
                      type="button"
                      data-testid="immediate_full_exit_btn"
                      onClick={handleExecuteImmediateFullExit}
                      className="bg-[#2B1216] hover:bg-[#F65454] text-[#F65454] hover:text-white border border-[#F65454]/40 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>إغلاق كلي</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Lock Screen Notifications */}
            <div data-testid="settings_lockscreen_notifications_card" className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white">إشعارات شاشة القفل</h3>
                  <p className="text-[11px] text-[#848E9C]">
                    تنبيهات الفتح والإغلاق والتراجع · الصلاحية:{' '}
                    <span className={browserPerm === 'granted' ? 'text-[#01BC8D]' : 'text-[#F59E0B]'}>
                      {browserPerm === 'granted' ? 'جاهزة' : 'تحتاج تفعيل'}
                    </span>
                  </p>
                </div>
                <input
                  type="checkbox"
                  data-testid="toggle_lockscreen_notifications"
                  checked={lockScreenEnabled}
                  onChange={(e) =>
                    handleUpdate(
                      { lockScreenNotificationsEnabled: e.target.checked },
                      e.target.checked ? 'تم تفعيل إشعارات شاشة القفل.' : 'تم إيقاف إشعارات شاشة القفل.'
                    )
                  }
                  className="w-4 h-4 accent-[#01BC8D] cursor-pointer shrink-0"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#EAECEF]">
                  <input
                    type="checkbox"
                    data-testid="toggle_lockscreen_sensitive_details"
                    checked={showSensitiveDetails}
                    onChange={(e) =>
                      handleUpdate(
                        { lockScreenShowSensitiveDetails: e.target.checked },
                        e.target.checked
                          ? 'سيتم عرض التفاصيل المالية على شاشة القفل.'
                          : 'تم إخفاء المبالغ للخصوصية.'
                      )
                    }
                    className="w-4 h-4 accent-[#01BC8D] cursor-pointer"
                  />
                  <span>إظهار المبالغ على شاشة القفل</span>
                </label>

                <button
                  type="button"
                  data-testid="test_lockscreen_notification_btn"
                  onClick={handleTestLockScreenNotification}
                  className="bg-[#161B22] hover:bg-[#1E2530] text-[#01BC8D] border border-[#1C232D] font-semibold py-1.5 px-3 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تجربة الإشعار</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* GROUP 3: الأداء والذاكرة */}
      <section className="bg-[#12161C] border border-[#1C232D] rounded-xl overflow-hidden">
        <button
          type="button"
          data-testid="settings_group_memory_toggle"
          onClick={() => toggleGroup('memory')}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#161B22] transition-colors cursor-pointer text-right"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#161B22] border border-[#1C232D] text-[#01BC8D] flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">الأداء والذاكرة</div>
              <div className="text-[11px] text-[#848E9C] font-mono tabular-nums truncate">
                الكاش {memorySnapshot.utilizationPercent}% ({memorySnapshot.totalEstimatedCacheKb} KB) ·
                تنظيف السجلات &gt;{memorySnapshot.historyRetentionDays} يوم
              </div>
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-[#848E9C] shrink-0 transition-transform ${
              openGroups.memory ? 'rotate-180 text-[#01BC8D]' : ''
            }`}
          />
        </button>

        {openGroups.memory && (
          <div data-testid="settings_memory_cleanup_card" className="border-t border-[#1C232D] p-4 space-y-3">
            {/* Compact 4-metric Hairline Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 bg-[#0B0E11] border border-[#1C232D] rounded-lg divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-[#1C232D]">
              <div className="p-2.5">
                <span className="text-[10px] text-[#848E9C] block">الكاش الحالي</span>
                <span dir="ltr" className="text-xs font-bold font-mono text-white tabular-nums">
                  {memorySnapshot.totalEstimatedCacheKb}/{memorySnapshot.effectiveMaxCacheKb} KB
                </span>
              </div>
              <div className="p-2.5">
                <span className="text-[10px] text-[#848E9C] block">الامتلاء</span>
                <span
                  dir="ltr"
                  className={`text-xs font-bold font-mono tabular-nums ${
                    memorySnapshot.utilizationPercent >= memorySnapshot.config.heapThresholdPercent
                      ? 'text-[#F59E0B]'
                      : 'text-[#01BC8D]'
                  }`}
                >
                  {memorySnapshot.utilizationPercent}%
                </span>
              </div>
              <div className="p-2.5">
                <span className="text-[10px] text-[#848E9C] block">السجلات المؤقتة</span>
                <span dir="ltr" className="text-xs font-bold font-mono text-white tabular-nums">
                  {memorySnapshot.totalCachedItems}
                </span>
              </div>
              <div className="p-2.5">
                <span className="text-[10px] text-[#848E9C] block">عمليات التنظيف</span>
                <span dir="ltr" className="text-xs font-bold font-mono text-[#01BC8D] tabular-nums">
                  {memorySnapshot.cleanupRunCount} ({memorySnapshot.totalItemsFreed})
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="flex items-center justify-between gap-2 bg-[#0B0E11] border border-[#1C232D] rounded-lg px-3 py-2 cursor-pointer text-xs text-white">
                <span>التنظيف التلقائي للكاش</span>
                <input
                  type="checkbox"
                  data-testid="toggle_memory_cleanup_enabled"
                  checked={memorySnapshot.config.enabled}
                  onChange={(e) => {
                    memoryCleanupService.updateConfig({ enabled: e.target.checked });
                    setStatusFeedback(
                      e.target.checked ? 'تم تفعيل التنظيف التلقائي.' : 'تم إيقاف التنظيف التلقائي.'
                    );
                    setTimeout(() => setStatusFeedback(null), 3500);
                  }}
                  className="w-4 h-4 accent-[#01BC8D] cursor-pointer"
                />
              </label>

              <select
                data-testid="select_memory_threshold"
                value={memorySnapshot.config.heapThresholdPercent}
                onChange={(e) => {
                  const nextPct = Number(e.target.value) || 70;
                  memoryCleanupService.updateConfig({ heapThresholdPercent: nextPct });
                  setStatusFeedback(`تم ضبط حد التنظيف عند ${nextPct}%.`);
                  setTimeout(() => setStatusFeedback(null), 3500);
                }}
                className="w-full bg-[#0B0E11] border border-[#1C232D] focus:border-[#01BC8D] rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value={60}>حد التنظيف: 60% (مكثف)</option>
                <option value={70}>حد التنظيف: 70% (متوازن)</option>
                <option value={80}>حد التنظيف: 80% (اقتصادي)</option>
              </select>

              <label className="flex items-center justify-between gap-2 bg-[#0B0E11] border border-[#1C232D] rounded-lg px-3 py-2 cursor-pointer text-xs text-white">
                <span>وضع الأجهزة الضعيفة (Low-RAM)</span>
                <input
                  type="checkbox"
                  data-testid="toggle_low_end_device_mode"
                  checked={memorySnapshot.config.lowEndDeviceMode}
                  onChange={(e) => {
                    memoryCleanupService.updateConfig({ lowEndDeviceMode: e.target.checked });
                    setStatusFeedback(
                      e.target.checked ? 'تم تفعيل وضع Low-RAM.' : 'تم إيقاف وضع Low-RAM.'
                    );
                    setTimeout(() => setStatusFeedback(null), 3500);
                  }}
                  className="w-4 h-4 accent-[#01BC8D] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-2 bg-[#0B0E11] border border-[#1C232D] rounded-lg px-3 py-2 cursor-pointer text-xs text-white">
                <span>
                  حذف السجلات الأقدم من {memorySnapshot.historyRetentionDays} يوماً تلقائياً
                </span>
                <input
                  type="checkbox"
                  data-testid="toggle_startup_history_cleanup"
                  checked={memorySnapshot.config.autoCleanExpiredLogsOnStartup !== false}
                  onChange={(e) => {
                    memoryCleanupService.updateConfig({
                      autoCleanExpiredLogsOnStartup: e.target.checked,
                    });
                    if (e.target.checked) {
                      memoryCleanupService.runStartupHistoryCleanup({ force: true });
                    }
                    setStatusFeedback(
                      e.target.checked
                        ? 'تم تفعيل تنظيف السجلات الأقدم من 30 يوماً عند بدء التشغيل.'
                        : 'تم إيقاف تنظيف السجلات القديمة.'
                    );
                    setTimeout(() => setStatusFeedback(null), 3500);
                  }}
                  className="w-4 h-4 accent-[#01BC8D] cursor-pointer"
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <div className="text-[11px] text-[#848E9C]">
                آخر تنظيف:{' '}
                <span dir="ltr" className="font-mono text-white tabular-nums">
                  {memorySnapshot.lastCleanupAt
                    ? formatDateTimeWestern(memorySnapshot.lastCleanupAt)
                    : '--'}
                </span>
              </div>
              <button
                type="button"
                data-testid="trigger_memory_cleanup_btn"
                onClick={handleManualMemoryCleanup}
                className="bg-[#0D2B24] hover:bg-[#01BC8D] text-[#01BC8D] hover:text-[#0B0E11] border border-[#01BC8D]/40 font-bold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>تنظيف الذاكرة</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* GROUP 4: حول التطبيق وحالة المنصة */}
      <section className="bg-[#12161C] border border-[#1C232D] rounded-xl overflow-hidden">
        <button
          type="button"
          data-testid="settings_group_about_toggle"
          onClick={() => toggleGroup('about')}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#161B22] transition-colors cursor-pointer text-right"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#161B22] border border-[#1C232D] text-[#01BC8D] flex items-center justify-center shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>حول التطبيق والمنصة</span>
                <span
                  dir="ltr"
                  data-testid="settings_version_badge"
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#0D2B24] text-[#01BC8D] font-mono font-bold tabular-nums"
                >
                  v{APP_VERSION}
                </span>
              </div>
              <div className="text-[11px] text-[#848E9C] truncate">
                Copy TR · {envInfo?.titleAr || config.environment} ·{' '}
                {connectionState.isConnected ? 'متصل' : 'غير متصل'}
              </div>
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-[#848E9C] shrink-0 transition-transform ${
              openGroups.about ? 'rotate-180 text-[#01BC8D]' : ''
            }`}
          />
        </button>

        {openGroups.about && (
          <div className="border-t border-[#1C232D] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="space-y-0.5">
                <div className="text-white font-semibold">USDⓈ-M Futures · Copy TR</div>
                <div className="text-[11px] text-[#848E9C]">
                  الحالة:{' '}
                  <span
                    className={
                      connectionState.isAuthenticated || connectionState.isConnected
                        ? 'text-[#01BC8D]'
                        : 'text-[#F65454]'
                    }
                  >
                    {connectionState.statusMessageAr}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onLive}
                data-testid="settings_live_review_button"
                className="bg-[#161B22] hover:bg-[#1E2530] border border-[#1C232D] text-[#01BC8D] font-semibold py-1.5 px-3 rounded-lg text-xs cursor-pointer transition-colors"
              >
                مراجعة أمان التداول
              </button>
            </div>

            <div
              data-testid="settings_version_history_card"
              className="pt-2 border-t border-[#1C232D] space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#01BC8D]" />
                  <span>سجل التحديثات</span>
                </span>
                <span dir="ltr" className="text-[11px] font-mono text-[#01BC8D] tabular-nums">
                  {APP_MAJOR_VERSION}.0 + {APP_PROMPT_REVISION} = v{APP_VERSION}
                </span>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {PROMPT_VERSION_HISTORY.slice()
                  .reverse()
                  .map((item) => (
                    <div
                      key={item.version}
                      className="flex items-start justify-between gap-2 bg-[#0B0E11] border border-[#1C232D] rounded-lg px-2.5 py-2 text-[11px]"
                    >
                      <div className="text-[#EAECEF] leading-relaxed">
                        <span className="text-[#848E9C] ml-1">#{item.promptNumber}</span>
                        <span>{item.summaryAr}</span>
                      </div>
                      <span
                        dir="ltr"
                        className="px-1.5 py-0.5 rounded bg-[#161B22] text-[#01BC8D] font-mono text-[10px] font-bold shrink-0 tabular-nums"
                      >
                        v{item.version}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
