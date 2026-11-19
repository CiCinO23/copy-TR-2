import React from 'react';
import { Settings, BellRing } from 'lucide-react';
import { BinanceConnectionState, KuCoinConnectionState } from '../types';
import { classifyPingHealth, PingHealthStatus } from '../services/syncResilience';

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

function getPingDotColor(status: PingHealthStatus): string {
  switch (status) {
    case 'good':
      return 'bg-[#01BC8D]';
    case 'warn':
      return 'bg-[#F59E0B]';
    case 'bad':
    case 'offline':
    default:
      return 'bg-[#F65454]';
  }
}

function getPingTextColor(status: PingHealthStatus): string {
  switch (status) {
    case 'good':
      return 'text-[#01BC8D]';
    case 'warn':
      return 'text-[#F59E0B]';
    case 'bad':
      return 'text-[#F65454]';
    case 'offline':
    default:
      return 'text-[#848E9C]';
  }
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
  const isBinanceConnected = Boolean(connectionState.isConnected);
  const isKucoinConnected = Boolean(kucoinConnectionState?.isConnected);

  const binancePing = classifyPingHealth(isBinanceConnected, connectionState.latencyMs);
  const kucoinPing = classifyPingHealth(isKucoinConnected, kucoinConnectionState?.latencyMs);

  const binanceTooltip = `باينانس: ${isBinanceConnected ? 'متصل' : 'غير متصل'} (${binancePing.labelMs})`;
  const kucoinTooltip = `كوكوين: ${isKucoinConnected ? 'متصل' : 'غير متصل'} (${kucoinPing.labelMs})`;

  return (
    <header className="w-full bg-[#0B0E11]/95 backdrop-blur-md border-b border-[#1C232D] px-2.5 sm:px-4 py-2 sticky top-0 z-40 header-safe pl-safe pr-safe">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-1.5 sm:gap-2">
        {/* Right (Start in RTL): Clean single-line KuCoin-style Brand Lockup */}
        <button
          type="button"
          onClick={onOpenHomeTab}
          data-testid="header_app_logo"
          title="Copy TR - الرئيسية"
          className="group flex items-center gap-1.5 sm:gap-2 cursor-pointer focus:outline-none shrink-0 select-none whitespace-nowrap"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#12161C] border border-[#1C232D] group-hover:border-[#01BC8D]/60 overflow-hidden flex items-center justify-center shrink-0 transition-colors">
            <img
              src="/assets/aistudio/icone_c1401ade.png"
              alt="Copy TR"
              className="w-full h-full object-cover pointer-events-none"
            />
          </div>
          <span className="text-[13px] sm:text-[15px] font-extrabold text-white tracking-tight font-mono whitespace-nowrap">
            Copy TR
          </span>
        </button>

        {/* Left (End in RTL): Separate Binance Ping + KuCoin Ping + Notifications + Settings */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Binance Separate Ping Indicator */}
          <button
            type="button"
            onClick={onOpenApiTab}
            data-testid="header_binance_ping"
            title={binanceTooltip}
            aria-label={binanceTooltip}
            className={`h-8 px-1.5 sm:px-2.5 rounded-lg border flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer shrink-0 select-none whitespace-nowrap ${
              activeApiSubTab === 'BINANCE'
                ? 'bg-[#12161C] border-[#F0B90B] text-white'
                : 'bg-[#12161C] hover:bg-[#181E27] border-[#1C232D] text-[#D1D9E6]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${getPingDotColor(binancePing.status)}`}
            />
            <span className="text-[10px] font-bold text-[#F0B90B] sm:hidden">BN</span>
            <span className="text-[11px] font-bold text-[#F0B90B] hidden sm:inline">باينانس</span>
            <span
              dir="ltr"
              data-testid="header_binance_ping_value"
              className={`text-[10px] sm:text-[11px] font-mono font-semibold tabular-nums ${getPingTextColor(
                binancePing.status
              )}`}
            >
              {binancePing.labelMs}
            </span>
          </button>

          {/* KuCoin Separate Ping Indicator */}
          <button
            type="button"
            onClick={onOpenKucoinTab || onOpenApiTab}
            data-testid="header_kucoin_badge"
            title={kucoinTooltip}
            aria-label={kucoinTooltip}
            className={`h-8 px-1.5 sm:px-2.5 rounded-lg border flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer shrink-0 select-none whitespace-nowrap ${
              activeApiSubTab === 'KUCOIN'
                ? 'bg-[#12161C] border-[#01BC8D] text-white'
                : 'bg-[#12161C] hover:bg-[#181E27] border-[#1C232D] text-[#D1D9E6]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${getPingDotColor(kucoinPing.status)}`}
            />
            <span className="text-[10px] font-bold text-[#01BC8D] sm:hidden">KC</span>
            <span className="text-[11px] font-bold text-[#01BC8D] hidden sm:inline">كوكوين</span>
            <span
              dir="ltr"
              data-testid="header_kucoin_ping_value"
              className={`text-[10px] sm:text-[11px] font-mono font-semibold tabular-nums ${getPingTextColor(
                kucoinPing.status
              )}`}
            >
              {kucoinPing.labelMs}
            </span>
          </button>

          {/* Notifications Bell */}
          <button
            type="button"
            onClick={onOpenNotifications}
            data-testid="header_notifications_button"
            title="التنبيهات"
            aria-label="التنبيهات"
            className={`relative w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer shrink-0 select-none ${
              unreadNotificationsCount > 0
                ? 'bg-[#0D2B24] border-[#01BC8D]/50 text-[#01BC8D]'
                : 'bg-[#12161C] hover:bg-[#181E27] border-[#1C232D] text-[#848E9C] hover:text-white'
            }`}
          >
            <BellRing className="w-4 h-4" />
            {unreadNotificationsCount > 0 ? (
              <span
                dir="ltr"
                className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-[#01BC8D] text-[#0B0E11] font-mono font-bold text-[9px] flex items-center justify-center tabular-nums"
              >
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            ) : (
              notificationsEnabled && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#01BC8D]" />
              )
            )}
          </button>

          {/* Settings Gear */}
          <button
            type="button"
            onClick={onOpenSettingsTab}
            data-testid="header_settings_button"
            title="الإعدادات"
            aria-label="الإعدادات"
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer shrink-0 select-none ${
              isSettingsActive
                ? 'bg-[#01BC8D]/15 border-[#01BC8D] text-[#01BC8D]'
                : 'bg-[#12161C] hover:bg-[#181E27] border-[#1C232D] text-[#848E9C] hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
