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
    <header className="w-full bg-[#12171D]/95 backdrop-blur-md border-b border-[#232E3A] px-4 py-2.5 sticky top-0 z-40 shadow-[0_4px_20px_rgba(0,0,0,0.45)]">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        {/* أقصى اليمين: رمز التطبيق فقط بإشارة متوهجة بثيم كوكوين الرسمي */}
        <button
          type="button"
          onClick={onOpenHomeTab}
          data-testid="header_app_logo"
          title="Copy TR"
          className="relative group flex items-center justify-center cursor-pointer focus:outline-none shrink-0"
        >
          {/* هالة متوهجة بلون كوكوين الرسمي (#01BC8D) */}
          <span className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-[#01BC8D]/60 via-[#00D49F]/45 to-[#00C8FF]/50 blur-md opacity-90 group-hover:opacity-100 transition-opacity animate-pulse" />
          <div className="relative w-11 h-11 rounded-full bg-[#0B0E11] ring-2 ring-[#01BC8D] shadow-[0_0_18px_rgba(1,188,141,0.65)] overflow-hidden flex items-center justify-center">
            <img
              src="/assets/aistudio/icone_c1401ade.png"
              alt="Copy TR"
              className="w-full h-full object-cover scale-110"
            />
          </div>
          {/* إشارة متوهجة حية على زاوية الرمز */}
          <span className="absolute -bottom-0.5 -left-0.5 flex h-3.5 w-3.5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#01BC8D] opacity-85" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#01BC8D] ring-2 ring-[#0B0E11] shadow-[0_0_10px_#01BC8D]" />
          </span>
        </button>

        {/* أقصى اليسار: رمز الإعدادات، جرس تنبيهات الموبايل، خانة كوكوين، خانة باينانس */}
        <div className="flex items-center gap-2 flex-row-reverse">
          {/* 1. أقصى اليسار: زر الإعدادات */}
          <button
            type="button"
            onClick={onOpenSettingsTab}
            data-testid="header_settings_button"
            title="الإعدادات"
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
              isSettingsActive
                ? 'bg-[#01BC8D]/20 border-[#01BC8D] text-[#01BC8D] shadow-[0_0_12px_rgba(1,188,141,0.3)]'
                : 'bg-[#1A222B] hover:bg-[#232E3A] border-[#232E3A] hover:border-[#01BC8D]/60 text-[#8A99AD] hover:text-[#01BC8D]'
            }`}
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* 1.5 جرس تنبيهات الموبايل الفورية (فتح صفقات، التدعيم، والخروج) */}
          <button
            type="button"
            onClick={onOpenNotifications}
            data-testid="header_notifications_button"
            title="تنبيهات الموبايل (فتح صفقات، التدعيم، والخروج)"
            className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
              unreadNotificationsCount > 0
                ? 'bg-[#0D2B24] border-[#01BC8D] text-[#01BC8D] shadow-[0_0_12px_rgba(1,188,141,0.3)]'
                : 'bg-[#1A222B] hover:bg-[#232E3A] border-[#232E3A] hover:border-[#01BC8D]/60 text-[#8A99AD] hover:text-[#01BC8D]'
            }`}
          >
            <BellRing className="w-4 h-4 sm:w-5 sm:h-5" />
            {unreadNotificationsCount > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#01BC8D] text-[#0B0E11] font-mono font-extrabold text-[10px] flex items-center justify-center shadow-[0_0_8px_#01BC8D]">
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            ) : (
              notificationsEnabled && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#01BC8D]" />
              )
            )}
          </button>

          {/* 2. بعده: خانة كوكوين (رمز كوكوين + نقطة خضراء/حمراء + سرعة الاستجابة) */}
          <button
            type="button"
            onClick={onOpenKucoinTab}
            data-testid="header_kucoin_badge"
            title="ربط المنصات - KuCoin للتنفيذ"
            className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border transition-all cursor-pointer shrink-0 ${
              activeApiSubTab === 'KUCOIN'
                ? 'bg-[#0D2B24] border-[#01BC8D] shadow-[0_0_12px_rgba(1,188,141,0.25)]'
                : 'bg-[#1A222B] hover:bg-[#212C37] border-[#232E3A] hover:border-[#01BC8D]/60'
            }`}
          >
            {/* رمز كوكوين الرسمي */}
            <span className="w-5 h-5 rounded-md bg-[#01BC8D]/15 border border-[#01BC8D]/40 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-3.5 h-3.5 text-[#01BC8D]"
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

            {/* نقطة خضراء عند الاتصال وحمراء عند عدم الاتصال */}
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isKucoinConnected
                  ? 'bg-[#01BC8D] shadow-[0_0_8px_#01BC8D]'
                  : 'bg-[#F6465D] shadow-[0_0_8px_#F6465D]'
              }`}
            />

            {/* سرعة الاستجابة */}
            <span
              dir="ltr"
              className="text-[11px] sm:text-xs font-mono font-bold text-[#F0F4F8] tabular-nums"
            >
              {kucoinLatency}
            </span>
          </button>

          {/* 3. بعدها: خانة باينانس بنفس الشروط (رمز باينانس + نقطة خضراء/حمراء + سرعة الاستجابة) */}
          <button
            type="button"
            onClick={onOpenApiTab}
            data-testid="header_status_badge"
            title="ربط المنصات - Binance للمعلومات"
            className={`flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border transition-all cursor-pointer shrink-0 ${
              activeApiSubTab === 'BINANCE'
                ? 'bg-[#0D2B24] border-[#01BC8D] shadow-[0_0_12px_rgba(1,188,141,0.25)]'
                : 'bg-[#1A222B] hover:bg-[#212C37] border-[#232E3A] hover:border-[#01BC8D]/60'
            }`}
          >
            {/* رمز باينانس الرسمي */}
            <span className="w-5 h-5 rounded-md bg-[#F3BA2F]/15 border border-[#F3BA2F]/40 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-3.5 h-3.5 text-[#F3BA2F]"
                fill="currentColor"
              >
                <path d="M12 3L8.2 6.8l2.2 2.2L12 7.4l1.6 1.6 2.2-2.2L12 3zm-5.2 5.2L3 12l3.8 3.8 2.2-2.2L7.4 12l1.6-1.6-2.2-2.2zm10.4 0l-2.2 2.2L16.6 12l-1.6 1.6 2.2 2.2L21 12l-3.8-3.8zM12 9.8L9.8 12l2.2 2.2 2.2-2.2L12 9.8zm0 6.8l-1.6-1.6-2.2 2.2L12 21l3.8-3.8-2.2-2.2-1.6 1.6z" />
              </svg>
            </span>

            {/* نقطة خضراء عند الاتصال وحمراء عند عدم الاتصال */}
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isBinanceConnected
                  ? 'bg-[#01BC8D] shadow-[0_0_8px_#01BC8D]'
                  : 'bg-[#F6465D] shadow-[0_0_8px_#F6465D]'
              }`}
            />

            {/* سرعة الاستجابة */}
            <span
              dir="ltr"
              className="text-[11px] sm:text-xs font-mono font-bold text-[#F0F4F8] tabular-nums"
            >
              {binanceLatency}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
