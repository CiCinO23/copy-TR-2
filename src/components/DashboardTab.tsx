import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Wallet,
  Activity,
  Plus,
  X,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  CandlestickChart,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  BinanceConfig,
  BinanceConnectionState,
  KuCoinConnectionState,
  PaperAccountSnapshot,
  FuturesKlinePoint,
} from '../types';
import {
  addWatchedFuturesSymbol,
  removeWatchedFuturesSymbol,
  fetchSymbolKlines,
  fetchAllFuturesPrices,
  searchFuturesSymbols,
  DEFAULT_WATCHED_SYMBOLS,
} from '../services/binanceApi';

interface DashboardTabProps {
  connectionState: BinanceConnectionState;
  kucoinConnectionState: KuCoinConnectionState;
  paperSnapshot?: PaperAccountSnapshot;
  config: BinanceConfig;
  onOpenKucoinSetup: () => void;
  onRefreshMarket: () => void;
  onRefreshKucoin: () => void;
  onFetchRealKucoinBalance?: () => void;
}

import { CoinIcon, REAL_COIN_DATA, extractBaseCoin } from './CoinIcon';

const QUICK_ADD_COINS = [
  'ADAUSDT',
  'AVAXUSDT',
  'SUIUSDT',
  'LINKUSDT',
  'DOTUSDT',
  'LTCUSDT',
  'TONUSDT',
  'TRXUSDT',
  'ARBUSDT',
  'NEARUSDT',
  'APTUSDT',
  'OPUSDT',
];

const RealCoinIcon = CoinIcon;

