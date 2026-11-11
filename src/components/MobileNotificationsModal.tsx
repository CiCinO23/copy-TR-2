import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  X,
  CheckCheck,
  Trash2,
  Volume2,
  Vibrate,
  Smartphone,
  Send,
  SlidersHorizontal,
  TrendingUp,
  Layers,
  LogOut,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  MobileNotificationActionType,
  MobileNotificationSettings,
  MobileTradeNotification,
} from '../types';
import { CoinIcon } from './CoinIcon';
import { mobileNotifications } from '../services/mobileNotifications';

function formatPriceClean(p: number): string {
  if (!p || isNaN(p)) return '0.00';
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

function formatDateTimeAr(ts: number): string {
  try {
    return new Date(ts).toLocaleString('ar-EG', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

interface MobilePushToastBannerProps {
  notification: MobileTradeNotification | null;
  onDismiss: () => void;
  onOpenSimulation: () => void;
  onOpenCenter: () => void;
}

/**
 * In-App Mobile Push Banner (drops from top of screen on mobile/desktop when a trade event fires)
 */
export const MobilePushToastBanner: React.FC<MobilePushToastBannerProps> = ({
  notification,
  onDismiss,
  onOpenSimulation,
  onOpenCenter,
}) => {
  if (!notification) return null;

  const isLong = notification.side === 'LONG';
  const hasPnl = notification.realizedPnlUsdt !== undefined;
  const pnlVal = notification.realizedPnlUsdt || 0;
  const pnlPct = notification.realizedPnlPercent || 0;
  const isProfit = pnlVal >= 0;

  const actionColorClass =
    notification.actionType === 'OPEN_TRADE'
      ? 'border-[#01BC8D] shadow-[0_10px_35px_rgba(1,188,141,0.35)]'
      : notification.actionType === 'SCALE_IN'
      ? 'border-[#38BDF8] shadow-[0_10px_35px_rgba(56,189,248,0.3)]'
      : notification.actionType === 'PARTIAL_EXIT'
      ? 'border-[#F59E0B] shadow-[0_10px_35px_rgba(245,158,11,0.3)]'
      : isProfit
      ? 'border-[#01BC8D] shadow-[0_10px_35px_rgba(1,188,141,0.38)]'
      : 'border-[#F6465D] shadow-[0_10px_35px_rgba(246,70,93,0.35)]';

  const headerBadgeClass =
    notification.actionType === 'OPEN_TRADE'
      ? 'bg-[#0D2B24] text-[#01BC8D] border-[#01BC8D]/50'
      : notification.actionType === 'SCALE_IN'
      ? 'bg-[#0C2D48] text-[#38BDF8] border-[#38BDF8]/50'
      : notification.actionType === 'PARTIAL_EXIT'
      ? 'bg-[#3B2606] text-[#FBBF24] border-[#F59E0B]/50'
      : isProfit
      ? 'bg-[#0D2B24] text-[#01BC8D] border-[#01BC8D]/50'
      : 'bg-[#3A1219] text-[#F6465D] border-[#F6465D]/50';

  return (
    <div
      dir="rtl"
      data-testid="mobile_push_toast_banner"
      className="fixed top-[calc(0.5rem+env(safe-area-inset-top,0px))] inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[500px] z-50 animate-in slide-in-from-top duration-200"
    >
      <div
        className={`bg-[#12171D]/98 backdrop-blur-xl border-2 rounded-2xl p-3.5 text-white ${actionColorClass}`}
      >
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#232E3A]">
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <CoinIcon symbol={notification.symbol} size="md" />
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#0B0E11] border border-[#01BC8D] flex items-center justify-center">
                <BellRing className="w-2.5 h-2.5 text-[#01BC8D]" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded-lg border text-[11px] font-extrabold ${headerBadgeClass}`}
                >
                  {notification.actionTitleAr}
                </span>
                <span className="font-mono font-extrabold text-sm text-white">
                  {notification.symbol}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                    isLong
                      ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40'
                      : 'bg-[#3A1219] text-[#F6465D] border border-[#F6465D]/40'
                  }`}
                >
                  {notification.side} {notification.leverage}x
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1A222B] text-[#8A99AD] border border-[#232E3A]">
                  {notification.executionMode === 'REAL' ? 'حقيقي KuCoin' : 'افتراضي'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#8A99AD] mt-1">
                <span>
                  المتداول المصدر: <strong className="text-white">{notification.traderName}</strong>
                </span>
                <span>•</span>
                <span className="font-mono">{formatDateTimeAr(notification.timestamp)}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="text-[#8A99AD] hover:text-white p-1 rounded-lg bg-[#1A222B] border border-[#232E3A] cursor-pointer shrink-0"
            title="إغلاق التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Full Trade Info Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2.5 text-[11px]">
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2">
            <span className="text-[#8A99AD] block text-[10px]">
              {notification.actionType === 'OPEN_TRADE'
                ? 'سعر الدخول'
                : notification.actionType === 'SCALE_IN'
                ? 'سعر التدعيم / المتوسط'
                : 'سعر الدخول ⬅️ الخروج'}
            </span>
            <span className="font-mono font-bold text-white text-xs block mt-0.5">
              {notification.actionType === 'OPEN_TRADE'
                ? `$${formatPriceClean(notification.entryPrice)}`
                : notification.actionType === 'SCALE_IN'
                ? `$${formatPriceClean(notification.price)} / $${formatPriceClean(notification.entryPrice)}`
                : `$${formatPriceClean(notification.entryPrice)} ⬅️ $${formatPriceClean(
                    notification.exitPrice || notification.price
                  )}`}
            </span>
          </div>

          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2">
            <span className="text-[#8A99AD] block text-[10px]">
              {notification.actionType === 'SCALE_IN'
                ? 'المضاف / إجمالي الصفقة'
                : notification.actionType === 'PARTIAL_EXIT'
                ? 'المسحوب / المتبقي'
                : 'قيمة الصفقة (الهامش)'}
            </span>
            <span className="font-mono font-bold text-[#01BC8D] text-xs block mt-0.5">
              {notification.actionType === 'SCALE_IN'
                ? `+$${Math.abs(notification.marginDeltaUsdt || 0).toFixed(2)} ($${notification.marginUsdt.toFixed(2)})`
                : notification.actionType === 'PARTIAL_EXIT'
                ? `-$${Math.abs(notification.marginDeltaUsdt || 0).toFixed(2)} ($${notification.marginUsdt.toFixed(2)})`
                : `$${notification.marginUsdt.toFixed(2)} USDT`}
            </span>
          </div>

          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2">
            <span className="text-[#8A99AD] block text-[10px]">الكمية والحجم الحالي</span>
            <span className="font-mono font-bold text-white text-xs block mt-0.5">
              {notification.quantity} •{' '}
              <span className="text-[#01BC8D]">{notification.remainingScalePercent}%</span>
            </span>
          </div>

          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2">
            <span className="text-[#8A99AD] block text-[10px]">
              {hasPnl ? 'صافي الربح / الخسارة' : 'العمولة المقتطعة'}
            </span>
            {hasPnl ? (
              <span
                className={`font-mono font-extrabold text-xs block mt-0.5 ${
                  isProfit ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                }`}
              >
                {isProfit ? '+' : ''}${pnlVal.toFixed(2)} ({isProfit ? '+' : ''}
                {pnlPct.toFixed(2)}%)
              </span>
            ) : (
              <span className="font-mono font-bold text-[#F59E0B] text-xs block mt-0.5">
                ${notification.commissionUsdt.toFixed(4)} USDT
              </span>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-[#EAECEF] line-clamp-1">{notification.summaryTextAr}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onDismiss();
                onOpenSimulation();
              }}
              className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-2.5 py-1 rounded-lg text-[11px] cursor-pointer"
            >
              عرض الصفقة
            </button>
            <button
              type="button"
              onClick={() => {
                onDismiss();
                onOpenCenter();
              }}
              className="bg-[#1A222B] hover:bg-[#232E3A] text-[#8A99AD] hover:text-white border border-[#232E3A] px-2.5 py-1 rounded-lg text-[11px] cursor-pointer"
            >
              كل التنبيهات
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface MobileNotificationsCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: MobileTradeNotification[];
  settings: MobileNotificationSettings;
  onUpdateSettings: (partial: Partial<MobileNotificationSettings>) => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onNavigateToSimulation: () => void;
}

export const MobileNotificationsCenterModal: React.FC<MobileNotificationsCenterModalProps> = ({
  isOpen,
  onClose,
  notifications,
  settings,
  onUpdateSettings,
  onMarkAllRead,
  onClearAll,
  onNavigateToSimulation,
}) => {
  const [activeTab, setActiveTab] = useState<'HISTORY' | 'SETTINGS'>('HISTORY');
  const [filterType, setFilterType] = useState<'ALL' | MobileNotificationActionType>('ALL');
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    mobileNotifications.getBrowserPermissionStatus()
  );
  const [telegramTestStatus, setTelegramTestStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredNotifications =
    filterType === 'ALL'
      ? notifications
      : notifications.filter((n) => n.actionType === filterType);

  const handleRequestPermission = async () => {
    const res = await mobileNotifications.requestBrowserPermission();
    setBrowserPerm(res);
    if (res === 'granted') {
      onUpdateSettings({ browserPushEnabled: true });
      mobileNotifications.triggerTestNotification('OPEN_TRADE');
    }
  };

  const handleTestTelegram = async () => {
    setTelegramTestStatus('جاري إرسال تنبيه تجريبي لتطبيق تيليجرام على الموبايل...');
    const sample = mobileNotifications.triggerTestNotification('OPEN_TRADE');
    const ok = await mobileNotifications.sendTelegramPushNotification(sample);
    if (ok) {
      setTelegramTestStatus('✅ تم إرسال التنبيه التجريبي إلى تيليجرام بنجاح!');
    } else {
      setTelegramTestStatus(
        '⚠️ تعذر الإرسال لتيليجرام: تأكد من تفعيل الخيار وإدخال Bot Token و Chat ID الصحيحين.'
      );
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
    >
      <div className="bg-[#12171D] border border-[#232E3A] w-full max-w-2xl rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl pb-safe">
        {/* Modal Header */}
        <div className="px-4 py-3.5 bg-[#1A222B] border-b border-[#232E3A] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0D2B24] border border-[#01BC8D]/40 flex items-center justify-center text-[#01BC8D]">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>تنبيهات الموبايل الفورية للصفقات</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    settings.enabled
                      ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40'
                      : 'bg-[#3A1219] text-[#F6465D] border border-[#F6465D]/40'
                  }`}
                >
                  {settings.enabled ? 'مفعّل' : 'متوقف'}
                </span>
              </h3>
              <p className="text-[11px] text-[#8A99AD]">
                إشعارات مفصلة عند فتح الصفقات، التدعيم، السحب الجزئي، والخروج الكامل مع جميع المعلومات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#12171D] hover:bg-[#232E3A] border border-[#232E3A] flex items-center justify-center text-[#8A99AD] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* KuCoin-style Underline Sub-Tabs */}
        <div className="flex items-center border-b border-[#232E3A] bg-[#12171D] px-4">
          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'border-[#01BC8D] text-[#01BC8D]'
                : 'border-transparent text-[#8A99AD] hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>سجل تنبيهات الصفقات ({notifications.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SETTINGS')}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'SETTINGS'
                ? 'border-[#01BC8D] text-[#01BC8D]'
                : 'border-transparent text-[#8A99AD] hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>إعدادات وقنوات تنبيه الموبايل</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'HISTORY' ? (
            <>
              {/* Quick Test Bar for Mobile Notifications */}
              <div className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#01BC8D]" />
                    <span>تجربة إرسال تنبيه فوري للموبايل (مع الصوت والاهتزاز وكامل البيانات):</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => mobileNotifications.triggerTestNotification('OPEN_TRADE')}
                    className="bg-[#0D2B24] hover:bg-[#01BC8D]/25 text-[#01BC8D] border border-[#01BC8D]/40 rounded-lg py-1.5 px-2 text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    🟢 تجربة فتح صفقة
                  </button>
                  <button
                    type="button"
                    onClick={() => mobileNotifications.triggerTestNotification('SCALE_IN')}
                    className="bg-[#0C2D48] hover:bg-[#38BDF8]/25 text-[#38BDF8] border border-[#38BDF8]/40 rounded-lg py-1.5 px-2 text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    🔵 تجربة تدعيم (+50%)
                  </button>
                  <button
                    type="button"
                    onClick={() => mobileNotifications.triggerTestNotification('PARTIAL_EXIT')}
                    className="bg-[#3B2606] hover:bg-[#F59E0B]/25 text-[#FBBF24] border border-[#F59E0B]/40 rounded-lg py-1.5 px-2 text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    🟠 تجربة سحب جزئي (-40%)
                  </button>
                  <button
                    type="button"
                    onClick={() => mobileNotifications.triggerTestNotification('FULL_EXIT')}
                    className="bg-[#0D2B24] hover:bg-[#01BC8D]/25 text-[#01BC8D] border border-[#01BC8D]/40 rounded-lg py-1.5 px-2 text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    🏆 تجربة خروج وإغلاق
                  </button>
                </div>
              </div>

              {/* Filter & Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { key: 'ALL', label: 'الكل' },
                    { key: 'OPEN_TRADE', label: 'فتح صفقات' },
                    { key: 'SCALE_IN', label: 'التدعيم' },
                    { key: 'PARTIAL_EXIT', label: 'سحب جزئي' },
                    { key: 'FULL_EXIT', label: 'الخروج الكامل' },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() =>
                        setFilterType(tab.key as 'ALL' | MobileNotificationActionType)
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        filterType === tab.key
                          ? 'bg-[#01BC8D] text-[#0B0E11]'
                          : 'bg-[#0B0E11] text-[#8A99AD] border border-[#232E3A] hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {notifications.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onMarkAllRead}
                      className="flex items-center gap-1 text-[11px] bg-[#1A222B] hover:bg-[#232E3A] text-[#01BC8D] border border-[#232E3A] px-2.5 py-1 rounded-lg cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>قراءة الكل</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClearAll}
                      className="flex items-center gap-1 text-[11px] bg-[#1A222B] hover:bg-[#3A1219] text-[#F6465D] border border-[#232E3A] px-2.5 py-1 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>مسح السجل</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Notifications List */}
              {filteredNotifications.length === 0 ? (
                <div className="bg-[#0B0E11] border border-[#232E3A] rounded-2xl p-8 text-center space-y-2">
                  <Bell className="w-8 h-8 text-[#8A99AD] mx-auto opacity-60" />
                  <div className="text-sm font-bold text-white">
                    لا توجد تنبيهات مسجلة في هذا القسم حتى الآن
                  </div>
                  <p className="text-xs text-[#8A99AD]">
                    سيتم إرسال تنبيه فوري على الموبايل تلقائياً فور فتح أي صفقة أو تدعيمها أو السحب الجزئي أو الخروج الكامل منها.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredNotifications.map((item) => {
                    const isLong = item.side === 'LONG';
                    const hasPnl = item.realizedPnlUsdt !== undefined;
                    const pnlVal = item.realizedPnlUsdt || 0;
                    const pnlPct = item.realizedPnlPercent || 0;
                    const isProfit = pnlVal >= 0;

                    const badgeStyle =
                      item.actionType === 'OPEN_TRADE'
                        ? 'bg-[#0D2B24] text-[#01BC8D] border-[#01BC8D]/40'
                        : item.actionType === 'SCALE_IN'
                        ? 'bg-[#0C2D48] text-[#38BDF8] border-[#38BDF8]/40'
                        : item.actionType === 'PARTIAL_EXIT'
                        ? 'bg-[#3B2606] text-[#FBBF24] border-[#F59E0B]/40'
                        : isProfit
                        ? 'bg-[#0D2B24] text-[#01BC8D] border-[#01BC8D]/40'
                        : 'bg-[#3A1219] text-[#F6465D] border-[#F6465D]/40';

                    return (
                      <div
                        key={item.id}
                        className={`bg-[#0B0E11] border rounded-2xl p-3.5 space-y-2.5 transition-all ${
                          !item.read
                            ? 'border-[#01BC8D]/60 shadow-[0_0_15px_rgba(1,188,141,0.1)]'
                            : 'border-[#232E3A]'
                        }`}
                      >
                        {/* Card Top */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <CoinIcon symbol={item.symbol} size="md" />
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${badgeStyle}`}
                                >
                                  {item.actionTitleAr}
                                </span>
                                <span className="font-mono font-extrabold text-sm text-white">
                                  {item.symbol}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-0.5 ${
                                    isLong
                                      ? 'bg-[#0D2B24] text-[#01BC8D]'
                                      : 'bg-[#3A1219] text-[#F6465D]'
                                  }`}
                                >
                                  {isLong ? (
                                    <ArrowUpRight className="w-3 h-3" />
                                  ) : (
                                    <ArrowDownRight className="w-3 h-3" />
                                  )}
                                  {item.side} {item.leverage}x
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1A222B] text-[#8A99AD]">
                                  {item.executionMode === 'REAL'
                                    ? 'حقيقي (KuCoin)'
                                    : 'افتراضي (Simulation)'}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#8A99AD] mt-1 flex items-center gap-2 flex-wrap">
                                <span>
                                  المتداول المصدر:{' '}
                                  <strong className="text-[#EAECEF]">{item.traderName}</strong>
                                </span>
                                <span>•</span>
                                <span className="font-mono">{formatDateTimeAr(item.timestamp)}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onNavigateToSimulation();
                            }}
                            className="text-[11px] text-[#01BC8D] hover:underline font-bold shrink-0 cursor-pointer"
                          >
                            عرض بالمحاكاة
                          </button>
                        </div>

                        {/* Complete Details Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#12171D] border border-[#232E3A] rounded-xl p-2.5 text-[11px]">
                          <div>
                            <span className="text-[#8A99AD] block text-[10px]">
                              {item.actionType === 'OPEN_TRADE'
                                ? 'سعر الدخول'
                                : item.actionType === 'SCALE_IN'
                                ? 'سعر التدعيم / المتوسط'
                                : 'سعر الدخول ⬅️ الخروج'}
                            </span>
                            <span className="font-mono font-bold text-white">
                              {item.actionType === 'OPEN_TRADE'
                                ? `$${formatPriceClean(item.entryPrice)}`
                                : item.actionType === 'SCALE_IN'
                                ? `$${formatPriceClean(item.price)} / $${formatPriceClean(
                                    item.entryPrice
                                  )}`
                                : `$${formatPriceClean(item.entryPrice)} ⬅️ $${formatPriceClean(
                                    item.exitPrice || item.price
                                  )}`}
                            </span>
                          </div>

                          <div>
                            <span className="text-[#8A99AD] block text-[10px]">
                              {item.actionType === 'SCALE_IN'
                                ? 'قيمة التدعيم / الإجمالي'
                                : item.actionType === 'PARTIAL_EXIT'
                                ? 'قيمة السحب / المتبقي'
                                : 'قيمة الصفقة (الهامش)'}
                            </span>
                            <span className="font-mono font-bold text-[#01BC8D]">
                              {item.actionType === 'SCALE_IN'
                                ? `+$${Math.abs(item.marginDeltaUsdt || 0).toFixed(2)} ($${item.marginUsdt.toFixed(2)})`
                                : item.actionType === 'PARTIAL_EXIT'
                                ? `-$${Math.abs(item.marginDeltaUsdt || 0).toFixed(2)} ($${item.marginUsdt.toFixed(2)})`
                                : `$${item.marginUsdt.toFixed(2)} USDT`}
                            </span>
                          </div>

                          <div>
                            <span className="text-[#8A99AD] block text-[10px]">
                              الكمية وحجم المركز
                            </span>
                            <span className="font-mono font-bold text-white">
                              {item.quantity} ({item.remainingScalePercent}%)
                            </span>
                          </div>

                          <div>
                            <span className="text-[#8A99AD] block text-[10px]">
                              {hasPnl ? 'الربح/الخسارة والعمولة' : 'العمولة المقتطعة'}
                            </span>
                            {hasPnl ? (
                              <span
                                className={`font-mono font-bold ${
                                  isProfit ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                                }`}
                              >
                                {isProfit ? '+' : ''}${pnlVal.toFixed(2)} ({isProfit ? '+' : ''}
                                {pnlPct.toFixed(2)}%) • عمولة ${item.commissionUsdt.toFixed(3)}
                              </span>
                            ) : (
                              <span className="font-mono font-bold text-[#F59E0B]">
                                ${item.commissionUsdt.toFixed(4)} USDT
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Summary Line */}
                        <div className="text-[11px] text-[#8A99AD] flex items-center justify-between">
                          <span>{item.summaryTextAr}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* SETTINGS TAB */
            <div className="space-y-4">
              {/* Master Toggle & Event Toggles */}
              <div className="bg-[#0B0E11] border border-[#232E3A] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-[#232E3A]">
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white">
                      تفعيل تنبيهات الموبايل الفورية
                    </div>
                    <div className="text-[11px] text-[#8A99AD]">
                      إرسال إشعارات لحظية عند حدوث أي حركة على الصفقات المنسوخة أو اليدوية
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) => onUpdateSettings({ enabled: e.target.checked })}
                    className="w-5 h-5 accent-[#01BC8D] cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <label className="flex items-center justify-between bg-[#12171D] border border-[#232E3A] rounded-xl p-3 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#01BC8D]" />
                      <div>
                        <div className="text-xs font-bold text-white">عند فتح صفقة جديدة</div>
                        <div className="text-[10px] text-[#8A99AD]">
                          السعر، الهامش، الرافعة، واسم المتداول
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.notifyOnOpen}
                      onChange={(e) => onUpdateSettings({ notifyOnOpen: e.target.checked })}
                      className="w-4 h-4 accent-[#01BC8D]"
                    />
                  </label>

                  <label className="flex items-center justify-between bg-[#12171D] border border-[#232E3A] rounded-xl p-3 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#38BDF8]" />
                      <div>
                        <div className="text-xs font-bold text-white">عند تدعيم الصفقة (Scale-In)</div>
                        <div className="text-[10px] text-[#8A99AD]">
                          قيمة ونسبة التدعيم ومتوسط الدخول الجديد
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.notifyOnScaleIn}
                      onChange={(e) => onUpdateSettings({ notifyOnScaleIn: e.target.checked })}
                      className="w-4 h-4 accent-[#01BC8D]"
                    />
                  </label>

                  <label className="flex items-center justify-between bg-[#12171D] border border-[#232E3A] rounded-xl p-3 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <LogOut className="w-4 h-4 text-[#F59E0B]" />
                      <div>
                        <div className="text-xs font-bold text-white">عند السحب الجزئي من الصفقة</div>
                        <div className="text-[10px] text-[#8A99AD]">
                          النسبة المسحوبة، الربح المحقق، والمتبقي
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.notifyOnPartialExit}
                      onChange={(e) => onUpdateSettings({ notifyOnPartialExit: e.target.checked })}
                      className="w-4 h-4 accent-[#01BC8D]"
                    />
                  </label>

                  <label className="flex items-center justify-between bg-[#12171D] border border-[#232E3A] rounded-xl p-3 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#01BC8D]" />
                      <div>
                        <div className="text-xs font-bold text-white">عند الخروج الكامل وإغلاق الصفقة</div>
                        <div className="text-[10px] text-[#8A99AD]">
                          سعر الخروج وصافي الربح/الخسارة بالدولار و%
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.notifyOnFullExit}
                      onChange={(e) => onUpdateSettings({ notifyOnFullExit: e.target.checked })}
                      className="w-4 h-4 accent-[#01BC8D]"
                    />
                  </label>
                </div>
              </div>

              {/* Sound, Vibration & System Push */}
              <div className="bg-[#0B0E11] border border-[#232E3A] rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-[#01BC8D] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  <span>خصائص تنبيه الهاتف (الصوت، الاهتزاز، وإشعار النظام)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="flex items-center justify-between bg-[#12171D] border border-[#232E3A] rounded-xl p-2.5 cursor-pointer">
                    <span className="text-xs text-white flex items-center gap-1.5">
                      <BellRing className="w-3.5 h-3.5 text-[#01BC8D]" />
                      <span>شريط منبثق أعلى الشاشة</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.inAppBannerEnabled}
                      onChange={(e) => onUpdateSettings({ inAppBannerEnabled: e.target.checked })}
                      className="w-4 h-4 accent-[#01BC8D]"
                    />
                  </label>

                  <label className="flex items-center justify-between bg-[#12171D] border border-[#232E3A] rounded-xl p-2.5 cursor-pointer">
                    <span className="text-xs text-white flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-[#01BC8D]" />
                      <span>نغمة تنبيه صوتية</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.soundEnabled}
                      onChange={(e) => onUpdateSettings({ soundEnabled: e.target.checked })}
                      className="w-4 h-4 accent-[#01BC8D]"
                    />
                  </label>

                  <label className="flex items-center justify-between bg-[#12171D] border border-[#232E3A] rounded-xl p-2.5 cursor-pointer">
                    <span className="text-xs text-white flex items-center gap-1.5">
                      <Vibrate className="w-3.5 h-3.5 text-[#01BC8D]" />
                      <span>اهتزاز الموبايل</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.vibrationEnabled}
                      onChange={(e) => onUpdateSettings({ vibrationEnabled: e.target.checked })}
                      className="w-4 h-4 accent-[#01BC8D]"
                    />
                  </label>
                </div>

                {/* Native System Notification Permission */}
                <div className="bg-[#12171D] border border-[#232E3A] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-white">
                      إشعارات نظام الأندرويد / الآيفون والمتصفح (Web Push Notifications)
                    </div>
                    <div className="text-[11px] text-[#8A99AD]">
                      حالة الصلاحية الحالية:{' '}
                      <strong
                        className={
                          browserPerm === 'granted' ? 'text-[#01BC8D]' : 'text-[#F59E0B]'
                        }
                      >
                        {browserPerm === 'granted'
                          ? 'مفعّلة وجاهزة لإظهار إشعارات الهاتف ✅'
                          : browserPerm === 'denied'
                          ? 'محظورة من إعدادات المتصفح ⚠️'
                          : 'بانتظار منح الصلاحية 🔔'}
                      </strong>
                    </div>
                  </div>
                  {browserPerm !== 'granted' && browserPerm !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={handleRequestPermission}
                      className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3 py-2 rounded-xl text-xs cursor-pointer shrink-0"
                    >
                      تفعيل إشعارات نظام الموبايل
                    </button>
                  )}
                </div>
              </div>

              {/* Telegram Mobile Push Integration */}
              <div className="bg-[#0B0E11] border border-[#232E3A] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      <Send className="w-4 h-4 text-[#38BDF8]" />
                      <span>إشعارات تطبيق تيليجرام على الموبايل (Telegram Bot Push)</span>
                    </h4>
                    <p className="text-[11px] text-[#8A99AD]">
                      استقبل تنبيهات الصفقات والتدعيم والخروج على هاتفك حتى عند إغلاق المتصفح
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.telegramEnabled}
                    onChange={(e) => onUpdateSettings({ telegramEnabled: e.target.checked })}
                    className="w-5 h-5 accent-[#01BC8D] cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-[#8A99AD] mb-1">
                      رمز بوت تيليجرام (Bot Token):
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={settings.telegramBotToken}
                      onChange={(e) => onUpdateSettings({ telegramBotToken: e.target.value })}
                      placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                      className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#8A99AD] mb-1">
                      معرّف المحادثة (Chat ID):
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={settings.telegramChatId}
                      onChange={(e) => onUpdateSettings({ telegramChatId: e.target.value })}
                      placeholder="مثال: 987654321"
                      className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    className="bg-[#1A222B] hover:bg-[#232E3A] text-[#38BDF8] border border-[#38BDF8]/40 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>إرسال تنبيه تجريبي لتيليجرام الآن</span>
                  </button>
                  {telegramTestStatus && (
                    <span className="text-[11px] text-[#EAECEF] flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-[#01BC8D] shrink-0" />
                      <span>{telegramTestStatus}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
