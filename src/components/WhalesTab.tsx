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
import { TraderAvatar } from './TraderAvatar';
import { AccountCopyPickerModal } from './AccountCopyPickerModal';
import {
  formatDateTimeWestern,
  formatSignedCurrency,
  formatSignedPercent,
} from '../utils/formatters';
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
  PaperVirtualAccountSummary,
  ManualSingleCopyResult,
} from '../types';
import {
  fetchSmartMoneyTradersList,
  fetchSmartMoneyWhaleDetail,
} from '../services/copyAndSmartMoneyApi';
import { calculateTraderQualityScore } from '../services/proRiskAndAnalytics';

interface WhalesTabProps {
  connectionState: BinanceConnectionState;
  kucoinConfig?: KuCoinConfig;
  kucoinConnectionState?: KuCoinConnectionState;
  tradeSettings?: TradeExecutionSettings;
  openPositionsCount?: number;
  accounts?: PaperVirtualAccountSummary[];
  activeAccountId?: string;
  onCreateAccount?: (name: string, initialBalance?: number) => string;
  onRefresh: () => void;
  onOpenKucoin?: () => void;
  onSyncTraderToEngine: (params: {
    traderId: string;
    traderName: string;
    source: 'COPY_TRADING' | 'SMART_MONEY';
    positions: TraderOpenPosition[];
    latestRecords: TraderLatestRecord[];
    positionHistory?: TraderPositionHistoryItem[];
    marginPerTradeUsdt: number;
    accountId?: string;
    forceImmediateExecution?: boolean;
    copiedStartedAt?: number;
  }) => CopiedSyncLog[];
  onCopySinglePosition: (
    pos: TraderOpenPosition,
    traderName: string,
    marginUsdt: number,
    accountId?: string
  ) => ManualSingleCopyResult | undefined;
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
  accounts = [],
  activeAccountId = 'acc_default',
  onCreateAccount,
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

  // Pending Copy Action Modal State (اختيار الحساب الافتراضي عند الضغط على زر النسخ)
  const [pendingCopyTarget, setPendingCopyTarget] = useState<
    | { type: 'WHALE'; whale: SmartMoneyTraderItem }
    | {
        type: 'SINGLE_POSITION';
        pos: TraderOpenPosition;
        traderName: string;
        customBanner?: string;
      }
    | null
  >(null);

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