export const DashboardTab: React.FC<DashboardTabProps> = ({
  connectionState,
  kucoinConnectionState,
  paperSnapshot,
  config,
  onOpenKucoinSetup,
  onRefreshMarket,
  onRefreshKucoin,
  onFetchRealKucoinBalance,
}) => {
  // Add Coin State
  const [showAddCoinPanel, setShowAddCoinPanel] = useState<boolean>(false);
  const [newCoinInput, setNewCoinInput] = useState<string>('');
  const [coinFeedback, setCoinFeedback] = useState<string | null>(null);
  const [realBalanceFeedback, setRealBalanceFeedback] = useState<string | null>(null);

  const handleFetchRealBalanceClick = () => {
    if (onFetchRealKucoinBalance) {
      onFetchRealKucoinBalance();
    } else {
      onRefreshKucoin();
    }
    setRealBalanceFeedback('جاري جلب وتحديث الرصيد الحقيقي من محفظة KuCoin...');
    setTimeout(() => {
      setRealBalanceFeedback(null);
    }, 4500);
  };

  // Chart State: Candlestick vs Area Line Mode
  const [chartViewMode, setChartViewMode] = useState<'CANDLE' | 'AREA'>('CANDLE');
  const [selectedChartSymbol, setSelectedChartSymbol] = useState<string>('BTCUSDT');
  const [chartInterval, setChartInterval] = useState<'15m' | '1h' | '4h' | '1d'>('1h');
  const [klineData, setKlineData] = useState<FuturesKlinePoint[]>([]);
  const [isLoadingChart, setIsLoadingChart] = useState<boolean>(false);
  const [hoveredCandle, setHoveredCandle] = useState<FuturesKlinePoint | null>(null);

  // KuCoin Balance Calculations (Real or Virtual fallback)
  const isKucoinAuth = kucoinConnectionState.isAuthenticated;
  const totalKucoinUsdt = isKucoinAuth
    ? kucoinConnectionState.usdtBalance
    : paperSnapshot?.totalEquity ?? kucoinConnectionState.usdtBalance ?? 1000;

  const availableKucoinUsdt = isKucoinAuth
    ? kucoinConnectionState.availableUsdt
    : paperSnapshot?.availableBalance ?? kucoinConnectionState.availableUsdt ?? 1000;

  const futuresBalance =
    kucoinConnectionState.futuresBalanceUsdt !== undefined && isKucoinAuth
      ? kucoinConnectionState.futuresBalanceUsdt
      : Number((totalKucoinUsdt * 0.55).toFixed(2));

  const spotBalance =
    kucoinConnectionState.spotBalanceUsdt !== undefined && isKucoinAuth
      ? kucoinConnectionState.spotBalanceUsdt
      : Number((totalKucoinUsdt * 0.35).toFixed(2));

  const mainBalance =
    kucoinConnectionState.mainBalanceUsdt !== undefined && isKucoinAuth
      ? kucoinConnectionState.mainBalanceUsdt
      : Number((totalKucoinUsdt * 0.1).toFixed(2));

  const unrealizedPnl = isKucoinAuth
    ? kucoinConnectionState.unrealizedPnlUsdt ?? 0
    : paperSnapshot?.unrealizedPnl ?? 0;

  const inOrderOrMargin = Math.max(0, Number((totalKucoinUsdt - availableKucoinUsdt).toFixed(2)));

  // Active ticker for the selected chart symbol
  const activeTicker =
    connectionState.tickers.find((t) => t.symbol === selectedChartSymbol) ||
    connectionState.tickers[0];

  const activeNumericPrice = activeTicker
    ? parseFloat(activeTicker.lastPrice.replace(/,/g, ''))
    : undefined;

  // Load chart klines whenever selected symbol or interval changes
  useEffect(() => {
    let cancelled = false;
    setIsLoadingChart(true);
    fetchSymbolKlines(config, selectedChartSymbol, chartInterval, activeNumericPrice)
      .then((pts) => {
        if (!cancelled) {
          setKlineData(pts);
          setIsLoadingChart(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingChart(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config, selectedChartSymbol, chartInterval, activeNumericPrice]);

  // Preload all Binance Futures symbols when Add Coin panel opens for instant autocomplete
  useEffect(() => {
    if (showAddCoinPanel) {
      fetchAllFuturesPrices(config).catch(() => {});
    }
  }, [showAddCoinPanel, config]);

  // Live autocomplete suggestions as the user types letters
  const coinSuggestions = React.useMemo(() => {
    if (!newCoinInput.trim()) return [];
    return searchFuturesSymbols(newCoinInput, 8);
  }, [newCoinInput]);

  const handleAddCoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newCoinInput.trim().toUpperCase();
    if (!cleaned) return;
    const targetSymbol =
      coinSuggestions.length > 0 &&
      (coinSuggestions[0].symbol === cleaned ||
        coinSuggestions[0].symbol.replace(/USDT$/, '') === cleaned)
        ? coinSuggestions[0].symbol
        : cleaned;
    addWatchedFuturesSymbol(targetSymbol);
    const normalized = targetSymbol.endsWith('USDT') ? targetSymbol : `${targetSymbol}USDT`;
    setNewCoinInput('');
    setSelectedChartSymbol(normalized);
    setCoinFeedback(`تمت إضافة ${normalized} إلى قائمة العملات الحية بنجاح!`);
    setTimeout(() => setCoinFeedback(null), 3500);
    onRefreshMarket();
  };

  const handleQuickAddCoin = (sym: string) => {
    addWatchedFuturesSymbol(sym);
    setNewCoinInput('');
    setSelectedChartSymbol(sym);
    setCoinFeedback(`تمت إضافة ${sym} وتحديث الأسعار المباشرة!`);
    setTimeout(() => setCoinFeedback(null), 3500);
    onRefreshMarket();
  };

  const handleRemoveCoin = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeWatchedFuturesSymbol(sym);
    if (selectedChartSymbol === sym) {
      setSelectedChartSymbol('BTCUSDT');
    }
    onRefreshMarket();
  };

  const isPositiveChart = activeTicker
    ? !activeTicker.priceChangePercent.startsWith('-')
    : true;

  // حساب المدى السعري للشموع
  const candlePriceRange = React.useMemo(() => {
    if (!klineData || klineData.length === 0) return { min: 0, max: 100 };
    let min = Infinity;
    let max = -Infinity;
    for (const pt of klineData) {
      if (pt.low < min) min = pt.low;
      if (pt.high > max) max = pt.high;
    }
    if (min === Infinity || max === -Infinity) return { min: 0, max: 100 };
    const pad = (max - min) * 0.08;
    return { min: Math.max(0, min - pad), max: max + pad };
  }, [klineData]);

  // أحدث نقطة للسعر المعروض في أعلى الشارت
  const displayedCandle = hoveredCandle || (klineData.length > 0 ? klineData[klineData.length - 1] : null);

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-200 w-full overflow-hidden">
      {/* 1. رصيد كوكوين الإجمالي وتفاصيل المحفظة */}
      <div className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4 overflow-hidden">
        {/* Top Row: Header & Total Balance */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2733] pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-[#161D26] border border-[#1E2733] flex items-center justify-center text-[#01BC8D] shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm text-[#8A99AD] font-semibold">
                  رصيد كوكوين الإجمالي
                </span>
                <span
                  className={`text-[11px] font-semibold shrink-0 ${
                    isKucoinAuth ? 'text-[#01BC8D]' : 'text-[#8A99AD]'
                  }`}
                >
                  · {isKucoinAuth ? 'حساب KuCoin حقيقي' : 'وضع التداول الافتراضي'}
                </span>
              </div>
              <div className="flex items-baseline gap-2.5 mt-1 flex-wrap">
                <span
                  dir="ltr"
                  className="text-2xl sm:text-3xl font-bold text-white font-mono tabular-nums tracking-tight"
                >
                  {totalKucoinUsdt.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  <span className="text-sm text-[#01BC8D] font-bold">USDT</span>
                </span>
                <span
                  dir="ltr"
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg shrink-0 ${
                    unrealizedPnl >= 0
                      ? 'bg-[#0D2B24] text-[#01BC8D]'
                      : 'bg-[#2B1216] text-[#F6465D]'
                  }`}
                >
                  PNL {unrealizedPnl >= 0 ? '+' : '-'}
                  ${Math.abs(unrealizedPnl).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleFetchRealBalanceClick}
              disabled={kucoinConnectionState.isTesting}
              data-testid="fetch_real_kucoin_balance_btn"
              className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${
                  kucoinConnectionState.isTesting ? 'animate-spin' : ''
                }`}
              />
              <span>جلب الرصيد الحقيقي</span>
            </button>

            <button
              type="button"
              onClick={onOpenKucoinSetup}
              className="bg-[#161D26] hover:bg-[#1E2733] border border-[#1E2733] text-[#F0F4F8] font-semibold px-3.5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
            >
              إعدادات كوكوين
            </button>
          </div>
        </div>

        {realBalanceFeedback && (
          <div
            data-testid="real_kucoin_balance_feedback"
            className="bg-[#0D2B24] border border-[#01BC8D]/40 rounded-xl px-3.5 py-2.5 text-xs text-[#01BC8D] font-bold flex items-center justify-between gap-2 animate-in fade-in duration-150"
          >
            <span>{realBalanceFeedback}</span>
            <span dir="ltr" className="font-mono text-white shrink-0 tabular-nums">
              {totalKucoinUsdt.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USDT
            </span>
          </div>
        )}

        {/* Detailed KuCoin Balance Breakdown */}
        <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-3 sm:p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-[#01BC8D] shrink-0" />
              <h3 className="font-bold text-white truncate">
                تفصيل أرصدة محفظة كوكوين
              </h3>
            </div>
            <span className="text-[11px] text-[#8A99AD] font-mono whitespace-nowrap shrink-0 tabular-nums">
              المراكز النشطة: <strong className="text-white">{kucoinConnectionState.positions.length}</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* 1. Futures Balance */}
            <div className="bg-[#12171D] border border-[#1E2733] rounded-xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] text-[#8A99AD]">
                <span className="truncate">حساب الفيوتشر</span>
                <span className="text-[10px] text-[#01BC8D] font-mono font-semibold">Futures</span>
              </div>
              <div
                dir="ltr"
                className="text-sm sm:text-base font-bold text-white font-mono tabular-nums mt-1 text-right truncate"
              >
                {futuresBalance.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-[10px] text-[#8A99AD]">USDT</span>
              </div>
              <span className="text-[10px] text-[#8A99AD] block mt-0.5 truncate">
                مخصص للعقود والنسخ
              </span>
            </div>

            {/* 2. Spot Balance */}
            <div className="bg-[#12171D] border border-[#1E2733] rounded-xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] text-[#8A99AD]">
                <span className="truncate">حساب السبوت</span>
                <span className="text-[10px] text-[#8A99AD] font-mono font-semibold">Spot</span>
              </div>
              <div
                dir="ltr"
                className="text-sm sm:text-base font-bold text-white font-mono tabular-nums mt-1 text-right truncate"
              >
                {spotBalance.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-[10px] text-[#8A99AD]">USDT</span>
              </div>
              <span className="text-[10px] text-[#8A99AD] block mt-0.5 truncate">
                التداول الفوري
              </span>
            </div>

            {/* 3. Main / Funding */}
            <div className="bg-[#12171D] border border-[#1E2733] rounded-xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] text-[#8A99AD]">
                <span className="truncate">حساب التمويل</span>
                <span className="text-[10px] text-[#38BDF8] font-mono font-semibold">Funding</span>
              </div>
              <div
                dir="ltr"
                className="text-sm sm:text-base font-bold text-white font-mono tabular-nums mt-1 text-right truncate"
              >
                {mainBalance.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-[10px] text-[#8A99AD]">USDT</span>
              </div>
              <span className="text-[10px] text-[#8A99AD] block mt-0.5 truncate">
                الإيداع والسحب
              </span>
            </div>

            {/* 4. Available */}
            <div className="bg-[#12171D] border border-[#1E2733] rounded-xl p-3 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] text-[#8A99AD]">
                <span className="truncate">المتاح للتداول</span>
                <span className="text-[10px] text-[#01BC8D] font-mono font-semibold">Available</span>
              </div>
              <div
                dir="ltr"
                className="text-sm sm:text-base font-bold text-[#01BC8D] font-mono tabular-nums mt-1 text-right truncate"
              >
                {availableKucoinUsdt.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                <span className="text-[10px] text-[#8A99AD]">USDT</span>
              </div>
              <span className="text-[10px] text-[#8A99AD] font-mono block mt-0.5 truncate">
                محجوز:{' '}
                <span dir="ltr" className="inline-block tabular-nums">
                  ${inOrderOrMargin.toFixed(2)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. أسعار العقود الآجلة الحية */}
      <div className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-3.5 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-[#01BC8D] shrink-0" />
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2 flex-wrap">
                <span>أسعار العقود الآجلة الحية</span>
                <span className="text-[11px] text-[#01BC8D] font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#01BC8D]" />
                  <span>مباشر 24س</span>
                </span>
              </h3>
              <p className="text-[11px] text-[#8A99AD]">
                اضغط على أي عملة لعرض الشارت بالشموع اليابانية.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => setShowAddCoinPanel(!showAddCoinPanel)}
              data-testid="toggle_add_coin_btn"
              className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddCoinPanel ? 'إغلاق الإضافة' : 'إضافة عملة'}</span>
            </button>
            <button
              type="button"
              onClick={onRefreshMarket}
              data-testid="refresh_market_button"
              className="p-2 rounded-xl bg-[#161D26] hover:bg-[#1E2733] border border-[#1E2733] text-[#01BC8D] transition-colors cursor-pointer"
              title="تحديث الأسعار"
            >
              <RefreshCw
                className={`w-4 h-4 ${connectionState.isTesting ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {coinFeedback && (
          <div className="bg-[#0D2B24] border border-[#01BC8D]/40 rounded-xl px-3 py-2 text-xs text-[#01BC8D] font-semibold">
            {coinFeedback}
          </div>
        )}

        {/* Add New Coin Panel */}
        {showAddCoinPanel && (
          <div className="bg-[#0B0E11] border border-[#01BC8D]/40 rounded-xl p-3.5 space-y-3">
            <div className="relative">
              <form onSubmit={handleAddCoinSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCoinInput}
                  onChange={(e) => setNewCoinInput(e.target.value)}
                  placeholder="أدخل أحرف العملة للاقتراح المباشر (مثال: B أو SO أو PEPE)..."
                  data-testid="new_coin_input"
                  autoComplete="off"
                  className="flex-1 bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                />
                <button
                  type="submit"
                  data-testid="submit_add_coin_btn"
                  className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-4 py-2 rounded-xl text-xs cursor-pointer shrink-0"
                >
                  + أضف العملة
                </button>
              </form>

              {/* الاقتراح المباشر للعملات عند إدخال الأحرف (Live Coin Autocomplete Suggestions) */}
              {newCoinInput.trim().length > 0 && (
                <div
                  data-testid="coin_autocomplete_dropdown"
                  className="mt-2 bg-[#12171D] border border-[#01BC8D]/50 rounded-xl p-2 shadow-xl space-y-1.5"
                >
                  <div className="flex items-center justify-between px-2 py-0.5 text-[10px] text-[#8A99AD]">
                    <span>
                      اقتراحات العملات المطابقة لـ{' '}
                      <strong className="text-[#01BC8D] font-mono">
                        "{newCoinInput.trim().toUpperCase()}"
                      </strong>
                      :
                    </span>
                    <span>اضغط للإضافة المباشرة</span>
                  </div>

                  {coinSuggestions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[#8A99AD] flex items-center justify-between">
                      <span>
                        لم يتم العثور على عملة مطابقة في القائمة، يمكنك الضغط على{' '}
                        <strong className="text-[#01BC8D]">+ أضف العملة</strong> لإضافة{' '}
                        <span className="font-mono text-white">
                          {newCoinInput.trim().toUpperCase().endsWith('USDT')
                            ? newCoinInput.trim().toUpperCase()
                            : `${newCoinInput.trim().toUpperCase()}USDT`}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
                      {coinSuggestions.map((item) => {
                        const base = item.symbol.replace(/(USDT|USDC|BUSD)$/, '');
                        const meta = REAL_COIN_DATA[extractBaseCoin(item.symbol)];
                        const alreadyExists = connectionState.tickers.some(
                          (t) => t.symbol === item.symbol
                        );

                        return (
                          <button
                            key={item.symbol}
                            type="button"
                            onClick={() => handleQuickAddCoin(item.symbol)}
                            data-testid={`suggestion_item_${item.symbol}`}
                            className={`p-2 rounded-lg border flex items-center justify-between gap-2 text-right transition-all cursor-pointer ${
                              alreadyExists
                                ? 'bg-[#0B0E11] border-[#232E3A] text-[#8A99AD]'
                                : 'bg-[#1A222B] hover:bg-[#232E3A] border-[#232E3A] hover:border-[#01BC8D] text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <RealCoinIcon symbol={item.symbol} size="sm" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1 font-mono text-xs font-bold">
                                  <span className="text-white">{base}</span>
                                  <span className="text-[10px] text-[#8A99AD]">/USDT</span>
                                </div>
                                {meta?.nameEn && (
                                  <span className="text-[10px] text-[#8A99AD] block truncate">
                                    {meta.nameEn}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.price > 0 && (
                                <span
                                  dir="ltr"
                                  className="text-[11px] font-mono text-[#01BC8D] tabular-nums"
                                >
                                  {item.price >= 1
                                    ? item.price.toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 4,
                                      })
                                    : item.price.toFixed(6)}
                                  $
                                </span>
                              )}
                              {alreadyExists ? (
                                <span className="text-[9px] bg-[#0D2B24] text-[#01BC8D] px-1.5 py-0.5 rounded font-bold">
                                  مضافة
                                </span>
                              ) : (
                                <span className="text-[10px] bg-[#01BC8D] text-[#0B0E11] px-2 py-0.5 rounded font-bold flex items-center gap-0.5">
                                  <Plus className="w-3 h-3" />
                                  إضافة
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] text-[#8A99AD] block">
                أشهر عملات العقود الآجلة للإضافة السريعة:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ADD_COINS.map((sym) => {
                  const alreadyExists = connectionState.tickers.some((t) => t.symbol === sym);
                  const base = sym.replace(/(USDT|USDC|BUSD)$/, '');
                  return (
                    <button
                      key={sym}
                      type="button"
                      disabled={alreadyExists}
                      onClick={() => handleQuickAddCoin(sym)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 border transition-all ${
                        alreadyExists
                          ? 'bg-[#12171D] text-[#8A99AD]/40 border-[#232E3A] cursor-default'
                          : 'bg-[#1A222B] hover:bg-[#212C37] text-white border-[#232E3A] hover:border-[#01BC8D]/60 cursor-pointer'
                      }`}
                    >
                      <RealCoinIcon symbol={sym} size="sm" />
                      <span>{base}</span>
                      {alreadyExists ? (
                        <span className="text-[9px] text-[#01BC8D]">مضافة</span>
                      ) : (
                        <Plus className="w-3 h-3 text-[#01BC8D]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Live Futures Tickers Grid with Real Logos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {connectionState.tickers.map((ticker) => {
            const isPositive = !ticker.priceChangePercent.startsWith('-');
            const base = ticker.symbol.replace(/(USDT|USDC|BUSD)$/, '');
            const isSelectedOnChart = selectedChartSymbol === ticker.symbol;
            const isRemovable = !DEFAULT_WATCHED_SYMBOLS.includes(ticker.symbol);

            return (
              <div
                key={ticker.symbol}
                onClick={() => setSelectedChartSymbol(ticker.symbol)}
                data-testid={`ticker_row_${ticker.symbol}`}
                className={`rounded-xl p-3 flex items-center justify-between gap-2.5 border transition-all cursor-pointer overflow-hidden ${
                  isSelectedOnChart
                    ? 'bg-[#1A222B] border-[#01BC8D] shadow-[0_0_14px_rgba(1,188,141,0.22)] ring-1 ring-[#01BC8D]/40'
                    : 'bg-[#0B0E11] hover:bg-[#1A222B]/80 border-[#232E3A]'
                }`}
              >
                {/* Right side: Real Coin Logo + Symbol */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <RealCoinIcon symbol={ticker.symbol} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-white font-mono tracking-tight">
                        {base}
                      </span>
                      <span className="text-[10px] text-[#8A99AD] font-mono">/USDT</span>
                    </div>
                  </div>
                </div>

                {/* Left side: Live Price + 24h Change */}
                <div className="flex items-center gap-2 shrink-0">
                  <div dir="ltr" className="text-left font-mono">
                    <div className="text-sm font-bold text-white tabular-nums tracking-tight">
                      {ticker.lastPrice}
                    </div>
                    <div
                      className={`text-[11px] font-bold flex items-center justify-end gap-0.5 tabular-nums ${
                        isPositive ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                      }`}
                    >
                      {isPositive ? (
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 shrink-0" />
                      )}
                      <span>{ticker.priceChangePercent}</span>
                    </div>
                  </div>

                  {isRemovable && (
                    <button
                      type="button"
                      onClick={(e) => handleRemoveCoin(ticker.symbol, e)}
                      className="p-1 rounded-lg bg-[#12171D] hover:bg-[#2B1216] text-[#8A99AD] hover:text-[#F6465D] transition-colors cursor-pointer"
                      title="حذف العملة"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. الشارت التفاعلي بالشموع اليابانية */}
      <div
        data-testid="dashboard_futures_chart"
        className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4 overflow-hidden"
      >
        {/* Coin Quick Switcher Underline Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[#1E2733] -mx-4 px-4 sm:-mx-5 sm:px-5 no-scrollbar">
          {connectionState.tickers.map((t) => {
            const base = t.symbol.replace('USDT', '');
            const active = t.symbol === selectedChartSymbol;
            return (
              <button
                key={t.symbol}
                type="button"
                onClick={() => setSelectedChartSymbol(t.symbol)}
                className={`px-3 py-2.5 text-xs font-mono font-bold flex items-center gap-1.5 shrink-0 border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                    : 'border-transparent text-[#8A99AD] hover:text-white'
                }`}
              >
                <RealCoinIcon symbol={t.symbol} size="sm" />
                <span>{base}/USDT</span>
              </button>
            );
          })}
        </div>

        {/* Compact Ticker Strip */}
        <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-3 sm:p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <RealCoinIcon symbol={selectedChartSymbol} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm sm:text-base text-white font-mono">
                  {selectedChartSymbol}
                </span>
                <span className="text-[10px] text-[#01BC8D] font-mono font-bold">
                  Perp
                </span>
              </div>
              <span className="text-[11px] text-[#8A99AD] block">
                عقود باينانس الآجلة الدائمة
              </span>
            </div>

            {activeTicker && (
              <div className="flex items-center gap-2.5 mr-auto sm:mr-2" dir="ltr">
                <span
                  className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums ${
                    isPositiveChart ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                  }`}
                >
                  {activeTicker.lastPrice}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-lg text-xs font-bold font-mono tabular-nums ${
                    isPositiveChart
                      ? 'bg-[#0D2B24] text-[#01BC8D]'
                      : 'bg-[#2B1216] text-[#F6465D]'
                  }`}
                >
                  {activeTicker.priceChangePercent}
                </span>
              </div>
            )}
          </div>

          {activeTicker && (
            <div className="grid grid-cols-3 gap-3 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-[#1E2733] text-[11px]">
              <div>
                <span className="text-[#8A99AD] block text-[10px]">أعلى 24س</span>
                <span dir="ltr" className="inline-block text-white font-bold font-mono tabular-nums">
                  {activeTicker.highPrice}
                </span>
              </div>
              <div>
                <span className="text-[#8A99AD] block text-[10px]">أدنى 24س</span>
                <span dir="ltr" className="inline-block text-white font-bold font-mono tabular-nums">
                  {activeTicker.lowPrice}
                </span>
              </div>
              <div>
                <span className="text-[#8A99AD] block text-[10px]">السيولة 24س</span>
                <span dir="ltr" className="inline-block text-[#01BC8D] font-bold font-mono tabular-nums">
                  {activeTicker.quoteVolume}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Chart Controls: Underline Mode Switch (Candles vs Line) & Timeframes */}
        <div className="flex items-center justify-between gap-2 border-b border-[#1E2733] pb-0 flex-wrap">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setChartViewMode('CANDLE')}
              className={`pb-2.5 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                chartViewMode === 'CANDLE'
                  ? 'border-[#01BC8D] text-[#01BC8D]'
                  : 'border-transparent text-[#8A99AD] hover:text-white'
              }`}
            >
              <CandlestickChart className="w-3.5 h-3.5" />
              <span>الشموع اليابانية</span>
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode('AREA')}
              className={`pb-2.5 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                chartViewMode === 'AREA'
                  ? 'border-[#01BC8D] text-[#01BC8D]'
                  : 'border-transparent text-[#8A99AD] hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>الرسم الخطي</span>
            </button>
          </div>

          <div className="flex items-center gap-1 pb-1.5">
            {(
              [
                { id: '15m', label: '15m' },
                { id: '1h', label: '1h' },
                { id: '4h', label: '4h' },
                { id: '1d', label: '1D' },
              ] as const
            ).map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setChartInterval(tf.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono transition-colors cursor-pointer ${
                  chartInterval === tf.id
                    ? 'bg-[#01BC8D]/15 text-[#01BC8D]'
                    : 'text-[#8A99AD] hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live Candle OHLC Summary Strip */}
        {displayedCandle && (
          <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[#8A99AD]">
                الوقت: <strong dir="ltr" className="inline-block text-white">{displayedCandle.timeLabel}</strong>
              </span>
              <span>
                افتتاح:{' '}
                <strong dir="ltr" className="inline-block text-white tabular-nums">{displayedCandle.open}</strong>
              </span>
              <span>
                أعلى:{' '}
                <strong dir="ltr" className="inline-block text-[#01BC8D] tabular-nums">{displayedCandle.high}</strong>
              </span>
              <span>
                أدنى:{' '}
                <strong dir="ltr" className="inline-block text-[#F6465D] tabular-nums">{displayedCandle.low}</strong>
              </span>
              <span>
                إغلاق:{' '}
                <strong
                  dir="ltr"
                  className={`inline-block tabular-nums ${
                    displayedCandle.close >= displayedCandle.open
                      ? 'text-[#01BC8D]'
                      : 'text-[#F6465D]'
                  }`}
                >
                  {displayedCandle.close}
                </strong>
              </span>
            </div>
            <div className="text-[#8A99AD]">
              الحجم: <strong dir="ltr" className="inline-block text-white tabular-nums">{displayedCandle.volume.toLocaleString('en-US')}</strong>
            </div>
          </div>
        )}

        {/* Main Candlestick / Area Chart Viewport */}
        <div className="bg-[#0B0E11] border border-[#1E2733] rounded-xl p-3 sm:p-4 relative">
          {isLoadingChart && klineData.length === 0 ? (
            <div
              data-testid="dashboard_chart_skeleton"
              className="h-64 sm:h-72 flex flex-col justify-between p-2 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="h-3 w-32 rounded bg-[#161D26]" />
                <div className="h-3 w-20 rounded bg-[#161D26]" />
              </div>
              <div className="flex-1 flex items-end gap-2 py-4">
                {[38, 62, 48, 74, 55, 80, 68, 44, 72, 60, 86, 54].map((h, idx) => (
                  <div
                    key={idx}
                    className="flex-1 rounded-sm bg-[#161D26]"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <div className="h-2.5 w-12 rounded bg-[#161D26]" />
                <div className="h-2.5 w-12 rounded bg-[#161D26]" />
                <div className="h-2.5 w-12 rounded bg-[#161D26]" />
              </div>
            </div>
          ) : chartViewMode === 'CANDLE' ? (
            /* رسم الشموع اليابانية التفاعلي الدقيق (SVG Candlesticks) */
            <div className="w-full" dir="ltr">
              <div className="h-64 sm:h-72 w-full relative">
                <svg
                  className="w-full h-full overflow-visible"
                  viewBox={`0 0 ${Math.max(400, klineData.length * 20)} 260`}
                  preserveAspectRatio="none"
                >
                  {/* Grid Lines */}
                  {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
                    const y = 260 * ratio;
                    const priceVal =
                      candlePriceRange.max -
                      (candlePriceRange.max - candlePriceRange.min) * ratio;
                    return (
                      <g key={ratio}>
                        <line
                          x1="0"
                          y1={y}
                          x2={klineData.length * 20}
                          y2={y}
                          stroke="#1A222B"
                          strokeDasharray="3 3"
                          strokeWidth="1"
                        />
                        <text
                          x={klineData.length * 20 - 4}
                          y={y - 4}
                          fill="#8A99AD"
                          fontSize="9"
                          textAnchor="end"
                          fontFamily="Cairo, sans-serif"
                        >
                          {priceVal.toFixed(priceVal > 500 ? 1 : 3)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Volume Bars at Bottom */}
                  {klineData.map((candle, idx) => {
                    const x = idx * 20 + 10;
                    const isGreen = candle.close >= candle.open;
                    const maxVol = Math.max(...klineData.map((c) => c.volume), 1);
                    const volHeight = Math.min(45, (candle.volume / maxVol) * 45);
                    return (
                      <rect
                        key={`vol-${candle.timestamp}`}
                        x={x - 4}
                        y={260 - volHeight}
                        width="8"
                        height={volHeight}
                        fill={isGreen ? '#01BC8D' : '#F6465D'}
                        opacity="0.25"
                      />
                    );
                  })}

                  {/* Japanese Candlesticks (فتيل الشمعة + جسم الشمعة) */}
                  {klineData.map((candle, idx) => {
                    const x = idx * 20 + 10;
                    const isGreen = candle.close >= candle.open;
                    const color = isGreen ? '#01BC8D' : '#F6465D';
                    const range = candlePriceRange.max - candlePriceRange.min || 1;

                    // تحويل السعر إلى إحداثيات Y (أعلى سعر هو Y=15، وأدنى سعر Y=210)
                    const getY = (val: number) => {
                      const normalized = (val - candlePriceRange.min) / range;
                      return 210 - normalized * 195;
                    };

                    const highY = getY(candle.high);
                    const lowY = getY(candle.low);
                    const openY = getY(candle.open);
                    const closeY = getY(candle.close);

                    const bodyTop = Math.min(openY, closeY);
                    const bodyHeight = Math.max(3, Math.abs(closeY - openY));

                    return (
                      <g
                        key={`candle-${candle.timestamp}`}
                        onMouseEnter={() => setHoveredCandle(candle)}
                        onMouseLeave={() => setHoveredCandle(null)}
                        className="cursor-pointer transition-opacity hover:opacity-80"
                      >
                        {/* فتيل الشمعة (Wick) */}
                        <line
                          x1={x}
                          y1={highY}
                          x2={x}
                          y2={lowY}
                          stroke={color}
                          strokeWidth="1.5"
                        />
                        {/* جسم الشمعة (Candle Body) */}
                        <rect
                          x={x - 5}
                          y={bodyTop}
                          width="10"
                          height={bodyHeight}
                          fill={color}
                          rx="1.5"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Time Axis Labels */}
              <div className="flex justify-between items-center text-[10px] text-[#8A99AD] font-mono pt-2 border-t border-[#1A222B]">
                <span>{klineData[0]?.timeLabel || ''}</span>
                <span>{klineData[Math.floor(klineData.length / 2)]?.timeLabel || ''}</span>
                <span>{klineData[klineData.length - 1]?.timeLabel || ''}</span>
              </div>
            </div>
          ) : (
            /* الرسم البياني الخطي البديل */
            <div className="w-full h-64 sm:h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={klineData}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="futuresChartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={isPositiveChart ? '#01BC8D' : '#F6465D'}
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="95%"
                        stopColor={isPositiveChart ? '#01BC8D' : '#F6465D'}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1A222B" />
                  <XAxis
                    dataKey="timeLabel"
                    stroke="#8A99AD"
                    tick={{ fill: '#8A99AD', fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId="price"
                    orientation="right"
                    stroke="#8A99AD"
                    tick={{ fill: '#8A99AD', fontSize: 11 }}
                    domain={['auto', 'auto']}
                    width={65}
                  />
                  <YAxis
                    yAxisId="vol"
                    orientation="left"
                    hide
                    domain={[0, (dataMax: number) => dataMax * 4]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#12171D',
                      borderColor: '#232E3A',
                      borderRadius: '10px',
                      color: '#FFFFFF',
                      fontSize: '12px',
                    }}
                    formatter={(value: any, name: any) => {
                      if (name === 'close') return [`${value} USDT`, 'سعر الإغلاق'];
                      if (name === 'high') return [`${value} USDT`, 'أعلى سعر'];
                      if (name === 'low') return [`${value} USDT`, 'أدنى سعر'];
                      if (name === 'volume') return [Number(value).toLocaleString('en-US'), 'حجم التداول'];
                      return [value, name];
                    }}
                  />
                  {activeNumericPrice && (
                    <ReferenceLine
                      yAxisId="price"
                      y={activeNumericPrice}
                      stroke="#01BC8D"
                      strokeDasharray="4 4"
                    />
                  )}
                  <Bar
                    yAxisId="vol"
                    dataKey="volume"
                    fill="#232E3A"
                    opacity={0.45}
                    radius={[3, 3, 0, 0]}
                  />
                  <Area
                    yAxisId="price"
                    type="monotone"
                    dataKey="close"
                    stroke={isPositiveChart ? '#01BC8D' : '#F6465D'}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#futuresChartGrad)"
                    activeDot={{ r: 5, fill: '#01BC8D', stroke: '#0B0E11', strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Bottom Summary Strip */}
          {activeTicker && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 mt-3 border-t border-[#1A222B] text-[11px] font-mono">
              <div className="flex items-center justify-between bg-[#12171D] px-3 py-1.5 rounded-lg border border-[#232E3A]/60">
                <span className="text-[#8A99AD]">أعلى سعر 24س:</span>
                <span className="font-bold text-[#01BC8D] tabular-nums">
                  {activeTicker.highPrice}
                </span>
              </div>
              <div className="flex items-center justify-between bg-[#12171D] px-3 py-1.5 rounded-lg border border-[#232E3A]/60">
                <span className="text-[#8A99AD]">أدنى سعر 24س:</span>
                <span className="font-bold text-[#F6465D] tabular-nums">
                  {activeTicker.lowPrice}
                </span>
              </div>
              <div className="flex items-center justify-between bg-[#12171D] px-3 py-1.5 rounded-lg border border-[#232E3A]/60">
                <span className="text-[#8A99AD]">حجم السيولة:</span>
                <span className="font-bold text-white tabular-nums">
                  {activeTicker.quoteVolume}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
