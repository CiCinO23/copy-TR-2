import {
  MobileNotificationActionType,
  MobileNotificationSettings,
  MobileTradeNotification,
  PaperPosition,
  PaperVirtualAccountSummary,
} from '../types';

const NOTIFICATIONS_STORAGE_KEY = 'whale_mobile_notifications_log_v1';
const NOTIFICATION_SETTINGS_KEY = 'whale_mobile_notification_settings_v1';
const DRAWDOWN_ALERT_STATE_KEY = 'whale_drawdown_alert_state_v1';
const MAX_STORED_NOTIFICATIONS = 100;

export const DEFAULT_MOBILE_NOTIFICATION_SETTINGS: MobileNotificationSettings = {
  enabled: true,
  notifyOnOpen: true,
  notifyOnScaleIn: true,
  notifyOnPartialExit: true,
  notifyOnFullExit: true,
  notifyOnDrawdown: true,
  drawdownThresholdPercent: 10,
  soundEnabled: true,
  vibrationEnabled: true,
  browserPushEnabled: true,
  inAppBannerEnabled: true,
  lockScreenNotificationsEnabled: true,
  lockScreenShowSensitiveDetails: true,
  appExitBehavior: 'KEEP_ALIVE_BACKGROUND',
  wakeLockEnabled: true,
  telegramEnabled: false,
  telegramBotToken: '',
  telegramChatId: '',
};

interface AndroidAppControlBridge {
  setBackgroundMode?: (
    keepAlive: boolean,
    lockScreenNotifications: boolean,
    showSensitiveDetails: boolean
  ) => void;
  showNativeNotification?: (
    title: string,
    body: string,
    notifId: string,
    isUrgent: boolean
  ) => void;
  exitAppCompletely?: () => void;
}

declare global {
  interface Window {
    AndroidAppControl?: AndroidAppControlBridge;
  }
}

interface AccountDrawdownAlertRecord {
  alertedAtThreshold: number;
  peakAlertedDrawdown: number;
  lastAlertTimestamp: number;
}

type NotificationListener = (
  latest: MobileTradeNotification | null,
  all: MobileTradeNotification[],
  settings: MobileNotificationSettings
) => void;

class MobileNotificationService {
  private notifications: MobileTradeNotification[] = [];
  private settings: MobileNotificationSettings = { ...DEFAULT_MOBILE_NOTIFICATION_SETTINGS };
  private listeners: Set<NotificationListener> = new Set();
  private drawdownAlertState: Record<string, AccountDrawdownAlertRecord> = {};
  private wakeLockSentinel: { release: () => Promise<void> } | null = null;
  private isFullExitTriggered: boolean = false;

  constructor() {
    this.settings = this.loadSettings();
    this.notifications = this.loadNotifications();
    this.drawdownAlertState = this.loadDrawdownAlertState();
    this.initBackgroundAndLockScreenLifecycle();
  }