  // Intercept Back button / swipe gesture when a copy modal or whale detail view is open
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingCopyTarget || selectedWhaleId) {
      window.__copyTrSubViewBackHandler = () => {
        if (pendingCopyTarget) {
          setPendingCopyTarget(null);
          return true;
        }
        if (selectedWhaleId) {
          setSelectedWhaleId(null);
          setWhaleProfile(null);
          return true;
        }
        return false;
      };
    } else {
      window.__copyTrSubViewBackHandler = null;
    }
    return () => {
      if (window.__copyTrSubViewBackHandler) {
        window.__copyTrSubViewBackHandler = null;
      }
    };
  }, [pendingCopyTarget, selectedWhaleId]);

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
        connectionState.tickers,
        { forceRefresh: true }
      );
      setWhaleProfile(fullData.profile);
      setWhalePositions(fullData.positions);
      setWhalePositionHistory(fullData.positionHistory);
      setWhaleRecords(fullData.latestRecords);
      setIsLoadingDetail(false);
    },
    [connectionState.tickers]
  );

  // Visibility-aware detail refresh (4s interval) without duplicating App.tsx background sync
  useEffect(() => {
    if (!selectedWhaleId || !selectedSummary) return;
    let isCancelled = false;

    const timer = window.setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const fullData = await fetchSmartMoneyWhaleDetail(
          selectedWhaleId,
          selectedSummary,
          connectionState.tickers,
          { forceRefresh: true }
        );
        if (isCancelled) return;
        setWhaleProfile(fullData.profile);
        setWhalePositions(fullData.positions);
        setWhalePositionHistory(fullData.positionHistory);
        setWhaleRecords(fullData.latestRecords);
      } catch {
        // ignore transient refresh failure
      }
    }, 4000);

    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [
    selectedWhaleId,
    selectedSummary,
    connectionState.tickers,
  ]);

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

  // Execute Copy Whale into a chosen Virtual Account
  const executeCopyWhaleToAccount = useCallback(
    async (whale: SmartMoneyTraderItem, targetAccountId: string) => {
      const targetAcc = accounts.find((a) => a.id === targetAccountId);
      const targetAccName = targetAcc?.name || 'الحساب الافتراضي';
      const accMarginPerTrade = targetAcc?.settings.tradeValueUsdt || marginPerTrade;
      const nowMs = Date.now();

      setFeedbackBanner(
        `جاري جلب وتطبيق صفقات الحوت ${whale.traderName} في نفس اللحظة على «${targetAccName}»...`
      );

      const fullData = await fetchSmartMoneyWhaleDetail(
        whale.topTraderId,
        whale,
        connectionState.tickers,
        { forceRefresh: true }
      );

      if (selectedWhaleId === whale.topTraderId) {
        setWhaleProfile(fullData.profile);
        setWhalePositions(fullData.positions);
        setWhalePositionHistory(fullData.positionHistory);
        setWhaleRecords(fullData.latestRecords);
      }

      const existsInAccount = copiedWhales.find(
        (c) =>
          c.traderId === whale.topTraderId &&
          (c.accountId || 'acc_default') === targetAccountId
      );
      let updatedList: ActiveCopiedTrader[];
      if (existsInAccount) {
        updatedList = copiedWhales.map((c) =>
          c.traderId === whale.topTraderId &&
          (c.accountId || 'acc_default') === targetAccountId
            ? {
                ...c,
                accountId: targetAccountId,
                accountName: targetAccName,
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
            copyBudgetUsdt: accMarginPerTrade,
            leverageOverride: null,
            startedAt: nowMs,
            syncedPositionsCount: fullData.positions.length,
            syncedRecordsCount: fullData.positionHistory.length,
            autoFollowRecords: true,
            accountId: targetAccountId,
            accountName: targetAccName,
          },
          ...copiedWhales,
        ];
      }
      saveCopiedWhales(updatedList);

      const logs = onSyncTraderToEngine({
        traderId: whale.topTraderId,
        traderName: whale.traderName,
        source: 'SMART_MONEY',
        positions: fullData.positions,
        latestRecords: fullData.latestRecords,
        positionHistory: fullData.positionHistory,
        marginPerTradeUsdt: accMarginPerTrade,
        accountId: targetAccountId,
        forceImmediateExecution: true,
        copiedStartedAt: existsInAccount?.startedAt || nowMs,
      });

      setSyncLogs((prev) => [...logs, ...prev].slice(0, 30));

      setFeedbackBanner(
        `تم تفعيل نسخ الحوت "${whale.traderName}" في حساب «${targetAccName}» فوراً! تم تطبيق (${fullData.positions.length}) صفقات مفتوحة في نفس اللحظة بالسعر الحالي للسوق.`
      );
    },
    [
      accounts,
      connectionState.tickers,
      selectedWhaleId,
      onSyncTraderToEngine,
      marginPerTrade,
      copiedWhales,
    ]
  );

  // Open Account Picker Modal when user clicks "نسخ الحوت"
  const handleCopyWhale = useCallback((whale: SmartMoneyTraderItem) => {
    setPendingCopyTarget({ type: 'WHALE', whale });
  }, []);

  const handleStopCopyWhale = (traderId: string, accountId?: string) => {
    const updated = copiedWhales.filter((c) => {
      if (c.traderId !== traderId) return true;
      if (accountId && (c.accountId || 'acc_default') !== accountId) return true;
      return false;
    });
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

  const formatTime = (ms: number) => formatDateTimeWestern(ms);

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
        <div className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-5">
          {/* Header & Back Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2733] pb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setSelectedWhaleId(null)}
                className="bg-[#1A222B] hover:bg-[#232E3A] text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 border border-[#1E2733] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 rotate-180" />
                <span>عودة للقائمة</span>
              </button>

              <button
                onClick={onOpenSimulationTab}
                className="bg-[#161D26] hover:bg-[#1E2733] text-[#01BC8D] border border-[#1E2733] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                title="العودة مباشرة لنافذة التداول والصفقات"
              >
                <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
                <span>نافذة التداول</span>
              </button>

              <div className="flex items-center gap-3">
                <TraderAvatar
                  src={whaleProfile.avatarUrl}
                  name={whaleProfile.traderName}
                  size="lg"
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-white">
                      {whaleProfile.traderName}
                    </h3>
                    <span dir="ltr" className="text-[10px] font-mono bg-[#161D26] text-[#01BC8D] px-2 py-0.5 rounded border border-[#1E2733]">
                      ID #{whaleProfile.topTraderId}
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
                className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  نسخ الحوت (<span dir="ltr" className="inline-block tabular-nums">${marginPerTrade} × {tradeSettings?.leverage || 5}x</span>)
                </span>
              </button>
            </div>
          </div>

          {isLoadingDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className="bg-[#161D26] border border-[#1E2733] rounded-xl p-3 space-y-2 animate-pulse">
                    <div className="h-3 w-20 bg-[#1E2733] rounded" />
                    <div className="h-5 w-28 bg-[#232E3A] rounded" />
                  </div>
                ))}
              </div>
              <div className="space-y-2.5">
                {[0, 1].map((idx) => (
                  <div key={idx} className="h-24 bg-[#161D26] border border-[#1E2733] rounded-xl animate-pulse" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Whale Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-[#161D26] border border-[#1E2733] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">إجمالي ربح الحوت (PNL)</span>
                  <span
                    dir="ltr"
                    className={`inline-block text-base sm:text-lg font-bold font-mono tabular-nums mt-0.5 ${
                      whaleProfile.pnl >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                    }`}
                  >
                    {formatMoney(whaleProfile.pnl)} USDT
                  </span>
                </div>

                <div className="bg-[#161D26] border border-[#1E2733] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">نسبة العائد (ROI)</span>
                  <span
                    dir="ltr"
                    className={`inline-block text-base sm:text-lg font-bold font-mono tabular-nums mt-0.5 ${
                      whaleProfile.roi >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                    }`}
                  >
                    {formatSignedPercent(whaleProfile.roi)}
                  </span>
                </div>

                <div className="bg-[#161D26] border border-[#1E2733] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">
                    رصيد العقود الآجلة
                  </span>
                  <span dir="ltr" className="inline-block text-base sm:text-lg font-bold font-mono tabular-nums text-[#01BC8D] mt-0.5">
                    {whaleProfile.umMarginBalance.toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    USDT
                  </span>
                </div>

                <div className="bg-[#161D26] border border-[#1E2733] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">المشتركون / النشاط</span>
                  <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-white mt-0.5 block">
                    <span dir="ltr" className="inline-block">{whaleProfile.subscribers.toLocaleString('en-US')}</span> متابع
                  </span>
                  <span className="text-[10px] text-[#8A99AD] block">
                    نشط منذ <span dir="ltr" className="font-mono">{whaleProfile.daysActive}</span> يوماً • النجاح: <span dir="ltr" className="font-mono">{whaleProfile.winRate.toFixed(1)}%</span>
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
                    <span
                      className={`text-[11px] font-medium ${
                        whaleProfile.sharingPosition ? 'text-[#01BC8D]' : 'text-[#F59E0B]'
                      }`}
                    >
                      {whaleProfile.sharingPosition
                        ? 'مشاركة المراكز: مفعّلة'
                        : 'مشاركة المراكز: خاصة (غير معلنة)'}
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
                                  <strong dir="ltr" className="text-white font-mono inline-block whitespace-nowrap">
                                    {formatTime(pos.entryTime)}
                                  </strong>
                                </span>
                                <span className="bg-[#0B0E11] border border-[#232E3A] px-2.5 py-1 rounded-lg text-[#8A99AD]">
                                  آخر حركة (تدعيم/انسحاب):{' '}
                                  <strong dir="ltr" className="text-[#01BC8D] font-mono inline-block whitespace-nowrap">
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
                                  setPendingCopyTarget({
                                    type: 'SINGLE_POSITION',
                                    pos,
                                    traderName: whaleProfile.traderName,
                                    customBanner: `تم نسخ مركز الحوت ${pos.symbol} (${pos.side} ${pos.leverage}x) من نافذة Positions`,
                                  });
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
                                        <span dir="ltr" className="font-mono text-white inline-block whitespace-nowrap">
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
                                  <strong dir="ltr" className="text-[#01BC8D] font-mono inline-block whitespace-nowrap">
                                    {formatTime(item.opened)}
                                  </strong>
                                </span>
                                <span className="bg-[#0B0E11] border border-[#232E3A] px-2.5 py-1 rounded-lg text-[#8A99AD]">
                                  وقت الخروج:{' '}
                                  <strong dir="ltr" className="text-[#01BC8D] font-mono inline-block whitespace-nowrap">
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
                                  setPendingCopyTarget({
                                    type: 'SINGLE_POSITION',
                                    pos: {
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
                                    traderName: whaleProfile.traderName,
                                    customBanner: `تم نسخ إعدادات المركز (${item.symbol} ${item.side}) من نافذة Position للحوت ${whaleProfile.traderName}`,
                                  });
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
                                        <span dir="ltr" className="text-white inline-block whitespace-nowrap">{formatTime(adj.timestamp)}</span>
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
          <div className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Sort Selector */}
              <div>
                <label className="block text-[11px] text-[#8A99AD] mb-1">
                  ترتيب الحيتان:
                </label>
                <select
                  value={rankingType}
                  onChange={(e) => setRankingType(e.target.value as SmartMoneySortType)}
                  className="w-full bg-[#0B0E11] border border-[#1E2733] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none"
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
                          : 'bg-[#0B0E11] text-[#8A99AD] border border-[#1E2733] hover:text-white'
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
                  بحث عن حوت أو محفظة:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="اسم الحوت أو المحفظة..."
                    className="w-full bg-[#0B0E11] border border-[#1E2733] focus:border-[#01BC8D] rounded-xl pr-8 pl-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <Search className="w-3.5 h-3.5 text-[#8A99AD] absolute right-2.5 top-2.5" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs flex-wrap gap-2">
              <label className="flex items-center gap-2 text-[#8A99AD] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlySharingPos}
                  onChange={(e) => setOnlySharingPos(e.target.checked)}
                  className="accent-[#01BC8D]"
                />
                <span>إظهار الحيتان الذين يشاركون مراكزهم المفتوحة فقط</span>
              </label>

              <span className="text-[11px] text-[#8A99AD]">
                إجمالي الحيتان:{' '}
                <strong dir="ltr" className="text-[#01BC8D] font-mono tabular-nums inline-block">
                  {totalWhales.toLocaleString('en-US')}
                </strong>
              </span>
            </div>
          </div>

          {/* Smart Money Whales Grid */}
          {isLoadingWhales ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 space-y-3.5 animate-pulse"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-[#1E2733]" />
                      <div className="space-y-1.5">
                        <div className="h-4 w-28 bg-[#1E2733] rounded" />
                        <div className="h-3 w-20 bg-[#161D26] rounded" />
                      </div>
                    </div>
                    <div className="h-6 w-16 bg-[#161D26] rounded-lg" />
                  </div>
                  <div className="h-28 bg-[#161D26] border border-[#1E2733] rounded-xl" />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-9 bg-[#161D26] rounded-xl" />
                    <div className="h-9 bg-[#1E2733] rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {whales.map((whale, index) => {
                const whaleCopiedEntries = copiedWhales.filter(
                  (c) => c.traderId === whale.topTraderId
                );
                const isCopied = whaleCopiedEntries.length > 0;
                const inPos = whale.positionStatus === 'IN_POSITION';
                const roiPct = whale.roi * 100;
                const mddPct =
                  whale.mdd !== null && whale.mdd !== undefined
                    ? Math.abs(whale.mdd) <= 1
                      ? Math.abs(whale.mdd) * 100
                      : Math.abs(whale.mdd)
                    : 18;
                const estimatedWinRate =
                  whale.pnl > 0
                    ? Math.min(82, 56 + Math.min(26, Math.max(0, roiPct * 0.25)))
                    : 42;
                const quality = calculateTraderQualityScore({
                  roi: roiPct,
                  winRate: estimatedWinRate,
                  mdd: mddPct,
                  sharpRatio: whale.roi > 0 ? 1.8 : 0.4,
                  leadingDays: whale.daysActive,
                  pnl: whale.pnl,
                });
                const scoreBadgeCls =
                  quality.tier === 'ELITE'
                    ? 'bg-[#0D2B24] text-[#01BC8D] border-[#01BC8D]/50'
                    : quality.tier === 'STRONG'
                    ? 'bg-[#10253A] text-[#38BDF8] border-[#38BDF8]/40'
                    : quality.tier === 'MODERATE'
                    ? 'bg-[#2B2210] text-[#F59E0B] border-[#F59E0B]/40'
                    : 'bg-[#2B1216] text-[#F6465D] border-[#F6465D]/40';

                return (
                  <div
                    key={whale.topTraderId}
                    className={`bg-[#12171D] border rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-all hover:border-[#2E3B4E] ${
                      isCopied ? 'border-[#01BC8D]/60' : 'border-[#1E2733]'
                    }`}
                  >
                    {/* Top Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        onClick={() => handleSelectWhale(whale)}
                        className="flex items-center gap-3 cursor-pointer group min-w-0"
                      >
                        <div className="relative shrink-0">
                          <TraderAvatar
                            src={whale.avatarUrl}
                            name={whale.traderName}
                            size="md"
                          />
                          <span dir="ltr" className="absolute -top-1 -right-1 bg-[#01BC8D] text-[#0B0E11] font-mono font-bold text-[9px] px-1 rounded">
                            #{index + 1}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-[#01BC8D] transition-colors truncate">
                            {whale.traderName}
                          </h3>
                          <div className="flex items-center gap-2 text-[11px] text-[#8A99AD] mt-0.5">
                            <span className="flex items-center gap-1" title="عدد المتابعين / الناسخين">
                              <Users className="w-3 h-3 text-[#01BC8D]" />
                              <span dir="ltr" className="font-mono tabular-nums">
                                {whale.subscribers.toLocaleString('en-US')}
                              </span>
                            </span>
                            <span>•</span>
                            <span className="font-mono tabular-nums text-[#EAECEF]" title="عدد أيام فتح حسابه للنسخ">
                              {whale.daysActive || 180} يوم
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Left Side: Quality Score + Filter Days + Status */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            dir="ltr"
                            data-testid={`whale_quality_score_${whale.topTraderId}`}
                            title={`تقييم جودة الحوت: ${quality.gradeAr} (${quality.score}/100)`}
                            className={`px-2 py-0.5 rounded-lg border font-mono font-extrabold text-[10px] tabular-nums ${scoreBadgeCls}`}
                          >
                            Score {quality.score}/100
                          </span>
                          <span
                            className="text-[#01BC8D] bg-[#0D2B24]/80 border border-[#01BC8D]/30 px-2.5 py-0.5 rounded-lg font-mono font-bold text-[11px]"
                            title="الفترة الزمنية"
                          >
                            {SMART_TIME_RANGES.find((t) => t.key === timeRange)?.labelAr || timeRange}
                          </span>
                        </div>
                        {isCopied ? (
                          <span className="bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#01BC8D]" />
                            <span>
                              منسوخ ({whaleCopiedEntries.length > 1 ? `${whaleCopiedEntries.length} حسابات` : whaleCopiedEntries[0]?.accountName || 'نشط'})
                            </span>
                          </span>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              inPos
                                ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/30'
                                : 'bg-[#161D26] text-[#8A99AD] border border-[#1E2733]'
                            }`}
                          >
                            {inPos ? 'مراكز نشطة' : 'مراقبة السيولة'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metrics + Sparkline */}
                    <div className="bg-[#161D26] rounded-xl p-3 border border-[#1E2733] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] text-[#8A99AD] block">
                            نسبة العائد (ROI)
                          </span>
                          <span
                            dir="ltr"
                            className={`inline-block text-lg sm:text-xl font-extrabold font-mono tabular-nums ${
                              whale.roi >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                            }`}
                          >
                            {formatSignedPercent(whale.roi)}
                          </span>
                        </div>

                        <SparklineSvg
                          points={whale.chartItems?.map((c) => c[1])}
                          seedKey={whale.topTraderId}
                          isPositive={whale.roi >= 0}
                          className="w-28 h-11"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1E2733]">
                        <div>
                          <span className="text-[10px] text-[#8A99AD] block">صافي الربح (PNL)</span>
                          <span
                            dir="ltr"
                            className={`inline-block text-xs sm:text-sm font-bold font-mono tabular-nums ${
                              whale.pnl >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                            }`}
                          >
                            {Math.abs(whale.pnl) >= 1000000
                              ? `${whale.pnl >= 0 ? '+' : '-'}$${(Math.abs(whale.pnl) / 1000000).toFixed(2)}M`
                              : formatSignedCurrency(whale.pnl)}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-[#8A99AD] block">الأصول (Assets)</span>
                          <span dir="ltr" className="inline-block text-xs sm:text-sm font-bold font-mono text-[#01BC8D] tabular-nums">
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
                        className="bg-[#161D26] hover:bg-[#1E2733] text-white border border-[#1E2733] font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#01BC8D]" />
                        <span>المراكز والتفاصيل</span>
                      </button>

                      {isCopied ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleCopyWhale(whale)}
                            className="flex-1 bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2 px-2 rounded-xl text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            title="نسخ هذا الحوت إلى حساب افتراضي آخر"
                          >
                            <Copy className="w-3 h-3" />
                            <span>نسخ لحساب آخر</span>
                          </button>
                          <button
                            onClick={() => handleStopCopyWhale(whale.topTraderId)}
                            className="bg-[#2B1216] hover:bg-[#F6465D]/30 text-[#F6465D] border border-[#F6465D]/40 font-bold py-2 px-2.5 rounded-xl text-[11px] flex items-center justify-center cursor-pointer"
                            title="إيقاف النسخ"
                          >
                            <Square className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleCopyWhale(whale)}
                          className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
                  العقود المفتوحة للحيتان (OI)
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

      {/* Account Selection Modal when clicking any Copy button */}
      <AccountCopyPickerModal
        isOpen={pendingCopyTarget !== null}
        onClose={() => setPendingCopyTarget(null)}
        titleAr={
          pendingCopyTarget?.type === 'SINGLE_POSITION'
            ? `اختيار الحساب الافتراضي لنسخ مركز ${pendingCopyTarget.pos.symbol}`
            : 'اختيار الحساب الافتراضي لنسخ الحوت إليه'
        }
        targetName={
          pendingCopyTarget?.type === 'WHALE'
            ? pendingCopyTarget.whale.traderName
            : pendingCopyTarget?.type === 'SINGLE_POSITION'
            ? `${pendingCopyTarget.pos.symbol} (${pendingCopyTarget.traderName})`
            : ''
        }
        accounts={accounts}
        activeAccountId={activeAccountId}
        copiedAccountIdsForTarget={
          pendingCopyTarget?.type === 'WHALE'
            ? copiedWhales
                .filter((cw) => cw.traderId === pendingCopyTarget.whale.topTraderId)
                .map((cw) => cw.accountId || 'acc_default')
            : []
        }
        onCreateNewAccount={onCreateAccount}
        onConfirmCopyToAccount={(chosenAccountId) => {
          const target = pendingCopyTarget;
          setPendingCopyTarget(null);
          if (!target) return;

          const chosenAcc = accounts.find((a) => a.id === chosenAccountId);
          const chosenAccName = chosenAcc?.name || 'الحساب الافتراضي';
          const chosenTradeVal = chosenAcc?.settings.tradeValueUsdt || marginPerTrade;

          if (target.type === 'WHALE') {
            executeCopyWhaleToAccount(target.whale, chosenAccountId);
          } else if (target.type === 'SINGLE_POSITION') {
            const copyResult = onCopySinglePosition(
              target.pos,
              target.traderName,
              chosenTradeVal,
              chosenAccountId
            );
            setFeedbackBanner(
              copyResult?.messageAr ||
                `${target.customBanner || `تم نسخ مركز ${target.pos.symbol}`} إلى حساب «${chosenAccName}»!`
            );
          }
        }}
      />
    </div>
  );
};
