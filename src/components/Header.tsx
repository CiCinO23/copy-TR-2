import React from 'react';
import { Settings, BellRing } from 'lucide-react';
import { BinanceConnectionState, KuCoinConnectionState } from '../types';

interface HeaderProps {
  connectionState: BinanceConnectionState;
  kucoinConnectionState?: KuCoinConnectionState;
  isSettingsActive?: boolean;
  activeApiSubTab?: 'KUCOIN' | 'BINANCE' | null;
  unreadNotificationsCount?: number;
  notificationsEnabled?: boolean;
  onOpenNotifications?: () => void;
  onOpenApiTab: () => void;
  onOpenKucoinTab?: () => void;
  onOpenSettingsTab?: () => void;
  onOpenHomeTab?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  connectionState,
  kucoinConnectionState,
  isSettingsActive,
  activeApiSubTab,
  unreadNotificationsCount = 0,
  notificationsEnabled = true,
  onOpenNotifications,
  onOpenApiTab,
  onOpenKucoinTab,
  onOpenSettingsTab,
  onOpenHomeTab,
}) => {
  const isKucoinConnected = Boolean(kucoinConnectionState?.isConnected);
  const kucoinLatency =
    kucoinConnectionState?.latencyMs !== null && kucoinConnectionState?.latencyMs !== undefined
      ? `${kucoinConnectionState.latencyMs} ms`
      : '-- ms';

  const isBinanceConnected = Boolean(connectionState.isConnected);
  const binanceLatency =
    connectionState.latencyMs !== null && connectionState.latencyMs !== undefined
      ? `${connectionState.latencyMs} ms`
      : '-- ms';

  return (
    <header className="w-full bg-[#12171D]/95 backdrop-blur-md border-b border-[#232E3A] px-3 sm:px-4 py-2 sm:py-2.5 sticky top-0 z-40 shadow-[0_4px_20px_rgba(0,0,0,0.45)] header-safe pl-safe pr-safe">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* أقصى اليمين: رمز التطبيق بهالة متوهجة أنيقة متناسقة مع ثيم كوكوين الرسمي */}
        <button
          type="button"
          onClick={onOpenHomeTab}
          data-testid="header_app_logo"
          title="Copy TR - الصفحة الرئيسية"
          className="relative group w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center cursor-pointer focus:outline-none shrink-0 select-none active:scale-95 transition-transform"
        >
          {/* هالة متوهجة بلون كوكوين الرسمي (#01BC8D) */}
          <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-[#01BC8D]/50 via-[#00D49F]/35 to-[#00C8FF]/40 blur-sm opacity-80 group-hover:opacity-100 transition-opacity animate-pulse" />
          <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#0B0E11] ring-1.5 ring-[#01BC8D] shadow-[0_0_12px_rgba(1,188,141,0.5)] overflow-hidden flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/icone_c1401ade.png"
              alt="Copy TR"
              className="w-full h-full max-w-full max-h-full object-cover rounded-full pointer-events-none"
            />
          </div>
          {/* إشارة متوهجة حية على زاوية الرمز */}
          <span className="absolute -bottom-0.5 -left-0.5 flex h-3 w-3 items-center justify-center pointer-events-none">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#01BC8D] opacity-80" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#01BC8D] ring-1.5 ring-[#0B0E11] shadow-[0_0_8px_#01BC8D]" />
          </span>
        </button>

        {/* خانات الهيدر: بتنسيق مصغر ومتناسق تماماً ومريح للمس */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 1. خانة باينانس (بيانات السوق والمتداولين) */}
          <button
            type="button"
            onClick={onOpenApiTab}
            data-testid="header_status_badge"
            title="ربط المنصات - Binance للمعلومات"
            className={`h-8 sm:h-9 px-2 py-1 sm:px-2.5 sm:py-1 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer shrink-0 select-none active:scale-95 ${
              activeApiSubTab === 'BINANCE'
                ? 'bg-[#0D2B24] border-[#01BC8D] shadow-[0_0_10px_rgba(1,188,141,0.25)]'
                : 'bg-[#1A222B] hover:bg-[#212C37] border-[#232E3A] hover:border-[#01BC8D]/50'
            }`}
          >
            {/* رمز باينانس الرسمي مصغر */}
            <span className="w-4 h-4 rounded-md bg-[#F3BA2F]/15 border border-[#F3BA2F]/35 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-3 h-3 text-[#F3BA2F]"
                fill="currentColor"
              >
                <path d="M12 3L8.2 6.8l2.2 2.2L12 7.4l1.6 1.6 2.2-2.2L12 3zm-5.2 5.2L3 12l3.8 3.8 2.2-2.2L7.4 12l1.6-1.6-2.2-2.2zm10.4 0l-2.2 2.2L16.6 12l-1.6 1.6 2.2 2.2L21 12l-3.8-3.8zM12 9.8L9.8 12l2.2 2.2 2.2-2.2L12 9.8zm0 6.8l-1.6-1.6-2.2 2.2L12 21l3.8-3.8-2.2-2.2-1.6 1.6z" />
              </svg>
            </span>

            {/* نقطة الاتصال */}
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isBinanceConnected
                  ? 'bg-[#01BC8D] shadow-[0_0_6px_#01BC8D]'
                  : 'bg-[#F6465D] shadow-[0_0_6px_#F6465D]'
              }`}
            />

            {/* سرعة الاستجابة */}
            <span
              dir="ltr"
              className="text-[10px] sm:text-[11px] font-mono font-bold text-[#F0F4F8] tabular-nums"
            >
              {binanceLatency}
            </span>
          </button>

          {/* 2. خانة كوكوين (منصة التنفيذ المباشر) */}
          <button
            type="button"
            onClick={onOpenKucoinTab}
            data-testid="header_kucoin_badge"
            title="ربط المنصات - KuCoin للتنفيذ"
            className={`h-8 sm:h-9 px-2 py-1 sm:px-2.5 sm:py-1 rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer shrink-0 select-none active:scale-95 ${
              activeApiSubTab === 'KUCOIN'
                ? 'bg-[#0D2B24] border-[#01BC8D] shadow-[0_0_10px_rgba(1,188,141,0.25)]'
                : 'bg-[#1A222B] hover:bg-[#212C37] border-[#232E3A] hover:border-[#01BC8D]/50'
            }`}
          >
            {/* رمز كوكوين الرسمي مصغر */}
            <span className="w-4 h-4 rounded-md bg-[#01BC8D]/15 border border-[#01BC8D]/35 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-3 h-3 text-[#01BC8D]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 4v16" />
                <path d="M17 5l-7 7 7 7" />
                <circle cx="17" cy="12" r="1.4" fill="currentColor" stroke="none" />
              </svg>
            </span>

            {/* نقطة الاتصال */}
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isKucoinConnected
                  ? 'bg-[#01BC8D] shadow-[0_0_6px_#01BC8D]'
                  : 'bg-[#F6465D] shadow-[0_0_6px_#F6465D]'
              }`}
            />

            {/* سرعة الاستجابة */}
            <span
              dir="ltr"
              className="text-[10px] sm:text-[11px] font-mono font-bold text-[#F0F4F8] tabular-nums"
            >
              {kucoinLatency}
            </span>
          </button>

          {/* 3. جرس تنبيهات الموبايل الفورية */}
          <button
            type="button"
            onClick={onOpenNotifications}
            data-testid="header_notifications_button"
            title="تنبيهات الموبايل (فتح صفقات، التدعيم، والخروج)"
            className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg border flex items-center justify-center transition-all cursor-pointer shrink-0 select-none active:scale-95 ${
              unreadNotificationsCount > 0
                ? 'bg-[#0D2B24] border-[#01BC8D] text-[#01BC8D] shadow-[0_0_10px_rgba(1,188,141,0.25)]'
                : 'bg-[#1A222B] hover:bg-[#232E3A] border-[#232E3A] hover:border-[#01BC8D]/50 text-[#8A99AD] hover:text-[#01BC8D]'
            }`}
          >
            <BellRing className="w-4 h-4" />
            {unreadNotificationsCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#01BC8D] text-[#0B0E11] font-mono font-extrabold text-[9px] flex items-center justify-center shadow-[0_0_6px_#01BC8D]">
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            ) : (
              notificationsEnabled && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#01BC8D]" />
              )
            )}
          </button>

          {/* 4. زر الإعدادات (في أقصى اليسار) */}
          <button
            type="button"
            onClick={onOpenSettingsTab}
            data-testid="header_settings_button"
            title="الإعدادات وإدارة المخاطر"
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg border flex items-center justify-center transition-all cursor-pointer shrink-0 select-none active:scale-95 ${
              isSettingsActive
                ? 'bg-[#01BC8D]/20 border-[#01BC8D] text-[#01BC8D] shadow-[0_0_10px_rgba(1,188,141,0.25)]'
                : 'bg-[#1A222B] hover:bg-[#232E3A] border-[#232E3A] hover:border-[#01BC8D]/50 text-[#8A99AD] hover:text-[#01BC8D]'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