  private loadSettings(): MobileNotificationSettings {
    try {
      const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (raw) {
        return { ...DEFAULT_MOBILE_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_MOBILE_NOTIFICATION_SETTINGS };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
  }

  private loadNotifications(): MobileTradeNotification[] {
    try {
      const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  }

  private saveNotifications(): void {
    try {
      localStorage.setItem(
        NOTIFICATIONS_STORAGE_KEY,
        JSON.stringify(this.notifications.slice(0, MAX_STORED_NOTIFICATIONS))
      );
    } catch {
      // ignore
    }
  }

  private loadDrawdownAlertState(): Record<string, AccountDrawdownAlertRecord> {
    try {
      const raw = localStorage.getItem(DRAWDOWN_ALERT_STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  }

  private saveDrawdownAlertState(): void {
    try {
      localStorage.setItem(DRAWDOWN_ALERT_STATE_KEY, JSON.stringify(this.drawdownAlertState));
    } catch {
      // ignore
    }
  }

  public resetAccountDrawdownAlert(accountId?: string): void {
    if (accountId) {
      delete this.drawdownAlertState[accountId];
    } else {
      this.drawdownAlertState = {};
    }
    this.saveDrawdownAlertState();
  }

  public getSettings(): MobileNotificationSettings {
    return { ...this.settings };
  }

  public isAppStoppedByFullExit(): boolean {
    return this.isFullExitTriggered;
  }

  public resumeFromFullExit(): void {
    this.isFullExitTriggered = false;
    this.syncBackgroundAndLockScreenMode();
    this.emitChange(null);
  }

  private initBackgroundAndLockScreenLifecycle(): void {
    if (typeof window === 'undefined') return;

    this.syncBackgroundAndLockScreenMode();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.isFullExitTriggered) {
        this.applyWakeLock();
      }
    });

    window.addEventListener('pagehide', () => {
      if (this.settings.appExitBehavior === 'FULL_EXIT') {
        this.stopBackgroundWorkers();
      }
    });
  }

  private async applyWakeLock(): Promise<void> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    const shouldKeepAwake =
      !this.isFullExitTriggered &&
      this.settings.appExitBehavior === 'KEEP_ALIVE_BACKGROUND' &&
      (this.settings.wakeLockEnabled ?? true);

    try {
      if (shouldKeepAwake) {
        if (!this.wakeLockSentinel) {
          const wl = await (
            navigator as unknown as {
              wakeLock: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
            }
          ).wakeLock.request('screen');
          this.wakeLockSentinel = wl;
        }
      } else if (this.wakeLockSentinel) {
        await this.wakeLockSentinel.release();
        this.wakeLockSentinel = null;
      }
    } catch {
      // WakeLock requires active visible tab in some browsers
    }
  }

  private stopBackgroundWorkers(): void {
    try {
      if (this.wakeLockSentinel) {
        this.wakeLockSentinel.release().catch(() => {});
        this.wakeLockSentinel = null;
      }
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          reg?.active?.postMessage({ type: 'STOP_ALL_BACKGROUND' });
        });
      }
    } catch {
      // ignore
    }
  }

  public async syncBackgroundAndLockScreenMode(): Promise<void> {
    if (typeof window === 'undefined') return;

    const keepAlive =
      !this.isFullExitTriggered && this.settings.appExitBehavior === 'KEEP_ALIVE_BACKGROUND';
    const lockScreenNotif = Boolean(this.settings.lockScreenNotificationsEnabled ?? true);
    const showSensitive = Boolean(this.settings.lockScreenShowSensitiveDetails ?? true);

    // 1. Sync with Android Native APK Service & Lock Screen Notification Manager if present
    try {
      if (window.AndroidAppControl?.setBackgroundMode) {
        window.AndroidAppControl.setBackgroundMode(keepAlive, lockScreenNotif, showSensitive);
      }
    } catch {
      // ignore
    }

    // 2. Register and configure Web Service Worker (/sw.js)
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const targetWorker = reg.active || reg.waiting || reg.installing;
        targetWorker?.postMessage({
          type: 'CONFIGURE_BACKGROUND_MODE',
          keepAlive,
          lockScreenNotificationsEnabled: lockScreenNotif,
        });
      }
    } catch {
      // ignore
    }

    // 3. Apply Screen Wake Lock preference
    await this.applyWakeLock();
  }

  /**
   * Perform an immediate Full Exit of the app (stopping background services, workers, and closing Android Task if on APK)
   */
  public performFullAppExit(): void {
    this.isFullExitTriggered = true;
    this.stopBackgroundWorkers();
    try {
      if (typeof window !== 'undefined' && window.AndroidAppControl?.exitAppCompletely) {
        window.AndroidAppControl.exitAppCompletely();
      }
    } catch {
      // ignore
    }
    this.emitChange(null);
  }

  public updateSettings(partial: Partial<MobileNotificationSettings>): MobileNotificationSettings {
    const prevThreshold = this.settings.drawdownThresholdPercent;
    this.settings = { ...this.settings, ...partial };
    if (
      partial.drawdownThresholdPercent !== undefined &&
      partial.drawdownThresholdPercent !== prevThreshold
    ) {
      // Reset alert memory when user changes the drawdown threshold so accounts meeting the new threshold can alert
      this.resetAccountDrawdownAlert();
    }
    this.saveSettings();
    this.syncBackgroundAndLockScreenMode();
    this.emitChange(null);
    return { ...this.settings };
  }

  public getNotifications(): MobileTradeNotification[] {
    return [...this.notifications];
  }

  public getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  public markAllAsRead(): void {
    let changed = false;
    this.notifications = this.notifications.map((n) => {
      if (!n.read) {
        changed = true;
        return { ...n, read: true };
      }
      return n;
    });
    if (changed) {
      this.saveNotifications();
      this.emitChange(null);
    }
  }

  public markAsRead(id: string): void {
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    this.saveNotifications();
    this.emitChange(null);
  }

  public clearAllNotifications(): void {
    this.notifications = [];
    this.saveNotifications();
    this.emitChange(null);
  }

  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(latest: MobileTradeNotification | null): void {
    const snapshot = [...this.notifications];
    const currentSettings = { ...this.settings };
    this.listeners.forEach((cb) => cb(latest, snapshot, currentSettings));
  }

  /**
   * Request Browser/System Mobile Push Notification Permission
   */
  public async requestBrowserPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    if (Notification.permission === 'granted') {
      return 'granted';
    }
    try {
      const perm = await Notification.requestPermission();
      return perm;
    } catch {
      return Notification.permission;
    }
  }

  public getBrowserPermissionStatus(): NotificationPermission | 'unsupported' {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }

  /**
   * Play distinct mobile sound chime using Web Audio API
   */
  private playChime(actionType: MobileNotificationActionType, isProfit: boolean = true): void {
    if (!this.settings.soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const playTone = (freq: number, startOffset: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.14) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
        gain.gain.setValueAtTime(0.001, ctx.currentTime + startOffset);
        gain.gain.exponentialRampToValueAtTime(gainVal, ctx.currentTime + startOffset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + startOffset);
        osc.stop(ctx.currentTime + startOffset + duration);
      };

      if (actionType === 'DRAWDOWN_ALERT') {
        // Urgent warning siren / triple descending alert tone
        playTone(880.0, 0, 0.14, 'sawtooth', 0.16); // A5
        playTone(659.25, 0.14, 0.14, 'sawtooth', 0.16); // E5
        playTone(440.0, 0.28, 0.26, 'sawtooth', 0.2); // A4
      } else if (actionType === 'OPEN_TRADE') {
        // Ascending emerald chime
        playTone(587.33, 0, 0.14, 'triangle', 0.15); // D5
        playTone(880.0, 0.12, 0.22, 'triangle', 0.18); // A5
      } else if (actionType === 'SCALE_IN') {
        // Double reinforcement pulse
        playTone(523.25, 0, 0.12, 'sine', 0.15); // C5
        playTone(659.25, 0.1, 0.12, 'sine', 0.15); // E5
        playTone(783.99, 0.2, 0.2, 'sine', 0.18); // G5
      } else if (actionType === 'PARTIAL_EXIT') {
        // Partial harvest two-tone
        playTone(783.99, 0, 0.14, 'sine', 0.15);
        playTone(659.25, 0.13, 0.2, 'sine', 0.15);
      } else {
        // FULL_EXIT
        if (isProfit) {
          playTone(523.25, 0, 0.12, 'triangle', 0.16);
          playTone(659.25, 0.11, 0.12, 'triangle', 0.16);
          playTone(1046.5, 0.22, 0.28, 'triangle', 0.2);
        } else {
          playTone(440.0, 0, 0.16, 'sine', 0.15);
          playTone(349.23, 0.15, 0.24, 'sine', 0.15);
        }
      }
    } catch {
      // AudioContext blocked until user interaction
    }
  }

  /**
   * Vibrate mobile phone
   */
  private triggerVibration(actionType: MobileNotificationActionType): void {
    if (!this.settings.vibrationEnabled || typeof navigator === 'undefined' || !navigator.vibrate) {
      return;
    }
    try {
      if (actionType === 'DRAWDOWN_ALERT') {
        navigator.vibrate([250, 80, 250, 80, 320]);
      } else if (actionType === 'OPEN_TRADE') {
        navigator.vibrate([120, 60, 140]);
      } else if (actionType === 'SCALE_IN') {
        navigator.vibrate([90, 50, 90, 50, 140]);
      } else if (actionType === 'PARTIAL_EXIT') {
        navigator.vibrate([100, 70, 100]);
      } else {
        navigator.vibrate([180, 80, 220]);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Format price cleanly
   */
  private formatPrice(p: number): string {
    if (!p || isNaN(p)) return '0.00';
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(6);
  }

  /**
   * Dispatch native system & Lock Screen notification on Android APK / iOS PWA / Desktop Browser
   */
  private async sendBrowserSystemNotification(item: MobileTradeNotification): Promise<void> {
    if (this.isFullExitTriggered && this.settings.appExitBehavior === 'FULL_EXIT') {
      return;
    }

    const allowPush =
      this.settings.browserPushEnabled || (this.settings.lockScreenNotificationsEnabled ?? true);
    if (!allowPush || typeof window === 'undefined') {
      return;
    }

    const showSensitiveOnLockScreen = this.settings.lockScreenShowSensitiveDetails ?? true;
    let title = `${item.actionTitleAr} — ${item.symbol}`;
    let lines: string[] = [];

    if (item.actionType === 'DRAWDOWN_ALERT') {
      const accName = item.accountName || item.traderName || 'حساب افتراضي';
      const ddPct = (item.drawdownPercent ?? 0).toFixed(2);
      const threshPct = (
        item.drawdownThresholdPercent ?? this.settings.drawdownThresholdPercent
      ).toFixed(1);
      const initBal = (item.initialBalanceUsdt ?? item.marginUsdt ?? 0).toFixed(2);
      const eqNow = (item.currentEquityUsdt ?? item.price ?? 0).toFixed(2);
      const lossVal = (item.drawdownLossUsdt ?? Math.abs(item.realizedPnlUsdt || 0)).toFixed(2);

      title = `${item.actionTitleAr} — ${accName}`;
      if (showSensitiveOnLockScreen) {
        lines = [
          `الحساب الافتراضي: ${accName} | نسبة التراجع: ${ddPct}% (الحد: ${threshPct}%)`,
          `رأس المال الأولي: ${initBal}$ ⬅️ الرصيد الحالي (Equity): ${eqNow}$`,
          `مقدار التراجع من رأس المال الأولي: -${lossVal}$ USDT`,
        ];
      } else {
        lines = [
          `الحساب الافتراضي: ${accName} • تجاوز حد التراجع المسموح (${threshPct}%)`,
          `🔒 افتح التطبيق للاطلاع على التفاصيل المالية الكاملة للرصيد`,
        ];
      }
    } else {
      const sideAr = item.side === 'LONG' ? 'شراء Long 🟢' : 'بيع Short 🔴';
      const modeAr = item.executionMode === 'REAL' ? 'حقيقي (KuCoin)' : 'افتراضي (Simulation)';
      lines = [
        `العملة: ${item.symbol} | ${sideAr} (${item.leverage}x)`,
        `المتداول المصدر: ${item.traderName} • الوضع: ${modeAr}`,
      ];

      if (!showSensitiveOnLockScreen) {
        lines.push(`🔒 تفاصيل المبالغ والربح/الخسارة مخفية على شاشة القفل للخصوصية`);
      } else if (item.actionType === 'OPEN_TRADE') {
        lines.push(
          `سعر الدخول: ${this.formatPrice(item.entryPrice)}$ | قيمة الصفقة: ${item.marginUsdt.toFixed(2)}$`,
          `الكمية: ${item.quantity} | العمولة: ${item.commissionUsdt.toFixed(4)}$`
        );
      } else if (item.actionType === 'SCALE_IN') {
        const addedUsdt = Math.abs(item.marginDeltaUsdt || 0);
        lines.push(
          `قيمة التدعيم: +${addedUsdt.toFixed(2)}$ (+${Math.abs(item.volumePercent)}%) | السعر: ${this.formatPrice(item.price)}$`,
          `متوسط الدخول الجديد: ${this.formatPrice(item.entryPrice)}$ | إجمالي الهامش: ${item.marginUsdt.toFixed(2)}$ (${item.remainingScalePercent}%)`
        );
      } else if (item.actionType === 'PARTIAL_EXIT') {
        const withdrawnUsdt = Math.abs(item.marginDeltaUsdt || 0);
        const pnlVal = item.realizedPnlUsdt || 0;
        const pnlSign = pnlVal >= 0 ? '+' : '';
        lines.push(
          `نسبة السحب: -${Math.abs(item.volumePercent)}% (${withdrawnUsdt.toFixed(2)}$) | سعر الخروج: ${this.formatPrice(item.exitPrice || item.price)}$`,
          `الربح المحقق للجزء: ${pnlSign}${pnlVal.toFixed(2)}$ | المتبقي بالصفقة: ${item.remainingScalePercent}% (${item.marginUsdt.toFixed(2)}$)`
        );
      } else {
        // FULL_EXIT
        const pnlVal = item.realizedPnlUsdt || 0;
        const pnlPct = item.realizedPnlPercent || 0;
        const pnlSign = pnlVal >= 0 ? '+' : '';
        lines.push(
          `سعر الدخول: ${this.formatPrice(item.entryPrice)}$ ⬅️ سعر الخروج: ${this.formatPrice(item.exitPrice || item.price)}$`,
          `صافي الربح/الخسارة: ${pnlSign}${pnlVal.toFixed(2)}$ (${pnlSign}${pnlPct.toFixed(2)}%) | العمولة: ${item.commissionUsdt.toFixed(4)}$`
        );
      }
    }

    const body = lines.join('\n');
    const isUrgent =
      item.actionType === 'DRAWDOWN_ALERT' || Boolean(this.settings.lockScreenNotificationsEnabled);

    // 1. Dispatch to Native Android APK NotificationManager (shows directly on Android Lock Screen)
    try {
      if (window.AndroidAppControl?.showNativeNotification) {
        window.AndroidAppControl.showNativeNotification(title, body, item.id, isUrgent);
      }
    } catch {
      // ignore
    }

    // 2. Dispatch to Web Notification / Service Worker with Lock Screen persistence
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const vibratePattern =
      item.actionType === 'DRAWDOWN_ALERT' ? [250, 80, 250, 80, 320] : [180, 70, 200];

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, {
            body,
            icon: '/assets/aistudio/icone_c1401ade.png',
            badge: '/assets/aistudio/icone_c1401ade.png',
            dir: 'rtl',
            lang: 'ar',
            tag: item.id,
            requireInteraction: Boolean(this.settings.lockScreenNotificationsEnabled ?? true),
            silent: !this.settings.soundEnabled,
            vibrate: this.settings.vibrationEnabled ? vibratePattern : undefined,
          } as NotificationOptions);
          return;
        }
      }
      new Notification(title, {
        body,
        icon: '/assets/aistudio/icone_c1401ade.png',
        dir: 'rtl',
        lang: 'ar',
        tag: item.id,
        requireInteraction: Boolean(this.settings.lockScreenNotificationsEnabled ?? true),
        silent: !this.settings.soundEnabled,
      });
    } catch {
      // Fallback handled by in-app mobile banner
    }
  }

  /**
   * Send rich Telegram mobile push notification if enabled
   */
  public async sendTelegramPushNotification(item: MobileTradeNotification): Promise<boolean> {
    if (
      !this.settings.telegramEnabled ||
      !this.settings.telegramBotToken.trim() ||
      !this.settings.telegramChatId.trim()
    ) {
      return false;
    }

    const token = this.settings.telegramBotToken.trim();
    const chatId = this.settings.telegramChatId.trim();
    const timeStr = new Date(item.timestamp).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    if (item.actionType === 'DRAWDOWN_ALERT') {
      const accName = item.accountName || item.traderName || 'حساب افتراضي';
      const ddPct = (item.drawdownPercent ?? 0).toFixed(2);
      const threshPct = (item.drawdownThresholdPercent ?? this.settings.drawdownThresholdPercent).toFixed(1);
      const initBal = (item.initialBalanceUsdt ?? item.marginUsdt ?? 0).toFixed(2);
      const eqNow = (item.currentEquityUsdt ?? item.price ?? 0).toFixed(2);
      const lossVal = (item.drawdownLossUsdt ?? Math.abs(item.realizedPnlUsdt || 0)).toFixed(2);

      const drawdownHtml = [
        `🚨 <b>${item.actionTitleAr}</b>`,
        `━━━━━━━━━━━━━━━━━━`,
        `🏦 <b>الحساب الافتراضي:</b> <code>${accName}</code>`,
        `📉 <b>نسبة التراجع الحالية:</b> <code>-${ddPct}%</code> (تجاوزت الحد <code>${threshPct}%</code>)`,
        `💰 <b>رأس المال الأولي:</b> <code>$${initBal} USDT</code>`,
        `📊 <b>الرصيد الحالي (Equity):</b> <code>$${eqNow} USDT</code>`,
        `🔻 <b>قيمة التراجع بالدولار:</b> <code>-$${lossVal} USDT</code>`,
        `━━━━━━━━━━━━━━━━━━`,
        `🕒 <b>الوقت:</b> ${timeStr}`,
      ].join('\n');

      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: drawdownHtml,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        });
        return res.ok;
      } catch {
        return false;
      }
    }

    const sideBadge = item.side === 'LONG' ? '🟢 LONG (شراء)' : '🔴 SHORT (بيع)';
    const modeBadge =
      item.executionMode === 'REAL' ? '⚡ حقيقي (KuCoin Live)' : '🧪 محاكاة (Simulation)';

    let detailsBlock = '';
    if (item.actionType === 'OPEN_TRADE') {
      detailsBlock = [
        `💵 <b>قيمة الصفقة (الهامش):</b> <code>$${item.marginUsdt.toFixed(2)} USDT</code>`,
        `🎯 <b>سعر الدخول:</b> <code>$${this.formatPrice(item.entryPrice)}</code>`,
        `📦 <b>الكمية المنفذة:</b> <code>${item.quantity}</code>`,
        `📊 <b>الحجم الابتدائي:</b> <code>100%</code>`,
        `🧾 <b>العمولة:</b> <code>$${item.commissionUsdt.toFixed(4)}</code>`,
      ].join('\n');
    } else if (item.actionType === 'SCALE_IN') {
      const addedUsdt = Math.abs(item.marginDeltaUsdt || 0);
      detailsBlock = [
        `➕ <b>المبلغ المضاف للتدعيم:</b> <code>+$${addedUsdt.toFixed(2)} USDT (+${Math.abs(item.volumePercent)}%)</code>`,
        `⚡ <b>سعر التدعيم:</b> <code>$${this.formatPrice(item.price)}</code>`,
        `🎯 <b>متوسط سعر الدخول الجديد:</b> <code>$${this.formatPrice(item.entryPrice)}</code>`,
        `💼 <b>إجمالي قيمة الصفقة الآن:</b> <code>$${item.marginUsdt.toFixed(2)} USDT</code>`,
        `📈 <b>نسبة حجم الصفقة الحالية:</b> <code>${item.remainingScalePercent}%</code>`,
        `🧾 <b>إجمالي العمولة:</b> <code>$${item.commissionUsdt.toFixed(4)}</code>`,
      ].join('\n');
    } else if (item.actionType === 'PARTIAL_EXIT') {
      const withdrawnUsdt = Math.abs(item.marginDeltaUsdt || 0);
      const pnlVal = item.realizedPnlUsdt || 0;
      const pnlEmoji = pnlVal >= 0 ? '✅' : '🔻';
      const pnlSign = pnlVal >= 0 ? '+' : '';
      detailsBlock = [
        `➖ <b>الجزء المسحوب:</b> <code>-${Math.abs(item.volumePercent)}% ($${withdrawnUsdt.toFixed(2)} USDT)</code>`,
        `🎯 <b>سعر الدخول:</b> <code>$${this.formatPrice(item.entryPrice)}</code>`,
        `🏁 <b>سعر الخروج الجزئي:</b> <code>$${this.formatPrice(item.exitPrice || item.price)}</code>`,
        `${pnlEmoji} <b>الربح/الخسارة المحققة للجزء:</b> <code>${pnlSign}$${pnlVal.toFixed(2)} USDT</code>`,
        `💼 <b>الهامش المتبقي بالصفقة:</b> <code>$${item.marginUsdt.toFixed(2)} USDT (${item.remainingScalePercent}%)</code>`,
      ].join('\n');
    } else {
      const pnlVal = item.realizedPnlUsdt || 0;
      const pnlPct = item.realizedPnlPercent || 0;
      const pnlEmoji = pnlVal >= 0 ? '🏆 ربح محقق' : '🔻 خسارة محققة';
      const pnlSign = pnlVal >= 0 ? '+' : '';
      detailsBlock = [
        `🎯 <b>سعر الدخول:</b> <code>$${this.formatPrice(item.entryPrice)}</code>`,
        `🏁 <b>سعر الخروج النهائي:</b> <code>$${this.formatPrice(item.exitPrice || item.price)}</code>`,
        `📦 <b>الكمية المغلقة:</b> <code>${item.quantity}</code>`,
        `${pnlEmoji}: <code>${pnlSign}$${pnlVal.toFixed(2)} USDT (${pnlSign}${pnlPct.toFixed(2)}%)</code>`,
        `🧾 <b>إجمالي العمولة المقتطعة:</b> <code>$${item.commissionUsdt.toFixed(4)}</code>`,
      ].join('\n');
    }

    const htmlMessage = [
      `🔔 <b>${item.actionTitleAr}</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `🪙 <b>العملة:</b> <code>${item.symbol}</code>`,
      `🧭 <b>الاتجاه والرافعة:</b> ${sideBadge} × <b>${item.leverage}x</b>`,
      `👤 <b>المتداول المصدر:</b> ${item.traderName}`,
      `⚙️ <b>وضع التنفيذ:</b> ${modeBadge}`,
      `━━━━━━━━━━━━━━━━━━`,
      detailsBlock,
      `━━━━━━━━━━━━━━━━━━`,
      `🕒 <b>الوقت:</b> ${timeStr}`,
    ].join('\n');

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: htmlMessage,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Dispatch a full trade notification when a position is opened, scaled in, partially exited, or closed
   */
  public notifyTradeEvent(params: {
    actionType: MobileNotificationActionType;
    position: PaperPosition;
    executionPrice: number;
    volumePercent?: number;
    marginDeltaUsdt?: number;
    realizedPnlDeltaUsdt?: number;
  }): MobileTradeNotification | null {
    if (!this.settings.enabled) return null;

    const { actionType, position, executionPrice, volumePercent, marginDeltaUsdt, realizedPnlDeltaUsdt } =
      params;

    if (actionType === 'OPEN_TRADE' && !this.settings.notifyOnOpen) return null;
    if (actionType === 'SCALE_IN' && !this.settings.notifyOnScaleIn) return null;
    if (actionType === 'PARTIAL_EXIT' && !this.settings.notifyOnPartialExit) return null;
    if (actionType === 'FULL_EXIT' && !this.settings.notifyOnFullExit) return null;

    const traderName =
      position.sourceTraderName ||
      (position.sourceType === 'SMART_MONEY'
        ? 'حوت Smart Money'
        : position.sourceType === 'COPY_TRADING'
        ? 'متداول Copy Trading'
        : 'صفقة يدوية');

    let actionTitleAr = 'فتح صفقة جديدة';
    let summaryTextAr = '';
    let volPct = volumePercent ?? 100;
    let remainingPct = position.currentScalePercent ?? 100;
    let pnlUsdt: number | undefined = undefined;
    let pnlPercent: number | undefined = undefined;

    const baseMargin =
      position.initialMarginUsdt || position.marginUsdt || 25;

    if (actionType === 'OPEN_TRADE') {
      actionTitleAr = '🟢 فتح صفقة جديدة';
      volPct = position.currentScalePercent || 100;
      remainingPct = position.currentScalePercent || 100;
      const userTimeStr = new Date(position.openTime || Date.now())
        .toLocaleString('ar-EG-u-nu-latn', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
      const traderTimeStr = position.traderEntryTime
        ? new Date(position.traderEntryTime)
            .toLocaleString('ar-EG-u-nu-latn', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
            .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        : userTimeStr;
      const isCopiedOrLate =
        (position.sourceType && position.sourceType !== 'MANUAL') ||
        (position.traderEntryTime && Math.abs((position.openTime || 0) - position.traderEntryTime) > 1000) ||
        (position.traderEntryPrice && Math.abs(position.traderEntryPrice - position.entryPrice) > 0.0001);

      if (isCopiedOrLate) {
        const tPrice = position.traderEntryPrice || position.entryPrice;
        summaryTextAr = `تم فتح صفقة ${position.side === 'LONG' ? 'شراء Long' : 'بيع Short'} على ${position.symbol} بقيمة ${position.marginUsdt.toFixed(2)}$ (${position.leverage}x) • سعر دخول المتداول: ${this.formatPrice(tPrice)}$ (الوقت: ${traderTimeStr}) • سعر دخولي: ${this.formatPrice(position.entryPrice)}$ (الوقت: ${userTimeStr})`;
      } else {
        summaryTextAr = `تم فتح صفقة ${position.side === 'LONG' ? 'شراء Long' : 'بيع Short'} على ${position.symbol} بقيمة ${position.marginUsdt.toFixed(2)}$ (${position.leverage}x) • سعر دخولي: ${this.formatPrice(position.entryPrice)}$ (الوقت: ${userTimeStr})`;
      }
    } else if (actionType === 'SCALE_IN') {
      const addedUsdt = Math.abs(marginDeltaUsdt || 0);
      volPct = Math.abs(volumePercent || 25);
      remainingPct = position.currentScalePercent || 100 + volPct;
      actionTitleAr = `🔵 تدعيم الصفقة (+${volPct}%)`;
      summaryTextAr = `تم تدعيم صفقة ${position.symbol} بمبلغ +${addedUsdt.toFixed(2)}$ (+${volPct}%) عند سعر ${this.formatPrice(executionPrice)}$ • إجمالي الهامش الآن ${position.marginUsdt.toFixed(2)}$ (الحجم: ${remainingPct}%)`;
    } else if (actionType === 'PARTIAL_EXIT') {
      const withdrawnUsdt = Math.abs(marginDeltaUsdt || 0);
      volPct = -Math.abs(volumePercent || 25);
      remainingPct = position.currentScalePercent || 50;
      pnlUsdt = realizedPnlDeltaUsdt ?? 0;
      pnlPercent = withdrawnUsdt > 0 ? (pnlUsdt / withdrawnUsdt) * 100 : 0;
      const pnlSign = pnlUsdt >= 0 ? '+' : '';
      actionTitleAr = `🟠 سحب جزئي من الصفقة (-${Math.abs(volPct)}%)`;
      summaryTextAr = `تم سحب ${Math.abs(volPct)}% (${withdrawnUsdt.toFixed(2)}$) من صفقة ${position.symbol} بسعر ${this.formatPrice(executionPrice)}$ • الربح المحقق للجزء: ${pnlSign}${pnlUsdt.toFixed(2)}$ • المتبقي: ${remainingPct}%`;
    } else {
      // FULL_EXIT
      volPct = -100;
      remainingPct = 0;
      pnlUsdt = realizedPnlDeltaUsdt ?? position.realizedPnl ?? 0;
      pnlPercent = baseMargin > 0 ? (pnlUsdt / baseMargin) * 100 : 0;
      const pnlSign = pnlUsdt >= 0 ? '+' : '';
      actionTitleAr =
        pnlUsdt >= 0 ? '🏆 إغلاق الصفقة بربح' : '🔴 إغلاق كامل للصفقة';
      summaryTextAr = `تم الخروج الكامل من صفقة ${position.symbol} بسعر ${this.formatPrice(executionPrice)}$ (دخول: ${this.formatPrice(position.entryPrice)}$) • صافي النتيجة: ${pnlSign}${pnlUsdt.toFixed(2)}$ (${pnlSign}${pnlPercent.toFixed(2)}%)`;
    }

    const notification: MobileTradeNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      read: false,
      actionType,
      actionTitleAr,
      symbol: position.symbol,
      side: position.side,
      leverage: position.leverage,
      executionMode: position.executionMode || 'VIRTUAL',
      traderName,
      sourceType: position.sourceType || 'MANUAL',
      price: executionPrice,
      entryPrice: position.entryPrice,
      traderOriginalEntryPrice: position.traderEntryPrice || position.entryPrice,
      traderOriginalEntryTime: position.traderEntryTime || position.openTime,
      userEntryTime: position.openTime,
      exitPrice:
        actionType === 'PARTIAL_EXIT' || actionType === 'FULL_EXIT'
          ? executionPrice
          : undefined,
      quantity: position.quantity,
      marginUsdt: position.marginUsdt,
      marginDeltaUsdt,
      volumePercent: volPct,
      remainingScalePercent: remainingPct,
      commissionUsdt: position.commissionUsdt || 0,
      realizedPnlUsdt: pnlUsdt,
      realizedPnlPercent: pnlPercent,
      summaryTextAr,
    };

    this.notifications.unshift(notification);
    if (this.notifications.length > MAX_STORED_NOTIFICATIONS) {
      this.notifications = this.notifications.slice(0, MAX_STORED_NOTIFICATIONS);
    }
    this.saveNotifications();

    // Trigger mobile sound, vibration, native system notification, and Telegram push
    this.playChime(actionType, (pnlUsdt ?? 0) >= 0);
    this.triggerVibration(actionType);
    this.sendBrowserSystemNotification(notification);
    this.sendTelegramPushNotification(notification);

    this.emitChange(notification);
    return notification;
  }

  /**
   * Dispatch an instant Push Notification when a virtual account's Drawdown reaches or exceeds the threshold
   */
  public notifyDrawdownAlert(params: {
    accountId: string;
    accountName: string;
    initialBalanceUsdt: number;
    currentEquityUsdt: number;
    drawdownPercent: number;
    thresholdPercent?: number;
    openPositionsCount?: number;
    force?: boolean;
  }): MobileTradeNotification | null {
    if (!params.force) {
      if (!this.settings.enabled || !this.settings.notifyOnDrawdown) return null;
    }

    const threshold = Math.max(
      0.5,
      params.thresholdPercent ?? this.settings.drawdownThresholdPercent ?? 10
    );
    const ddPct = parseFloat(Math.max(0, params.drawdownPercent).toFixed(2));
    const lossUsdt = parseFloat(
      Math.max(0, params.initialBalanceUsdt - params.currentEquityUsdt).toFixed(2)
    );
    const remainingPct = parseFloat(Math.max(0, 100 - ddPct).toFixed(2));

    const notification: MobileTradeNotification = {
      id: `notif_dd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      read: false,
      actionType: 'DRAWDOWN_ALERT',
      actionTitleAr: `⚠️ تنبيه تراجع الرصيد (${ddPct}%)`,
      symbol: 'USDT',
      side: 'SHORT',
      leverage: 1,
      executionMode: 'VIRTUAL',
      traderName: params.accountName,
      sourceType: 'COPY_TRADING',
      price: params.currentEquityUsdt,
      entryPrice: params.initialBalanceUsdt,
      exitPrice: params.currentEquityUsdt,
      quantity: params.openPositionsCount ?? 0,
      marginUsdt: params.initialBalanceUsdt,
      marginDeltaUsdt: -lossUsdt,
      volumePercent: -ddPct,
      remainingScalePercent: remainingPct,
      commissionUsdt: 0,
      realizedPnlUsdt: -lossUsdt,
      realizedPnlPercent: -ddPct,
      accountId: params.accountId,
      accountName: params.accountName,
      drawdownPercent: ddPct,
      drawdownThresholdPercent: threshold,
      initialBalanceUsdt: params.initialBalanceUsdt,
      currentEquityUsdt: params.currentEquityUsdt,
      drawdownLossUsdt: lossUsdt,
      summaryTextAr: `تنبيه مخاطر فوري: وصلت نسبة التراجع (Drawdown) في "${params.accountName}" إلى ${ddPct}% من رأس المال الأولي (${params.initialBalanceUsdt.toFixed(2)}$ ⬅️ ${params.currentEquityUsdt.toFixed(2)}$ • تراجع -${lossUsdt.toFixed(2)}$) متجاوزة الحد المحدد (${threshold}%).`,
    };

    this.notifications.unshift(notification);
    if (this.notifications.length > MAX_STORED_NOTIFICATIONS) {
      this.notifications = this.notifications.slice(0, MAX_STORED_NOTIFICATIONS);
    }
    this.saveNotifications();

    this.playChime('DRAWDOWN_ALERT', false);
    this.triggerVibration('DRAWDOWN_ALERT');
    this.sendBrowserSystemNotification(notification);
    this.sendTelegramPushNotification(notification);

    this.emitChange(notification);
    return notification;
  }

  /**
   * Monitor all virtual accounts and fire an instant Push Notification when any account's drawdown
   * from initial capital reaches or exceeds the configured threshold (e.g., 10%).
   */
  public checkAccountsDrawdown(accounts: PaperVirtualAccountSummary[]): MobileTradeNotification[] {
    if (!this.settings.enabled || !this.settings.notifyOnDrawdown) return [];

    const threshold = Math.max(0.5, Number(this.settings.drawdownThresholdPercent) || 10);
    const triggered: MobileTradeNotification[] = [];
    let stateChanged = false;

    for (const acc of accounts) {
      if (!acc || acc.initialBalance <= 0) continue;

      const ddPct =
        acc.drawdownPercent !== undefined
          ? acc.drawdownPercent
          : acc.totalEquity < acc.initialBalance
          ? parseFloat((((acc.initialBalance - acc.totalEquity) / acc.initialBalance) * 100).toFixed(2))
          : 0;

      const prevRecord = this.drawdownAlertState[acc.id];

      if (ddPct >= threshold) {
        // Trigger if never alerted for this drawdown wave, or if threshold was lowered, or if drawdown worsened by >= 5% more
        const shouldAlert =
          !prevRecord ||
          prevRecord.alertedAtThreshold > threshold ||
          ddPct >= prevRecord.peakAlertedDrawdown + 5;

        if (shouldAlert) {
          this.drawdownAlertState[acc.id] = {
            alertedAtThreshold: threshold,
            peakAlertedDrawdown: Math.max(ddPct, prevRecord?.peakAlertedDrawdown || 0),
            lastAlertTimestamp: Date.now(),
          };
          stateChanged = true;

          const notif = this.notifyDrawdownAlert({
            accountId: acc.id,
            accountName: acc.name,
            initialBalanceUsdt: acc.initialBalance,
            currentEquityUsdt: acc.totalEquity,
            drawdownPercent: ddPct,
            thresholdPercent: threshold,
            openPositionsCount: acc.openPositionsCount,
          });
          if (notif) triggered.push(notif);
        }
      } else if (prevRecord && ddPct < threshold * 0.9) {
        // Account recovered below 90% of the threshold — re-arm alert for future drawdowns
        delete this.drawdownAlertState[acc.id];
        stateChanged = true;
      }
    }

    if (stateChanged) {
      this.saveDrawdownAlertState();
    }

    return triggered;
  }

  /**
   * Trigger a realistic test notification so the user can verify mobile banner, sound, vibration, and Telegram
   */
  public triggerTestNotification(
    actionType: MobileNotificationActionType = 'OPEN_TRADE'
  ): MobileTradeNotification {
    if (actionType === 'DRAWDOWN_ALERT') {
      const thresh = Math.max(0.5, Number(this.settings.drawdownThresholdPercent) || 10);
      const simulatedDd = parseFloat((thresh + 1.45).toFixed(2));
      const initBal = 1000;
      const eqNow = parseFloat((initBal * (1 - simulatedDd / 100)).toFixed(2));
      return this.notifyDrawdownAlert({
        accountId: 'acc_default',
        accountName: 'الحساب الافتراضي 1',
        initialBalanceUsdt: initBal,
        currentEquityUsdt: eqNow,
        drawdownPercent: simulatedDd,
        thresholdPercent: thresh,
        openPositionsCount: 3,
        force: true,
      })!;
    }

    const mockPosition: PaperPosition = {
      id: `test_pos_${Date.now()}`,
      symbol: 'BTCUSDT',
      side: 'LONG',
      quantity: 0.0026,
      marginUsdt: actionType === 'SCALE_IN' ? 37.5 : actionType === 'PARTIAL_EXIT' ? 15.0 : 25.0,
      initialMarginUsdt: 25.0,
      entryPrice: 96420.5,
      leverage: 10,
      commissionUsdt: 0.15,
      status: actionType === 'FULL_EXIT' ? 'CLOSED' : 'OPEN',
      openTime: Date.now() - 3600000,
      closeTime: actionType === 'FULL_EXIT' ? Date.now() : undefined,
      currentScalePercent:
        actionType === 'SCALE_IN'
          ? 150
          : actionType === 'PARTIAL_EXIT'
          ? 60
          : actionType === 'FULL_EXIT'
          ? 0
          : 100,
      realizedPnl: actionType === 'FULL_EXIT' ? 6.85 : actionType === 'PARTIAL_EXIT' ? 2.45 : 0,
      sourceTraderName: 'AlphaWhale_Quant',
      sourceType: 'COPY_TRADING',
      executionMode: 'VIRTUAL',
    };

    const prevEnabled = this.settings.enabled;
    this.settings.enabled = true;
    const created = this.notifyTradeEvent({
      actionType,
      position: mockPosition,
      executionPrice:
        actionType === 'OPEN_TRADE'
          ? 96420.5
          : actionType === 'SCALE_IN'
          ? 96150.0
          : 98840.0,
      volumePercent:
        actionType === 'OPEN_TRADE'
          ? 100
          : actionType === 'SCALE_IN'
          ? 50
          : actionType === 'PARTIAL_EXIT'
          ? -40
          : -100,
      marginDeltaUsdt:
        actionType === 'OPEN_TRADE'
          ? 25.0
          : actionType === 'SCALE_IN'
          ? 12.5
          : actionType === 'PARTIAL_EXIT'
          ? -10.0
          : -25.0,
      realizedPnlDeltaUsdt:
        actionType === 'PARTIAL_EXIT'
          ? 2.45
          : actionType === 'FULL_EXIT'
          ? 6.85
          : undefined,
    });
    this.settings.enabled = prevEnabled;
    return created!;
  }

  /**
   * Dispatch an interactive In-App Notification when a previous/reconnection trade has an unfavorable price
   * compared to the trader's entry price, giving the user the choice to execute now at current price or skip.
   */
  public notifyReconnectTradeChoice(params: {
    choiceId: string;
    symbol: string;
    side: 'LONG' | 'SHORT';
    leverage: number;
    marginUsdt: number;
    traderName: string;
    sourceType: 'COPY_TRADING' | 'SMART_MONEY';
    traderEntryPrice: number;
    currentMarketPrice: number;
    priceDiffPercent: number;
    accountId: string;
    accountName: string;
    executionMode?: 'VIRTUAL' | 'REAL';
  }): MobileTradeNotification | null {
    const isShort = params.side === 'SHORT';
    const sideAr = isShort ? 'بيع (SHORT)' : 'شراء (LONG)';
    const comparisonAr = isShort
      ? `السعر الحالي (${this.formatPrice(params.currentMarketPrice)}$) أقل من سعر دخول المتداول (${this.formatPrice(params.traderEntryPrice)}$)`
      : `السعر الحالي (${this.formatPrice(params.currentMarketPrice)}$) أعلى من سعر دخول المتداول (${this.formatPrice(params.traderEntryPrice)}$)`;

    const notification: MobileTradeNotification = {
      id: `notif_choice_${params.choiceId}`,
      timestamp: Date.now(),
      read: false,
      actionType: 'RECONNECT_TRADE_CHOICE',
      actionTitleAr: `⏳ خيار تنفيذ صفقة سابقة (${sideAr})`,
      symbol: params.symbol,
      side: params.side,
      leverage: params.leverage,
      executionMode: params.executionMode || 'VIRTUAL',
      traderName: params.traderName,
      sourceType: params.sourceType,
      price: params.currentMarketPrice,
      entryPrice: params.traderEntryPrice,
      exitPrice: params.currentMarketPrice,
      quantity: Number(((params.marginUsdt * params.leverage) / Math.max(0.0001, params.currentMarketPrice)).toFixed(5)),
      marginUsdt: params.marginUsdt,
      volumePercent: params.priceDiffPercent,
      remainingScalePercent: 100,
      commissionUsdt: 0,
      accountId: params.accountId,
      accountName: params.accountName,
      pendingTradeChoiceId: params.choiceId,
      traderOriginalEntryPrice: params.traderEntryPrice,
      summaryTextAr: `صفقة ${sideAr} سابقة على ${params.symbol} لدى "${params.traderName}": ${comparisonAr}. السعر الحالي ليس في مصلحتك مقارنة بسعر دخول المتداول — اختر التنفيذ بالسعر الحالي أو التجاهل.`,
    };

    // Avoid duplicate unread notifications for the exact same choiceId
    this.notifications = [
      notification,
      ...this.notifications.filter((n) => n.pendingTradeChoiceId !== params.choiceId),
    ].slice(0, MAX_STORED_NOTIFICATIONS);
    this.saveNotifications();

    this.playChime('PARTIAL_EXIT', false);
    this.triggerVibration('PARTIAL_EXIT');
    this.sendBrowserSystemNotification(notification);
    this.emitChange(notification);
    return notification;
  }

  /**
   * Dispatch a notification when the user secures an open position with a Stop-Loss near the current price
   */
  public notifyPositionSecured(params: {
    position: PaperPosition;
    currentPrice: number;
    stopLossPrice: number;
  }): MobileTradeNotification | null {
    if (!this.settings.enabled) return null;
    const { position, currentPrice, stopLossPrice } = params;
    const notification: MobileTradeNotification = {
      id: `notif_sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      read: false,
      actionType: 'POSITION_SECURED',
      actionTitleAr: '🛡️ تأمين الصفقة بوقف خسارة',
      symbol: position.symbol,
      side: position.side,
      leverage: position.leverage,
      executionMode: position.executionMode || 'VIRTUAL',
      traderName: position.sourceTraderName || 'تأمين يدوي',
      sourceType: position.sourceType || 'MANUAL',
      price: currentPrice,
      entryPrice: position.entryPrice,
      exitPrice: stopLossPrice,
      quantity: position.quantity,
      marginUsdt: position.marginUsdt,
      volumePercent: position.currentScalePercent || 100,
      remainingScalePercent: position.currentScalePercent || 100,
      commissionUsdt: position.commissionUsdt || 0,
      accountId: position.accountId,
      accountName: position.accountName,
      stopLossPrice,
      summaryTextAr: `تم تأمين صفقة ${position.symbol} (${position.side}) بوضع وقف خسارة قرب السعر الحالي عند ${this.formatPrice(stopLossPrice)}$ (السعر الحالي: ${this.formatPrice(currentPrice)}$).`,
    };

    this.notifications.unshift(notification);
    if (this.notifications.length > MAX_STORED_NOTIFICATIONS) {
      this.notifications = this.notifications.slice(0, MAX_STORED_NOTIFICATIONS);
    }
    this.saveNotifications();
    this.playChime('OPEN_TRADE', true);
    this.emitChange(notification);
    return notification;
  }
}

export const mobileNotifications = new MobileNotificationService();

