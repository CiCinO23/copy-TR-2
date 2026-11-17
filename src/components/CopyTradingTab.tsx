import React, { useState, useEffect, useCallback } from 'react';
import {
  Copy,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Eye,
  Play,
  Square,
  Layers,
  History,
  ListOrdered,
  ExternalLink,
  ShieldCheck,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
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
  CopyTraderItem,
  CopyTraderDetail,
  CopyTradingSortType,
  CopyTradingTimeRange,
  TraderOpenPosition,
  TraderLatestRecord,
  TraderPositionHistoryItem,
  ActiveCopiedTrader,
  CopiedSyncLog,
  KuCoinConfig,
  KuCoinConnectionState,
  TradeExecutionSettings,
  PaperVirtualAccountSummary,
  ManualSingleCopyResult,
} from '../types';
import {
  fetchCopyTradersList,
  fetchCopyTraderFullData,
} from '../services/copyAndSmartMoneyApi';

interface CopyTradingTabProps {
  connectionState: BinanceConnectionState;
  kucoinConfig?: KuCoinConfig;
  kucoinConnectionState?: KuCoinConnectionState;
  tradeSettings?: TradeExecutionSettings;
  openPositionsCount?: number;
  accounts?: PaperVirtualAccountSummary[];
  activeAccountId?: string;
  onCreateAccount?: (name: string, initialBalance?: number) => string;
  auto: boolean;
  onAutoChange: (val: boolean) => void;
  onOpenApi: () => void;
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
  targetTraderId?: string | null;
  onClearTargetTraderId?: () => void;
}

const SORT_OPTIONS: { key: CopyTradingSortType; labelAr: string }[] = [
  { key: 'ROI', labelAr: 'الأعلى عائداً (ROI %)' },
  { key: 'PNL', labelAr: 'الأعلى ربحاً (PNL $)' },
  { key: 'WIN_RATE', labelAr: 'نسبة النجاح (Win Rate)' },
  { key: 'COPY_COUNT', labelAr: 'الأكثر نسخاً (Copiers)' },
  { key: 'AUM', labelAr: 'الأصول المدارة (AUM)' },
  { key: 'MDD', labelAr: 'أقل تراجع (MDD)' },
];

const TIME_RANGES: { key: CopyTradingTimeRange; labelAr: string }[] = [
  { key: '7D', labelAr: '7 أيام' },
  { key: '30D', labelAr: '30 يوم' },
  { key: '90D', labelAr: '90 يوم' },
  { key: '365D', labelAr: '365 يوم' },
];

