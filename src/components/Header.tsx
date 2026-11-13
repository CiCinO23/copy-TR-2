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
    <header className="w-full bg-[#12171D]/95 backdrop-blur-md border-b border-[#1E2733] px-3 sm:px-4 py-2 sm:py-2.5 sticky top-0 z-40 header-safe pl-safe pr-safe">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* أقصى اليمين: رمز التطبيق بتصميم احترافي هادئ */}
        <button
          type="button"
          onClick={onOpenHomeTab}
          data-testid="header_app_logo"
          title="Copy TR - الرئيسية"
          className="group flex items-center gap-2.5 cursor-pointer focus:outline-none shrink-0 select-none active:scale-95 transition-transform"
        >
          <div className="w-9 h-9 rounded-xl bg-[#0B0E11] border border-[#232E3A] group-hover:border-[#01BC8D]/60 overflow-hidden flex items-center justify-center shrink-0 transition-colors">
            <img
              src="/assets/aistudio/icone_c1401ade.png"
              alt="Copy TR"
              className="w-full h-full object-cover pointer-events-none"
            />
          </div>
          <div className="hidden sm:flex flex-col text-right leading-tight">
            <span className="text-xs font-extrabold text-white tracking-tight font-mono">
              Copy TR
            </span>
            <span className="text-[10px] text-[#8A99AD] font-medium">
              منصة التداول والنسخ
            </span>
          </div>
        </button>

        {/* خانات الهيدر: بتنسيق متناسق ومريح للمس */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 1. خانة باينانس (بيانات السوق والمتداولين) */}
          <button
            type="button"
            onClick={onOpenApiTab}
            data-testid="header_status_badge"
            title="ربط المنصات - باينانس للمعلومات"
            className={`h-9 px-2.5 rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 select-none ${
              activeApiSubTab === 'BINANCE'
                ? 'bg-[#161D26] border-[#01BC8D] text-white'
                : 'bg-[#161D26] hover:bg-[#1A222B] border-[#1E2733] hover:border-[#2C394A]'
            }`}
          >
            <span className="w-4 h-4 rounded-md bg-[#F3BA2F]/15 flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-3 h-3 text-[#F3BA2F]"
                fill="currentColor"
              >
                <path d="M12 3L8.2 6.8l2.2 2.2L12 7.4l1.6 1.6 2.2-2.2L12 3zm-5.2 5.2L3 12l3.8 3.8 2.2-2.2L7.4 12l1.6-1.6-2.2-2.2zm10.4 0l-2.2 2.2L16.6 12l-1.6 1.6 2.2 2.2L21 12l-3.8-3.8zM12 9.8L9.8 12l2.2 2.2 2.2-2.2L12 9.8zm0 6.8l-1.6-1.6-2.2 2.2L12 21l3.8-3.8-2.2-2.2-1.6 1.6z" />
              </svg>
            </span>

            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isBinanceConnected ? 'bg-[#01BC8D]' : 'bg-[#F6465D]'
              }`}
            />

            <span
              dir="ltr"
              className="text-[11px] font-mono font-semibold text-[#F0F4F8] tabular-nums"
            >
              {binanceLatency}
            </span>
          </button>

          {/* 2. خانة كوكوين (منصة التنفيذ المباشر) */}
          <button
            type="button"
            onClick={onOpenKucoinTab}
            data-testid="header_kucoin_badge"
            title="ربط المنصات - كوكوين للتنفيذ"
            className={`h-9 px-2.5 rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 select-none ${
              activeApiSubTab === 'KUCOIN'
                ? 'bg-[#161D26] border-[#01BC8D] text-white'
                : 'bg-[#161D26] hover:bg-[#1A222B] border-[#1E2733] hover:border-[#2C394A]'
            }`}
          >
            <span className="w-4 h-4 rounded-md bg-[#01BC8D]/15 flex items-center justify-center shrink-0">
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

            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isKucoinConnected ? 'bg-[#01BC8D]' : 'bg-[#F6465D]'
              }`}
            />

            <span
              dir="ltr"
              className="text-[11px] font-mono font-semibold text-[#F0F4F8] tabular-nums"
            >
              {kucoinLatency}
            </span>
          </button>

          {/* 3. جرس تنبيهات الموبايل الفورية */}
          <button
            type="button"
            onClick={onOpenNotifications}
            data-testid="header_notifications_button"
            title="تنبيهات الموبايل"
            className={`relative w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 select-none ${
              unreadNotificationsCount > 0
                ? 'bg-[#0D2B24] border-[#01BC8D]/60 text-[#01BC8D]'
                : 'bg-[#161D26] hover:bg-[#1A222B] border-[#1E2733] hover:border-[#2C394A] text-[#8A99AD] hover:text-white'
            }`}
          >
            <BellRing className="w-4 h-4" />
            {unreadNotificationsCount > 0 ? (
              <span
                dir="ltr"
                className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#01BC8D] text-[#0B0E11] font-mono font-bold text-[9px] flex items-center justify-center"
              >
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            ) : (
              notificationsEnabled && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#01BC8D]" />
              )
            )}
          </button>

          {/* 4. زر الإعدادات */}
          <button
            type="button"
            onClick={onOpenSettingsTab}
            data-testid="header_settings_button"
            title="الإعدادات وإدارة المخاطر"
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 select-none ${
              isSettingsActive
                ? 'bg-[#01BC8D]/15 border-[#01BC8D] text-[#01BC8D]'
                : 'bg-[#161D26] hover:bg-[#1A222B] border-[#1E2733] hover:border-[#2C394A] text-[#8A99AD] hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
