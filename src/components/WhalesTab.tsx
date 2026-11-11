import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Search,
  Users,
  Eye,
  Copy,
  Play,
  Square,
  Layers,
  History,
  ExternalLink,
  CheckCircle2,
  ChevronLeft,
  Sparkles,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { WhaleIcon } from './WhaleIcon';
import { SparklineSvg, QuickTradeBar } from './SparklineSvg';
import { CoinIcon } from './CoinIcon';
import {
  BinanceConnectionState,
  SmartMoneyTraderItem,
  SmartMoneyTraderProfile,
  SmartMoneySortType,
  SmartMoneyTimeRange,
  TraderOpenPosition,
  TraderPositionHistoryItem,
  TraderLatestRecord,
  ActiveCopiedTrader,
  CopiedSyncLog,
  KuCoinConfig,
  KuCoinConnectionState,
  TradeExecutionSettings,
} from '../types';
import {
  fetchSmartMoneyTradersList,
  fetchSmartMoneyWhaleDetail,
} from '../services/copyAndSmartMoneyApi';

interface WhalesTabProps {
  connectionState: BinanceConnectionState;
  kucoinConfig?: KuCoinConfig;
  kucoinConnectionState?: KuCoinConnectionState;
  tradeSettings?: TradeExecutionSettings;
  openPositionsCount?: number;
  onRefresh: () => void;
  onOpenKucoin?: () => void;
  onSyncTraderToEngine: (params: {
    traderId: string;
    traderName: string;
    source: 'COPY_TRADING' | 'SMART_MONEY';
    positions: TraderOpenPosition[];
    latestRecords: TraderLatestRecord[];
    marginPerTradeUsdt: number;
  }) => CopiedSyncLog[];
  onCopySinglePosition: (
    pos: TraderOpenPosition,
    traderName: string,
    marginUsdt: number
  ) => void;
  onOpenSimulationTab: () => void;
  targetWhaleId?: string | null;
  onClearTargetWhaleId?: () => void;
}

const SMART_SORT_OPTIONS: { key: SmartMoneySortType; labelAr: string }[] = [
  { key: 'PNL', labelAr: 'الأعلى ربحاً بالدولار (PNL $)' },
  { key: 'ROI', labelAr: 'الأعلى عائداً (ROI %)' },
  { key: 'SUBSCRIBERS', labelAr: 'الأكثر مشتركين (Subscribers)' },
];

const SMART_TIME_RANGES: { key: SmartMoneyTimeRange; labelAr: string }[] = [
  { key: '7D', labelAr: '7 أيام' },
  { key: '30D', labelAr: '30 يوم' },
  { key: '90D', labelAr: '90 يوم' },
  { key: '365D', labelAr: '365 يوم' },
  { key: 'ALL', labelAr: 'الكل (ALL)' },
];