export const CopyTradingTab: React.FC<CopyTradingTabProps> = ({
  connectionState,
  tradeSettings,
  openPositionsCount = 0,
  accounts = [],
  activeAccountId = 'acc_default',
  onCreateAccount,
  auto,
  onAutoChange,
  onSyncTraderToEngine,
  onCopySinglePosition,
  onOpenSimulationTab,
  targetTraderId,
  onClearTargetTraderId,
}) => {
  // Sorting & Filtering state
  const [sortBy, setSortBy] = useState<CopyTradingSortType>('ROI');
  const [timeRange, setTimeRange] = useState<CopyTradingTimeRange>('30D');
  const [searchNickname, setSearchNickname] = useState<string>('');
  const [hideFull, setHideFull] = useState<boolean>(false);

  // Traders list state
  const [traders, setTraders] = useState<CopyTraderItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);
  const [isLiveBinance, setIsLiveBinance] = useState<boolean>(true);

  // Selected trader detail state
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<CopyTraderItem | null>(null);
  const [traderDetail, setTraderDetail] = useState<CopyTraderDetail | null>(null);
  const [openPositions, setOpenPositions] = useState<TraderOpenPosition[]>([]);
  const [latestRecords, setLatestRecords] = useState<TraderLatestRecord[]>([]);
  const [positionHistory, setPositionHistory] = useState<TraderPositionHistoryItem[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailSubTab, setDetailSubTab] = useState<'POSITIONS' | 'LATEST_RECORDS' | 'HISTORY'>(
    'POSITIONS'
  );
  const [recordsFilter, setRecordsFilter] = useState<
    'ALL' | 'ENTRY' | 'SCALE_IN' | 'PARTIAL_EXIT' | 'EXIT'
  >('ALL');

  // Pending Copy Action Modal State (اختيار الحساب الافتراضي عند الضغط على زر النسخ)
  const [pendingCopyTarget, setPendingCopyTarget] = useState<
    | { type: 'TRADER'; trader: CopyTraderItem }
    | {
        type: 'SINGLE_POSITION';
        pos: TraderOpenPosition;
        traderName: string;
        customBanner?: string;
      }
    | null
  >(null);

  // Copy configuration & active copied traders
  const marginPerTrade = tradeSettings?.tradeValueUsdt || 25;
  const [copiedTraders, setCopiedTraders] = useState<ActiveCopiedTrader[]>(() => {
    try {
      const saved = localStorage.getItem('whale_copied_traders_ct');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [syncLogs, setSyncLogs] = useState<CopiedSyncLog[]>([]);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Intercept Back button / swipe gesture when a copy modal or trader detail view is open
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingCopyTarget || selectedTraderId) {
      window.__copyTrSubViewBackHandler = () => {
        if (pendingCopyTarget) {
          setPendingCopyTarget(null);
          return true;
        }
        if (selectedTraderId) {
          setSelectedTraderId(null);
          setTraderDetail(null);
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
  }, [pendingCopyTarget, selectedTraderId]);

  const saveCopiedTraders = (list: ActiveCopiedTrader[]) => {
    setCopiedTraders(list);
    try {
      localStorage.setItem('whale_copied_traders_ct', JSON.stringify(list));
    } catch {
      // ignore storage errors
    }
  };

  // Load Traders List from Binance Copy Trading
  const loadTraders = useCallback(async () => {
    setIsLoadingList(true);
    const res = await fetchCopyTradersList({
      pageNumber: 1,
      pageSize: 20,
      timeRange,
      dataType: sortBy,
      hideFull,
      nickname: searchNickname.trim(),
      order: sortBy === 'MDD' ? 'ASC' : 'DESC',
    });
    setTraders(res.list);
    setTotalCount(res.total);
    setIsLiveBinance(res.isLiveBinance);
    setIsLoadingList(false);
  }, [timeRange, sortBy, hideFull, searchNickname]);

  useEffect(() => {
    loadTraders();
  }, [loadTraders]);

  // Load Selected Trader Detail + Positions + Latest records + History
  const handleSelectTrader = useCallback(
    async (trader: CopyTraderItem) => {
      setSelectedTraderId(trader.leadPortfolioId);
      setSelectedSummary(trader);
      setIsLoadingDetail(true);
      setFeedbackBanner(null);

      const fullData = await fetchCopyTraderFullData(
        trader.leadPortfolioId,
        trader,
        connectionState.tickers,
        { forceRefresh: true }
      );
      setTraderDetail(fullData.detail);
      setOpenPositions(fullData.positions);
      setLatestRecords(fullData.latestRecords);
      setPositionHistory(fullData.positionHistory);
      setIsLoadingDetail(false);
    },
    [connectionState.tickers]
  );

  // Auto-select trader if requested from SimulationTab or elsewhere
  useEffect(() => {
    if (targetTraderId) {
      const existing = traders.find((t) => t.leadPortfolioId === targetTraderId);
      handleSelectTrader(
        existing || {
          leadPortfolioId: targetTraderId,
          nickname: 'Lead Trader',
          avatarUrl: '',
          currentCopyCount: 0,
          maxCopyCount: 500,
          roi: 0,
          pnl: 0,
          aum: 0,
          mdd: 0,
          winRate: 0,
          copierPnl: 0,
          sharpRatio: null,
          chartItems: [],
        }
      );
      if (onClearTargetTraderId) {
        onClearTargetTraderId();
      }
    }
  }, [targetTraderId, traders, handleSelectTrader, onClearTargetTraderId]);

  // Execute Copy Trader into a chosen Virtual Account
  const executeCopyTraderToAccount = useCallback(
    async (trader: CopyTraderItem, targetAccountId: string) => {
      const targetAcc = accounts.find((a) => a.id === targetAccountId);
      const targetAccName = targetAcc?.name || 'الحساب الافتراضي';
      const accMarginPerTrade = targetAcc?.settings.tradeValueUsdt || marginPerTrade;
      const nowMs = Date.now();

      setFeedbackBanner(
        `جاري جلب Positions وسجل الدخول والخروج Latest records للمتداول ${trader.nickname} ونسخه فوراً إلى «${targetAccName}»...`
      );

      const fullData = await fetchCopyTraderFullData(
        trader.leadPortfolioId,
        trader,
        connectionState.tickers,
        { forceRefresh: true }
      );

      if (selectedTraderId === trader.leadPortfolioId) {
        setTraderDetail(fullData.detail);
        setOpenPositions(fullData.positions);
        setLatestRecords(fullData.latestRecords);
        setPositionHistory(fullData.positionHistory);
      }

      const existsInAccount = copiedTraders.find(
        (c) =>
          c.traderId === trader.leadPortfolioId &&
          (c.accountId || 'acc_default') === targetAccountId
      );
      let updatedList: ActiveCopiedTrader[];
      if (existsInAccount) {
        updatedList = copiedTraders.map((c) =>
          c.traderId === trader.leadPortfolioId &&
          (c.accountId || 'acc_default') === targetAccountId
            ? {
                ...c,
                accountId: targetAccountId,
                accountName: targetAccName,
                syncedPositionsCount: fullData.positions.length,
                syncedRecordsCount: fullData.latestRecords.length,
              }
            : c
        );
      } else {
        updatedList = [
          {
            traderId: trader.leadPortfolioId,
            nickname: trader.nickname,
            avatarUrl: trader.avatarUrl,
            source: 'COPY_TRADING',
            copyBudgetUsdt: accMarginPerTrade,
            leverageOverride: null,
            startedAt: nowMs,
            syncedPositionsCount: fullData.positions.length,
            syncedRecordsCount: fullData.latestRecords.length,
            autoFollowRecords: true,
            accountId: targetAccountId,
            accountName: targetAccName,
          },
          ...copiedTraders,
        ];
      }
      saveCopiedTraders(updatedList);

      const logs = onSyncTraderToEngine({
        traderId: trader.leadPortfolioId,
        traderName: trader.nickname,
        source: 'COPY_TRADING',
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
        `تم تفعيل نسخ المتداول "${trader.nickname}" في حساب «${targetAccName}» بنجاح! تم سحب (${fullData.positions.length}) مراكز من Positions و (${fullData.latestRecords.length}) حركات دخول/خروج.`
      );
    },
    [
      accounts,
      connectionState.tickers,
      selectedTraderId,
      onSyncTraderToEngine,
      marginPerTrade,
      copiedTraders,
    ]
  );

  // Open Account Picker Modal when user clicks "نسخ المتداول"
  const handleCopyTrader = useCallback((trader: CopyTraderItem) => {
    setPendingCopyTarget({ type: 'TRADER', trader });
  }, []);

  const handleStopCopyTrader = (traderId: string, accountId?: string) => {
    const updated = copiedTraders.filter((c) => {
      if (c.traderId !== traderId) return true;
      if (accountId && (c.accountId || 'acc_default') !== accountId) return true;
      return false;
    });
    saveCopiedTraders(updated);
    setFeedbackBanner('تم إيقاف النسخ التلقائي لهذا المتداول.');
  };

  const formatMoney = (val: number) => {
    const sign = val > 0 ? '+' : '';
    return `${sign}${val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatTime = (ms: number) => formatDateTimeWestern(ms);

  const filteredRecords = latestRecords.filter((rec) => {
    if (recordsFilter === 'ALL') return true;
    return rec.actionType === recordsFilter;
  });

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Quick Trade Bar (شريط حالة التداول السريع الموحد) */}
      <QuickTradeBar
        tradeSettings={tradeSettings}
        openPositionsCount={openPositionsCount}
        autoCopy={auto}
        onAutoCopyChange={onAutoChange}
        onEditClick={onOpenSimulationTab}
      />

      {/* Feedback notification */}
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

      {/* If a Trader is selected, show the focused Trader Details & Positions / Latest records View */}
      {selectedTraderId && traderDetail ? (
        <div className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-5">
          {/* Back button & Trader Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E2733] pb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setSelectedTraderId(null)}
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
                  src={traderDetail.avatarUrl}
                  name={traderDetail.nickname}
                  size="lg"
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-bold text-white">
                      {traderDetail.nickname}
                    </h3>
                    <span dir="ltr" className="text-[10px] font-mono bg-[#161D26] text-[#8A99AD] px-2 py-0.5 rounded border border-[#1E2733]">
                      ID: {traderDetail.leadPortfolioId.slice(0, 10)}...
                    </span>
                  </div>
                  <p className="text-xs text-[#8A99AD] mt-0.5 line-clamp-1">
                    {traderDetail.description}
                  </p>
                </div>
              </div>
            </div>

            {/* Copy Action Controls (Unified size from TradeSettings) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  selectedSummary && handleCopyTrader(selectedSummary)
                }
                className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  نسخ المتداول (<span dir="ltr" className="inline-block tabular-nums">${marginPerTrade} × {tradeSettings?.leverage || 5}x</span>)
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
              {/* Comprehensive Trader Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-[#161D26] border border-[#1E2733] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">العائد (ROI)</span>
                  <span
                    dir="ltr"
                    className={`inline-block text-base sm:text-lg font-bold font-mono tabular-nums mt-0.5 ${
                      traderDetail.roi >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                    }`}
                  >
                    {formatSignedPercent(traderDetail.roi)}
                  </span>
                </div>

                <div className="bg-[#161D26] border border-[#1E2733] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">صافي ربح المتداول (PNL)</span>
                  <span
                    dir="ltr"
                    className={`inline-block text-base sm:text-lg font-bold font-mono tabular-nums mt-0.5 ${
                      traderDetail.pnl >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                    }`}
                  >
                    {formatMoney(traderDetail.pnl)} USDT
                  </span>
                </div>

                <div className="bg-[#161D26] border border-[#1E2733] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">نسبة النجاح (Win Rate)</span>
                  <span dir="ltr" className="inline-block text-base sm:text-lg font-bold font-mono tabular-nums text-white mt-0.5">
                    {traderDetail.winRate.toFixed(2)}%
                  </span>
                  <span className="text-[10px] text-[#8A99AD] block">
                    رابحة: <span dir="ltr" className="font-mono tabular-nums">{traderDetail.winOrders} / {traderDetail.totalOrders}</span>
                  </span>
                </div>

                <div className="bg-[#161D26] border border-[#1E2733] rounded-xl p-3">
                  <span className="text-[11px] text-[#8A99AD] block">الأصول المدارة (AUM)</span>
                  <span dir="ltr" className="inline-block text-base sm:text-lg font-bold font-mono tabular-nums text-[#01BC8D] mt-0.5">
                    {traderDetail.aum.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT
                  </span>
                  <span className="text-[10px] text-[#8A99AD] block">
                    الناسخون: <span dir="ltr" className="font-mono tabular-nums">{traderDetail.currentCopyCount}/{traderDetail.maxCopyCount}</span>
                  </span>
                </div>

                <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2.5">
                  <span className="text-[10px] text-[#8A99AD] block">أرباح الناسخين (Copier PNL)</span>
                  <span
                    className={`text-xs font-bold font-mono ${
                      traderDetail.copierPnl >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                    }`}
                  >
                    {formatMoney(traderDetail.copierPnl)} USDT
                  </span>
                </div>

                <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2.5">
                  <span className="text-[10px] text-[#8A99AD] block">أقصى تراجع (MDD)</span>
                  <span className="text-xs font-bold font-mono text-[#F6465D]">
                    {traderDetail.mdd.toFixed(2)}%
                  </span>
                </div>

                <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2.5">
                  <span className="text-[10px] text-[#8A99AD] block">رصيد الهامش (Margin Balance)</span>
                  <span className="text-xs font-bold font-mono text-white">
                    {traderDetail.marginBalance.toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    USDT
                  </span>
                </div>

                <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2.5">
                  <span className="text-[10px] text-[#8A99AD] block">مشاركة الأرباح / Sharpe</span>
                  <span className="text-xs font-bold font-mono text-[#01BC8D]">
                    {traderDetail.profitSharingRate}% • SR:{' '}
                    {traderDetail.sharpRatio ? traderDetail.sharpRatio.toFixed(2) : '--'}
                  </span>
                </div>
              </div>

              {/* KuCoin-style Underline Sub-navigation Tabs: Positions | Latest records | Position History */}
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
                  <span>Positions ({openPositions.length})</span>
                </button>

                <button
                  onClick={() => setDetailSubTab('LATEST_RECORDS')}
                  className={`pb-3 px-2 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
                    detailSubTab === 'LATEST_RECORDS'
                      ? 'border-[#01BC8D] text-[#01BC8D]'
                      : 'border-transparent text-[#8A99AD] hover:text-white'
                  }`}
                >
                  <ListOrdered className="w-4 h-4" />
                  <span>Latest records ({latestRecords.length})</span>
                </button>

                <button
                  onClick={() => setDetailSubTab('HISTORY')}
                  className={`pb-3 px-2 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
                    detailSubTab === 'HISTORY'
                      ? 'border-[#01BC8D] text-[#01BC8D]'
                      : 'border-transparent text-[#8A99AD] hover:text-white'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Position History ({positionHistory.length})</span>
                </button>
              </div>

              {/* SUB-TAB 1: POSITIONS */}
              {detailSubTab === 'POSITIONS' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8A99AD]">
                      الصفقات المفتوحة حالياً في نافذة <strong className="text-white">Positions</strong> مع وقت الدخول وأوقات ونسب التدعيم والانسحاب الجزئي:
                    </span>
                    <span className="text-[11px] text-[#01BC8D] font-mono tabular-nums">
                      {traderDetail.positionShow ? 'مشاركة المراكز: مفعلة' : 'مشتقة من أحدث الإشارات'}
                    </span>
                  </div>

                  {openPositions.length === 0 ? (
                    <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-6 text-center text-xs text-[#8A99AD]">
                      لا توجد صفقات مفتوحة حالياً في نافذة Positions لهذا المتداول. يمكنك فحص نافذة{' '}
                      <button
                        onClick={() => setDetailSubTab('LATEST_RECORDS')}
                        className="text-[#01BC8D] underline font-bold cursor-pointer"
                      >
                        Latest records
                      </button>{' '}
                      لمتابعة أحدث حركات الدخول والتدعيم والخروج.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {openPositions.map((pos) => {
                        const isProfit = pos.unrealizedProfit >= 0;
                        return (
                          <div
                            key={pos.id}
                            className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3.5 space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="space-y-1">
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
                                  <span className="text-[10px] text-[#01BC8D] font-mono tabular-nums">
                                    الحجم الحالي: {pos.currentScalePercent || 100}% من الدخول الأولي
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] text-[#8A99AD] pt-1 font-mono tabular-nums">
                                  <div>
                                    الكمية الحالية:{' '}
                                    <span className="text-white font-semibold">
                                      {pos.positionAmount}
                                    </span>
                                  </div>
                                  <div>
                                    متوسط الدخول:{' '}
                                    <span className="text-white font-semibold">
                                      {pos.entryPrice.toFixed(pos.entryPrice > 50 ? 2 : 4)}
                                    </span>
                                  </div>
                                  <div>
                                    السعر العادل (Mark):{' '}
                                    <span className="text-[#01BC8D] font-semibold">
                                      {pos.markPrice.toFixed(pos.markPrice > 50 ? 2 : 4)}
                                    </span>
                                  </div>
                                  <div>
                                    القيمة الإجمالية:{' '}
                                    <span className="text-white">
                                      {pos.notionalValue.toFixed(2)} USDT
                                    </span>
                                  </div>
                                </div>

                                {/* Timestamps Row: Entry Time & Last Scaling Update */}
                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#8A99AD] pt-1">
                                  <span>
                                    وقت الدخول:{' '}
                                    <strong dir="ltr" className="text-white font-mono tabular-nums inline-block whitespace-nowrap">
                                      {formatTime(pos.entryTime)}
                                    </strong>
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    آخر تدعيم / انسحاب:{' '}
                                    <strong dir="ltr" className="text-[#01BC8D] font-mono tabular-nums inline-block whitespace-nowrap">
                                      {formatTime(pos.lastUpdateTime)}
                                    </strong>
                                  </span>
                                  {pos.initialPositionAmount && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>
                                        الحجم الابتدائي:{' '}
                                        <strong className="text-white font-mono tabular-nums">
                                          {pos.initialPositionAmount}
                                        </strong>
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-[#232E3A] pt-2 sm:pt-0">
                                <div className="text-left font-mono tabular-nums">
                                  <div
                                    className={`text-xs sm:text-sm font-bold ${
                                      isProfit ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                                    }`}
                                  >
                                    {isProfit ? '+' : ''}
                                    {pos.unrealizedProfit.toFixed(2)} USDT
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
                                      traderName: traderDetail.nickname,
                                      customBanner: `تم نسخ الصفقة ${pos.symbol} (${pos.side} ${pos.leverage}x) للمتداول ${traderDetail.nickname}`,
                                    });
                                  }}
                                  className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                                >
                                  نسخ هذه الصفقة
                                </button>
                              </div>
                            </div>

                            {/* Scale-In & Partial Withdrawal Timeline with % Volumes and Timestamps */}
                            {pos.scaleAdjustments && pos.scaleAdjustments.length > 0 && (
                              <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2.5 space-y-1.5">
                                <div className="flex items-center justify-between text-[10px] text-[#8A99AD]">
                                  <span className="font-bold text-[#01BC8D]">
                                    سجل أوقات وأحجام الدخول والتدعيم والانسحاب الجزئي (بالنسب المئوية %):
                                  </span>
                                  <span className="font-mono tabular-nums">
                                    صافي الحجم القائم: {pos.currentScalePercent || 100}%
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {pos.scaleAdjustments.map((adj) => {
                                    const isScaleIn = adj.actionType === 'SCALE_IN';
                                    const isPartialExit = adj.actionType === 'PARTIAL_EXIT';
                                    const accentClass = isScaleIn
                                      ? 'text-[#01BC8D]'
                                      : isPartialExit
                                      ? 'text-[#F6465D]'
                                      : 'text-[#01BC8D]';

                                    return (
                                      <div
                                        key={adj.id}
                                        className="bg-[#12171D] border border-[#232E3A] rounded-lg p-2 text-[11px] flex flex-col justify-between gap-1"
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className={`font-bold ${accentClass}`}>
                                            {adj.actionLabelAr}
                                          </span>
                                          <span
                                            className={`font-mono tabular-nums font-bold ${accentClass}`}
                                          >
                                            {adj.volumePercent > 0 ? `+${adj.volumePercent}%` : `${adj.volumePercent}%`}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-1.5 text-[10px] text-[#8A99AD] font-mono tabular-nums">
                                          <span className="flex items-center gap-1">
                                            <span>الوقت:</span>
                                            <span dir="ltr" className="text-white inline-block whitespace-nowrap">{formatTime(adj.timestamp)}</span>
                                          </span>
                                          <span>السعر: {adj.price}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] text-[#8A99AD] font-mono tabular-nums">
                                          <span>الكمية: {adj.executedQty}</span>
                                          <span>المتبقي بعدها: {adj.remainingPercentAfter}%</span>
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
                  )}
                </div>
              )}

              {/* SUB-TAB 2: LATEST RECORDS (Entry, Scale-In, Partial Exit, Full Exit) */}
              {detailSubTab === 'LATEST_RECORDS' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-[#8A99AD]">
                      سجل حركات الدخول، التدعيم (<strong className="text-[#01BC8D]">+%</strong>)، الانسحاب الجزئي (<strong className="text-[#01BC8D]">-%</strong>)، والخروج الكامل مع التوقيت من نافذة{' '}
                      <strong className="text-white">Latest records</strong>:
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => setRecordsFilter('ALL')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                          recordsFilter === 'ALL'
                            ? 'bg-[#01BC8D] text-[#0B0E11]'
                            : 'bg-[#0B0E11] text-[#8A99AD]'
                        }`}
                      >
                        الكل ({latestRecords.length})
                      </button>
                      <button
                        onClick={() => setRecordsFilter('ENTRY')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                          recordsFilter === 'ENTRY'
                            ? 'bg-[#01BC8D] text-[#0B0E11]'
                            : 'bg-[#0B0E11] text-[#01BC8D]'
                        }`}
                      >
                        دخول أولي (100%)
                      </button>
                      <button
                        onClick={() => setRecordsFilter('SCALE_IN')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                          recordsFilter === 'SCALE_IN'
                            ? 'bg-[#01BC8D] text-white'
                            : 'bg-[#0B0E11] text-[#01BC8D]'
                        }`}
                      >
                        تدعيم (+% Scale-In)
                      </button>
                      <button
                        onClick={() => setRecordsFilter('PARTIAL_EXIT')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                          recordsFilter === 'PARTIAL_EXIT'
                            ? 'bg-[#01BC8D] text-[#0B0E11]'
                            : 'bg-[#0B0E11] text-[#01BC8D]'
                        }`}
                      >
                        انسحاب جزئي (-%)
                      </button>
                      <button
                        onClick={() => setRecordsFilter('EXIT')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                          recordsFilter === 'EXIT'
                            ? 'bg-[#F6465D] text-[#0B0E11]'
                            : 'bg-[#0B0E11] text-[#F6465D]'
                        }`}
                      >
                        خروج كامل (-100%)
                      </button>
                    </div>
                  </div>

                  {filteredRecords.length === 0 ? (
                    <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-6 text-center text-xs text-[#8A99AD]">
                      لا توجد سجلات مطابقة للفلتر المحدد.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredRecords.map((rec) => {
                        const isEntry = rec.actionType === 'ENTRY';
                        const isScaleIn = rec.actionType === 'SCALE_IN';
                        const isPartialExit = rec.actionType === 'PARTIAL_EXIT';

                        const badgeStyle =
                          isEntry || isScaleIn
                            ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/30'
                            : isPartialExit
                            ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40'
                            : 'bg-[#2B1216] text-[#F6465D] border border-[#F6465D]/30';

                        const badgeText = isEntry
                          ? `دخول (100%)`
                          : isScaleIn
                          ? `تدعيم (+${rec.volumePercent}%)`
                          : isPartialExit
                          ? `انسحاب جزئي (${rec.volumePercent}%)`
                          : `خروج كامل (-100%)`;

                        return (
                          <div
                            key={rec.id}
                            className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-start sm:items-center gap-3">
                              <span
                                className={`px-2.5 py-1 rounded-lg font-bold font-mono tabular-nums text-[10px] shrink-0 flex items-center gap-1 ${badgeStyle}`}
                              >
                                {isEntry || isScaleIn ? (
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                ) : (
                                  <ArrowDownRight className="w-3.5 h-3.5" />
                                )}
                                <span>{badgeText}</span>
                              </span>

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <CoinIcon symbol={rec.symbol} size="sm" />
                                  <span className="font-bold text-white font-mono text-sm">
                                    {rec.symbol}
                                  </span>
                                  <span className="text-[#01BC8D] font-semibold">
                                    {rec.actionLabelAr}
                                  </span>
                                  <span className="text-[10px] font-mono bg-[#0B0E11] text-[#8A99AD] px-1.5 py-0.5 rounded">
                                    {rec.side} / {rec.positionSide}
                                  </span>
                                  <span className="text-[10px] font-mono tabular-nums text-[#01BC8D]">
                                    المتبقي بعد العملية: {rec.remainingPercentAfter}%
                                  </span>
                                </div>

                                <div className="text-[11px] text-[#8A99AD] mt-1 font-mono tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <span>
                                    السعر المنفذ:{' '}
                                    <strong className="text-white">
                                      {rec.avgPrice > 0 ? `${rec.avgPrice.toFixed(4)} USDT` : 'سعر السوق'}
                                    </strong>
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    الحجم المنفذ:{' '}
                                    <strong className="text-white">
                                      {rec.executedQty} {rec.baseAsset} (
                                      {rec.volumePercent > 0 ? `+${rec.volumePercent}%` : `${rec.volumePercent}%`})
                                    </strong>
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    وقت الدخول الأصلي:{' '}
                                    <strong dir="ltr" className="text-white inline-block whitespace-nowrap">
                                      {formatTime(rec.entryTime || rec.orderTime)}
                                    </strong>
                                  </span>
                                  {rec.exitTime && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>
                                        وقت الانسحاب/الخروج:{' '}
                                        <strong dir="ltr" className="text-[#01BC8D] inline-block whitespace-nowrap">
                                          {formatTime(rec.exitTime)}
                                        </strong>
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-[#232E3A] pt-2 sm:pt-0">
                              <div className="text-left font-mono tabular-nums">
                                {rec.totalPnl !== 0 ? (
                                  <span
                                    className={`font-bold ${
                                      rec.totalPnl > 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                                    }`}
                                  >
                                    الربح المحقق: {formatMoney(rec.totalPnl)} USDT
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-[#8A99AD]">
                                    {isScaleIn ? `تعزيز الحجم (+${rec.volumePercent}%)` : 'أمر دخول جديد (100%)'}
                                  </span>
                                )}
                              </div>

                              {(isEntry || isScaleIn || isPartialExit) && rec.avgPrice > 0 && (
                                <button
                                  onClick={() => {
                                    const side: 'LONG' | 'SHORT' =
                                      rec.positionSide === 'SHORT'
                                        ? 'SHORT'
                                        : rec.positionSide === 'LONG'
                                        ? 'LONG'
                                        : isPartialExit
                                        ? rec.side === 'BUY'
                                          ? 'SHORT'
                                          : 'LONG'
                                        : rec.side === 'SELL'
                                        ? 'SHORT'
                                        : 'LONG';
                                    setPendingCopyTarget({
                                      type: 'SINGLE_POSITION',
                                      pos: {
                                        id: rec.id,
                                        symbol: rec.symbol,
                                        collateral: 'USDT',
                                        positionAmount: rec.executedQty,
                                        side,
                                        entryPrice: rec.avgPrice,
                                        markPrice: rec.avgPrice,
                                        breakEvenPrice: rec.avgPrice,
                                        unrealizedProfit: 0,
                                        cumRealized: 0,
                                        notionalValue: rec.executedQty * rec.avgPrice,
                                        leverage: 5,
                                        isolated: false,
                                        roePercent: 0,
                                        entryTime: rec.entryTime || rec.orderTime,
                                        lastUpdateTime: rec.orderTime,
                                        currentScalePercent: rec.remainingPercentAfter || 100,
                                        scaleAdjustments: [
                                          {
                                            id: `${rec.id}_adj`,
                                            actionType: isScaleIn
                                              ? 'SCALE_IN'
                                              : isPartialExit
                                              ? 'PARTIAL_EXIT'
                                              : 'INITIAL_ENTRY',
                                            actionLabelAr: rec.actionLabelAr,
                                            timestamp: rec.orderTime,
                                            volumePercent: rec.volumePercent,
                                            remainingPercentAfter: rec.remainingPercentAfter,
                                            executedQty: rec.executedQty,
                                            price: rec.avgPrice,
                                          },
                                        ],
                                      },
                                      traderName: traderDetail.nickname,
                                      customBanner: `تم نسخ حركة ${
                                        isScaleIn
                                          ? `التدعيم (+${rec.volumePercent}%)`
                                          : isPartialExit
                                          ? `السحب الجزئي (${rec.volumePercent}%)`
                                          : 'الدخول'
                                      } (${rec.symbol} ${side}) من نافذة Latest records للمتداول ${traderDetail.nickname}`,
                                    });
                                  }}
                                  className="bg-[#01BC8D]/20 hover:bg-[#01BC8D]/30 text-[#01BC8D] border border-[#01BC8D]/40 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  {isScaleIn
                                    ? `نسخ التدعيم (+${rec.volumePercent}%)`
                                    : isPartialExit
                                    ? `نسخ السحب الجزئي (${rec.volumePercent}%)`
                                    : 'نسخ الدخول'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SUB-TAB 3: POSITION HISTORY */}
              {detailSubTab === 'HISTORY' && (
                <div className="space-y-3">
                  {positionHistory.length === 0 ? (
                    <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-6 text-center text-xs text-[#8A99AD]">
                      لا يوجد سجل صفقات مغلقة متاح حالياً لهذا المتداول.
                    </div>
                  ) : (
                    positionHistory.map((h) => {
                      const isWin = h.closingPnl >= 0;
                      const durationMin = Math.max(1, Math.round((h.closed - h.opened) / 60000));
                      const durationLabel =
                        durationMin >= 60
                          ? `${Math.floor(durationMin / 60)} ساعة و ${durationMin % 60} دقيقة`
                          : `${durationMin} دقيقة`;

                      return (
                        <div
                          key={h.id}
                          className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3.5 space-y-2.5 text-xs"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                                    h.side === 'LONG'
                                      ? 'bg-[#0D2B24] text-[#01BC8D]'
                                      : 'bg-[#2B1216] text-[#F6465D]'
                                  }`}
                                >
                                  {h.side}
                                </span>
                                <CoinIcon symbol={h.symbol} size="sm" />
                                <span className="font-bold text-white font-mono text-sm">
                                  {h.symbol}
                                </span>
                                <span className="text-[11px] text-[#8A99AD] font-mono tabular-nums">
                                  وقت الدخول: <strong dir="ltr" className="text-white inline-block whitespace-nowrap">{formatTime(h.opened)}</strong>
                                </span>
                                <span aria-hidden="true" className="text-[#8A99AD]">←</span>
                                <span className="text-[11px] text-[#8A99AD] font-mono tabular-nums">
                                  وقت الخروج: <strong dir="ltr" className="text-[#01BC8D] inline-block whitespace-nowrap">{formatTime(h.closed)}</strong>
                                </span>
                                <span className="text-[10px] text-[#8A99AD] font-mono">
                                  (المدة: {durationLabel})
                                </span>
                              </div>
                              <div className="text-[11px] text-[#8A99AD] mt-1 font-mono tabular-nums">
                                متوسط الدخول:{' '}
                                <span className="text-white">{h.avgCost.toFixed(4)}</span> • متوسط
                                الإغلاق:{' '}
                                <span className="text-white">{h.avgClosePrice.toFixed(4)}</span> •
                                إجمالي الحجم المغلق:{' '}
                                <span className="text-white">{h.closedVolume}</span>
                              </div>
                            </div>

                            <div className="text-left font-mono tabular-nums">
                              <span
                                className={`font-bold text-sm ${
                                  isWin ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                                }`}
                              >
                                {formatMoney(h.closingPnl)} USDT
                              </span>
                              <span className="block text-[10px] text-[#8A99AD]">
                                صافي الربح المحقق عند الخروج
                              </span>
                            </div>
                          </div>

                          {/* Full Lifecycle Scaling Adjustments (Entry -> Scale-In % -> Partial Exit % -> Full Exit -100%) */}
                          {h.scaleAdjustments && h.scaleAdjustments.length > 0 && (
                            <div className="bg-[#0B0E11] border border-[#232E3A] rounded-lg p-2.5 space-y-1.5">
                              <span className="text-[10px] text-[#01BC8D] font-bold block">
                                التسلسل الزمني للدخول والتدعيم والانسحاب الجزئي والخروج (بالنسب المئوية %):
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                {h.scaleAdjustments.map((step) => {
                                  const stepColor =
                                    step.actionType === 'SCALE_IN'
                                      ? 'text-[#01BC8D]'
                                      : step.actionType === 'PARTIAL_EXIT'
                                      ? 'text-[#01BC8D]'
                                      : step.actionType === 'FULL_EXIT'
                                      ? 'text-[#F6465D]'
                                      : 'text-white';
                                  return (
                                    <div
                                      key={step.id}
                                      className="bg-[#12171D] border border-[#232E3A] rounded p-2 text-[10px] font-mono tabular-nums space-y-0.5"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className={`font-bold ${stepColor}`}>
                                          {step.volumePercent > 0
                                            ? `+${step.volumePercent}%`
                                            : `${step.volumePercent}%`}
                                        </span>
                                        <span className="text-[#8A99AD]">
                                          متبقي: {step.remainingPercentAfter}%
                                        </span>
                                      </div>
                                      <div className="text-white font-sans font-semibold truncate">
                                        {step.actionLabelAr}
                                      </div>
                                      <div className="text-[#8A99AD] flex items-center justify-between gap-1">
                                        <span dir="ltr" className="inline-block whitespace-nowrap">{formatTime(step.timestamp)}</span>
                                        <span dir="ltr" className="inline-block">{step.price}$</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Sorting, Filtering & Traders Grid View */
        <>
          {/* Filter & Sort Controls Card */}
          <div className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Sort Selector */}
              <div>
                <label className="block text-[11px] text-[#8A99AD] mb-1">
                  ترتيب المتداولين:
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as CopyTradingSortType)}
                  className="w-full bg-[#0B0E11] border border-[#1E2733] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Range Selector */}
              <div>
                <label className="block text-[11px] text-[#8A99AD] mb-1">الفترة الزمنية:</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {TIME_RANGES.map((tr) => (
                    <button
                      key={tr.key}
                      type="button"
                      onClick={() => setTimeRange(tr.key)}
                      className={`py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
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

              {/* Search by Nickname */}
              <div>
                <label className="block text-[11px] text-[#8A99AD] mb-1">
                  بحث بالاسم:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchNickname}
                    onChange={(e) => setSearchNickname(e.target.value)}
                    placeholder="اكتب اسم المتداول..."
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
                  checked={hideFull}
                  onChange={(e) => setHideFull(e.target.checked)}
                  className="accent-[#01BC8D]"
                />
                <span>إظهار المتاحين للنسخ فقط</span>
              </label>

              <span className="text-[11px] text-[#8A99AD]">
                إجمالي المتداولين:{' '}
                <strong dir="ltr" className="text-[#01BC8D] font-mono tabular-nums inline-block">
                  {totalCount.toLocaleString('en-US')}
                </strong>
              </span>
            </div>
          </div>

          {/* Traders Grid */}
          {isLoadingList ? (
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
                    <div className="h-6 w-14 bg-[#161D26] rounded-lg" />
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
              {traders.map((trader) => {
                const traderCopiedEntries = copiedTraders.filter(
                  (c) => c.traderId === trader.leadPortfolioId
                );
                const isCopied = traderCopiedEntries.length > 0;
                const isPositiveRoi = trader.roi >= 0;

                return (
                  <div
                    key={trader.leadPortfolioId}
                    className={`bg-[#12171D] border rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-all hover:border-[#2E3B4E] ${
                      isCopied ? 'border-[#01BC8D]/60' : 'border-[#1E2733]'
                    }`}
                  >
                    {/* Trader Top Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        onClick={() => handleSelectTrader(trader)}
                        className="flex items-center gap-3 cursor-pointer group min-w-0"
                      >
                        <TraderAvatar
                          src={trader.avatarUrl}
                          name={trader.nickname}
                          size="md"
                        />
                        <div className="min-w-0">
                          <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-[#01BC8D] transition-colors flex items-center gap-1.5 truncate">
                            <span className="truncate">{trader.nickname}</span>
                            {trader.badgeName && (
                              <Award className="w-3.5 h-3.5 text-[#01BC8D] shrink-0" />
                            )}
                          </h3>
                          <div className="flex items-center gap-2 text-[11px] text-[#8A99AD] mt-0.5">
                            <span className="flex items-center gap-1" title="عدد الناسخين">
                              <Users className="w-3 h-3 text-[#01BC8D]" />
                              <span dir="ltr" className="font-mono tabular-nums">
                                {trader.currentCopyCount}/{trader.maxCopyCount}
                              </span>
                            </span>
                            <span>•</span>
                            <span className="font-mono tabular-nums text-[#EAECEF]" title="عدد أيام فتح حسابه للنسخ">
                              {trader.leadingDays || 120} يوم
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Left Side: Filter Days + Copy Status */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className="text-[#01BC8D] bg-[#0D2B24]/80 border border-[#01BC8D]/30 px-2.5 py-0.5 rounded-lg font-mono font-bold text-[11px]"
                          title="الفترة الزمنية"
                        >
                          {TIME_RANGES.find((t) => t.key === timeRange)?.labelAr || timeRange}
                        </span>
                        {isCopied && (
                          <span className="bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40 px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#01BC8D]" />
                            <span>
                              منسوخ ({traderCopiedEntries.length > 1 ? `${traderCopiedEntries.length} حسابات` : traderCopiedEntries[0]?.accountName || 'يتم النسخ'})
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Trader Metrics + Sparkline */}
                    <div className="bg-[#161D26] rounded-xl p-3 border border-[#1E2733] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] text-[#8A99AD] block">
                            نسبة العائد (ROI)
                          </span>
                          <span
                            dir="ltr"
                            className={`inline-block text-lg sm:text-xl font-extrabold font-mono tabular-nums ${
                              isPositiveRoi ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                            }`}
                          >
                            {formatSignedPercent(trader.roi)}
                          </span>
                        </div>

                        <SparklineSvg
                          points={trader.chartItems?.map((c) => c.value)}
                          seedKey={trader.leadPortfolioId}
                          isPositive={isPositiveRoi}
                          className="w-28 h-11"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1E2733]">
                        <div>
                          <span className="text-[10px] text-[#8A99AD] block">
                            صافي الربح (PNL)
                          </span>
                          <span
                            dir="ltr"
                            className={`inline-block text-xs font-bold font-mono tabular-nums ${
                              trader.pnl >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                            }`}
                          >
                            {formatSignedCurrency(trader.pnl)}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-[#8A99AD] block">
                            نسبة النجاح
                          </span>
                          <span dir="ltr" className="inline-block text-xs font-bold font-mono text-white tabular-nums">
                            {trader.winRate.toFixed(1)}%
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-[#8A99AD] block">
                            AUM / MDD
                          </span>
                          <span dir="ltr" className="inline-block text-xs font-bold font-mono text-[#01BC8D] tabular-nums">
                            ${(trader.aum / 1000).toFixed(0)}K •{' '}
                            <span className="text-[#F6465D]">{trader.mdd.toFixed(1)}%</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSelectTrader(trader)}
                        className="bg-[#161D26] hover:bg-[#1E2733] text-white border border-[#1E2733] font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#01BC8D]" />
                        <span>التفاصيل والصفقات</span>
                      </button>

                      {isCopied ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleCopyTrader(trader)}
                            className="flex-1 bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2 px-2 rounded-xl text-[11px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            title="نسخ هذا المتداول إلى حساب افتراضي آخر"
                          >
                            <Copy className="w-3 h-3" />
                            <span>نسخ لحساب آخر</span>
                          </button>
                          <button
                            onClick={() => handleStopCopyTrader(trader.leadPortfolioId)}
                            className="bg-[#2B1216] hover:bg-[#F6465D]/30 text-[#F6465D] border border-[#F6465D]/40 font-bold py-2 px-2.5 rounded-xl text-[11px] flex items-center justify-center cursor-pointer"
                            title="إيقاف النسخ"
                          >
                            <Square className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleCopyTrader(trader)}
                          className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ المتداول</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
            ? `اختيار الحساب الافتراضي لنسخ صفقة ${pendingCopyTarget.pos.symbol}`
            : 'اختيار الحساب الافتراضي لنسخ المتداول إليه'
        }
        targetName={
          pendingCopyTarget?.type === 'TRADER'
            ? pendingCopyTarget.trader.nickname
            : pendingCopyTarget?.type === 'SINGLE_POSITION'
            ? `${pendingCopyTarget.pos.symbol} (${pendingCopyTarget.traderName})`
            : ''
        }
        accounts={accounts}
        activeAccountId={activeAccountId}
        copiedAccountIdsForTarget={
          pendingCopyTarget?.type === 'TRADER'
            ? copiedTraders
                .filter((ct) => ct.traderId === pendingCopyTarget.trader.leadPortfolioId)
                .map((ct) => ct.accountId || 'acc_default')
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

          if (target.type === 'TRADER') {
            executeCopyTraderToAccount(target.trader, chosenAccountId);
          } else if (target.type === 'SINGLE_POSITION') {
            const copyResult = onCopySinglePosition(
              target.pos,
              target.traderName,
              chosenTradeVal,
              chosenAccountId
            );
            setFeedbackBanner(
              copyResult?.messageAr ||
                `${target.customBanner || `تم نسخ الصفقة ${target.pos.symbol}`} إلى حساب «${chosenAccName}»!`
            );
          }
        }}
      />
    </div>
  );
};
