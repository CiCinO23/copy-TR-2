import React, { useState, useMemo } from 'react';
import {
  Key,
  CheckCircle2,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  ExternalLink,
  Zap,
  Sliders,
  Lock,
  ShieldCheck,
  Fingerprint,
  History,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
} from 'lucide-react';
import { KuCoinConfig, KuCoinConnectionState, KuCoinSecurityLockConfig } from '../types';
import {
  KuCoinSecurityLockScreen,
  KuCoinSecurityConfigModal,
} from './KuCoinSecurityLockGuard';
import { DEFAULT_KUCOIN_SECURITY_CONFIG } from '../services/kucoinSecurityLock';
import {
  OrderSideFilter,
  filterKuCoinRecentOrders,
  summarizeKuCoinOrders,
  getReadableSymbolBadge,
} from '../services/kucoinOrdersFilter';
import { CoinIcon } from './CoinIcon';

interface KucoinApiTabProps {
  config: KuCoinConfig;
  connectionState: KuCoinConnectionState;
  onSaveAndTest: (config: KuCoinConfig) => void;
  onClearKeys: () => void;
  onRefresh: () => void;
  onClearOrderHistory?: () => void;
  onOpenSimulationTab?: () => void;
  securityConfig?: KuCoinSecurityLockConfig;
  isSecurityUnlocked?: boolean;
  onUnlockSecurity?: (method: 'PIN' | 'BIOMETRIC', credentialId?: string | null) => void;
  onLockSecurityNow?: () => void;
  onUpdateSecurityConfig?: (partial: Partial<KuCoinSecurityLockConfig>) => void;
  onOpenSettingsTab?: () => void;
}