export const WhalesTab: React.FC<WhalesTabProps> = ({
  connectionState,
  tradeSettings,
  openPositionsCount = 0,
  onRefresh,
  onSyncTraderToEngine,
  onCopySinglePosition,
  onOpenSimulationTab,
  targetWhaleId,
  onClearTargetWhaleId,
}) => {
  // Sorting & Filtering State
  const [rankingType, setRankingType] = useState<SmartMoneySortType>('PNL');
  const [timeRange, setTimeRange] = useState<SmartMoneyTimeRange>('30D');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlySharingPos, setOnlySharingPos] = useState<boolean>(false);

  // Smart Money List State
  const [whales, setWhales] = useState<SmartMoneyTraderItem[]>([]);
  const [totalWhales, setTotalWhales] = useState<number>(0);
  const [isLoadingWhales, setIsLoadingWhales] = useState<boolean>(true);
  const [isLiveBinance, setIsLiveBinance] = useState<boolean>(true);

  // Selected Whale Detail State
  const [selectedWhaleId, setSelectedWhaleId] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<SmartMoneyTraderItem | null>(null);
  const [whaleProfile, setWhaleProfile] = useState<SmartMoneyTraderProfile | null>(null);
  const [whalePositions, setWhalePositions] = useState<TraderOpenPosition[]>([]);
  const [whalePositionHistory, setWhalePositionHistory] = useState<TraderPositionHistoryItem[]>([]);
  const [whaleRecords, setWhaleRecords] = useState<TraderLatestRecord[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailSubTab, setDetailSubTab] = useState<'POSITIONS' | 'POSITION_DETAILS'>('POSITIONS');

  // Copy Configuration & Active Copied Whales
  const marginPerTrade = tradeSettings?.tradeValueUsdt || 30;
  const [copiedWhales, setCopiedWhales] = useState<ActiveCopiedTrader[]>(() => {
    try {
      const saved = localStorage.getItem('whale_copied_traders_sm');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [syncLogs, setSyncLogs] = useState<CopiedSyncLog[]>([]);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const saveCopiedWhales = (list: ActiveCopiedTrader[]) => {
    setCopiedWhales(list);
    try {
      localStorage.setItem('whale_copied_traders_sm', JSON.stringify(list));
    } catch {
      // ignore storage errors
    }
  };

  // Load Smart Money Whales from https://www.binance.com/en/smart-money
  const loadSmartMoneyWhales = useCallback(async () => {
    setIsLoadingWhales(true);
    const res = await fetchSmartMoneyTradersList({
      page: 1,
      rows: 20,
      timeRange,
      rankingType,
      onlyShowSharingPosition: onlySharingPos,
      searchNickname: searchQuery,
      order: 'DESC',
    });
    setWhales(res.rows);
    setTotalWhales(res.total);
    setIsLiveBinance(res.isLiveBinance);
    setIsLoadingWhales(false);
  }, [timeRange, rankingType, onlySharingPos, searchQuery]);

  useEffect(() => {
    loadSmartMoneyWhales();
  }, [loadSmartMoneyWhales]);

  // Select a Whale to view full details + Positions + Position tabs
  const handleSelectWhale = useCallback(
    async (whale: SmartMoneyTraderItem) => {
      setSelectedWhaleId(whale.topTraderId);
      setSelectedSummary(whale);
      setIsLoadingDetail(true);
      setFeedbackBanner(null);

      const fullData = await fetchSmartMoneyWhaleDetail(
        whale.topTraderId,
        whale,
        connectionState.tickers
      );
      setWhaleProfile(fullData.profile);
      setWhalePositions(fullData.positions);
      setWhalePositionHistory(fullData.positionHistory);
      setWhaleRecords(fullData.latestRecords);
      setIsLoadingDetail(false);
    },
    [connectionState.tickers]
  );

  // Auto-select whale if requested from SimulationTab or elsewhere
  useEffect(() => {
    if (targetWhaleId) {
      const existing = whales.find((w) => w.topTraderId === targetWhaleId);
      handleSelectWhale(
        existing || {
          topTraderId: targetWhaleId,
          traderName: 'Whale Trader',
          accountName: 'Whale',
          avatarUrl: '',
          subscribers: 0,
          roi: 0,
          pnl: 0,
          assets: 0,
          mdd: null,
          positionStatus: 'IN_POSITION',
          chartItems: [],
        }
      );
      if (onClearTargetWhaleId) {
        onClearTargetWhaleId();
      }
    }
  }, [targetWhaleId, whales, handleSelectWhale, onClearTargetWhaleId]);

  // Copy a Whale: fetches `positions` and `position` details and syncs to engine
  const handleCopyWhale = useCallback(
    async (whale: SmartMoneyTraderItem) => {
      setFeedbackBanner(
        `جاري جلب معلومات الصفقات من نافذتي Positions و Position للحوت ${whale.traderName}...`
      );

      const fullData = await fetchSmartMoneyWhaleDetail(
        whale.topTraderId,
        whale,
        connectionState.tickers
      );

      if (selectedWhaleId === whale.topTraderId) {
        setWhaleProfile(fullData.profile);
        setWhalePositions(fullData.positions);
        setWhalePositionHistory(fullData.positionHistory);
        setWhaleRecords(fullData.latestRecords);
      }

      const logs = onSyncTraderToEngine({
        traderId: whale.topTraderId,
        traderName: whale.traderName,
        source: 'SMART_MONEY',
        positions: fullData.positions,
        latestRecords: fullData.latestRecords,
        marginPerTradeUsdt: marginPerTrade,
      });

      setSyncLogs((prev) => [...logs, ...prev].slice(0, 30));

      const exists = copiedWhales.find((c) => c.traderId === whale.topTraderId);
      let updatedList: ActiveCopiedTrader[];
      if (exists) {
        updatedList = copiedWhales.map((c) =>
          c.traderId === whale.topTraderId
            ? {
                ...c,
                syncedPositionsCount: fullData.positions.length,
                syncedRecordsCount: fullData.positionHistory.length,
              }
            : c
        );
      } else {
        updatedList = [
          {
            traderId: whale.topTraderId,
            nickname: whale.traderName,
            avatarUrl: whale.avatarUrl,
            source: 'SMART_MONEY',
            copyBudgetUsdt: marginPerTrade,
            leverageOverride: null,
            startedAt: Date.now(),
            syncedPositionsCount: fullData.positions.length,
            syncedRecordsCount: fullData.positionHistory.length,
            autoFollowRecords: true,
          },
          ...copiedWhales,
        ];
      }
      saveCopiedWhales(updatedList);

      setFeedbackBanner(
        `تم تفعيل نسخ الحوت "${whale.traderName}" بنجاح! تم جلب (${fullData.positions.length}) صفقات من نافذة Positions و (${fullData.positionHistory.length}) تفاصيل مراكز من نافذة Position.`
      );
    },
    [connectionState.tickers, selectedWhaleId, onSyncTraderToEngine, marginPerTrade, copiedWhales]
  );

  const handleStopCopyWhale = (traderId: string) => {
    const updated = copiedWhales.filter((c) => c.traderId !== traderId);
    saveCopiedWhales(updated);
    setFeedbackBanner('تم إيقاف نسخ الحوت المحدد.');
  };

  const formatMoney = (val: number) => {
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatTime = (ms: number) => {
    if (!ms) return '--';
    return new Date(ms)
      .toLocaleString('ar-EG-u-nu-latn', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  };

  const formatDuration = (startMs: number, endMs: number) => {
    if (!startMs || !endMs || endMs <= startMs) return '--';
    const diffMin = Math.round((endMs - startMs) / 60000);
    if (diffMin < 60) return `${diffMin} دقيقة`;
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return mins > 0 ? `${hours} ساعة و ${mins} د` : `${hours} ساعة`;
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Quick Trade Bar (شريط حالة التداول السريع الموحد) */}
      <QuickTradeBar
        tradeSettings={tradeSettings}
        openPositionsCount={openPositionsCount}
        onEditClick={onOpenSimulationTab}
      />

      {feedbackBanner && (
        <div className="bg-[#0D2B24] border border-[#01BC8D]/40 rounded-xl p-3 flex items-center justify-between gap-3 text-xs text-[#01BC8D]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackBanner}</span>
          </div>
          <button
            onClick={onOpenSimulationTab}
            className="bg-[#01BC8D] text-[#0B0E11] font-bold px-3 py-1 rounded-lg shrink-0 cursor-pointer"
          >
            عرض نافذة التداول
          </button>
        </div>
      )}

      {/* Selected Whale Detail Window (Focused Full View) */}
      {selectedWhaleId && whaleProfile ? (
        <div className="bg-[#12171D] border border-[#01BC8D]/50 rounded-2xl p-4 sm:p-5 space-y-5">
          {/* Header & Back Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#232E3A] pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedWhaleId(null)}
                className="bg-[#1A222B] hover:bg-[#293847] text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 border border-[#232E3A] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 rotate-180" />
                <span>عودة لقائمة الحيتان</span>
              </button>

              <button
                onClick={onOpenSimulationTab}
                className="bg-[#0D2B24] hover:bg-[#01BC8D]/20 text-[#01BC8D] border border-[#01BC8D]/40 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                title="العودة مباشرة لنافذة التداول والصفقات"
              >
                <span>العودة لصفحة التداول ⬅️</span>
              </button>

              <div className="flex items-center gap-3">
                {whaleProfile.avatarUrl ? (
                  <img
                    src={whaleProfile.avatarUrl}
                    alt={whaleProfile.traderName}
                    className="w-12 h-12 rounded-full object-cover border-2 border-[#01BC8D]"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#01BC8D]/20 text-[#01BC8D] flex items-center justify-center font-bold text-lg border border-[#01BC8D]">
                    {whaleProfile.traderName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-white">
                      {whaleProfile.traderName}
                    </h3>
                    <span className="text-[10px] font-mono bg-[#0D2B24] text-[#01BC8D] px-2 py-0.5 rounded border border-[#01BC8D]/30">
                      Smart Money ID: #{whaleProfile.topTraderId}
                    </span>
                  </div>
                  <p className="text-xs text-[#8A99AD] mt-0.5 line-clamp-1">
                    {whaleProfile.introduction}
                  </p>
                </div>
              </div>
            </div>

            {/* Copy Action Controls (Unified size from TradeSettings) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => selectedSummary && handleCopyWhale(selectedSummary)}
                className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  نسخ الحوت ({marginPerTrade}$ × {tradeSettings?.leverage || 5}x)
                </span>
              </button>
            </div>
          </div>

          {isLoadingDetail ? (
            <div className="py-12 text-center text-sm text-[#8A99AD] flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#01BC8D]" />
              <span>جاري جلب الملف الكامل للحوت ومعلومات الصفقات من نافذتي Positions و Position...</span>
            </div>
          ) : (
            <>
              {/* Whale Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">إجمالي ربح الحوت (PNL)</span>
                  <span
                    className={`text-base sm:text-lg font-bold font-mono mt-0.5 block ${
                      whaleProfile.pnl >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                    }`}
                  >
                    {formatMoney(whaleProfile.pnl)} USDT
                  </span>
                </div>

                <div className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">نسبة العائد (ROI)</span>
                  <span
                    className={`text-base sm:text-lg font-bold font-mono mt-0.5 block ${
                      whaleProfile.roi >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                    }`}
                  >
                    {whaleProfile.roi >= 0 ? '+' : ''}
                    {whaleProfile.roi.toFixed(2)}%
                  </span>
                </div>

                <div className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">
                    رصيد العقود الآجلة (UM Balance)
                  </span>
                  <span className="text-base sm:text-lg font-bold font-mono text-[#01BC8D] mt-0.5 block">
                    {whaleProfile.umMarginBalance.toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    USDT
                  </span>
                </div>

                <div className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">المشتركون / أيام النشاط</span>
                  <span className="text-base sm:text-lg font-bold font-mono text-white mt-0.5 block">
                    {whaleProfile.subscribers.toLocaleString('en-US')} متابع
                  </span>
                  <span className="text-[10px] text-[#8A99AD]">
                    نشط منذ {whaleProfile.daysActive} يوماً • Win Rate: {whaleProfile.winRate.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* KuCoin-style Underline Sub-Tabs: Positions & Position */}
              <div className="flex items-center gap-4 border-b border-[#232E3A] overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setDetailSubTab('POSITIONS')}
                  className={`pb-3 px-2 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
                    detailSubTab === 'POSITIONS'
                      ? 'border-[#01BC8D] text-[#01BC8D]'
                      : 'border-transparent text-[#8A99AD] hover:text-white'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Positions ({whalePositions.length})</span>
                </button>

                <button
                  onClick={() => setDetailSubTab('POSITION_DETAILS')}
                  className={`pb-3 px-2 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
                    detailSubTab === 'POSITION_DETAILS'
                      ? 'border-[#01BC8D] text-[#01BC8D]'
                      : 'border-transparent text-[#8A99AD] hover:text-white'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Position ({whalePositionHistory.length})</span>
                </button>
              </div>

              {/* SUB-TAB 1: POSITIONS */}
              {detailSubTab === 'POSITIONS' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8A99AD]">
                      معلومات الصفقات الحية المسحوبة من نافذة <strong className="text-white">Positions</strong> الخاصة بالحوت (مع وقت الدخول وسجل التدعيم والانسحاب الجزئي %):
                    </span>
                    <span className="text-[11px] text-[#01BC8D] font-mono">
                      Sharing Position: {whaleProfile.sharingPosition ? 'ON' : 'SYNCED'}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {whalePositions.map((pos) => {
                      const isProfit = pos.unrealizedProfit >= 0;
                      return (
                        <div
                          key={pos.id}
                          className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3.5 flex flex-col gap-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                    pos.side === 'LONG'
                                      ? 'bg-[#0D2B24] text-[#01BC8D]'
                                      : 'bg-[#2B1216] text-[#F6465D]'
                                  }`}
                                >
                                  {pos.side} {pos.leverage}x
                                </span>
                                <CoinIcon symbol={pos.symbol} size="sm" />
                                <span className="font-bold text-sm text-white font-mono">
                                  {pos.symbol}
                                </span>
                                <span className="text-[10px] text-[#8A99AD] bg-[#0B0E11] px-2 py-0.5 rounded font-mono">
                                  {pos.isolated ? 'Isolated' : 'Cross'}
                                </span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                                    pos.currentScalePercent > 100
                                      ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40'
                                      : pos.currentScalePercent < 100
                                      ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40'
                                      : 'bg-[#0B0E11] text-[#8A99AD]'
                                  }`}
                                >
                                  الحجم الحالي: {pos.currentScalePercent}%{' '}
                                  {pos.currentScalePercent > 100
                                    ? `(مُدعّم +${pos.currentScalePercent - 100}%)`
                                    : pos.currentScalePercent < 100
                                    ? `(منسحب جزئياً -${100 - pos.currentScalePercent}%)`
                                    : '(دخول أساسي)'}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] text-[#8A99AD] pt-1">
                                <div>
                                  حجم المركز:{' '}
                                  <span className="text-white font-mono font-semibold">
                                    {pos.positionAmount} {pos.symbol.replace('USDT', '')}
                                  </span>
                                </div>
                                <div>
                                  سعر الدخول:{' '}
                                  <span className="text-white font-mono font-semibold">
                                    {pos.entryPrice}
                                  </span>
                                </div>
                                <div>
                                  السعر العادل (Mark):{' '}
                                  <span className="text-[#01BC8D] font-mono font-semibold">
                                    {pos.markPrice}
                                  </span>
                                </div>
                                <div>
                                  القيمة الاسمية:{' '}
                                  <span className="text-white font-mono">
                                    {pos.notionalValue.toLocaleString('en-US', {
                                      maximumFractionDigits: 0,
                                    })}{' '}
                                    USDT
                                  </span>
                                </div>
                              </div>

                              {/* Entry Time & Last Update Time Row */}
                              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                                <span className="bg-[#0B0E11] border border-[#232E3A] px-2.5 py-1 rounded-lg text-[#8A99AD]">
                                  وقت الدخول:{' '}
                                  <strong className="text-white font-mono">
                                    {formatTime(pos.entryTime)}
                                  </strong>
                                </span>
                                <span className="bg-[#0B0E11] border border-[#232E3A] px-2.5 py-1 rounded-lg text-[#8A99AD]">
                                  آخر حركة (تدعيم/انسحاب):{' '}
                                  <strong className="text-[#01BC8D] font-mono">
                                    {formatTime(pos.lastUpdateTime)}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-[#232E3A] pt-2 sm:pt-0">
                              <div className="text-left font-mono">
                                <div
                                  className={`text-xs sm:text-sm font-bold ${
                                    isProfit ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                                  }`}
                                >
                                  {formatMoney(pos.unrealizedProfit)} USDT
                                </div>
                                <div
                                  className={`text-[10px] ${
                                    pos.roePercent >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                                  }`}
                                >
                                  ROE: {pos.roePercent >= 0 ? '+' : ''}
                                  {pos.roePercent.toFixed(2)}%
                                </div>
                              </div>

                              <button
                                onClick={() => {
                                  onCopySinglePosition(
                                    pos,
                                    whaleProfile.traderName,
                                    marginPerTrade
                                  );
                                  setFeedbackBanner(
                                    `تم نسخ مركز الحوت ${pos.symbol} (${pos.side} ${pos.leverage}x) من نافذة Positions بنجاح!`
                                  );
                                }}
                                className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shrink-0"
                              >
                                نسخ المركز
                              </button>
                            </div>
                          </div>

                          {/* Scale-In / Partial Withdrawal Timeline */}
                          {pos.scaleAdjustments && pos.scaleAdjustments.length > 0 && (
                            <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2.5 space-y-1.5">
                              <div className="flex items-center justify-between text-[10px] text-[#8A99AD]">
                                <span className="font-bold text-[#01BC8D]">
                                  سجل أوقات وأحجام الدخول والتدعيم والانسحاب الجزئي (%):
                                </span>
                                <span className="font-mono">
                                  {pos.scaleAdjustments.length} حركات مسجلة
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {pos.scaleAdjustments.map((adj) => {
                                  const isScaleIn = adj.actionType === 'SCALE_IN';
                                  const isPartialExit = adj.actionType === 'PARTIAL_EXIT';
                                  return (
                                    <div
                                      key={adj.id}
                                      className={`rounded-lg p-2 border text-[10px] flex flex-col justify-between gap-1 ${
                                        isScaleIn
                                          ? 'bg-[#0D2B24]/50 border-[#01BC8D]/40'
                                          : isPartialExit
                                          ? 'bg-[#0D2B24]/60 border-[#01BC8D]/40'
                                          : 'bg-[#12171D] border-[#232E3A]'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span
                                          className={`font-bold ${
                                            isScaleIn
                                              ? 'text-[#01BC8D]'
                                              : isPartialExit
                                              ? 'text-[#01BC8D]'
                                              : 'text-white'
                                          }`}
                                        >
                                          {adj.actionLabelAr}
                                        </span>
                                        <span
                                          className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                                            isScaleIn
                                              ? 'bg-[#01BC8D] text-[#0B0E11]'
                                              : isPartialExit
                                              ? 'bg-[#01BC8D] text-[#0B0E11]'
                                              : 'bg-[#232E3A] text-white'
                                          }`}
                                        >
                                          {isScaleIn
                                            ? `+${adj.volumePercent}%`
                                            : isPartialExit
                                            ? `-${adj.volumePercent}%`
                                            : `${adj.volumePercent}%`}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[#8A99AD] font-mono">
                                        <span>السعر: {adj.price}</span>
                                        <span>المتبقي: {adj.remainingPercentAfter}%</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[#8A99AD] pt-0.5 border-t border-[#232E3A]/60">
                                        <span>الكمية: {adj.executedQty}</span>
                                        <span className="font-mono text-white">
                                          {formatTime(adj.timestamp)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: POSITION (Detailed Position & Closed Position History) */}
              {detailSubTab === 'POSITION_DETAILS' && (
                <div className="space-y-3">
                  <div className="text-xs text-[#8A99AD]">
                    تفاصيل المراكز وسجل الأداء الكامل من نافذة <strong className="text-white">Position</strong> الخاصة بالحوت (مع أوقات الدخول والخروج ونسب التدعيم والانسحاب %):
                  </div>

                  <div className="space-y-2.5">
                    {whalePositionHistory.map((item) => {
                      const isWin = item.closingPnl >= 0;
                      return (
                        <div
                          key={item.id}
                          className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3.5 flex flex-col gap-3 text-xs"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                                    item.side === 'LONG'
                                      ? 'bg-[#0D2B24] text-[#01BC8D]'
                                      : 'bg-[#2B1216] text-[#F6465D]'
                                  }`}
                                >
                                  {item.side}
                                </span>
                                <CoinIcon symbol={item.symbol} size="sm" />
                                <span className="font-bold text-white font-mono text-sm">
                                  {item.symbol}
                                </span>
                                <span className="text-[10px] text-[#8A99AD] bg-[#0B0E11] px-2 py-0.5 rounded">
                                  {item.isolated ? 'Isolated' : 'Cross'}
                                </span>
                                <span className="text-[10px] text-[#01BC8D] bg-[#0B0E11] border border-[#01BC8D]/30 px-2 py-0.5 rounded font-mono">
                                  مدة الصفقة: {formatDuration(item.opened, item.closed)}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[11px] text-[#8A99AD] pt-1">
                                <div>
                                  متوسط التكلفة:{' '}
                                  <span className="text-white font-mono font-semibold">
                                    {item.avgCost} USDT
                                  </span>
                                </div>
                                <div>
                                  سعر الإغلاق / المرجعي:{' '}
                                  <span className="text-white font-mono font-semibold">
                                    {item.avgClosePrice} USDT
                                  </span>
                                </div>
                                <div>
                                  الحجم المنفذ:{' '}
                                  <span className="text-white font-mono">
                                    {item.closedVolume} {item.symbol.replace('USDT', '')}
                                  </span>
                                </div>
                              </div>

                              {/* Entry Time & Exit Time */}
                              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                                <span className="bg-[#0B0E11] border border-[#232E3A] px-2.5 py-1 rounded-lg text-[#8A99AD]">
                                  وقت الدخول:{' '}
                                  <strong className="text-[#01BC8D] font-mono">
                                    {formatTime(item.opened)}
                                  </strong>
                                </span>
                                <span className="bg-[#0B0E11] border border-[#232E3A] px-2.5 py-1 rounded-lg text-[#8A99AD]">
                                  وقت الخروج:{' '}
                                  <strong className="text-[#01BC8D] font-mono">
                                    {formatTime(item.closed)}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-[#232E3A] pt-2 sm:pt-0">
                              <div className="text-left font-mono">
                                <span
                                  className={`font-bold text-sm ${
                                    isWin ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                                  }`}
                                >
                                  {formatMoney(item.closingPnl)} USDT
                                </span>
                                <span className="block text-[10px] text-[#8A99AD]">
                                  أقصى حجم: {item.maxOpenInterest} {item.symbol.replace('USDT', '')}
                                </span>
                              </div>

                              <button
                                onClick={() => {
                                  onCopySinglePosition(
                                    {
                                      id: item.id,
                                      symbol: item.symbol,
                                      collateral: 'USDT',
                                      positionAmount: item.closedVolume,
                                      side: item.side,
                                      entryPrice: item.avgCost,
                                      markPrice: item.avgClosePrice,
                                      breakEvenPrice: item.avgCost,
                                      unrealizedProfit: item.closingPnl,
                                      cumRealized: item.closingPnl,
                                      notionalValue: item.closedVolume * item.avgClosePrice,
                                      leverage: 5,
                                      isolated: item.isolated,
                                      roePercent: 0,
                                      entryTime: item.opened,
                                      lastUpdateTime: item.closed,
                                      currentScalePercent: 100,
                                      scaleAdjustments: item.scaleAdjustments,
                                    },
                                    whaleProfile.traderName,
                                    marginPerTrade
                                  );
                                  setFeedbackBanner(
                                    `تم نسخ إعدادات المركز (${item.symbol} ${item.side}) من نافذة Position للحوت ${whaleProfile.traderName}`
                                  );
                                }}
                                className="bg-[#12171D] hover:bg-[#212C37] text-[#01BC8D] border border-[#01BC8D]/40 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                              >
                                محاكاة المركز
                              </button>
                            </div>
                          </div>

                          {/* Scale adjustments timeline for closed whale position */}
                          {item.scaleAdjustments && item.scaleAdjustments.length > 0 && (
                            <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2.5 space-y-1.5">
                              <div className="text-[10px] text-[#01BC8D] font-bold">
                                مراحل تنفيذ الصفقة للحوت (أوقات وأحجام الدخول والتدعيم والانسحاب والخروج %):
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                {item.scaleAdjustments.map((adj) => {
                                  const isScaleIn = adj.actionType === 'SCALE_IN';
                                  const isPartial = adj.actionType === 'PARTIAL_EXIT';
                                  const isFullExit = adj.actionType === 'FULL_EXIT';
                                  return (
                                    <div
                                      key={adj.id}
                                      className={`rounded-lg p-2 border text-[10px] space-y-1 ${
                                        isScaleIn
                                          ? 'bg-[#0D2B24]/40 border-[#01BC8D]/40'
                                          : isPartial
                                          ? 'bg-[#0D2B24]/50 border-[#01BC8D]/40'
                                          : isFullExit
                                          ? 'bg-[#2B1216]/40 border-[#F6465D]/40'
                                          : 'bg-[#12171D] border-[#232E3A]'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-white">
                                          {adj.actionLabelAr}
                                        </span>
                                        <span
                                          className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                                            isScaleIn
                                              ? 'bg-[#01BC8D] text-[#0B0E11]'
                                              : isPartial
                                              ? 'bg-[#01BC8D] text-[#0B0E11]'
                                              : isFullExit
                                              ? 'bg-[#F6465D] text-[#0B0E11]'
                                              : 'bg-[#232E3A] text-white'
                                          }`}
                                        >
                                          {isScaleIn
                                            ? `+${adj.volumePercent}%`
                                            : isPartial || isFullExit
                                            ? `-${adj.volumePercent}%`
                                            : `${adj.volumePercent}%`}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[#8A99AD] font-mono">
                                        <span>السعر: {adj.price}</span>
                                        <span>المتبقي: {adj.remainingPercentAfter}%</span>
                                      </div>
                                      <div className="text-[#8A99AD] font-mono text-[9px] pt-0.5 border-t border-[#232E3A]/50 flex items-center justify-between">
                                        <span>الوقت:</span>
                                        <span className="text-white">{formatTime(adj.timestamp)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Smart Money Whales List & Sorting View */
        <>
          {/* Sorting & Filtering Controls */}
          <div className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Sort Selector */}
              <div>
                <label className="block text-[11px] text-[#8A99AD] mb-1">
                  ترتيب الحيتان حسب الطلب (Smart Money Ranking):
                </label>
                <select
                  value={rankingType}
                  onChange={(e) => setRankingType(e.target.value as SmartMoneySortType)}
                  className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none"
                >
                  {SMART_SORT_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Range */}
              <div>
                <label className="block text-[11px] text-[#8A99AD] mb-1">الفترة الزمنية:</label>
                <div className="grid grid-cols-5 gap-1">
                  {SMART_TIME_RANGES.map((tr) => (
                    <button
                      key={tr.key}
                      type="button"
                      onClick={() => setTimeRange(tr.key)}
                      className={`py-2 rounded-xl text-[11px] font-bold transition-colors cursor-pointer ${
                        timeRange === tr.key
                          ? 'bg-[#01BC8D] text-[#0B0E11]'
                          : 'bg-[#0B0E11] text-[#8A99AD] border border-[#232E3A] hover:text-white'
                      }`}
                    >
                      {tr.labelAr}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search by Whale Name */}
              <div>
                <label className="block text-[11px] text-[#8A99AD] mb-1">
                  بحث عن متداول في Smart Money:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="اسم الحوت أو المحفظة (مثال: 0x7ffa)..."
                    className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl pr-8 pl-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <Search className="w-3.5 h-3.5 text-[#8A99AD] absolute right-2.5 top-2.5" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <label className="flex items-center gap-2 text-[#8A99AD] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlySharingPos}
                  onChange={(e) => setOnlySharingPos(e.target.checked)}
                  className="accent-[#01BC8D]"
                />
                <span>إظهار الحيتان الذين يشاركون مراكزهم المفتوحة فقط (Sharing Positions)</span>
              </label>

              <span className="text-[11px] text-[#8A99AD]">
                إجمالي الحيتان المسجلين:{' '}
                <strong className="text-[#01BC8D] font-mono">
                  {totalWhales.toLocaleString('en-US')}
                </strong>
              </span>
            </div>
          </div>

          {/* Smart Money Whales Grid */}
          {isLoadingWhales ? (
            <div className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-10 text-center text-sm text-[#8A99AD] flex flex-col items-center gap-3">
              <RefreshCw className="w-7 h-7 animate-spin text-[#01BC8D]" />
              <span>جاري جلب قائمة الحيتان (Smart Money) من باينانس...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {whales.map((whale, index) => {
                const isCopied = copiedWhales.some((c) => c.traderId === whale.topTraderId);
                const inPos = whale.positionStatus === 'IN_POSITION';

                return (
                  <div
                    key={whale.topTraderId}
                    className={`bg-[#12171D] border rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-all hover:border-[#01BC8D]/60 ${
                      isCopied ? 'border-[#01BC8D]' : 'border-[#232E3A]'
                    }`}
                  >
                    {/* Top Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        onClick={() => handleSelectWhale(whale)}
                        className="flex items-center gap-3 cursor-pointer group"
                      >
                        <div className="relative">
                          {whale.avatarUrl ? (
                            <img
                              src={whale.avatarUrl}
                              alt={whale.traderName}
                              className="w-11 h-11 rounded-full object-cover border border-[#01BC8D]/50"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-[#1A222B] text-[#01BC8D] flex items-center justify-center font-bold text-sm border border-[#01BC8D]/40">
                              {whale.traderName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span className="absolute -top-1 -right-1 bg-[#01BC8D] text-[#0B0E11] font-mono font-bold text-[9px] px-1.5 rounded-full">
                            #{index + 1}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-[#01BC8D] transition-colors">
                            {whale.traderName}
                          </h3>
                          <div className="flex items-center gap-2 text-[11px] text-[#8A99AD] mt-0.5">
                            <span className="flex items-center gap-1" title="عدد المتابعين / الناسخين">
                              <Users className="w-3 h-3 text-[#01BC8D]" />
                              <span className="font-mono">
                                {whale.subscribers.toLocaleString('en-US')} متابع
                              </span>
                            </span>
                            <span>•</span>
                            <span className="font-mono text-[#EAECEF]" title="عدد أيام فتح حسابه للنسخ">
                              {whale.daysActive || 180} يوم
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Left Side: Filter Days in Green + Status */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className="text-[#01BC8D] bg-[#0D2B24] border border-[#01BC8D]/40 px-2.5 py-0.5 rounded-lg font-mono font-bold text-[11px]"
                          title="الأيام الخاصة بالفلتر"
                        >
                          {SMART_TIME_RANGES.find((t) => t.key === timeRange)?.labelAr || timeRange}
                        </span>
                        {isCopied ? (
                          <span className="bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/50 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 shadow-[0_0_10px_rgba(1,188,141,0.25)]">
                            <span className="w-2 h-2 rounded-full bg-[#01BC8D] animate-pulse" />
                            <span>يتم النسخ الآن</span>
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              inPos
                                ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/30'
                                : 'bg-[#1A222B] text-[#8A99AD] border border-[#232E3A]'
                            }`}
                          >
                            {inPos ? 'مراكز نشطة' : 'مراقبة السيولة'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metrics + KuCoin Sparkline */}
                    <div className="bg-[#1A222B] rounded-xl p-3 border border-[#232E3A]/70 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] text-[#8A99AD] block">
                            نسبة العائد (ROI)
                          </span>
                          <span
                            className={`text-lg sm:text-xl font-extrabold font-mono tabular-nums ${
                              whale.roi >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                            }`}
                          >
                            {whale.roi >= 0 ? '+' : ''}
                            {whale.roi.toFixed(2)}%
                          </span>
                        </div>

                        <SparklineSvg
                          points={whale.chartItems?.map((c) => c[1])}
                          seedKey={whale.topTraderId}
                          isPositive={whale.roi >= 0}
                          className="w-28 h-11"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#232E3A]/80">
                        <div>
                          <span className="text-[10px] text-[#8A99AD] block">صافي الربح (PNL)</span>
                          <span
                            className={`text-xs sm:text-sm font-bold font-mono tabular-nums ${
                              whale.pnl >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                            }`}
                          >
                            {whale.pnl >= 1000000
                              ? `+$${(whale.pnl / 1000000).toFixed(2)}M`
                              : `${formatMoney(whale.pnl)}$`}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-[#8A99AD] block">الأصول (Assets)</span>
                          <span className="text-xs sm:text-sm font-bold font-mono text-[#01BC8D] tabular-nums">
                            {whale.assets >= 1000000
                              ? `$${(whale.assets / 1000000).toFixed(2)}M`
                              : `$${(whale.assets / 1000).toFixed(1)}K`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSelectWhale(whale)}
                        className="bg-[#1A222B] hover:bg-[#212C37] text-white border border-[#232E3A] font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#01BC8D]" />
                        <span>Positions & التفاصيل</span>
                      </button>

                      {isCopied ? (
                        <button
                          onClick={() => handleStopCopyWhale(whale.topTraderId)}
                          className="bg-[#0D2B24] hover:bg-[#2B1216] text-[#01BC8D] hover:text-[#F6465D] border border-[#01BC8D]/50 hover:border-[#F6465D]/50 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>إيقاف النسخ</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCopyWhale(whale)}
                          className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-[0_0_12px_rgba(1,188,141,0.2)]"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ الحوت</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Live Open Interest Market Whale Insights Section */}
          {connectionState.whaleInsights.length > 0 && (
            <div className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 space-y-3 mt-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#01BC8D]" />
                <h3 className="font-bold text-xs sm:text-sm text-white">
                  مؤشر العقود المفتوحة الكلية للحيتان (Binance Futures Open Interest)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {connectionState.whaleInsights.map((insight) => (
                  <div
                    key={insight.symbol}
                    className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white font-mono">
                        {insight.symbol}
                      </span>
                      <span className="text-xs font-mono text-[#01BC8D] font-bold">
                        {insight.openInterestUsdt}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#8A99AD] mt-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-[#388AF6] shrink-0" />
                      <span>{insight.signalAr}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