export const KucoinApiTab: React.FC<KucoinApiTabProps> = ({
  config,
  connectionState,
  onSaveAndTest,
  onClearKeys,
  onRefresh,
  onClearOrderHistory,
  onOpenSimulationTab,
  securityConfig = DEFAULT_KUCOIN_SECURITY_CONFIG,
  isSecurityUnlocked = true,
  onUnlockSecurity,
  onLockSecurityNow,
  onUpdateSecurityConfig,
  onOpenSettingsTab,
}) => {
  const [apiKey, setApiKey] = useState<string>(config.apiKey);
  const [passphrase, setPassphrase] = useState<string>(config.passphrase);
  const [marketType, setMarketType] = useState<'FUTURES' | 'SPOT'>(config.marketType);
  const [enableLiveExecution, setEnableLiveExecution] = useState<boolean>(
    config.enableLiveExecution
  );

  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);

  // Recent Orders Filtering State (Side: ALL | BUY | SELL, Symbol: ALL or specific, Search query)
  const [orderSideFilter, setOrderSideFilter] = useState<OrderSideFilter>('ALL');
  const [orderSymbolFilter, setOrderSymbolFilter] = useState<string>('ALL');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');

  const recentOrders = useMemo(
    () => connectionState.recentOrders || [],
    [connectionState.recentOrders]
  );

  const orderStats = useMemo(
    () => summarizeKuCoinOrders(recentOrders),
    [recentOrders]
  );

  const filteredOrders = useMemo(
    () =>
      filterKuCoinRecentOrders(recentOrders, {
        side: orderSideFilter,
        symbol: orderSymbolFilter,
        searchQuery: orderSearchQuery,
      }),
    [recentOrders, orderSideFilter, orderSymbolFilter, orderSearchQuery]
  );

  const isAnyOrderFilterActive =
    orderSideFilter !== 'ALL' ||
    orderSymbolFilter !== 'ALL' ||
    orderSearchQuery.trim().length > 0;

  const handleResetOrderFilters = () => {
    setOrderSideFilter('ALL');
    setOrderSymbolFilter('ALL');
    setOrderSearchQuery('');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveAndTest({
      apiKey: apiKey.trim(),
      apiSecret: '',
      passphrase: passphrase.trim(),
      apiType: config.apiType,
      marketType,
      enableLiveExecution,
      defaultLeverage: config.defaultLeverage || 5,
      maxOrderUsdt: config.maxOrderUsdt || 50,
    });
  };

  if (securityConfig.enabled && !isSecurityUnlocked) {
    return (
      <div className="py-2 animate-in fade-in duration-200">
        <KuCoinSecurityLockScreen
          config={securityConfig}
          titleAr="قفل أمان تبويب التنفيذ المباشر (KuCoin)"
          subtitleAr="تم تفعيل الحماية المتقدمة للمحفظة الحقيقية. يرجى إدخال رمز القفل الرقمي (PIN Code) أو التأكيد ببصمة الإصبع لفتح تبويب التنفيذ المباشر (KuCoin)."
          onUnlockSuccess={(method, credId) => {
            if (onUnlockSecurity) {
              onUnlockSecurity(method, credId);
            }
          }}
          onOpenSettingsTab={onOpenSettingsTab}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Real Wallet Security Vault Bar (شريط حماية المحفظة الحقيقية بـ PIN وبصمة الإصبع) */}
      <div
        data-testid="kucoin_security_vault_bar"
        className="bg-[#0D2B24]/90 border border-[#01BC8D]/40 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#01BC8D]/20 border border-[#01BC8D]/40 text-[#01BC8D] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 flex-wrap">
              <span>أمان المحفظة الحقيقية (KuCoin Security Lock)</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                  securityConfig.enabled
                    ? 'bg-[#01BC8D] text-[#0B0E11]'
                    : 'bg-[#232E3A] text-[#8A99AD]'
                }`}
              >
                {securityConfig.enabled
                  ? `مفعّل (PIN ${securityConfig.biometricEnabled ? '+ بصمة الإصبع' : 'فقط'})`
                  : 'غير مفعّل'}
              </span>
            </div>
            <p className="text-[11px] text-[#8A99AD] mt-0.5">
              حماية تبويب التنفيذ المباشر ومفاتيح محفظة KuCoin الحقيقية برمز قفل رقمي (PIN) أو بصمة الإصبع.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            data-testid="kucoin_open_security_settings_btn"
            className="text-xs bg-[#12171D] hover:bg-[#1A222B] text-white border border-[#01BC8D]/40 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-semibold cursor-pointer transition-colors"
          >
            <Fingerprint className="w-3.5 h-3.5 text-[#01BC8D]" />
            <span>إعدادات رمز PIN والبصمة</span>
          </button>

          {securityConfig.enabled && onLockSecurityNow && (
            <button
              type="button"
              onClick={onLockSecurityNow}
              data-testid="kucoin_lock_now_btn"
              className="text-xs bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>قفل التبويب الآن</span>
            </button>
          )}
        </div>
      </div>

      {/* Title & Architecture Banner */}
      <div className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#01BC8D]/20 text-[#01BC8D] border border-[#01BC8D]/30 flex items-center justify-center font-bold text-base">
                K
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                ربط منصة KuCoin API (تنفيذ الصفقات)
              </h2>
            </div>
            <p className="text-xs text-[#8A99AD] mt-1.5 leading-relaxed">
              منصة <strong className="text-[#01BC8D]">كوكوين (KuCoin)</strong> هي منصة التنفيذ الفعلي لفتح وإغلاق الصفقات وإدارة الرصيد، بينما تُدار إعدادات حجم الصفقة والرافعة والمراكز المفتوحة بشكل موحد من نافذة <strong className="text-white">التداول</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="https://www.kucoin.com/account/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-[#1A222B] hover:bg-[#212C37] text-white border border-[#232E3A] px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors"
            >
              <span>إنشاء مفتاح KuCoin API</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onRefresh}
              disabled={connectionState.isTesting}
              className="text-xs bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${connectionState.isTesting ? 'animate-spin' : ''}`} />
              <span>فحص الاتصال</span>
            </button>
          </div>
        </div>
      </div>

      {/* Connection Diagnostic Card */}
      <div
        className={`border rounded-2xl p-4 sm:p-5 transition-all ${
          connectionState.isAuthenticated
            ? 'bg-[#0D2B24] border-[#01BC8D]/50'
            : connectionState.isConnected
            ? 'bg-[#1A222B] border-[#232E3A]'
            : 'bg-[#2B1216] border-[#F6465D]/40'
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            {connectionState.isAuthenticated ? (
              <CheckCircle2 className="w-5 h-5 text-[#01BC8D]" />
            ) : (
              <Zap className="w-5 h-5 text-[#01BC8D]" />
            )}
            <h3 className="font-bold text-sm sm:text-base text-white">
              حالة الربط مع حسابك في KuCoin
            </h3>
          </div>
          {connectionState.isTesting && (
            <div className="flex items-center gap-2 text-xs text-[#01BC8D] font-semibold">
              <span className="w-4 h-4 border-2 border-[#01BC8D] border-t-transparent rounded-full animate-spin" />
              <span>جاري التحقق من المفاتيح...</span>
            </div>
          )}
        </div>

        <p
          className={`text-xs sm:text-sm font-semibold mb-2 ${
            connectionState.isAuthenticated ? 'text-[#01BC8D]' : 'text-white'
          }`}
        >
          {connectionState.statusMessageAr}
        </p>

        {connectionState.latencyMs !== null && (
          <div className="text-xs text-[#8A99AD] font-mono mb-2">
            زمن استجابة خادم KuCoin: <strong className="text-white">{connectionState.latencyMs} ms</strong>
            {connectionState.serverTimeFormatted && ` • توقيت الخادم: ${connectionState.serverTimeFormatted}`}
          </div>
        )}

        {connectionState.isAuthenticated && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-[#232E3A]/70">
            <div className="bg-[#0B0E11] p-2.5 rounded-xl">
              <span className="text-[10px] text-[#8A99AD] block">رصيد KuCoin المتاح للتداول</span>
              <span className="text-sm sm:text-base font-bold font-mono text-[#01BC8D]">
                {connectionState.availableUsdt.toFixed(2)} USDT
              </span>
            </div>

            <div className="bg-[#0B0E11] p-2.5 rounded-xl">
              <span className="text-[10px] text-[#8A99AD] block">إجمالي رصيد المحفظة</span>
              <span className="text-sm sm:text-base font-bold font-mono text-white">
                {connectionState.usdtBalance.toFixed(2)} USDT
              </span>
            </div>

            <div className="bg-[#0B0E11] p-2.5 rounded-xl col-span-2 sm:col-span-1">
              <span className="text-[10px] text-[#8A99AD] block">مراكز العقود المفتوحة بـ KuCoin</span>
              <span className="text-sm sm:text-base font-bold font-mono text-[#01BC8D]">
                {connectionState.positions.length} مركز مفتوح
              </span>
            </div>
          </div>
        )}

        {connectionState.errorMessageAr && (
          <div className="mt-2 text-xs text-[#F6465D] bg-[#2B1216]/80 p-2.5 rounded-xl border border-[#F6465D]/30">
            {connectionState.errorMessageAr}
          </div>
        )}
      </div>

      {/* Recent Orders Section with Filtering by Trade Type (Buy/Sell) & Symbol */}
      <div
        data-testid="kucoin_recent_orders_section"
        className="bg-[#12171D] border border-[#01BC8D]/40 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232E3A] pb-3.5">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0D2B24] border border-[#01BC8D]/40 flex items-center justify-center text-[#01BC8D] shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-white">
                  سجل الأوامر المنفذة في KuCoin (Recent Orders)
                </h3>
                <span
                  data-testid="kucoin_recent_orders_count_badge"
                  className="text-[10px] px-2 py-0.5 rounded-full bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40 font-mono font-bold"
                >
                  {filteredOrders.length} / {orderStats.totalCount} أمر
                </span>
              </div>
              <p className="text-[11px] text-[#8A99AD] mt-0.5">
                مراجعة جميع أوامر الشراء والبيع المنفذة عبر KuCoin مع التصفية الفورية حسب نوع الصفقة (شراء/بيع) أو الرمز (Symbol).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAnyOrderFilterActive && (
              <button
                type="button"
                onClick={handleResetOrderFilters}
                data-testid="kucoin_orders_reset_filters_btn"
                className="text-xs bg-[#1A222B] hover:bg-[#232E3A] text-[#01BC8D] border border-[#01BC8D]/40 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-bold cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إظهار الكل</span>
              </button>
            )}

            {recentOrders.length > 0 && onClearOrderHistory && (
              <button
                type="button"
                onClick={onClearOrderHistory}
                data-testid="kucoin_clear_orders_history_btn"
                className="text-xs bg-[#2B1216] hover:bg-[#F6465D]/25 text-[#F6465D] border border-[#F6465D]/40 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-semibold cursor-pointer transition-colors"
                title="مسح سجل الأوامر المنفذة"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح السجل</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Bar: Trade Side (الكل / شراء / بيع) + Symbol Filter (Select + Search + Quick Chips) */}
        <div
          data-testid="kucoin_recent_orders_filter_bar"
          className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3 sm:p-3.5 space-y-3"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            {/* 1. Trade Side Filter (تصفية حسب نوع الصفقة: الكل / شراء / بيع) */}
            <div className="lg:col-span-5">
              <label className="block text-[11px] text-[#8A99AD] font-semibold mb-1.5 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#01BC8D]" />
                <span>تصفية حسب نوع الصفقة (شراء / بيع):</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-[#12171D] p-1 rounded-xl border border-[#232E3A]">
                <button
                  type="button"
                  onClick={() => setOrderSideFilter('ALL')}
                  data-testid="kucoin_orders_filter_side_all"
                  className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    orderSideFilter === 'ALL'
                      ? 'bg-[#01BC8D] text-[#0B0E11] shadow-sm'
                      : 'text-[#8A99AD] hover:text-white'
                  }`}
                >
                  <span>الكل</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                      orderSideFilter === 'ALL'
                        ? 'bg-[#0B0E11]/20 text-[#0B0E11]'
                        : 'bg-[#1A222B] text-[#8A99AD]'
                    }`}
                  >
                    {orderStats.totalCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderSideFilter('BUY')}
                  data-testid="kucoin_orders_filter_side_buy"
                  className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    orderSideFilter === 'BUY'
                      ? 'bg-[#01BC8D] text-[#0B0E11] shadow-sm'
                      : 'text-[#01BC8D] hover:bg-[#0D2B24]/60'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                  <span>شراء (Buy)</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                      orderSideFilter === 'BUY'
                        ? 'bg-[#0B0E11]/20 text-[#0B0E11]'
                        : 'bg-[#0D2B24] text-[#01BC8D]'
                    }`}
                  >
                    {orderStats.buyCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderSideFilter('SELL')}
                  data-testid="kucoin_orders_filter_side_sell"
                  className={`py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    orderSideFilter === 'SELL'
                      ? 'bg-[#F6465D] text-white shadow-sm'
                      : 'text-[#F6465D] hover:bg-[#2B1216]/60'
                  }`}
                >
                  <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                  <span>بيع (Sell)</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                      orderSideFilter === 'SELL'
                        ? 'bg-black/25 text-white'
                        : 'bg-[#2B1216] text-[#F6465D]'
                    }`}
                  >
                    {orderStats.sellCount}
                  </span>
                </button>
              </div>
            </div>

            {/* 2. Symbol Dropdown Filter (اختيار الرمز Symbol) */}
            <div className="lg:col-span-3">
              <label className="block text-[11px] text-[#8A99AD] font-semibold mb-1.5">
                اختيار الرمز (Symbol):
              </label>
              <select
                value={orderSymbolFilter}
                onChange={(e) => setOrderSymbolFilter(e.target.value)}
                data-testid="kucoin_orders_filter_symbol_select"
                className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none cursor-pointer"
              >
                <option value="ALL">كل الرموز ({orderStats.uniqueSymbols.length})</option>
                {orderStats.uniqueSymbols.map((sym) => {
                  const badge = getReadableSymbolBadge(sym);
                  return (
                    <option key={sym} value={sym}>
                      {badge.secondary ? `${sym} (${badge.secondary})` : sym}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 3. Instant Symbol Search Input (بحث سريع بالرمز) */}
            <div className="lg:col-span-4">
              <label className="block text-[11px] text-[#8A99AD] font-semibold mb-1.5">
                بحث فوري بالرمز (مثال: BTC أو ETH أو SOL):
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#8A99AD] absolute right-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  data-testid="kucoin_orders_filter_symbol_input"
                  placeholder="ابحث بالرمز (BTC, XBTUSDTM, ETH...)"
                  className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl pr-9 pl-8 py-2 text-xs text-white font-mono focus:outline-none"
                />
                {orderSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setOrderSearchQuery('')}
                    className="absolute left-2.5 top-2 text-[11px] text-[#8A99AD] hover:text-white px-1.5 py-0.5 rounded bg-[#1A222B] cursor-pointer"
                  >
                    مسح
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Clickable Symbol Pills */}
          {orderStats.uniqueSymbols.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[#1A222B]">
              <span className="text-[10px] text-[#8A99AD] ml-1">تصفية سريعة بالرمز:</span>
              <button
                type="button"
                onClick={() => setOrderSymbolFilter('ALL')}
                data-testid="kucoin_orders_symbol_chip_ALL"
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                  orderSymbolFilter === 'ALL'
                    ? 'bg-[#01BC8D] text-[#0B0E11]'
                    : 'bg-[#12171D] text-[#8A99AD] border border-[#232E3A] hover:text-white'
                }`}
              >
                الكل ({orderStats.totalCount})
              </button>
              {orderStats.uniqueSymbols.map((sym) => {
                const badge = getReadableSymbolBadge(sym);
                const isSelected = orderSymbolFilter === sym;
                const countForSym = recentOrders.filter(
                  (o) => o.symbol.toUpperCase().trim() === sym
                ).length;
                return (
                  <button
                    key={sym}
                    type="button"
                    onClick={() =>
                      setOrderSymbolFilter(isSelected ? 'ALL' : sym)
                    }
                    data-testid={`kucoin_orders_symbol_chip_${sym}`}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#01BC8D] text-[#0B0E11]'
                        : 'bg-[#12171D] text-white border border-[#232E3A] hover:border-[#01BC8D]/50'
                    }`}
                  >
                    <span>{sym}</span>
                    {badge.secondary && (
                      <span
                        className={`text-[9px] ${
                          isSelected ? 'text-[#0B0E11]/80' : 'text-[#01BC8D]'
                        }`}
                      >
                        ({badge.secondary.replace('USDT', '')})
                      </span>
                    )}
                    <span
                      className={`text-[9px] px-1 rounded ${
                        isSelected
                          ? 'bg-[#0B0E11]/20 text-[#0B0E11]'
                          : 'bg-[#0B0E11] text-[#8A99AD]'
                      }`}
                    >
                      {countForSym}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Orders List / Table */}
        {recentOrders.length === 0 ? (
          <div
            data-testid="kucoin_recent_orders_empty"
            className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-6 text-center text-xs text-[#8A99AD]"
          >
            لا توجد أوامر مسجلة في سجل KuCoin حالياً. عند فتح أو نسخ أي صفقة جديدة، ستظهر تفاصيل الأمر المنفذ هنا مباشرة.
          </div>
        ) : filteredOrders.length === 0 ? (
          <div
            data-testid="kucoin_recent_orders_no_match"
            className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-6 text-center space-y-2.5"
          >
            <p className="text-xs text-[#8A99AD]">
              لا توجد أوامر مطابقة لخيارات التصفية المحددة حالياً (نوع الصفقة أو الرمز).
            </p>
            <button
              type="button"
              onClick={handleResetOrderFilters}
              className="text-xs bg-[#01BC8D] text-[#0B0E11] font-bold px-3.5 py-1.5 rounded-xl cursor-pointer inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة ضبط التصفية وإظهار كل الأوامر ({orderStats.totalCount})</span>
            </button>
          </div>
        ) : (
          <div
            data-testid="kucoin_recent_orders_table"
            className="overflow-x-auto rounded-xl border border-[#232E3A] bg-[#0B0E11]"
          >
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-[#1A222B] text-[#8A99AD] border-b border-[#232E3A] text-[11px]">
                  <th className="py-3 px-3 font-bold">الرمز (Symbol)</th>
                  <th className="py-3 px-3 font-bold">نوع الصفقة</th>
                  <th className="py-3 px-3 font-bold">سعر التنفيذ</th>
                  <th className="py-3 px-3 font-bold">الكمية / العقود</th>
                  <th className="py-3 px-3 font-bold">المصدر / الإشارة</th>
                  <th className="py-3 px-3 font-bold">الحالة</th>
                  <th className="py-3 px-3 font-bold">التوقيت ورقم الأمر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A222B]">
                {filteredOrders.map((ord) => {
                  const isBuy = (ord.side || '').toLowerCase() === 'buy';
                  const badge = getReadableSymbolBadge(ord.symbol);
                  const timeFormatted = new Date(ord.createdAt)
                    .toLocaleString('ar-EG-u-nu-latn', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    })
                    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

                  return (
                    <tr
                      key={ord.id}
                      data-testid={`kucoin_order_row_${ord.id}`}
                      data-order-side={isBuy ? 'BUY' : 'SELL'}
                      data-order-symbol={ord.symbol}
                      className="hover:bg-[#12171D] transition-colors"
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <CoinIcon symbol={badge.coinSymbol} size="sm" />
                          <div>
                            <div className="font-bold font-mono text-white text-xs flex items-center gap-1.5">
                              <span>{badge.primary}</span>
                              <button
                                type="button"
                                onClick={() => setOrderSymbolFilter(ord.symbol)}
                                title={`تصفية حسب الرمز ${ord.symbol}`}
                                className="text-[9px] bg-[#1A222B] hover:bg-[#0D2B24] text-[#01BC8D] border border-[#232E3A] px-1.5 py-0.5 rounded font-mono cursor-pointer"
                              >
                                {badge.secondary || 'تصفية'}
                              </button>
                            </div>
                            <span className="text-[10px] text-[#8A99AD] font-mono">
                              نوع الأمر: {ord.type.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold font-mono text-[11px] border ${
                            isBuy
                              ? 'bg-[#0D2B24] text-[#01BC8D] border-[#01BC8D]/40'
                              : 'bg-[#2B1216] text-[#F6465D] border-[#F6465D]/40'
                          }`}
                        >
                          {isBuy ? (
                            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{isBuy ? 'شراء • BUY (LONG)' : 'بيع • SELL (SHORT)'}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap font-mono font-bold text-white tabular-nums">
                        {ord.price > 0
                          ? `${ord.price.toFixed(ord.price > 50 ? 2 : 4)} USDT`
                          : 'سعر السوق (Market)'}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap font-mono text-white tabular-nums">
                        <span className="font-bold text-[#01BC8D]">{ord.dealSize || ord.size}</span>{' '}
                        <span className="text-[10px] text-[#8A99AD]">عقد</span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          {ord.sourceTraderName && (
                            <div className="text-xs font-bold text-[#01BC8D]">
                              المتداول: {ord.sourceTraderName}
                            </div>
                          )}
                          <div className="text-[11px] text-[#8A99AD]">
                            {ord.sourceSignal || 'تنفيذ مباشر بالسعر الحالي'}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            ord.isRealKuCoin || ord.status === 'DONE' || ord.status === 'NEW'
                              ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/30'
                              : 'bg-[#1A222B] text-[#8A99AD] border border-[#232E3A]'
                          }`}
                        >
                          <span>
                            {ord.status === 'DONE'
                              ? 'منفّذ (DONE)'
                              : ord.status === 'NEW'
                              ? 'مرسل (LIVE)'
                              : ord.status === 'CANCELLED'
                              ? 'ملغي (CANCELLED)'
                              : 'محاكاة (SIMULATED)'}
                          </span>
                        </span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px]">
                        <div className="text-white">{timeFormatted}</div>
                        <div className="text-[10px] text-[#8A99AD]">#{ord.orderId}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API Form */}
      <form onSubmit={handleSave} className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-sm text-[#01BC8D] flex items-center gap-2">
            <Key className="w-4 h-4" />
            <span>بيانات مفتاح KuCoin API (API Key & Passphrase بدون Secret)</span>
          </h3>
          {onOpenSimulationTab && (
            <button
              type="button"
              onClick={onOpenSimulationTab}
              className="text-[11px] text-[#01BC8D] hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>إعدادات الصفقات والمراكز (التداول) ←</span>
            </button>
          )}
        </div>

        {/* API Key */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-white">
              مفتاح API Key (من KuCoin)
            </label>
            <span className="text-[10px] text-[#8A99AD] font-mono">
              لا يتطلب مفتاح سري (No API Secret)
            </span>
          </div>
          <input
            type="text"
            data-testid="kucoin_api_key_input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="مثال: 64b8f... (KuCoin API Key)"
            className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
          />
        </div>

        {/* Passphrase (Mandatory for KuCoin) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-white">
              كلمة مرور المفتاح (API Passphrase)
            </label>
            <span className="text-[10px] text-[#01BC8D]">مطلوبة في KuCoin</span>
          </div>
          <div className="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              data-testid="kucoin_passphrase_input"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="الكلمة التي قمت بتعيينها عند إنشاء المفتاح في كوكوين"
              className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl pr-3.5 pl-10 py-2.5 text-xs text-white font-mono focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase(!showPassphrase)}
              className="absolute left-3 top-2.5 text-[#8A99AD] hover:text-white"
            >
              {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Market Selection */}
        <div>
          <label className="block text-[11px] text-[#8A99AD] mb-1.5">
            سوق التنفيذ المستهدف في KuCoin:
          </label>
          <div className="flex items-center border-b border-[#232E3A]">
            <button
              type="button"
              onClick={() => setMarketType('FUTURES')}
              className={`flex-1 py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                marketType === 'FUTURES'
                  ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                  : 'border-transparent text-[#8A99AD] hover:text-white'
              }`}
            >
              العقود الآجلة (KuCoin Futures)
            </button>
            <button
              type="button"
              onClick={() => setMarketType('SPOT')}
              className={`flex-1 py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                marketType === 'SPOT'
                  ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                  : 'border-transparent text-[#8A99AD] hover:text-white'
              }`}
            >
              التداول الفوري (KuCoin Spot)
            </button>
          </div>
        </div>

        {/* Live Execution Switch */}
        <div className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>تفعيل تنفيذ الصفقات الحقيقية في KuCoin</span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                  enableLiveExecution ? 'bg-[#F6465D]/20 text-[#F6465D]' : 'bg-[#0D2B24] text-[#01BC8D]'
                }`}
              >
                {enableLiveExecution ? 'LIVE ORDERS' : 'PAPER / DRY-RUN'}
              </span>
            </div>
            <p className="text-[11px] text-[#8A99AD] mt-0.5">
              عند التفعيل، سيتم إرسال أوامر حقيقية لحساب كوكوين بالحجم والرافعة المحددين في نافذة التداول
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={enableLiveExecution}
              onChange={(e) => setEnableLiveExecution(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#232E3A] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#232E3A] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#01BC8D]"></div>
          </label>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={connectionState.isTesting}
            data-testid="kucoin_save_and_test_btn"
            className="flex-1 bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>حفظ المفاتيح واختبار الاتصال مع كوكوين</span>
          </button>

          {(apiKey.length > 0 || config.apiKey.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setApiKey('');
                setPassphrase('');
                onClearKeys();
              }}
              className="bg-[#F6465D]/15 hover:bg-[#F6465D]/25 text-[#F6465D] border border-[#F6465D]/40 font-bold p-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              title="مسح مفاتيح KuCoin"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      <KuCoinSecurityConfigModal
        isOpen={isConfigModalOpen}
        config={securityConfig}
        onClose={() => setIsConfigModalOpen(false)}
        onUpdateConfig={(partial) => {
          if (onUpdateSecurityConfig) {
            onUpdateSecurityConfig(partial);
          }
        }}
      />
    </div>
  );
};
