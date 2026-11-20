import React, { useState, useEffect, useMemo } from 'react';
import {
  PlusCircle,
  RotateCcw,
  History,
  Copy,
  Sliders,
  Wallet,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Users,
  RefreshCw,
  Trash2,
  Edit3,
  Layers,
  AlertTriangle,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
  Download,
  FileSpreadsheet,
  ExternalLink,
  BellRing,
} from 'lucide-react';
import { WhaleIcon } from './WhaleIcon';
import { CoinIcon } from './CoinIcon';
import { TraderAvatar } from './TraderAvatar';
import {
  formatDateWestern,
  formatWeekdayWestern,
  formatDateTimeWestern,
} from '../utils/formatters';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
} from 'recharts';
import {
  BinanceConnectionState,
  KuCoinConnectionState,
  PaperAccountSnapshot,
  TradeExecutionSettings,
  TradingExecutionMode,
  ActiveCopiedTrader,
  MobileNotificationSettings,
  KuCoinSecurityLockConfig,
  TraderOpenPosition,
  TraderLatestRecord,
  TraderPositionHistoryItem,
  ManualSingleCopyResult,
} from '../types';
import { getCachedPrice, fetchSymbolPrice } from '../services/binanceApi';
import { mobileNotifications } from '../services/mobileNotifications';
import {
  filterPendingChoicesForCopiedTradersOnPage,
  formatLateEntryComparisonDetails,
} from '../services/tradeExecutionRules';
import { KuCoinSecurityLockScreen } from './KuCoinSecurityLockGuard';
import { DEFAULT_KUCOIN_SECURITY_CONFIG } from '../services/kucoinSecurityLock';
import { Lock } from 'lucide-react';
import {
  CopiedTraderInlineInspector,
  SelectedInlineTraderTarget,
} from './CopiedTraderInlineInspector';
import { PendingLimitOrdersCard } from './PendingLimitOrdersCard';
import { ProRiskSettingsPanel } from './ProRiskSettingsPanel';
import { ProAnalyticsPanel } from './ProAnalyticsPanel';

interface SimulationTabProps {
  connectionState: BinanceConnectionState;
  kucoinConnectionState: KuCoinConnectionState;
  paperSnapshot: PaperAccountSnapshot;
  copiedTraders: ActiveCopiedTrader[];
  isSyncingAll?: boolean;
  onSelectAccount?: (accountId: string) => void;
  onCreateAccount?: (name: string, initialBalance?: number) => string;
  onRenameAccount?: (accountId: string, newName: string) => void;
  onDeleteAccount?: (accountId: string) => void;
  onUpdateTradeSettings: (
    partial: Partial<TradeExecutionSettings>,
    accountId?: string,
    applyToAllAccounts?: boolean
  ) => void;
  onSetVirtualBalance: (newBalance: number, resetPositions: boolean) => void;
  onOpenOrder: (
    symbol: string,
    side: 'LONG' | 'SHORT',
    quantity: number,
    entryPrice: number,
    leverage: number
  ) => void;
  onClosePosition: (positionId: string, exitPrice: number) => void;
  onSecurePosition?: (positionId: string, currentPrice: number, bufferPercent?: number) => void;
  onUpdatePositionRiskLevels?: (
    positionId: string,
    levels: {
      stopLossPrice?: number | null;
      takeProfitPrice?: number | null;
      trailingStopPercent?: number | null;
    }
  ) => void;
  onMoveStopLossToBreakEven?: (positionId: string, currentMarketPrice?: number) => void;
  onCancelPendingLimitOrder?: (orderId: string) => void;
  onExecutePendingChoice?: (choiceId: string) => void;
  onDismissPendingChoice?: (choiceId: string) => void;
  onTriggerSampleReconnectChoice?: () => void;
  onScaleInPosition?: (
    positionId: string,
    addPercent: number,
    price: number,
    customAddedMarginUsdt?: number
  ) => void;
  onPartialExitPosition?: (positionId: string, withdrawPercent: number, price: number) => void;
  onResetPaper: () => void;
  onClearAllPaperData?: (options?: {
    scope?: 'ACTIVE_ACCOUNT' | 'ALL_ACCOUNTS';
    removeExtraAccounts?: boolean;
    clearCopiedTraders?: boolean;
  }) => void;
  onClearClosedHistory?: (allAccounts?: boolean) => void;
  onSyncAllCopiedTraders: () => void;
  onRemoveCopiedTrader: (
    traderId: string,
    source: 'COPY_TRADING' | 'SMART_MONEY',
    accountId?: string
  ) => void;
  onNavigateToTab: (tab: 'Copy Trading' | 'Whales' | 'KuCoinAPI') => void;
  onOpenTraderStats?: (
    traderId: string,
    source: 'COPY_TRADING' | 'SMART_MONEY',
    traderName?: string
  ) => void;
  onCopySinglePosition?: (
    pos: TraderOpenPosition,
    traderName: string,
    marginUsdt: number,
    accountId?: string
  ) => ManualSingleCopyResult | undefined;
  onSyncTraderToEngine?: (params: {
    traderId: string;
    traderName: string;
    source: 'COPY_TRADING' | 'SMART_MONEY';
    positions: TraderOpenPosition[];
    latestRecords: TraderLatestRecord[];
    positionHistory?: TraderPositionHistoryItem[];
    marginPerTradeUsdt: number;
    accountId?: string;
  }) => any;
  notificationSettings?: MobileNotificationSettings;
  onUpdateNotificationSettings?: (partial: Partial<MobileNotificationSettings>) => void;
  onOpenNotificationsCenter?: () => void;
  securityConfig?: KuCoinSecurityLockConfig;
  isSecurityUnlocked?: boolean;
  onUnlockSecurity?: (method: 'PIN' | 'BIOMETRIC', credentialId?: string | null) => void;
  onLockSecurityNow?: () => void;
}

export const SimulationTab: React.FC<SimulationTabProps> = ({
  connectionState,
  kucoinConnectionState,
  paperSnapshot,
  copiedTraders,
  isSyncingAll = false,
  onSelectAccount,
  onCreateAccount,
  onRenameAccount,
  onDeleteAccount,
  onUpdateTradeSettings,
  onSetVirtualBalance,
  onOpenOrder,
  onClosePosition,
  onSecurePosition,
  onUpdatePositionRiskLevels,
  onMoveStopLossToBreakEven,
  onCancelPendingLimitOrder,
  onExecutePendingChoice,
  onDismissPendingChoice,
  onTriggerSampleReconnectChoice,
  onScaleInPosition,
  onPartialExitPosition,
  onResetPaper,
  onClearAllPaperData,
  onClearClosedHistory,
  onSyncAllCopiedTraders,
  onRemoveCopiedTrader,
  onNavigateToTab,
  onOpenTraderStats,
  onCopySinglePosition,
  onSyncTraderToEngine,
  notificationSettings,
  onUpdateNotificationSettings,
  onOpenNotificationsCenter,
  securityConfig = DEFAULT_KUCOIN_SECURITY_CONFIG,
  isSecurityUnlocked = true,
  onUnlockSecurity,
  onLockSecurityNow,
}) => {
  const settings = paperSnapshot.settings;
  const accounts = paperSnapshot.accounts || [];
  const activeAccountId = paperSnapshot.activeAccountId || 'acc_default';
  const activeAccountName = paperSnapshot.activeAccountName || 'الحساب الافتراضي 1';
  const currentNotifSettings = notificationSettings || mobileNotifications.getSettings();
  const drawdownThresholdPercent = currentNotifSettings.drawdownThresholdPercent ?? 10;
  const notifyOnDrawdown = currentNotifSettings.notifyOnDrawdown ?? true;

  const handleUpdateDrawdownNotif = (partial: Partial<MobileNotificationSettings>) => {
    if (onUpdateNotificationSettings) {
      onUpdateNotificationSettings(partial);
    } else {
      mobileNotifications.updateSettings(partial);
    }
  };

  // Sub-Tab Organization (تنظيم نافذة التداول إلى 3 أقسام واضحة)
  const [simSubTab, setSimSubTab] = useState<'ACTIVE' | 'ACCOUNTS_SETTINGS' | 'STATS_HISTORY'>('ACTIVE');

  // Multi-Account UI State
  const [isCreatingAccount, setIsCreatingAccount] = useState<boolean>(false);
  const [newAccountName, setNewAccountName] = useState<string>('');
  const [newAccountBalance, setNewAccountBalance] = useState<string>('1000');
  const [isRenamingAccount, setIsRenamingAccount] = useState<boolean>(false);
  const [renameAccountInput, setRenameAccountInput] = useState<string>(activeAccountName);
  const [copiedTradersScope, setCopiedTradersScope] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [selectedInlineTrader, setSelectedInlineTrader] =
    useState<SelectedInlineTraderTarget | null>(null);

  // Virtual Balance Editor State
  const [balanceInput, setBalanceInput] = useState<string>(
    String(settings.virtualInitialBalance || paperSnapshot.initialBalance || 1000)
  );
  const [isEditingBalance, setIsEditingBalance] = useState<boolean>(false);

  // Clear All Data & Reset UI State
  const [isConfirmingWipeAll, setIsConfirmingWipeAll] = useState<boolean>(false);
  const [wipeSuccessMsg, setWipeSuccessMsg] = useState<string | null>(null);

  // Trade Settings Form State (stored as strings while editing so inputs never snap to auto-entered defaults)
  const [tradeValueInput, setTradeValueInput] = useState<string>(String(settings.tradeValueUsdt));
  const [leverageInput, setLeverageInput] = useState<string>(String(settings.leverage));
  const [commissionInput, setCommissionInput] = useState<string>(
    String(settings.commissionPercent)
  );
  const [maxConcurrentInput, setMaxConcurrentInput] = useState<string>(
    String(settings.maxConcurrentTrades)
  );
  const [tpInput, setTpInput] = useState<string>(String(settings.takeProfitPercent || 0));
  const [slInput, setSlInput] = useState<string>(String(settings.stopLossPercent || 0));
  const [enforceUserSize, setEnforceUserSize] = useState<boolean>(
    settings.enforceUserSizeOnCopy
  );
  const [scaleInFixedValueInput, setScaleInFixedValueInput] = useState<string>(
    String(settings.scaleInFixedValueUsdt ?? 10)
  );
  const [scaleInSamePercentInput, setScaleInSamePercentInput] = useState<boolean>(
    settings.scaleInSamePercentAsTrader ?? true
  );
  const [partialExitSamePercentInput, setPartialExitSamePercentInput] = useState<boolean>(
    settings.partialExitSamePercentAsTrader ?? true
  );
  const [promptOnUnfavorableLateEntryInput, setPromptOnUnfavorableLateEntryInput] = useState<boolean>(
    settings.promptOnUnfavorableLateEntry ?? true
  );
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);

  // Inline SL / TP / Trailing Stop Editor State on Open Positions (v2.23)
  const [editingRiskPositionId, setEditingRiskPositionId] = useState<string | null>(null);
  const [editSlInput, setEditSlInput] = useState<string>('');
  const [editTpInput, setEditTpInput] = useState<string>('');
  const [editTrailingInput, setEditTrailingInput] = useState<string>('');

  // Statistics Section Filter State
  const [includeOpenInStats, setIncludeOpenInStats] = useState<boolean>(true);
  const [breakdownMode, setBreakdownMode] = useState<'WIN_LOSS' | 'BY_TRADER'>('WIN_LOSS');

  // Manual trade state
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [orderSide, setOrderSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [orderError, setOrderError] = useState<string | null>(null);

  // Sync form inputs ONLY when the user switches to a different virtual account
  useEffect(() => {
    setTradeValueInput(String(settings.tradeValueUsdt));
    setLeverageInput(String(settings.leverage));
    setCommissionInput(String(settings.commissionPercent));
    setMaxConcurrentInput(String(settings.maxConcurrentTrades));
    setTpInput(String(settings.takeProfitPercent || 0));
    setSlInput(String(settings.stopLossPercent || 0));
    setEnforceUserSize(settings.enforceUserSizeOnCopy);
    setScaleInFixedValueInput(String(settings.scaleInFixedValueUsdt ?? 10));
    setScaleInSamePercentInput(settings.scaleInSamePercentAsTrader ?? true);
    setPartialExitSamePercentInput(settings.partialExitSamePercentAsTrader ?? true);
    setPromptOnUnfavorableLateEntryInput(settings.promptOnUnfavorableLateEntry ?? true);
    setBalanceInput(String(settings.virtualInitialBalance || paperSnapshot.initialBalance || 1000));
    setRenameAccountInput(activeAccountName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  useEffect(() => {
    setRenameAccountInput(activeAccountName);
  }, [activeAccountName]);

  const openPositions = paperSnapshot.positions.filter((p) => p.status === 'OPEN');
  const closedPositions = paperSnapshot.positions.filter((p) => p.status === 'CLOSED');

  // Closed Positions / Recent Orders Filter State (Side: ALL | LONG | SHORT, Symbol: ALL or specific)
  const [closedSideFilter, setClosedSideFilter] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [closedSymbolFilter, setClosedSymbolFilter] = useState<string>('ALL');
  const [closedSymbolSearch, setClosedSymbolSearch] = useState<string>('');

  const uniqueClosedSymbols = useMemo(() => {
    const set = new Set<string>();
    closedPositions.forEach((cp) => {
      if (cp.symbol) set.add(cp.symbol.toUpperCase().trim());
    });
    return Array.from(set);
  }, [closedPositions]);

  const filteredClosedPositions = useMemo(() => {
    return closedPositions.filter((cp) => {
      if (closedSideFilter !== 'ALL' && cp.side !== closedSideFilter) {
        return false;
      }
      const sym = (cp.symbol || '').toUpperCase().trim();
      if (closedSymbolFilter !== 'ALL' && sym !== closedSymbolFilter) {
        return false;
      }
      const q = closedSymbolSearch.toUpperCase().trim();
      if (q && !sym.includes(q)) {
        return false;
      }
      return true;
    });
  }, [closedPositions, closedSideFilter, closedSymbolFilter, closedSymbolSearch]);

  // Ensure any active position has its live price fetched from Binance
  const [dynPrices, setDynPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    openPositions.forEach((pos) => {
      const sym = pos.symbol.toUpperCase();
      if (!connectionState.allPrices?.[sym] && !dynPrices[sym]) {
        fetchSymbolPrice(sym).then((p) => {
          if (p && p > 0) {
            setDynPrices((prev) => ({ ...prev, [sym]: p }));
          }
        });
      }
    });
  }, [openPositions, connectionState.allPrices, dynPrices]);

  const getSymbolPrice = (symbol: string): number => {
    const sym = symbol.toUpperCase().trim();

    // 1. Check live price map of all 800+ Binance Futures contracts
    if (connectionState.allPrices && connectionState.allPrices[sym] && connectionState.allPrices[sym] > 0) {
      return connectionState.allPrices[sym];
    }

    // 2. Check dynamic on-demand fetched prices
    if (dynPrices[sym] && dynPrices[sym] > 0) {
      return dynPrices[sym];
    }

    // 3. Check memory cache from binanceApi
    const cached = getCachedPrice(sym);
    if (cached && cached > 0) {
      return cached;
    }

    // 4. Check watched tickers list
    const t = connectionState.tickers.find((tick) => tick.symbol === sym);
    if (t) {
      const p = parseFloat(t.lastPrice.replace(/,/g, ''));
      if (!isNaN(p) && p > 0) return p;
    }

    // 5. Fallback to open position entryPrice (NEVER guess arbitrary 100.0)
    const openPos = openPositions.find((p) => p.symbol === sym);
    if (openPos && openPos.entryPrice > 0) {
      return openPos.entryPrice;
    }

    // 6. Fallback to closed position entryPrice
    const closedPos = closedPositions.find((p) => p.symbol === sym);
    if (closedPos && closedPos.entryPrice > 0) {
      return closedPos.entryPrice;
    }

    // 7. Realistic defaults for major pairs
    if (sym === 'BTCUSDT') return 96450.0;
    if (sym === 'ETHUSDT') return 2780.0;
    if (sym === 'SOLUSDT') return 198.0;
    if (sym === 'BNBUSDT') return 654.0;
    if (sym === 'XRPUSDT') return 2.48;
    if (sym === 'DOGEUSDT') return 0.264;
    if (sym === 'LTCUSDT') return 50.10;
    if (sym === 'SUIUSDT') return 3.42;
    if (sym === 'ADAUSDT') return 0.78;
    if (sym === 'NEARUSDT') return 3.56;

    return 50.0;
  };

  const currentPrice = getSymbolPrice(selectedSymbol);

  // Live check of all virtual accounts' drawdown (including live unrealized PNL on the active account)
  useEffect(() => {
    if (!accounts || accounts.length === 0) return;
    let activeUnrealized = 0;
    let activeMargin = 0;
    openPositions.forEach((p) => {
      const m = p.marginUsdt || (p.quantity * p.entryPrice) / p.leverage;
      activeMargin += m;
      const liveP = getSymbolPrice(p.symbol);
      const dir = p.side === 'LONG' ? 1 : -1;
      activeUnrealized += (liveP - p.entryPrice) * p.quantity * dir;
    });

    const enrichedAccounts = accounts.map((acc) => {
      if (acc.id === activeAccountId) {
        const liveEquity = acc.availableBalance + activeMargin + activeUnrealized;
        const ddPct =
          acc.initialBalance > 0 && liveEquity < acc.initialBalance
            ? parseFloat((((acc.initialBalance - liveEquity) / acc.initialBalance) * 100).toFixed(2))
            : 0;
        return {
          ...acc,
          totalEquity: parseFloat(liveEquity.toFixed(4)),
          unrealizedPnl: parseFloat(activeUnrealized.toFixed(4)),
          drawdownPercent: ddPct,
        };
      }
      return acc;
    });

    mobileNotifications.checkAccountsDrawdown(enrichedAccounts);
  }, [
    accounts,
    activeAccountId,
    openPositions,
    connectionState.allPrices,
    dynPrices,
    drawdownThresholdPercent,
    notifyOnDrawdown,
  ]);

  // Expand Trader / Whale inline inspector below the Open Positions window without hiding user's open positions
  const handleTraderClick = (
    traderName?: string,
    traderId?: string,
    sourceType?: 'COPY_TRADING' | 'SMART_MONEY' | 'MANUAL'
  ) => {
    if (!traderName && !traderId) return;
    if (
      sourceType === 'MANUAL' ||
      traderName === 'يدوي' ||
      traderName === 'تداول يدوي' ||
      traderName === 'صفقة يدوية' ||
      traderName === 'المحفظة'
    ) {
      return;
    }

    // 1. Look in copiedTraders
    const copied = copiedTraders.find(
      (c) =>
        (traderId && c.traderId === traderId) ||
        (traderName && c.nickname.trim().toLowerCase() === traderName.trim().toLowerCase())
    );

    let finalId = traderId || copied?.traderId;
    let finalSource = (copied?.source || sourceType || 'COPY_TRADING') as 'COPY_TRADING' | 'SMART_MONEY';

    // Check if name is known whale pattern (e.g. 0x... or i386)
    if (
      traderName &&
      (traderName.startsWith('0x') ||
        traderName === 'i386' ||
        traderName.toLowerCase().includes('whale') ||
        traderName.includes('حوت'))
    ) {
      finalSource = 'SMART_MONEY';
    }

    if (!finalId) {
      if (finalSource === 'SMART_MONEY') {
        finalId = traderName === 'i386' ? '653599' : '601875';
      } else {
        finalId = traderName?.includes('Satoshi') ? '4820471288996401153' : '4753924989961029377';
      }
    }

    setSimSubTab('ACTIVE');
    setSelectedInlineTrader({
      traderId: finalId,
      traderName: traderName || copied?.nickname || finalId,
      source: finalSource,
      avatarUrl: copied?.avatarUrl,
      accountId: copied?.accountId || activeAccountId,
    });
  };

  // Compute Portfolio Statistics, Equity Curve, and Win/Loss Metrics
  const portfolioStats = useMemo(() => {
    const initialBal = Math.max(1, paperSnapshot.initialBalance || settings.virtualInitialBalance || 1000);

    // Sort closed positions chronologically
    const sortedClosed = [...closedPositions].sort(
      (a, b) => (a.closeTime || a.openTime) - (b.closeTime || b.openTime)
    );

    const equityCurve: Array<{
      step: string;
      label: string;
      equity: number;
      pnlDelta: number;
      symbol: string;
      trader: string;
    }> = [
      {
        step: 'البداية',
        label: 'الرصيد الابتدائي',
        equity: Number(initialBal.toFixed(2)),
        pnlDelta: 0,
        symbol: 'USDT',
        trader: 'المحفظة',
      },
    ];

    let runningEquity = initialBal;
    let peakEquity = initialBal;
    let maxDrawdownPercent = 0;

    sortedClosed.forEach((pos, idx) => {
      const pnl = pos.realizedPnl ?? 0;
      runningEquity += pnl;
      if (runningEquity > peakEquity) peakEquity = runningEquity;
      // أقصى تراجع يُحسب من رأس المال الأولي (initialBal)
      const dd =
        initialBal > 0 && runningEquity < initialBal
          ? ((initialBal - runningEquity) / initialBal) * 100
          : 0;
      if (dd > maxDrawdownPercent) maxDrawdownPercent = dd;

      const timeStr = formatDateTimeWestern(pos.closeTime || pos.openTime);

      equityCurve.push({
        step: `#${idx + 1} ${pos.symbol.replace('USDT', '')}`,
        label: `صفقة مغلقة (${pos.symbol}) • ${timeStr}`,
        equity: Number(runningEquity.toFixed(2)),
        pnlDelta: Number(pnl.toFixed(2)),
        symbol: pos.symbol,
        trader: pos.sourceTraderName || 'يدوي',
      });
    });

    // Optionally include open positions along the curve so live changes reflect immediately
    if (includeOpenInStats && openPositions.length > 0) {
      openPositions.forEach((pos, idx) => {
        const liveP = getSymbolPrice(pos.symbol);
        const dir = pos.side === 'LONG' ? 1 : -1;
        const gross = (liveP - pos.entryPrice) * pos.quantity * dir;
        const net = gross - (pos.commissionUsdt || 0);
        runningEquity += net;
        if (runningEquity > peakEquity) peakEquity = runningEquity;
        // أقصى تراجع يُحسب من رأس المال الأولي (initialBal)
        const dd =
          initialBal > 0 && runningEquity < initialBal
            ? ((initialBal - runningEquity) / initialBal) * 100
            : 0;
        if (dd > maxDrawdownPercent) maxDrawdownPercent = dd;

        equityCurve.push({
          step: `مفتوحة ${idx + 1}`,
          label: `صفقة نشطة (${pos.symbol})`,
          equity: Number(runningEquity.toFixed(2)),
          pnlDelta: Number(net.toFixed(2)),
          symbol: pos.symbol,
          trader: pos.sourceTraderName || 'يدوي',
        });
      });
    }

    // Ensure at least 2 points on the chart so AreaChart renders a clean line/area
    if (equityCurve.length === 1) {
      const currentEq = Number(paperSnapshot.totalEquity.toFixed(2));
      const dd =
        initialBal > 0 && currentEq < initialBal
          ? ((initialBal - currentEq) / initialBal) * 100
          : 0;
      if (dd > maxDrawdownPercent) maxDrawdownPercent = dd;
      equityCurve.push({
        step: 'الآن',
        label: 'الرصيد الحالي',
        equity: currentEq,
        pnlDelta: Number((currentEq - initialBal).toFixed(2)),
        symbol: 'USDT',
        trader: 'المحفظة',
      });
    }

    // Evaluate trades for Win vs Loss
    const evaluatedTrades: Array<{
      id: string;
      symbol: string;
      pnl: number;
      trader: string;
      isOpen: boolean;
    }> = [
      ...sortedClosed.map((c) => ({
        id: c.id,
        symbol: c.symbol,
        pnl: c.realizedPnl ?? 0,
        trader: c.sourceTraderName || 'تداول يدوي',
        isOpen: false,
      })),
      ...(includeOpenInStats
        ? openPositions.map((o) => {
            const liveP = getSymbolPrice(o.symbol);
            const dir = o.side === 'LONG' ? 1 : -1;
            const net = (liveP - o.entryPrice) * o.quantity * dir - (o.commissionUsdt || 0);
            return {
              id: o.id,
              symbol: o.symbol,
              pnl: net,
              trader: o.sourceTraderName || 'تداول يدوي',
              isOpen: true,
            };
          })
        : []),
    ];

    const winningTrades = evaluatedTrades.filter((t) => t.pnl > 0);
    const losingTrades = evaluatedTrades.filter((t) => t.pnl < 0);
    const breakEvenTrades = evaluatedTrades.filter((t) => t.pnl === 0);

    const grossProfit = winningTrades.reduce((acc, t) => acc + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.pnl, 0));
    const totalEvaluated = winningTrades.length + losingTrades.length;
    const winRate = totalEvaluated > 0 ? (winningTrades.length / totalEvaluated) * 100 : 0;
    const lossRate = totalEvaluated > 0 ? (losingTrades.length / totalEvaluated) * 100 : 0;
    const profitFactor =
      grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;

    // Group PNL by Trader / Source for the secondary bar chart
    const traderMap = new Map<string, { name: string; pnl: number; count: number }>();
    evaluatedTrades.forEach((t) => {
      const key = t.trader;
      const existing = traderMap.get(key) || { name: key, pnl: 0, count: 0 };
      existing.pnl += t.pnl;
      existing.count += 1;
      traderMap.set(key, existing);
    });

    const traderPerformance = Array.from(traderMap.values()).map((item) => ({
      name: item.name,
      pnl: Number(item.pnl.toFixed(2)),
      count: item.count,
    }));

    const finalEquity = equityCurve[equityCurve.length - 1]?.equity ?? initialBal;
    const totalGrowthPct = ((finalEquity - initialBal) / initialBal) * 100;

    return {
      initialBal,
      finalEquity,
      totalGrowthPct,
      peakEquity,
      maxDrawdownPercent,
      equityCurve,
      winningCount: winningTrades.length,
      losingCount: losingTrades.length,
      breakEvenCount: breakEvenTrades.length,
      totalTradesCount: evaluatedTrades.length,
      grossProfit,
      grossLoss,
      winRate,
      lossRate,
      profitFactor,
      traderPerformance,
    };
  }, [
    paperSnapshot.initialBalance,
    paperSnapshot.totalEquity,
    settings.virtualInitialBalance,
    closedPositions,
    openPositions,
    includeOpenInStats,
    connectionState.tickers,
  ]);

  const normalizeNumberInput = (raw: string): string => {
    return String(raw)
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/,/g, '.');
  };

  const parseNumInput = (
    raw: string,
    fallback: number,
    min: number,
    max?: number
  ): number => {
    const cleanStr = normalizeNumberInput(raw).trim();
    if (!cleanStr) return fallback;
    const parsed = parseFloat(cleanStr);
    if (isNaN(parsed)) return fallback;
    const clampedMin = Math.max(min, parsed);
    return max !== undefined ? Math.min(clampedMin, max) : clampedMin;
  };

  const previewTradeValue = parseNumInput(tradeValueInput, settings.tradeValueUsdt, 0.1, 1000000);
  const previewLeverage = Math.round(parseNumInput(leverageInput, settings.leverage, 1, 125));
  const previewScaleInFixed = parseNumInput(
    scaleInFixedValueInput,
    settings.scaleInFixedValueUsdt ?? 10,
    0.5,
    1000000
  );

  const buildCurrentSettingsPayload = (
    overrides?: Partial<TradeExecutionSettings>
  ): Partial<TradeExecutionSettings> => {
    const cleanValue = parseNumInput(tradeValueInput, settings.tradeValueUsdt, 0.1, 1000000);
    const cleanLev = Math.round(parseNumInput(leverageInput, settings.leverage, 1, 125));
    const cleanComm = parseNumInput(commissionInput, settings.commissionPercent, 0, 20);
    const cleanMaxTrades = Math.round(
      parseNumInput(maxConcurrentInput, settings.maxConcurrentTrades, 1, 500)
    );
    const cleanTp = parseNumInput(tpInput, settings.takeProfitPercent || 0, 0, 10000);
    const cleanSl = parseNumInput(slInput, settings.stopLossPercent || 0, 0, 100);
    const cleanScaleInFixed = parseNumInput(
      scaleInFixedValueInput,
      settings.scaleInFixedValueUsdt ?? 10,
      0.5,
      1000000
    );

    return {
      tradeValueUsdt: cleanValue,
      leverage: cleanLev,
      commissionPercent: cleanComm,
      maxConcurrentTrades: cleanMaxTrades,
      takeProfitPercent: cleanTp,
      stopLossPercent: cleanSl,
      enforceUserSizeOnCopy: enforceUserSize,
      scaleInFixedValueUsdt: cleanScaleInFixed,
      scaleInSamePercentAsTrader: scaleInSamePercentInput,
      partialExitSamePercentAsTrader: partialExitSamePercentInput,
      promptOnUnfavorableLateEntry: promptOnUnfavorableLateEntryInput,
      ...overrides,
    };
  };

  const [isPromptingRealModeUnlock, setIsPromptingRealModeUnlock] = useState<boolean>(false);

  const handleModeSwitch = (mode: TradingExecutionMode) => {
    if (
      mode === 'REAL' &&
      securityConfig.enabled &&
      securityConfig.protectRealTradingSwitch &&
      !isSecurityUnlocked
    ) {
      setIsPromptingRealModeUnlock(true);
      return;
    }
    setIsPromptingRealModeUnlock(false);
    onUpdateTradeSettings({ mode }, activeAccountId, false);
  };

  const handleSaveTradeSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildCurrentSettingsPayload();

    // Update form inputs to reflect the normalized saved values (never reverting to defaults)
    setTradeValueInput(String(payload.tradeValueUsdt));
    setLeverageInput(String(payload.leverage));
    setCommissionInput(String(payload.commissionPercent));
    setMaxConcurrentInput(String(payload.maxConcurrentTrades));
    setTpInput(String(payload.takeProfitPercent ?? 0));
    setSlInput(String(payload.stopLossPercent ?? 0));
    setScaleInFixedValueInput(String(payload.scaleInFixedValueUsdt));

    onUpdateTradeSettings(payload, activeAccountId, false);

    const scaleModeText = payload.scaleInSamePercentAsTrader
      ? 'التدعيم آلياً بنفس النسبة المئوية من قيمة الصفقة الأصلية'
      : `التدعيم بالقيمة المحددة (+${payload.scaleInFixedValueUsdt} USDT)`;

    const lateEntryModeText =
      payload.promptOnUnfavorableLateEntry === false
        ? 'الدخول آلي بسعر السوق حتى مع التأخر'
        : 'تفعيل اختيار الدخول أو الرفض عند السعر الأسوأ';

    setSettingsSavedMsg(
      `تم حفظ وتثبيت الإعدادات الخاصة بحساب «${activeAccountName}» فقط بنجاح: قيمة الصفقة (${payload.tradeValueUsdt} USDT) • الرافعة (${payload.leverage}x) • العمولة (${payload.commissionPercent}%) • أقصى صفقات (${payload.maxConcurrentTrades}) • ${scaleModeText} • ${lateEntryModeText}`
    );
    setTimeout(() => setSettingsSavedMsg(null), 7000);
  };

  const handleExecuteWipeAll = (options: {
    scope: 'ACTIVE_ACCOUNT' | 'ALL_ACCOUNTS';
    removeExtraAccounts?: boolean;
    clearCopiedTraders?: boolean;
  }) => {
    if (onClearAllPaperData) {
      onClearAllPaperData(options);
    } else {
      onResetPaper();
    }
    setIsConfirmingWipeAll(false);
    const msg =
      options.clearCopiedTraders
        ? 'تم مسح جميع البيانات والعمليات والصفقات السابقة وإلغاء نسخ المتداولين وإعادة ضبط التداول الافتراضي بالكامل.'
        : options.scope === 'ACTIVE_ACCOUNT'
        ? `تم مسح جميع العمليات والصفقات السابقة وتصفير بيانات الحساب «${activeAccountName}» بنجاح مع الاحتفاظ بإعدادات الصفقات.`
        : 'تم مسح جميع العمليات والصفقات السابقة وتصفير جميع الحسابات الافتراضية بنجاح مع الاحتفاظ بإعدادات الصفقات.';
    setWipeSuccessMsg(msg);
    setTimeout(() => setWipeSuccessMsg(null), 7000);
  };

  const handleApplyVirtualBalance = (resetAll: boolean) => {
    const val = parseNumInput(balanceInput, paperSnapshot.initialBalance || 1000, 1);
    if (isNaN(val) || val <= 0) return;
    setBalanceInput(String(val));
    onSetVirtualBalance(val, resetAll);
    setIsEditingBalance(false);
  };

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError(null);
    try {
      const margin = settings.tradeValueUsdt;
      const lev = settings.leverage;
      const notional = margin * lev;
      const quantity = notional / currentPrice;
      onOpenOrder(selectedSymbol, orderSide, quantity, currentPrice, lev);
    } catch (err: any) {
      setOrderError(err.message || 'فشل فتح الصفقة');
    }
  };

  const formatExcelDate = (timestamp?: number) => {
    if (!timestamp) return '--';
    return new Date(timestamp)
      .toLocaleString('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      .replace(',', '');
  };

  const triggerFileDownload = (content: string, fileName: string, mimeType: string) => {
    const win = window as unknown as {
      AndroidDownloader?: {
        saveFile?: (fileContent: string, name: string, mime: string) => void;
      };
    };
    if (win.AndroidDownloader && typeof win.AndroidDownloader.saveFile === 'function') {
      win.AndroidDownloader.saveFile(content, fileName, mimeType);
      return;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getTradeDurationMs = (cp: {
    openTime: number;
    closeTime?: number;
    traderEntryTime?: number;
    traderExitTime?: number;
  }): number => {
    const start = cp.openTime || cp.traderEntryTime || 0;
    const end = cp.closeTime || cp.traderExitTime || start;
    if (end >= start && start > 0) {
      return end - start;
    }
    if (cp.traderEntryTime && end >= cp.traderEntryTime) {
      return end - cp.traderEntryTime;
    }
    return Math.abs(end - start);
  };

  const formatTradeDuration = (
    durationMs: number,
    style: 'FULL' | 'COMPACT' = 'FULL'
  ): { textAr: string; hhmmss: string } => {
    const safeMs = Math.max(0, Math.floor(durationMs));
    const totalSeconds = Math.floor(safeMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const totalHours = Math.floor(totalSeconds / 3600);
    const hhmmss = `${String(totalHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    if (totalSeconds === 0) {
      return {
        textAr: style === 'COMPACT' ? '< 1ث' : 'أقل من ثانية',
        hhmmss: '00:00:00',
      };
    }

    if (style === 'COMPACT') {
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}ي`);
      if (hours > 0) parts.push(`${hours}س`);
      if (minutes > 0) parts.push(`${minutes}د`);
      if (seconds > 0 && days === 0 && hours === 0) parts.push(`${seconds}ث`);
      return {
        textAr: parts.join(' ') || `${seconds}ث`,
        hhmmss,
      };
    }

    const parts: string[] = [];
    if (days > 0) parts.push(`${days} يوم`);
    if (hours > 0) parts.push(`${hours} ساعة`);
    if (minutes > 0) parts.push(`${minutes} دقيقة`);
    if (seconds > 0 && days === 0) parts.push(`${seconds} ثانية`);

    return {
      textAr: parts.join(' و ') || `${seconds} ثانية`,
      hhmmss,
    };
  };

  const getSourceTypeLabelAr = (sourceType?: 'COPY_TRADING' | 'SMART_MONEY' | 'MANUAL', traderName?: string) => {
    if (sourceType === 'SMART_MONEY') return 'الحيتان (Smart Money)';
    if (sourceType === 'COPY_TRADING') return 'نسخ التداول (Copy Trading)';
    if (traderName && traderName !== 'يدوي' && traderName !== 'تداول يدوي') {
      return 'نسخ التداول (Copy Trading)';
    }
    return 'تداول يدوي';
  };

  const handleExportClosedTradesExcel = (format: 'XLS' | 'CSV' = 'XLS') => {
    if (closedPositions.length === 0) return;

    const nowDateStr = new Date().toISOString().slice(0, 10);
    const initialBal = Math.max(
      1,
      paperSnapshot.initialBalance || settings.virtualInitialBalance || 1000
    );

    const totalMargin = closedPositions.reduce(
      (acc, cp) => acc + (cp.initialMarginUsdt || cp.marginUsdt || settings.tradeValueUsdt),
      0
    );
    const totalCommission = closedPositions.reduce(
      (acc, cp) => acc + (cp.commissionUsdt || 0),
      0
    );
    const totalRealizedPnl = closedPositions.reduce(
      (acc, cp) => acc + (cp.realizedPnl || 0),
      0
    );
    const totalDurationMs = closedPositions.reduce(
      (acc, cp) => acc + getTradeDurationMs(cp),
      0
    );
    const avgDurationMs =
      closedPositions.length > 0 ? totalDurationMs / closedPositions.length : 0;
    const avgDurationFormatted = formatTradeDuration(avgDurationMs, 'FULL');
    const overallProfitPctOnMargin =
      totalMargin > 0 ? (totalRealizedPnl / totalMargin) * 100 : 0;
    const overallProfitPctOnCapital = (totalRealizedPnl / initialBal) * 100;
    const winningClosedCount = closedPositions.filter((cp) => (cp.realizedPnl || 0) > 0).length;
    const losingClosedCount = closedPositions.filter((cp) => (cp.realizedPnl || 0) < 0).length;
    const winRateClosedPct =
      closedPositions.length > 0 ? (winningClosedCount / closedPositions.length) * 100 : 0;

    if (format === 'CSV') {
      const headers = [
        '#',
        'الحساب',
        'الزوج (Symbol)',
        'الاتجاه (Side)',
        'الرافعة (Leverage)',
        'اسم المتداول المنسوخ',
        'مصدر الصفقة',
        'قيمة الصفقة (USDT)',
        'تاريخ ووقت الدخول',
        'تاريخ ووقت الخروج',
        'المدة الزمنية لاستمرار الصفقة',
        'المدة الزمنية (HH:MM:SS)',
        'سعر الدخول (USDT)',
        'سعر الخروج (USDT)',
        'العمولة (USDT)',
        'الأرباح المحققة الصافية (USDT)',
        'نسبة الربح المحققة من الصفقة (%)',
        'نسبة الربح من رأس المال الأولي (%)',
        'حالة الصفقة',
        'حركات التدعيم والانسحاب',
      ];

      const rows = closedPositions.map((cp, idx) => {
        const margin = cp.initialMarginUsdt || cp.marginUsdt || settings.tradeValueUsdt;
        const rPnl = cp.realizedPnl || 0;
        const roiPct = margin > 0 ? (rPnl / margin) * 100 : 0;
        const capitalPct = (rPnl / initialBal) * 100;
        const durMs = getTradeDurationMs(cp);
        const durFormatted = formatTradeDuration(durMs, 'FULL');
        const traderName = cp.sourceTraderName || 'تداول يدوي';
        const sourceLabel = getSourceTypeLabelAr(cp.sourceType, cp.sourceTraderName);
        const tradeStatus = rPnl > 0 ? 'صفقة رابحة' : rPnl < 0 ? 'صفقة خاسرة' : 'تعادل';

        const adjustmentsSummary = (cp.scaleAdjustments || [])
          .map(
            (a) =>
              `${a.actionLabelAr} (${a.volumePercent > 0 ? `+${a.volumePercent}%` : `${a.volumePercent}%`} @ ${a.price.toFixed(4)})`
          )
          .join(' | ');

        return [
          idx + 1,
          cp.accountName || activeAccountName,
          cp.symbol,
          cp.side,
          `${cp.leverage}x`,
          traderName,
          sourceLabel,
          margin.toFixed(2),
          formatExcelDate(cp.openTime),
          formatExcelDate(cp.closeTime),
          durFormatted.textAr,
          durFormatted.hhmmss,
          cp.entryPrice.toFixed(4),
          (cp.exitPrice || 0).toFixed(4),
          (cp.commissionUsdt || 0).toFixed(4),
          `${rPnl >= 0 ? '+' : ''}${rPnl.toFixed(2)}`,
          `${roiPct >= 0 ? '+' : ''}${roiPct.toFixed(2)}%`,
          `${capitalPct >= 0 ? '+' : ''}${capitalPct.toFixed(2)}%`,
          tradeStatus,
          adjustmentsSummary || 'بدون تعديل',
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(',');
      });

      const summaryRow = [
        'الإجمالي',
        activeAccountName,
        `${closedPositions.length} صفقة`,
        `رابحة: ${winningClosedCount} / خاسرة: ${losingClosedCount}`,
        `نسبة النجاح: ${winRateClosedPct.toFixed(1)}%`,
        'جميع المتداولين',
        '--',
        totalMargin.toFixed(2),
        '--',
        '--',
        `المتوسط: ${avgDurationFormatted.textAr}`,
        avgDurationFormatted.hhmmss,
        '--',
        '--',
        totalCommission.toFixed(4),
        `${totalRealizedPnl >= 0 ? '+' : ''}${totalRealizedPnl.toFixed(2)}`,
        `${overallProfitPctOnMargin >= 0 ? '+' : ''}${overallProfitPctOnMargin.toFixed(2)}%`,
        `${overallProfitPctOnCapital >= 0 ? '+' : ''}${overallProfitPctOnCapital.toFixed(2)}%`,
        totalRealizedPnl >= 0 ? 'صافي ربح' : 'صافي خسارة',
        '--',
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',');

      const csvContent = '\uFEFF' + [headers.join(','), ...rows, summaryRow].join('\r\n');
      triggerFileDownload(
        csvContent,
        `KuCoin_Closed_Trades_${nowDateStr}.csv`,
        'text/csv;charset=utf-8;'
      );
      return;
    }

    // تجميع إحصائيات المتداولين المنسوخين لإضافتها كملخص تحليلي داخل ملف Excel
    const traderSummaryMap = new Map<
      string,
      {
        traderName: string;
        sourceLabel: string;
        tradesCount: number;
        wins: number;
        losses: number;
        totalMargin: number;
        totalPnl: number;
        totalDurationMs: number;
      }
    >();

    closedPositions.forEach((cp) => {
      const tName = cp.sourceTraderName || 'تداول يدوي';
      const sLabel = getSourceTypeLabelAr(cp.sourceType, cp.sourceTraderName);
      const margin = cp.initialMarginUsdt || cp.marginUsdt || settings.tradeValueUsdt;
      const rPnl = cp.realizedPnl || 0;
      const dur = getTradeDurationMs(cp);

      const curr = traderSummaryMap.get(tName) || {
        traderName: tName,
        sourceLabel: sLabel,
        tradesCount: 0,
        wins: 0,
        losses: 0,
        totalMargin: 0,
        totalPnl: 0,
        totalDurationMs: 0,
      };
      curr.tradesCount += 1;
      if (rPnl > 0) curr.wins += 1;
      if (rPnl < 0) curr.losses += 1;
      curr.totalMargin += margin;
      curr.totalPnl += rPnl;
      curr.totalDurationMs += dur;
      traderSummaryMap.set(tName, curr);
    });

    const traderSummaryRowsHtml = Array.from(traderSummaryMap.values())
      .sort((a, b) => b.totalPnl - a.totalPnl)
      .map((item, idx) => {
        const winRate = item.tradesCount > 0 ? (item.wins / item.tradesCount) * 100 : 0;
        const avgProfitPct = item.totalMargin > 0 ? (item.totalPnl / item.totalMargin) * 100 : 0;
        const avgDur = formatTradeDuration(
          item.tradesCount > 0 ? item.totalDurationMs / item.tradesCount : 0,
          'FULL'
        );
        const color = item.totalPnl >= 0 ? '#01BC8D' : '#F6465D';
        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td style="font-weight:bold;">${item.traderName}</td>
            <td style="text-align:center;">${item.sourceLabel}</td>
            <td style="text-align:center;font-weight:bold;">${item.tradesCount}</td>
            <td style="text-align:center;color:#01BC8D;">${item.wins}</td>
            <td style="text-align:center;color:#F6465D;">${item.losses}</td>
            <td style="text-align:center;font-weight:bold;">${winRate.toFixed(1)}%</td>
            <td style="text-align:center;">${avgDur.textAr} (${avgDur.hhmmss})</td>
            <td style="text-align:right;">${item.totalMargin.toFixed(2)} USDT</td>
            <td style="text-align:right;font-weight:bold;color:${color};">${item.totalPnl >= 0 ? '+' : ''}${item.totalPnl.toFixed(2)} USDT</td>
            <td style="text-align:right;font-weight:bold;color:${color};">${avgProfitPct >= 0 ? '+' : ''}${avgProfitPct.toFixed(2)}%</td>
          </tr>`;
      })
      .join('');

    const tableRowsHtml = closedPositions
      .map((cp, idx) => {
        const margin = cp.initialMarginUsdt || cp.marginUsdt || settings.tradeValueUsdt;
        const rPnl = cp.realizedPnl || 0;
        const roiPct = margin > 0 ? (rPnl / margin) * 100 : 0;
        const capitalPct = (rPnl / initialBal) * 100;
        const pnlColor = rPnl >= 0 ? '#01BC8D' : '#F6465D';
        const rowBg = rPnl > 0 ? '#F0FDF9' : rPnl < 0 ? '#FEF2F2' : '#FFFFFF';
        const durMs = getTradeDurationMs(cp);
        const durFormatted = formatTradeDuration(durMs, 'FULL');
        const traderName = cp.sourceTraderName || 'تداول يدوي';
        const sourceLabel = getSourceTypeLabelAr(cp.sourceType, cp.sourceTraderName);
        const statusText = rPnl > 0 ? 'رابحة' : rPnl < 0 ? 'خاسرة' : 'تعادل';

        const adjustmentsSummary = (cp.scaleAdjustments || [])
          .map(
            (a) =>
              `${a.actionLabelAr} (${a.volumePercent > 0 ? `+${a.volumePercent}%` : `${a.volumePercent}%`})`
          )
          .join(' ، ');

        return `
          <tr style="background-color:${rowBg};">
            <td style="text-align:center;">${idx + 1}</td>
            <td style="text-align:center;">${cp.accountName || activeAccountName}</td>
            <td style="font-weight:bold;">${cp.symbol}</td>
            <td style="text-align:center;color:${cp.side === 'LONG' ? '#01BC8D' : '#F6465D'};font-weight:bold;">${cp.side}</td>
            <td style="text-align:center;">${cp.leverage}x</td>
            <td style="font-weight:bold;color:#0B0E11;">${traderName}</td>
            <td style="text-align:center;font-size:11px;color:#4B5563;">${sourceLabel}</td>
            <td style="text-align:right;font-weight:bold;">${margin.toFixed(2)}</td>
            <td style="text-align:center;">${formatExcelDate(cp.openTime)}</td>
            <td style="text-align:center;">${formatExcelDate(cp.closeTime)}</td>
            <td style="text-align:center;font-weight:bold;color:#1F2937;">${durFormatted.textAr}</td>
            <td style="text-align:center;font-family:monospace;color:#4B5563;">${durFormatted.hhmmss}</td>
            <td style="text-align:right;">${cp.entryPrice.toFixed(4)}</td>
            <td style="text-align:right;">${(cp.exitPrice || 0).toFixed(4)}</td>
            <td style="text-align:right;color:#F6465D;">${(cp.commissionUsdt || 0).toFixed(4)}</td>
            <td style="text-align:right;font-weight:bold;color:${pnlColor};">${rPnl >= 0 ? '+' : ''}${rPnl.toFixed(2)}</td>
            <td style="text-align:right;font-weight:bold;color:${pnlColor};">${roiPct >= 0 ? '+' : ''}${roiPct.toFixed(2)}%</td>
            <td style="text-align:right;color:${pnlColor};">${capitalPct >= 0 ? '+' : ''}${capitalPct.toFixed(2)}%</td>
            <td style="text-align:center;font-weight:bold;color:${pnlColor};">${statusText}</td>
            <td>${adjustmentsSummary || 'دخول وخروج مباشر'}</td>
          </tr>`;
      })
      .join('');

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>سجل الصفقات المغلقة</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayRightToLeft/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body, table { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 12px; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 18px; }
          th { background-color: #01BC8D; color: #0B0E11; font-weight: bold; padding: 8px; border: 1px solid #232E3A; }
          td { padding: 6px 8px; border: 1px solid #D1D5DB; }
          tfoot td { background-color: #12171D; color: #FFFFFF; font-weight: bold; padding: 8px; border: 1px solid #232E3A; }
          .report-header { background-color: #12171D; color: #FFFFFF; padding: 14px; border-radius: 8px; margin-bottom: 14px; border: 1px solid #232E3A; }
          .report-title { font-size: 16px; font-weight: bold; color: #01BC8D; margin-bottom: 6px; }
          .report-meta { font-size: 12px; color: #E5E7EB; line-height: 1.6; }
          .section-title { font-size: 14px; font-weight: bold; color: #0B0E11; background-color: #E6F9F4; padding: 8px 10px; border-right: 4px solid #01BC8D; margin: 14px 0 8px 0; }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div class="report-title">تقرير سجل الصفقات المغلقة الشامل — ${activeAccountName}</div>
          <div class="report-meta">
            <strong>تاريخ التصدير:</strong> ${nowDateStr} |
            <strong>وضع التداول:</strong> ${settings.mode === 'REAL' ? 'حقيقي (REAL)' : 'افتراضي (VIRTUAL)'} |
            <strong>رأس المال الأولي:</strong> ${initialBal.toFixed(2)} USDT |
            <strong>إجمالي الصفقات المغلقة:</strong> ${closedPositions.length} صفقة (رابحة: ${winningClosedCount} • خاسرة: ${losingClosedCount} • نسبة النجاح: ${winRateClosedPct.toFixed(1)}%) |
            <strong>متوسط مدة الصفقة:</strong> ${avgDurationFormatted.textAr} (${avgDurationFormatted.hhmmss}) |
            <strong>صافي الأرباح المحققة:</strong> ${totalRealizedPnl >= 0 ? '+' : ''}${totalRealizedPnl.toFixed(2)} USDT (${overallProfitPctOnMargin >= 0 ? '+' : ''}${overallProfitPctOnMargin.toFixed(2)}% من الهامش • ${overallProfitPctOnCapital >= 0 ? '+' : ''}${overallProfitPctOnCapital.toFixed(2)}% من رأس المال الأولي)
          </div>
        </div>

        <div class="section-title">1. جدول سجل الصفقات المغلقة التفصيلي (شامل المتداول المنسوخ، نسبة الربح المحققة، والمدة الزمنية)</div>
        <table dir="rtl">
          <thead>
            <tr>
              <th>#</th>
              <th>الحساب</th>
              <th>الزوج (Symbol)</th>
              <th>الاتجاه</th>
              <th>الرافعة</th>
              <th>اسم المتداول المنسوخ</th>
              <th>مصدر الصفقة</th>
              <th>قيمة الصفقة (USDT)</th>
              <th>تاريخ ووقت الدخول</th>
              <th>تاريخ ووقت الخروج</th>
              <th>المدة الزمنية لاستمرار الصفقة</th>
              <th>المدة (HH:MM:SS)</th>
              <th>سعر الدخول (USDT)</th>
              <th>سعر الخروج (USDT)</th>
              <th>العمولة (USDT)</th>
              <th>الأرباح المحققة (USDT)</th>
              <th>نسبة الربح المحققة من الصفقة (%)</th>
              <th>الأثر على رأس المال الأولي (%)</th>
              <th>حالة الصفقة</th>
              <th>سجل التدعيم والانسحاب</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="7" style="text-align:right;">الإجمالي العام (${closedPositions.length} صفقة مغلقة • رابحة: ${winningClosedCount} • خاسرة: ${losingClosedCount})</td>
              <td style="text-align:right;">${totalMargin.toFixed(2)} USDT</td>
              <td colspan="2" style="text-align:center;">متوسط المدة الزمنية:</td>
              <td style="text-align:center;color:#01BC8D;">${avgDurationFormatted.textAr}</td>
              <td style="text-align:center;font-family:monospace;">${avgDurationFormatted.hhmmss}</td>
              <td colspan="2"></td>
              <td style="text-align:right;color:#F6465D;">${totalCommission.toFixed(4)} USDT</td>
              <td style="text-align:right;color:${totalRealizedPnl >= 0 ? '#01BC8D' : '#F6465D'};">${totalRealizedPnl >= 0 ? '+' : ''}${totalRealizedPnl.toFixed(2)} USDT</td>
              <td style="text-align:right;color:${overallProfitPctOnMargin >= 0 ? '#01BC8D' : '#F6465D'};">${overallProfitPctOnMargin >= 0 ? '+' : ''}${overallProfitPctOnMargin.toFixed(2)}%</td>
              <td style="text-align:right;color:${overallProfitPctOnCapital >= 0 ? '#01BC8D' : '#F6465D'};">${overallProfitPctOnCapital >= 0 ? '+' : ''}${overallProfitPctOnCapital.toFixed(2)}%</td>
              <td style="text-align:center;color:${totalRealizedPnl >= 0 ? '#01BC8D' : '#F6465D'};">نسبة النجاح: ${winRateClosedPct.toFixed(1)}%</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div class="section-title">2. ملخص أداء المتداولين المنسوخين في الصفقات المغلقة</div>
        <table dir="rtl">
          <thead>
            <tr>
              <th>#</th>
              <th>اسم المتداول المنسوخ</th>
              <th>مصدر النسخ</th>
              <th>عدد الصفقات المغلقة</th>
              <th>الصفقات الرابحة</th>
              <th>الصفقات الخاسرة</th>
              <th>نسبة النجاح (Win Rate)</th>
              <th>متوسط المدة الزمنية للصفقة</th>
              <th>إجمالي قيمة الصفقات (USDT)</th>
              <th>صافي الأرباح المحققة (USDT)</th>
              <th>متوسط نسبة الربح المحققة (%)</th>
            </tr>
          </thead>
          <tbody>
            ${traderSummaryRowsHtml}
          </tbody>
        </table>
      </body>
      </html>`;

    triggerFileDownload(
      '\uFEFF' + excelHtml,
      `KuCoin_Closed_Trades_${nowDateStr}.xls`,
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const isRealMode = settings.mode === 'REAL';

  // إحصائيات مخصصة حصرياً لسجل الصفقات المغلقة (Closed Trades Dashboard Widget Stats)
  const closedTradesStats = useMemo(() => {
    const totalClosed = closedPositions.length;
    const winningTrades = closedPositions.filter((cp) => (cp.realizedPnl || 0) > 0).length;
    const losingTrades = closedPositions.filter((cp) => (cp.realizedPnl || 0) < 0).length;
    const winRatePct = totalClosed > 0 ? (winningTrades / totalClosed) * 100 : 0;
    const lossRatePct = totalClosed > 0 ? (losingTrades / totalClosed) * 100 : 0;

    const totalRealizedPnlUsdt = closedPositions.reduce(
      (sum, cp) => sum + (cp.realizedPnl || 0),
      0
    );
    const totalClosedMarginUsdt = closedPositions.reduce(
      (sum, cp) => sum + (cp.marginUsdt || settings.tradeValueUsdt),
      0
    );
    const initialBal = Math.max(1, paperSnapshot.initialBalance || 1000);

    // إجمالي الربح/الخسارة كنسبة مئوية من الرصيد الابتدائي ومن إجمالي الهامش المغلق
    const pnlPercentOfBalance = (totalRealizedPnlUsdt / initialBal) * 100;
    const pnlPercentOfMargin =
      totalClosedMarginUsdt > 0 ? (totalRealizedPnlUsdt / totalClosedMarginUsdt) * 100 : 0;

    const grossProfitUsdt = closedPositions
      .filter((cp) => (cp.realizedPnl || 0) > 0)
      .reduce((sum, cp) => sum + (cp.realizedPnl || 0), 0);

    const grossLossUsdt = Math.abs(
      closedPositions
        .filter((cp) => (cp.realizedPnl || 0) < 0)
        .reduce((sum, cp) => sum + (cp.realizedPnl || 0), 0)
    );

    const avgWinUsdt = winningTrades > 0 ? grossProfitUsdt / winningTrades : 0;
    const avgLossUsdt = losingTrades > 0 ? grossLossUsdt / losingTrades : 0;
    const profitFactor =
      grossLossUsdt > 0
        ? grossProfitUsdt / grossLossUsdt
        : grossProfitUsdt > 0
        ? grossProfitUsdt
        : 0;

    return {
      totalClosed,
      winningTrades,
      losingTrades,
      winRatePct,
      lossRatePct,
      totalRealizedPnlUsdt,
      totalClosedMarginUsdt,
      pnlPercentOfBalance,
      pnlPercentOfMargin,
      grossProfitUsdt,
      grossLossUsdt,
      avgWinUsdt,
      avgLossUsdt,
      profitFactor,
    };
  }, [closedPositions, paperSnapshot.initialBalance, settings.tradeValueUsdt]);

  // احتساب الأرباح التراكمية اليومية لآخر 30 يوماً بواسطة Recharts (Daily Cumulative PnL over the last 30 days)
  const dailyCumulativePnl30Days = useMemo(() => {
    const now = new Date();
    const days: {
      date: string;
      label: string;
      fullDate: string;
      dailyPnl: number;
      cumulativePnl: number;
      tradesCount: number;
      roiPercent: number;
    }[] = [];

    const initialBal = Math.max(1, paperSnapshot.initialBalance || 1000);
    const msPerDay = 24 * 60 * 60 * 1000;

    // خريطة لتجميع أرباح/خسائر الصفقات المغلقة حسب التاريخ بتوقيت اليوم (YYYY-MM-DD)
    const closedByDay = new Map<string, { pnl: number; count: number }>();
    closedPositions.forEach((cp) => {
      const ts = cp.closeTime || cp.openTime || Date.now();
      const dateKey = new Date(ts).toISOString().slice(0, 10);
      const curr = closedByDay.get(dateKey) || { pnl: 0, count: 0 };
      curr.pnl += (cp.realizedPnl || 0);
      curr.count += 1;
      closedByDay.set(dateKey, curr);
    });

    // إنشاء مصفوفة متسلسلة لـ 30 يوماً من اليوم-29 حتى اليوم الحالي
    let runningCumulative = 0;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * msPerDay);
      const dateKey = d.toISOString().slice(0, 10);
      const monthDayLabel = `${d.getMonth() + 1}/${d.getDate()}`;
      const dayData = closedByDay.get(dateKey) || { pnl: 0, count: 0 };

      const dayPnl = Number(dayData.pnl.toFixed(2));
      runningCumulative += dayPnl;
      const roundedCum = Number(runningCumulative.toFixed(2));
      const roiPercent = Number(((roundedCum / initialBal) * 100).toFixed(2));

      days.push({
        date: dateKey,
        label: monthDayLabel,
        fullDate: formatDateWestern(d),
        dailyPnl: dayPnl,
        cumulativePnl: roundedCum,
        tradesCount: dayData.count,
        roiPercent,
      });
    }

    const total30dCumulativePnl = Number(runningCumulative.toFixed(2));
    const roi30dPercent = Number(((total30dCumulativePnl / initialBal) * 100).toFixed(2));
    const bestDay = Number(Math.max(...days.map((d) => d.dailyPnl)).toFixed(2));
    const worstDay = Number(Math.min(...days.map((d) => d.dailyPnl)).toFixed(2));
    const activeDaysCount = days.filter((d) => d.tradesCount > 0).length;
    const profitableDaysCount = days.filter((d) => d.dailyPnl > 0).length;
    const losingDaysCount = days.filter((d) => d.dailyPnl < 0).length;

    return {
      data: days,
      total30dCumulativePnl,
      roi30dPercent,
      bestDay,
      worstDay,
      activeDaysCount,
      profitableDaysCount,
      losingDaysCount,
      strokeColor: total30dCumulativePnl >= 0 ? '#01BC8D' : '#F6465D',
    };
  }, [closedPositions, paperSnapshot.initialBalance]);

  // تصدير بيانات الأرباح التراكمية اليومية لآخر 30 يوماً إلى ملف Excel أو CSV
  const handleExport30DaysPnlData = (format: 'XLS' | 'CSV') => {
    if (!dailyCumulativePnl30Days || dailyCumulativePnl30Days.data.length === 0) return;

    const nowDateStr = new Date().toISOString().slice(0, 10);
    const initialBal = Math.max(1, paperSnapshot.initialBalance || 1000);

    if (format === 'CSV') {
      const csvHeader = [
        'التاريخ (Date)',
        'اليوم (Day)',
        'الصفقات المغلقة (Closed Trades)',
        'صافي ربح/خسارة اليوم (Daily PnL USDT)',
        'الربح التراكمي (Cumulative PnL USDT)',
        'العائد التراكمي ROI (%)',
        'حالة اليوم (Status)',
      ].join(',');

      const csvRows = dailyCumulativePnl30Days.data.map((day) => {
        const dayDate = new Date(day.date);
        const dayName = formatWeekdayWestern(dayDate);
        const status =
          day.dailyPnl > 0 ? 'يوم رابح' : day.dailyPnl < 0 ? 'يوم خاسر' : 'بدون صفقات';
        return [
          `"${day.date}"`,
          `"${dayName}"`,
          day.tradesCount,
          day.dailyPnl >= 0 ? `+${day.dailyPnl.toFixed(2)}` : day.dailyPnl.toFixed(2),
          day.cumulativePnl >= 0 ? `+${day.cumulativePnl.toFixed(2)}` : day.cumulativePnl.toFixed(2),
          `"${day.roiPercent >= 0 ? '+' : ''}${day.roiPercent.toFixed(2)}%"`,
          `"${status}"`,
        ].join(',');
      });

      const csvContent = '\uFEFF' + [csvHeader, ...csvRows].join('\r\n');
      triggerFileDownload(
        csvContent,
        `KuCoin_30D_Cumulative_PnL_${nowDateStr}.csv`,
        'text/csv;charset=utf-8;'
      );
      return;
    }

    // تنسيق ملف Excel (.xls) منسق ومصمم بالكامل
    const rowsHtml = dailyCumulativePnl30Days.data
      .map((day, idx) => {
        const dayDate = new Date(day.date);
        const dayName = formatWeekdayWestern(dayDate);
        const isProfit = day.cumulativePnl >= 0;
        const cumColor = isProfit ? '#01BC8D' : '#F6465D';
        const dailyColor =
          day.dailyPnl > 0 ? '#01BC8D' : day.dailyPnl < 0 ? '#F6465D' : '#8A99AD';
        const statusText =
          day.dailyPnl > 0 ? 'يوم رابح' : day.dailyPnl < 0 ? 'يوم خاسر' : 'بدون صفقات';
        const statusBg =
          day.dailyPnl > 0 ? '#E6F9F4' : day.dailyPnl < 0 ? '#FEECEE' : '#F3F4F6';

        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td style="text-align:center;font-weight:bold;">${day.date}</td>
            <td style="text-align:center;">${dayName}</td>
            <td style="text-align:center;">${day.tradesCount}</td>
            <td style="text-align:right;font-weight:bold;color:${dailyColor};">${day.dailyPnl >= 0 ? '+' : ''}${day.dailyPnl.toFixed(2)}</td>
            <td style="text-align:right;font-weight:bold;color:${cumColor};">${day.cumulativePnl >= 0 ? '+' : ''}${day.cumulativePnl.toFixed(2)}</td>
            <td style="text-align:right;font-weight:bold;color:${cumColor};">${day.roiPercent >= 0 ? '+' : ''}${day.roiPercent.toFixed(2)}%</td>
            <td style="text-align:center;background-color:${statusBg};font-weight:bold;color:${dailyColor};">${statusText}</td>
          </tr>`;
      })
      .join('');

    const totalTradesCount = dailyCumulativePnl30Days.data.reduce((s, d) => s + d.tradesCount, 0);

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>الأرباح التراكمية 30 يوم</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayRightToLeft/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body, table { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 12px; }
          table { border-collapse: collapse; width: 100%; margin-top: 10px; }
          th { background-color: #01BC8D; color: #0B0E11; font-weight: bold; padding: 8px; border: 1px solid #232E3A; }
          td { padding: 6px 8px; border: 1px solid #D1D5DB; }
          tfoot td { background-color: #12171D; color: #FFFFFF; font-weight: bold; padding: 8px; border: 1px solid #232E3A; }
          .report-header { background-color: #12171D; color: #FFFFFF; padding: 14px; border-radius: 8px; margin-bottom: 12px; }
          .report-title { font-size: 16px; font-weight: bold; color: #01BC8D; }
          .report-meta { font-size: 11px; color: #8A99AD; margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div class="report-title">تقرير الأرباح التراكمية اليومية لآخر 30 يوماً — KuCoin Smart Simulator</div>
          <div class="report-meta">
            <strong>تاريخ التصدير:</strong> ${nowDateStr} | 
            <strong>رصيد المحفظة المرجعي:</strong> ${initialBal.toFixed(2)} USDT | 
            <strong>إجمالي الأرباح لـ 30 يوماً:</strong> ${dailyCumulativePnl30Days.total30dCumulativePnl >= 0 ? '+' : ''}${dailyCumulativePnl30Days.total30dCumulativePnl.toFixed(2)} USDT (${dailyCumulativePnl30Days.roi30dPercent >= 0 ? '+' : ''}${dailyCumulativePnl30Days.roi30dPercent.toFixed(2)}%) | 
            <strong>أفضل يوم:</strong> +${dailyCumulativePnl30Days.bestDay}$ | 
            <strong>أسوأ يوم:</strong> ${dailyCumulativePnl30Days.worstDay}$ | 
            <strong>أيام التداول النشطة:</strong> ${dailyCumulativePnl30Days.activeDaysCount} من 30 يوم
          </div>
        </div>
        <table dir="rtl">
          <thead>
            <tr>
              <th>#</th>
              <th>التاريخ (YYYY-MM-DD)</th>
              <th>اليوم</th>
              <th>الصفقات المغلقة</th>
              <th>صافي ربح/خسارة اليوم (USDT)</th>
              <th>الربح التراكمي (USDT)</th>
              <th>العائد التراكمي ROI (%)</th>
              <th>حالة اليوم</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right;">الإجمالي النهائي لـ 30 يوماً</td>
              <td style="text-align:center;">${totalTradesCount} صفقة</td>
              <td style="text-align:right;color:${dailyCumulativePnl30Days.total30dCumulativePnl >= 0 ? '#01BC8D' : '#F6465D'};">
                ${dailyCumulativePnl30Days.total30dCumulativePnl >= 0 ? '+' : ''}${dailyCumulativePnl30Days.total30dCumulativePnl.toFixed(2)} USDT
              </td>
              <td style="text-align:right;color:${dailyCumulativePnl30Days.total30dCumulativePnl >= 0 ? '#01BC8D' : '#F6465D'};">
                ${dailyCumulativePnl30Days.total30dCumulativePnl >= 0 ? '+' : ''}${dailyCumulativePnl30Days.total30dCumulativePnl.toFixed(2)} USDT
              </td>
              <td style="text-align:right;color:${dailyCumulativePnl30Days.roi30dPercent >= 0 ? '#01BC8D' : '#F6465D'};">
                ${dailyCumulativePnl30Days.roi30dPercent >= 0 ? '+' : ''}${dailyCumulativePnl30Days.roi30dPercent.toFixed(2)}%
              </td>
              <td style="text-align:center;color:#01BC8D;">
                نشط: ${dailyCumulativePnl30Days.activeDaysCount} يوم
              </td>
            </tr>
          </tfoot>
        </table>
      </body>
      </html>`;

    triggerFileDownload(
      '\uFEFF' + excelHtml,
      `KuCoin_30D_Cumulative_PnL_${nowDateStr}.xls`,
      'application/vnd.ms-excel;charset=utf-8;'
    );
  };

  const winLossPieData =
    portfolioStats.winningCount + portfolioStats.losingCount > 0
      ? [
          { name: 'صفقات رابحة', value: portfolioStats.winningCount, color: '#01BC8D' },
          { name: 'صفقات خاسرة', value: portfolioStats.losingCount, color: '#F6465D' },
        ]
      : [{ name: 'بانتظار الصفقات', value: 1, color: '#232E3A' }];

  const pnlComparisonBarData = [
    {
      label: 'إجمالي الأرباح',
      amount: Number(portfolioStats.grossProfit.toFixed(2)),
      color: '#01BC8D',
    },
    {
      label: 'إجمالي الخسائر',
      amount: Number(portfolioStats.grossLoss.toFixed(2)),
      color: '#F6465D',
    },
  ];

  return (
    <div className="space-y-3.5 animate-in fade-in duration-200">
      {/* Unified KuCoin Futures Compact Account Header */}
      <div className="bg-[#12161C] border border-[#1C232D] rounded-xl overflow-hidden">
        {/* Top Row: Title + Compact Segmented Mode Switcher */}
        <div className="px-3.5 py-3 flex items-center justify-between gap-2.5 flex-wrap border-b border-[#1C232D]">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
              العقود الآجلة
            </h2>
            <span
              data-testid="trading_mode_badge"
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                isRealMode
                  ? 'bg-[#01BC8D]/15 text-[#01BC8D]'
                  : 'bg-[#1A2029] text-[#848E9C]'
              }`}
            >
              {isRealMode ? 'حقيقي · KuCoin' : 'افتراضي'}
            </span>
          </div>

          {/* Inline Compact Mode Switcher */}
          <div className="inline-flex items-center bg-[#0B0E11] p-0.5 rounded-lg border border-[#1C232D] shrink-0">
            <button
              type="button"
              onClick={() => handleModeSwitch('VIRTUAL')}
              data-testid="mode_switch_virtual"
              className={`px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                !isRealMode
                  ? 'bg-[#01BC8D] text-[#0B0E11]'
                  : 'text-[#848E9C] hover:text-white'
              }`}
            >
              <Wallet className="w-3.5 h-3.5 shrink-0" />
              <span>افتراضي</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch('REAL')}
              data-testid="mode_switch_real"
              className={`px-3 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                isRealMode
                  ? 'bg-[#01BC8D] text-[#0B0E11]'
                  : 'text-[#848E9C] hover:text-white'
              }`}
            >
              {securityConfig.enabled &&
              securityConfig.protectRealTradingSwitch &&
              !isSecurityUnlocked ? (
                <Lock className="w-3.5 h-3.5 shrink-0 text-[#01BC8D]" />
              ) : (
                <Zap className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>حقيقي</span>
            </button>
          </div>
        </div>

        {/* Security Lock Gate Modal/Panel when switching to Real KuCoin Execution */}
        {(isPromptingRealModeUnlock ||
          (isRealMode &&
            securityConfig.enabled &&
            securityConfig.protectRealTradingSwitch &&
            !isSecurityUnlocked)) && (
          <div className="p-3.5 border-b border-[#1C232D]">
            <KuCoinSecurityLockScreen
              config={securityConfig}
              titleAr="تأكيد التبديل إلى التداول الحقيقي (KuCoin)"
              subtitleAr="أدخل رمز القفل الرقمي (PIN) لحماية محفظتك الحقيقية قبل تفعيل التنفيذ المباشر."
              onUnlockSuccess={(method, credId) => {
                if (onUnlockSecurity) {
                  onUnlockSecurity(method, credId);
                }
                setIsPromptingRealModeUnlock(false);
                onUpdateTradeSettings({ mode: 'REAL' }, activeAccountId, false);
              }}
              onCancelOrFallback={() => {
                setIsPromptingRealModeUnlock(false);
                if (isRealMode) {
                  onUpdateTradeSettings({ mode: 'VIRTUAL' }, activeAccountId, false);
                }
              }}
              cancelLabelAr="العودة للافتراضي"
            />
          </div>
        )}

        {/* Quick Lock Real Mode Bar & Real Status Notice */}
        {isRealMode && (
          <div className="px-3.5 py-2 bg-[#0D2B24]/50 border-b border-[#1C232D] flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-[#01BC8D] min-w-0">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {kucoinConnectionState.isAuthenticated
                  ? `متصل بـ KuCoin · المتاح ${kucoinConnectionState.availableUsdt.toFixed(2)} USDT`
                  : 'وضع التنفيذ الحقيقي — تأكد من ربط مفاتيح KuCoin API'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {securityConfig.enabled && isSecurityUnlocked && onLockSecurityNow && (
                <button
                  type="button"
                  onClick={() => {
                    onLockSecurityNow();
                    onUpdateTradeSettings({ mode: 'VIRTUAL' }, activeAccountId, false);
                  }}
                  data-testid="simulation_lock_real_wallet_btn"
                  className="text-[11px] bg-[#161B22] hover:bg-[#1E2530] text-white border border-[#1C232D] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Lock className="w-3 h-3 text-[#01BC8D]" />
                  <span>قفل</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigateToTab('KuCoinAPI')}
                className="bg-[#01BC8D] text-[#0B0E11] font-bold px-2.5 py-1 rounded-md text-[11px] cursor-pointer whitespace-nowrap"
              >
                إعدادات KuCoin
              </button>
            </div>
          </div>
        )}

        {/* Active Account Chips + Compact 3-Column KPI Hairline Strip (on ACTIVE tab) */}
        {simSubTab === 'ACTIVE' && (
          <div className="border-b border-[#1C232D]">
            {!isRealMode && accounts.length > 0 && (
              <div className="px-3.5 py-2 flex items-center justify-between gap-2 border-b border-[#1C232D]/70 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1.5 shrink-0">
                  {accounts.map((acc) => {
                    const isSelected = acc.id === activeAccountId;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => onSelectAccount && onSelectAccount(acc.id)}
                        className={`text-[11px] px-2 py-1 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          isSelected
                            ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40'
                            : 'bg-[#0B0E11] text-[#848E9C] hover:text-white border border-[#1C232D]'
                        }`}
                      >
                        {acc.name}{' '}
                        <span dir="ltr" className="font-mono tabular-nums opacity-85">
                          {acc.settings.tradeValueUsdt}$×{acc.settings.leverage}x
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBalanceInput(String(paperSnapshot.initialBalance));
                    setIsEditingBalance(!isEditingBalance);
                  }}
                  data-testid="edit_virtual_balance_btn"
                  className="text-[11px] text-[#01BC8D] hover:text-[#00D49F] flex items-center gap-1 font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isEditingBalance ? 'إغلاق' : 'تعديل الرصيد'}</span>
                </button>
              </div>
            )}

            {/* 3-Column Hairline KPI Strip */}
            <div className="grid grid-cols-3 divide-x divide-x-reverse divide-[#1C232D]">
              <div className="px-3 py-2.5">
                <span className="text-[10px] text-[#848E9C] block">المتاح (USDT)</span>
                <span
                  dir="ltr"
                  className="inline-block text-sm sm:text-base font-bold text-white font-mono tabular-nums mt-0.5"
                >
                  {isRealMode
                    ? kucoinConnectionState.availableUsdt.toFixed(2)
                    : paperSnapshot.availableBalance.toFixed(2)}
                </span>
                <span className="block text-[10px] text-[#848E9C] font-mono tabular-nums mt-0.5">
                  الإجمالي:{' '}
                  <span dir="ltr" className="inline-block text-[#EAECEF]">
                    ${paperSnapshot.totalEquity.toFixed(2)}
                  </span>
                </span>
              </div>

              <div className="px-3 py-2.5">
                <span className="text-[10px] text-[#848E9C] block">الربح غير المحقق</span>
                <span
                  dir="ltr"
                  className={`inline-block text-sm sm:text-base font-bold font-mono tabular-nums mt-0.5 ${
                    paperSnapshot.unrealizedPnl >= 0 ? 'text-[#01BC8D]' : 'text-[#F65454]'
                  }`}
                >
                  {paperSnapshot.unrealizedPnl >= 0 ? '+$' : '-$'}
                  {Math.abs(paperSnapshot.unrealizedPnl).toFixed(2)}
                </span>
                <span className="block text-[10px] text-[#848E9C] font-mono tabular-nums mt-0.5">
                  عمولات:{' '}
                  <span dir="ltr" className="inline-block">
                    ${paperSnapshot.totalCommissionsPaid.toFixed(2)}
                  </span>
                </span>
              </div>

              <div className="px-3 py-2.5">
                <span className="text-[10px] text-[#848E9C] block">المراكز المفتوحة</span>
                <div className="flex items-baseline gap-1 mt-0.5 font-mono tabular-nums">
                  <span dir="ltr" className="text-sm sm:text-base font-bold text-white">
                    {openPositions.length}
                  </span>
                  <span dir="ltr" className="text-[11px] text-[#848E9C]">
                    /{settings.maxConcurrentTrades}
                  </span>
                </div>
                <span className="block text-[10px] text-[#01BC8D] mt-0.5">
                  {copiedTraders.length} متداول منسوخ
                </span>
              </div>
            </div>

            {/* Inline Virtual Balance Editor */}
            {!isRealMode && isEditingBalance && (
              <div className="px-3.5 py-3 bg-[#0B0E11] border-t border-[#1C232D] space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    min="10"
                    max="10000000"
                    step="any"
                    dir="ltr"
                    value={balanceInput}
                    onChange={(e) => setBalanceInput(e.target.value)}
                    data-testid="virtual_balance_input"
                    placeholder="الرصيد بـ USDT"
                    className="flex-1 min-w-[120px] bg-[#12161C] border border-[#01BC8D]/60 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyVirtualBalance(false)}
                    className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer whitespace-nowrap"
                  >
                    تطبيق
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyVirtualBalance(true)}
                    className="bg-[#161B22] hover:bg-[#1E2530] text-[#01BC8D] border border-[#01BC8D]/40 font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer whitespace-nowrap"
                    title="تعيين الرصيد مع تصفير الصفقات السابقة"
                  >
                    تصفير وضبط
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[100, 500, 1000, 5000, 10000, 50000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setBalanceInput(String(preset));
                        onSetVirtualBalance(preset, false);
                        setIsEditingBalance(false);
                      }}
                      className="text-[10px] bg-[#12161C] hover:bg-[#01BC8D] hover:text-[#0B0E11] text-[#848E9C] border border-[#1C232D] px-2 py-0.5 rounded font-mono cursor-pointer transition-colors"
                    >
                      ${preset.toLocaleString('en-US')}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Zero-Truncation KuCoin 3-Tab Underline Bar */}
        <div
          data-testid="simulation_subtabs_bar"
          className="grid grid-cols-3 bg-[#12161C]"
        >
          <button
            type="button"
            data-testid="sim_subtab_active"
            onClick={() => setSimSubTab('ACTIVE')}
            className={`py-2.5 px-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              simSubTab === 'ACTIVE'
                ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                : 'border-transparent text-[#848E9C] hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>المراكز</span>
            <span
              dir="ltr"
              className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                simSubTab === 'ACTIVE'
                  ? 'bg-[#01BC8D]/15 text-[#01BC8D]'
                  : 'bg-[#1A2029] text-[#848E9C]'
              }`}
            >
              {openPositions.length}
            </span>
          </button>

          <button
            type="button"
            data-testid="sim_subtab_accounts_settings"
            onClick={() => setSimSubTab('ACCOUNTS_SETTINGS')}
            className={`py-2.5 px-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              simSubTab === 'ACCOUNTS_SETTINGS'
                ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                : 'border-transparent text-[#848E9C] hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 shrink-0" />
            <span>الإعدادات</span>
            <span
              dir="ltr"
              className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                simSubTab === 'ACCOUNTS_SETTINGS'
                  ? 'bg-[#01BC8D]/15 text-[#01BC8D]'
                  : 'bg-[#1A2029] text-[#848E9C]'
              }`}
            >
              {accounts.length}
            </span>
          </button>

          <button
            type="button"
            data-testid="sim_subtab_stats_history"
            onClick={() => setSimSubTab('STATS_HISTORY')}
            className={`py-2.5 px-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
              simSubTab === 'STATS_HISTORY'
                ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                : 'border-transparent text-[#848E9C] hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
            <span>السجل</span>
            <span
              dir="ltr"
              className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                simSubTab === 'STATS_HISTORY'
                  ? 'bg-[#01BC8D]/15 text-[#01BC8D]'
                  : 'bg-[#1A2029] text-[#848E9C]'
              }`}
            >
              {closedPositions.length}
            </span>
          </button>
        </div>
      </div>

      {/* Multi-Account Virtual Trading Bar (Inside ACCOUNTS_SETTINGS tab) */}
      {simSubTab === 'ACCOUNTS_SETTINGS' && !isRealMode && (
        <div
          data-testid="virtual_multi_accounts_bar"
          className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Wallet className="w-4 h-4 text-[#01BC8D] shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-white">
                الحسابات الافتراضية المفتوحة ({accounts.length})
              </span>
              <span className="text-[11px] bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40 px-2 py-0.5 rounded-lg font-bold">
                الحساب النشط: {activeAccountName}
              </span>
            </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmingWipeAll(!isConfirmingWipeAll);
                    setIsRenamingAccount(false);
                    setIsCreatingAccount(false);
                  }}
                  data-testid="open_clear_all_data_panel_btn"
                  className="text-[11px] bg-[#2B1216] hover:bg-[#F6465D]/25 text-[#F6465D] border border-[#F6465D]/40 px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-bold cursor-pointer transition-colors"
                  title="مسح كل البيانات وتصفيرها (مسح كل العمليات والصفقات السابقة)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>مسح كل البيانات وتصفيرها</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRenameAccountInput(activeAccountName);
                    setIsRenamingAccount(!isRenamingAccount);
                    setIsCreatingAccount(false);
                    setIsConfirmingWipeAll(false);
                  }}
                  data-testid="rename_virtual_account_btn"
                  className="text-[11px] bg-[#1A222B] hover:bg-[#232E3A] text-white border border-[#232E3A] px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-semibold cursor-pointer transition-colors"
                >
                  <Edit3 className="w-3 h-3 text-[#01BC8D]" />
                  <span>تسمية / تعديل الاسم</span>
                </button>

                {accounts.length > 1 && onDeleteAccount && (
                  <button
                    type="button"
                    onClick={() => onDeleteAccount(activeAccountId)}
                    data-testid="delete_virtual_account_btn"
                    className="text-[11px] bg-[#2B1216] hover:bg-[#F6465D]/30 text-[#F6465D] border border-[#F6465D]/40 px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-semibold cursor-pointer transition-colors"
                    title="حذف هذا الحساب الافتراضي"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>حذف الحساب</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setNewAccountName(`حساب افتراضي ${accounts.length + 1}`);
                    setNewAccountBalance(String(settings.virtualInitialBalance || 1000));
                    setIsCreatingAccount(!isCreatingAccount);
                    setIsRenamingAccount(false);
                    setIsConfirmingWipeAll(false);
                  }}
                  data-testid="create_virtual_account_btn"
                  className="text-[11px] bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold cursor-pointer shadow-sm transition-colors"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>فتح حساب افتراضي جديد</span>
                </button>
              </div>
            </div>

            {wipeSuccessMsg && (
              <div
                data-testid="wipe_data_success_banner"
                className="bg-[#0D2B24] border border-[#01BC8D]/50 rounded-xl p-3 flex items-center justify-between gap-2 text-xs text-[#01BC8D]"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-bold">{wipeSuccessMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setWipeSuccessMsg(null)}
                  className="text-[11px] text-[#8A99AD] hover:text-white cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            )}

            {/* Inline Clear All Data & Reset Panel (مسح كل البيانات وتصفيرها - مسح كل العمليات والصفقات السابقة) */}
            {isConfirmingWipeAll && (
              <div
                data-testid="clear_all_data_confirmation_panel"
                className="bg-[#1A1115] border border-[#F6465D]/60 rounded-xl p-3.5 space-y-3 shadow-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#F6465D] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white">
                        مسح كل البيانات وتصفير التداول الافتراضي (مسح كل العمليات والصفقات السابقة)
                      </h4>
                      <p className="text-[11px] text-[#8A99AD] mt-0.5 leading-relaxed">
                        اختر نوع التصفير المطلوب. سيتم مسح الصفقات المفتوحة والمغلقة وسجل عمليات التدعيم والانسحاب الجزئي والعمولات وإعادة الرصيد المتاح إلى رأس المال الأولي مع <strong className="text-[#01BC8D]">الحفاظ التام على إعدادات الصفقات المحفوظة</strong>:
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingWipeAll(false)}
                    className="text-[11px] text-[#8A99AD] hover:text-white cursor-pointer shrink-0"
                  >
                    إلغاء
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleExecuteWipeAll({
                        scope: 'ALL_ACCOUNTS',
                        removeExtraAccounts: false,
                        clearCopiedTraders: false,
                      })
                    }
                    data-testid="confirm_wipe_all_trades_btn"
                    className="bg-[#F6465D] hover:bg-[#D9384E] text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span>مسح كل العمليات والصفقات السابقة وتصفير البيانات</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleExecuteWipeAll({
                        scope: 'ACTIVE_ACCOUNT',
                        removeExtraAccounts: false,
                        clearCopiedTraders: false,
                      })
                    }
                    data-testid="confirm_wipe_active_account_only_btn"
                    className="bg-[#2B1216] hover:bg-[#F6465D]/30 text-[#F6465D] border border-[#F6465D]/50 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>تصفير صفقات الحساب الحالي فقط («{activeAccountName}»)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleExecuteWipeAll({
                        scope: 'ALL_ACCOUNTS',
                        removeExtraAccounts: true,
                        clearCopiedTraders: true,
                      })
                    }
                    data-testid="confirm_wipe_everything_with_traders_btn"
                    className="bg-[#12171D] hover:bg-[#232E3A] text-[#8A99AD] hover:text-white border border-[#232E3A] font-semibold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>تصفير شامل + إلغاء نسخ جميع المتداولين</span>
                  </button>
                </div>
              </div>
            )}

            {/* Inline Rename Active Account Form */}
            {isRenamingAccount && onRenameAccount && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (renameAccountInput.trim()) {
                    onRenameAccount(activeAccountId, renameAccountInput.trim());
                    setIsRenamingAccount(false);
                  }
                }}
                className="bg-[#12171D] border border-[#01BC8D]/50 rounded-xl p-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <span className="text-[11px] text-[#01BC8D] font-bold shrink-0">
                  الاسم الجديد للحساب الحالي:
                </span>
                <input
                  type="text"
                  value={renameAccountInput}
                  onChange={(e) => setRenameAccountInput(e.target.value)}
                  placeholder="أدخل اسم الحساب..."
                  className="flex-1 bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                  required
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="submit"
                    className="bg-[#01BC8D] text-[#0B0E11] font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                  >
                    حفظ الاسم
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRenamingAccount(false)}
                    className="bg-[#1A222B] text-[#8A99AD] hover:text-white px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            )}

            {/* Inline Create New Virtual Account Form */}
            {isCreatingAccount && onCreateAccount && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newAccountName.trim() || `حساب افتراضي ${accounts.length + 1}`;
                  const bal = Math.max(10, parseFloat(newAccountBalance) || 1000);
                  onCreateAccount(name, bal);
                  setIsCreatingAccount(false);
                }}
                className="bg-[#12171D] border border-[#01BC8D] rounded-xl p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#01BC8D]">
                    فتح حساب افتراضي جديد (يعمل في نفس الوقت بنفس الإعدادات المستقلة لكل حساب):
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCreatingAccount(false)}
                    className="text-[11px] text-[#8A99AD] hover:text-white cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <label className="block text-[10px] text-[#8A99AD] mb-1">
                      تسمية الحساب الجديد:
                    </label>
                    <input
                      type="text"
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      placeholder="مثال: حساب نسخ الحيتان"
                      data-testid="new_account_name_input"
                      className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-[#8A99AD] mb-1">
                      الرصيد الافتراضي الابتدائي (USDT):
                    </label>
                    <input
                      type="number"
                      min="10"
                      step="any"
                      value={newAccountBalance}
                      onChange={(e) => setNewAccountBalance(e.target.value)}
                      data-testid="new_account_balance_input"
                      className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="confirm_create_account_btn"
                    className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2 px-4 rounded-lg text-xs cursor-pointer transition-colors"
                  >
                    إنشاء وفتح الحساب الآن
                  </button>
                </div>
              </form>
            )}

            {/* Horizontal / Grid Selector of All Virtual Accounts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {accounts.map((acc) => {
                const isSelected = acc.id === activeAccountId;
                const accCopiedCount = copiedTraders.filter(
                  (ct) => (ct.accountId || 'acc_default') === acc.id
                ).length;
                const accDrawdown =
                  acc.drawdownPercent !== undefined
                    ? acc.drawdownPercent
                    : acc.initialBalance > 0 && acc.totalEquity < acc.initialBalance
                    ? parseFloat(
                        (((acc.initialBalance - acc.totalEquity) / acc.initialBalance) * 100).toFixed(2)
                      )
                    : 0;
                const isDrawdownBreached =
                  notifyOnDrawdown && accDrawdown >= drawdownThresholdPercent;

                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => onSelectAccount && onSelectAccount(acc.id)}
                    data-testid={`switch_account_btn_${acc.id}`}
                    className={`text-right rounded-xl p-2.5 border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                      isDrawdownBreached
                        ? 'bg-[#2B1216]/90 border-[#F6465D] shadow-[0_0_14px_rgba(246,70,93,0.28)]'
                        : isSelected
                        ? 'bg-[#0D2B24] border-[#01BC8D] shadow-[0_0_12px_rgba(1,188,141,0.18)]'
                        : 'bg-[#12171D] border-[#232E3A] hover:border-[#01BC8D]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 w-full">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isDrawdownBreached
                              ? 'bg-[#F6465D] animate-pulse'
                              : isSelected
                              ? 'bg-[#01BC8D]'
                              : 'bg-[#8A99AD]/50'
                          }`}
                        />
                        <span className="font-bold text-xs text-white truncate">
                          {acc.name}
                        </span>
                        {isDrawdownBreached && (
                          <span className="text-[9px] bg-[#F6465D] text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                            تراجع <span dir="ltr" className="font-mono tabular-nums inline-block">{accDrawdown.toFixed(1)}%</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#0B0E11] text-[#01BC8D] border border-[#232E3A] shrink-0">
                        {acc.settings.tradeValueUsdt}$ × {acc.settings.leverage}x
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[#8A99AD] font-mono tabular-nums w-full pt-1 border-t border-[#232E3A]/60">
                      <span>
                        المتاح: <strong className="text-white">{acc.availableBalance.toFixed(0)}$</strong>
                      </span>
                      <span>
                        التراجع:{' '}
                        <strong
                          className={
                            accDrawdown >= drawdownThresholdPercent
                              ? 'text-[#F6465D]'
                              : accDrawdown > 0
                              ? 'text-[#F59E0B]'
                              : 'text-[#01BC8D]'
                          }
                        >
                          {accDrawdown.toFixed(1)}%
                        </strong>
                      </span>
                      <span>
                        مفتوحة: <strong className="text-[#01BC8D]">{acc.openPositionsCount}/{acc.settings.maxConcurrentTrades}</strong>
                      </span>
                      <span>
                        منسوخون: <strong className="text-white">{accCopiedCount}</strong>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Instant Drawdown Push Notification Control Bar */}
            <div
              data-testid="simulation_drawdown_alert_bar"
              className="bg-[#12171D] border border-[#232E3A] rounded-xl p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="sim_toggle_drawdown_alert"
                    checked={notifyOnDrawdown}
                    onChange={(e) =>
                      handleUpdateDrawdownNotif({ notifyOnDrawdown: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#F6465D] cursor-pointer"
                  />
                  <BellRing
                    className={`w-4 h-4 shrink-0 ${
                      notifyOnDrawdown ? 'text-[#F6465D]' : 'text-[#8A99AD]'
                    }`}
                  />
                  <span className="text-xs font-bold text-white">
                    إشعار فوري (Push Notification) عند وصول نسبة التراجع (Drawdown) في أي حساب افتراضي إلى:
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex items-center bg-[#0B0E11] border border-[#232E3A] focus-within:border-[#F6465D] rounded-lg px-2 py-1">
                  <input
                    type="number"
                    min="0.5"
                    max="95"
                    step="0.5"
                    data-testid="sim_drawdown_threshold_input"
                    value={drawdownThresholdPercent}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        handleUpdateDrawdownNotif({
                          drawdownThresholdPercent: Math.min(95, Math.max(0.5, val)),
                        });
                      }
                    }}
                    className="w-12 bg-transparent text-xs font-mono font-bold text-white focus:outline-none text-center"
                  />
                  <span className="text-[11px] font-mono font-bold text-[#F6465D]">%</span>
                </div>

                {[5, 10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    data-testid={`sim_drawdown_preset_${pct}`}
                    onClick={() => handleUpdateDrawdownNotif({ drawdownThresholdPercent: pct })}
                    className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer transition-colors ${
                      drawdownThresholdPercent === pct
                        ? 'bg-[#F6465D] text-white'
                        : 'bg-[#0B0E11] text-[#8A99AD] border border-[#232E3A] hover:text-white'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}

                <button
                  type="button"
                  data-testid="sim_test_drawdown_push_btn"
                  onClick={() => mobileNotifications.triggerTestNotification('DRAWDOWN_ALERT')}
                  className="bg-[#3A1219] hover:bg-[#F6465D]/30 text-[#F6465D] border border-[#F6465D]/40 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                  title="إرسال إشعار فوري تجريبي لتنبيه التراجع الآن"
                >
                  <Zap className="w-3.5 h-3.5 inline-block ml-1" />
                  <span>تجربة الإشعار</span>
                </button>

                {onOpenNotificationsCenter && (
                  <button
                    type="button"
                    onClick={onOpenNotificationsCenter}
                    className="bg-[#1A222B] hover:bg-[#232E3A] text-[#8A99AD] hover:text-white border border-[#1E2733] px-2 py-1 rounded-lg text-[11px] cursor-pointer"
                  >
                    سجل التنبيهات
                  </button>
                )}
              </div>
            </div>
        </div>
      )}

      {/* Balance KPIs are now unified inside the top KuCoin Futures Compact Account Header */}

      {/* Pro Analytics Panel: Equity Curve, Sharpe-like Metrics & CSV Export (Inside STATS_HISTORY tab) */}
      {simSubTab === 'STATS_HISTORY' && (
        <ProAnalyticsPanel
          positions={paperSnapshot.positions}
          initialBalance={paperSnapshot.initialBalance}
          currentEquity={paperSnapshot.totalEquity}
          accountName={activeAccountName}
        />
      )}

      {/* Portfolio Statistics & Recharts Visualization Section (Inside STATS_HISTORY tab) */}
      {simSubTab === 'STATS_HISTORY' && (
      <div
        data-testid="portfolio_statistics_section"
        className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232E3A] pb-3">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-5 h-5 text-[#01BC8D]" />
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">
                إحصائيات المحفظة المنسوخة ومنحنى نمو الرصيد (Equity Curve & Win/Loss)
              </h3>
              <p className="text-[11px] text-[#8A99AD]">
                تحليل بياني لنمو الرصيد التراكمي ونسبة الصفقات الرابحة مقابل الخاسرة عبر جميع الصفقات المنسوخة واليدوية.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIncludeOpenInStats(!includeOpenInStats)}
              data-testid="toggle_include_open_stats"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                includeOpenInStats
                  ? 'bg-[#01BC8D] text-[#0B0E11]'
                  : 'bg-[#0B0E11] text-[#8A99AD] border border-[#232E3A] hover:text-white'
              }`}
            >
              {includeOpenInStats ? 'شامل الصفقات المفتوحة' : 'الصفقات المغلقة فقط'}
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3">
            <span className="text-[11px] text-[#8A99AD] block">نسبة نمو الرصيد (ROI)</span>
            <span
              className={`text-base sm:text-lg font-bold font-mono tabular-nums mt-1 block ${
                portfolioStats.totalGrowthPct >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
              }`}
            >
              {portfolioStats.totalGrowthPct >= 0 ? '+' : ''}
              {portfolioStats.totalGrowthPct.toFixed(2)}%
            </span>
            <span className="text-[10px] text-[#8A99AD] font-mono tabular-nums">
              الرصيد الحالي: {portfolioStats.finalEquity.toFixed(2)}$
            </span>
          </div>

          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3">
            <span className="text-[11px] text-[#8A99AD] block">نسبة الصفقات الرابحة (Win Rate)</span>
            <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-[#01BC8D] mt-1 block">
              {portfolioStats.winRate.toFixed(1)}%
            </span>
            <span className="text-[10px] text-[#8A99AD] font-mono tabular-nums">
              {portfolioStats.winningCount} رابحة · {portfolioStats.losingCount} خاسرة
            </span>
          </div>

          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3">
            <span className="text-[11px] text-[#8A99AD] block">معامل الربحية (Profit Factor)</span>
            <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-[#01BC8D] mt-1 block">
              {portfolioStats.profitFactor.toFixed(2)}
            </span>
            <span className="text-[10px] text-[#8A99AD] font-mono tabular-nums">
              ربح +{portfolioStats.grossProfit.toFixed(1)}$ / خسارة -{portfolioStats.grossLoss.toFixed(1)}$
            </span>
          </div>

          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3">
            <span className="text-[11px] text-[#8A99AD] block">أعلى رصيد / أقصى تراجع</span>
            <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-white mt-1 block">
              {portfolioStats.peakEquity.toFixed(0)} $
            </span>
            <span className="text-[10px] text-[#F6465D] font-mono tabular-nums">
              أقصى تراجع (من رأس المال الأولي): {portfolioStats.maxDrawdownPercent.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Two-Column Recharts Grid: 1) Equity Curve, 2) Win vs Loss Ratio */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Chart 1: Equity Curve (منحنى نمو الرصيد) */}
          <div className="lg:col-span-7 bg-[#0B0E11] border border-[#232E3A] rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-[#01BC8D]" />
                  <span>منحنى نمو الرصيد التراكمي (Equity Curve)</span>
                </h4>
                <p className="text-[11px] text-[#8A99AD]">
                  تطور قيمة المحفظة بعملة USDT مقارنة بالرصيد الابتدائي ({portfolioStats.initialBal.toFixed(0)} USDT)
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-[#01BC8D]">
                {portfolioStats.equityCurve.length} نقاط رصد
              </span>
            </div>

            <div className="w-full h-60" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={portfolioStats.equityCurve}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#01BC8D" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#01BC8D" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1A222B" />
                  <XAxis
                    dataKey="step"
                    stroke="#8A99AD"
                    tick={{ fill: '#8A99AD', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#8A99AD"
                    tick={{ fill: '#8A99AD', fontSize: 11 }}
                    domain={['auto', 'auto']}
                    width={60}
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
                      if (name === 'equity') return [`${Number(value).toFixed(2)} USDT`, 'إجمالي الرصيد'];
                      return [value, name];
                    }}
                    labelFormatter={(label, payload) => {
                      const item = payload?.[0]?.payload;
                      if (!item) return label;
                      const sign = item.pnlDelta >= 0 ? '+' : '';
                      return `${item.label} (${sign}${item.pnlDelta} USDT)`;
                    }}
                  />
                  <ReferenceLine
                    y={portfolioStats.initialBal}
                    stroke="#01BC8D"
                    strokeDasharray="4 4"
                    label={{
                      value: 'الرصيد الابتدائي',
                      fill: '#01BC8D',
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#01BC8D"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#equityGradient)"
                    activeDot={{ r: 5, fill: '#01BC8D', stroke: '#0B0E11', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Win vs Loss Ratio & Profit/Loss Breakdown */}
          <div className="lg:col-span-5 bg-[#0B0E11] border border-[#232E3A] rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <PieChartIcon className="w-4 h-4 text-[#01BC8D]" />
                  <span>نسبة الربح مقابل الخسارة</span>
                </h4>
                <p className="text-[11px] text-[#8A99AD]">
                  مقارنة الصفقات الرابحة والخاسرة وصافي العوائد
                </p>
              </div>

              <div className="flex items-center gap-1 bg-[#12171D] p-1 rounded-lg border border-[#232E3A]">
                <button
                  type="button"
                  onClick={() => setBreakdownMode('WIN_LOSS')}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    breakdownMode === 'WIN_LOSS'
                      ? 'bg-[#01BC8D] text-[#0B0E11]'
                      : 'text-[#8A99AD] hover:text-white'
                  }`}
                >
                  الربح / الخسارة
                </button>
                <button
                  type="button"
                  onClick={() => setBreakdownMode('BY_TRADER')}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                    breakdownMode === 'BY_TRADER'
                      ? 'bg-[#01BC8D] text-[#0B0E11]'
                      : 'text-[#8A99AD] hover:text-white'
                  }`}
                >
                  <BarChart3 className="w-3 h-3" />
                  <span>حسب المتداول</span>
                </button>
              </div>
            </div>

            {breakdownMode === 'WIN_LOSS' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center my-auto">
                {/* Donut Chart for Win vs Loss Count */}
                <div className="w-full h-44" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={winLossPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={66}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {winLossPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#12171D',
                          borderColor: '#232E3A',
                          borderRadius: '8px',
                          color: '#FFFFFF',
                          fontSize: '12px',
                        }}
                        formatter={(value: any, name: any) => [`${value} صفقات`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Bar Chart comparing Gross Profit ($) vs Gross Loss ($) */}
                <div className="w-full h-44" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={pnlComparisonBarData}
                      margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A222B" vertical={false} />
                      <XAxis
                        dataKey="label"
                        stroke="#8A99AD"
                        tick={{ fill: '#8A99AD', fontSize: 10 }}
                      />
                      <YAxis
                        stroke="#8A99AD"
                        tick={{ fill: '#8A99AD', fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#12171D',
                          borderColor: '#232E3A',
                          borderRadius: '8px',
                          color: '#FFFFFF',
                          fontSize: '12px',
                        }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} USDT`, 'القيمة']}
                      />
                      <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                        {pnlComparisonBarData.map((entry, idx) => (
                          <Cell key={`bar-${idx}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="w-full h-44 my-auto" dir="ltr">
                {portfolioStats.traderPerformance.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-[#8A99AD]" dir="rtl">
                    لا توجد صفقات مسجلة للمتداولين بعد. انسخ متداولاً أو افتح صفقة لعرض المقارنة.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={portfolioStats.traderPerformance}
                      margin={{ top: 10, right: 12, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A222B" vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke="#8A99AD"
                        tick={{ fill: '#8A99AD', fontSize: 10 }}
                      />
                      <YAxis
                        stroke="#8A99AD"
                        tick={{ fill: '#8A99AD', fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#12171D',
                          borderColor: '#232E3A',
                          borderRadius: '8px',
                          color: '#FFFFFF',
                          fontSize: '12px',
                        }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} USDT`, 'صافي الربح/الخسارة']}
                      />
                      <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                        {portfolioStats.traderPerformance.map((entry, idx) => (
                          <Cell
                            key={`trader-bar-${idx}`}
                            fill={entry.pnl >= 0 ? '#01BC8D' : '#F6465D'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {portfolioStats.traderPerformance.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-2 border-t border-[#1A222B]">
                    <span className="text-[10px] text-[#8A99AD]">اضغط للدخول لإحصائيات المتداول:</span>
                    {portfolioStats.traderPerformance.map((tp, idx) => (
                      <button
                        key={`tp-chip-${idx}`}
                        type="button"
                        onClick={() => handleTraderClick(tp.name)}
                        className="text-[10px] bg-[#0B0E11] hover:bg-[#0D2B24] border border-[#232E3A] hover:border-[#01BC8D] text-white hover:text-[#01BC8D] px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                        title={`الدخول إلى صفحة إحصائيات المتداول ${tp.name}`}
                      >
                        <span>{tp.name}</span>
                        <span className={tp.pnl >= 0 ? 'text-[#01BC8D] font-mono' : 'text-[#F6465D] font-mono'}>
                          ({tp.pnl >= 0 ? '+' : ''}{tp.pnl.toFixed(1)}$)
                        </span>
                        <ExternalLink className="w-2.5 h-2.5 text-[#01BC8D]" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Win / Loss Ratio Progress Bar & Legend */}
            <div className="mt-3 pt-3 border-t border-[#1A222B] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                <span className="text-[#01BC8D]">
                  رابحة: {portfolioStats.winningCount} ({portfolioStats.winRate.toFixed(1)}%)
                </span>
                <span className="text-[#8A99AD]">
                  إجمالي التداولات: {portfolioStats.totalTradesCount}
                </span>
                <span className="text-[#F6465D]">
                  خاسرة: {portfolioStats.losingCount} ({portfolioStats.lossRate.toFixed(1)}%)
                </span>
              </div>
              <svg className="w-full h-2 rounded-full overflow-hidden" viewBox="0 0 100 8" preserveAspectRatio="none">
                <rect x="0" y="0" width="100" height="8" fill="#1A222B" />
                <rect
                  x="0"
                  y="0"
                  width={portfolioStats.totalTradesCount > 0 ? portfolioStats.winRate : 50}
                  height="8"
                  fill="#01BC8D"
                />
                <rect
                  x={portfolioStats.totalTradesCount > 0 ? portfolioStats.winRate : 50}
                  y="0"
                  width={portfolioStats.totalTradesCount > 0 ? portfolioStats.lossRate : 50}
                  height="8"
                  fill="#F6465D"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Trade & Copy Settings Configuration Card (Inside ACCOUNTS_SETTINGS tab) */}
      {simSubTab === 'ACCOUNTS_SETTINGS' && (
      <div className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#232E3A] pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[#01BC8D]" />
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">
                إعدادات الصفقات الخاصة بحساب «{activeAccountName}» (مستقلة لكل حساب افتراضي)
              </h3>
              <p className="text-[11px] text-[#8A99AD]">
                لكل حساب افتراضي إعداداته المستقلة تماماً؛ عند نسخ أي متداول أو حوت إلى هذا الحساب سيتم فتح الصفقات بالحجم والرافعة والعمولة المحددة هنا فقط.
              </p>
            </div>
          </div>

          <span className="text-[11px] bg-[#1A222B] text-[#01BC8D] border border-[#01BC8D]/30 px-3 py-1 rounded-lg font-mono shrink-0">
            حجم الصفقة الفعلي: {(previewTradeValue * previewLeverage).toFixed(0)} USDT
          </span>
        </div>

        {settingsSavedMsg && (
          <div
            data-testid="trade_settings_saved_banner"
            className="bg-[#0D2B24] border border-[#01BC8D]/40 rounded-xl p-3 flex items-center gap-2 text-xs text-[#01BC8D]"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{settingsSavedMsg}</span>
          </div>
        )}

        <form onSubmit={handleSaveTradeSettings} className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Trade Value (USDT) */}
            <div>
              <label className="block text-[11px] text-[#8A99AD] mb-1 font-semibold">
                قيمة الصفقة الواحدة (USDT)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={tradeValueInput}
                onChange={(e) => setTradeValueInput(normalizeNumberInput(e.target.value))}
                placeholder="مثال: 25"
                data-testid="setting_trade_value_input"
                className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
              <span className="text-[10px] text-[#8A99AD] mt-0.5 block">
                الهامش المخصوم لكل صفقة (الحالي: {settings.tradeValueUsdt}$)
              </span>
            </div>

            {/* 2. Leverage */}
            <div>
              <label className="block text-[11px] text-[#8A99AD] mb-1 font-semibold">
                الرافعة المالية (Leverage)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={leverageInput}
                onChange={(e) => setLeverageInput(normalizeNumberInput(e.target.value))}
                placeholder="مثال: 5"
                data-testid="setting_leverage_input"
                className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
              <span className="text-[10px] text-[#8A99AD] mt-0.5 block">
                تُفرض على الصفقات المنسوخة (الحالي: {settings.leverage}x)
              </span>
            </div>

            {/* 3. Commission % */}
            <div>
              <label className="block text-[11px] text-[#8A99AD] mb-1 font-semibold">
                عمولة المنصة لكل صفقة (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={commissionInput}
                onChange={(e) => setCommissionInput(normalizeNumberInput(e.target.value))}
                placeholder="0.06"
                data-testid="setting_commission_input"
                className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
              <span className="text-[10px] text-[#8A99AD] mt-0.5 block">
                الحالي: {settings.commissionPercent}% (Taker Fee)
              </span>
            </div>

            {/* 4. Max Concurrent Open Trades */}
            <div>
              <label className="block text-[11px] text-[#8A99AD] mb-1 font-semibold">
                أقصى عدد صفقات مفتوحة معاً
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={maxConcurrentInput}
                onChange={(e) => setMaxConcurrentInput(normalizeNumberInput(e.target.value))}
                placeholder="5"
                data-testid="setting_max_concurrent_input"
                className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
              <span className="text-[10px] text-[#8A99AD] mt-0.5 block">
                يمنع تجاوز هذا العدد (الحالي: {settings.maxConcurrentTrades})
              </span>
            </div>
          </div>

          {/* Optional TP / SL & Enforce User Size Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label className="block text-[11px] text-[#8A99AD] mb-1">
                جني الأرباح التلقائي Take Profit (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={tpInput}
                onChange={(e) => setTpInput(normalizeNumberInput(e.target.value))}
                placeholder="0 = بدون حد"
                className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#8A99AD] mb-1">
                وقف الخسارة التلقائي Stop Loss (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={slInput}
                onChange={(e) => setSlInput(normalizeNumberInput(e.target.value))}
                placeholder="0 = بدون حد"
                className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <div className="flex items-center">
              <label className="flex items-center gap-2.5 bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2.5 w-full cursor-pointer">
                <input
                  type="checkbox"
                  checked={enforceUserSize}
                  onChange={(e) => setEnforceUserSize(e.target.checked)}
                  className="accent-[#01BC8D] w-4 h-4 shrink-0"
                />
                <span className="text-[11px] text-white font-semibold leading-snug">
                  فتح الصفقات بالحجم والرافعة التي أعينها أنا دائماً (تجاهل حجم المتداول المنسوخ)
                </span>
              </label>
            </div>
          </div>

          {/* Scale-In (التدعيم) & Partial Exit (الانسحاب الجزئي) Rules Section */}
          <div className="bg-[#0B0E11] border border-[#01BC8D]/35 rounded-xl p-3.5 sm:p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#232E3A] pb-2.5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#01BC8D]" />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    إعدادات التدعيم التلقائي والانسحاب الجزئي مع المتداول
                  </h4>
                  <p className="text-[10px] text-[#8A99AD]">
                    تحكم في كيفية تدعيم صفقتك عندما يدعم المتداول صفقته، وكيفية سحب جزء من الصفقة عندما يسحب المتداول جزءاً منها.
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-lg bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40 shrink-0">
                {scaleInSamePercentInput
                  ? 'وضع التدعيم: نفس النسبة المئوية من الأصل (%)'
                  : `وضع التدعيم: قيمة ثابتة (+${previewScaleInFixed}$)`}
              </span>
            </div>

            <div
              className={`grid grid-cols-1 ${
                scaleInSamePercentInput ? 'lg:grid-cols-2' : 'lg:grid-cols-3'
              } gap-3`}
            >
              {/* 1. Toggleable Option: Auto Scale-In by Same Percentage of Original Position Value */}
              <div
                className={`rounded-xl p-3 border transition-all flex flex-col justify-between ${
                  scaleInSamePercentInput
                    ? 'bg-[#12171D] border-[#01BC8D] shadow-[0_0_12px_rgba(1,188,141,0.12)]'
                    : 'bg-[#12171D]/70 border-[#232E3A]'
                }`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scaleInSamePercentInput}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setScaleInSamePercentInput(next);
                      onUpdateTradeSettings(
                        buildCurrentSettingsPayload({
                          scaleInSamePercentAsTrader: next,
                        }),
                        activeAccountId,
                        false
                      );
                    }}
                    data-testid="setting_scale_in_same_pct_checkbox"
                    className="accent-[#01BC8D] w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-white">
                        التدعيم آلياً بنفس النسبة المئوية من قيمة الصفقة الأصلية
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          scaleInSamePercentInput
                            ? 'bg-[#01BC8D] text-[#0B0E11]'
                            : 'bg-[#232E3A] text-[#8A99AD]'
                        }`}
                      >
                        {scaleInSamePercentInput ? 'مفعّل تلقائياً' : 'ملغى (التدعيم اليدوي/المحدد)'}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#8A99AD] leading-relaxed">
                      {scaleInSamePercentInput ? (
                        <>
                          عندما يدعم المتداول صفقته بنسبة معينة (مثلاً{' '}
                          <strong className="text-[#01BC8D] font-mono">+25%</strong>)، يقوم النظام
                          آلياً بالدعم بنفس النسبة من قيمة صفقتك الأصلية (
                          <strong className="text-white font-mono">
                            {previewTradeValue}$ × 25% = +{(previewTradeValue * 0.25).toFixed(2)}$
                          </strong>
                          )، ويتم إخفاء خيار التدعيم اليدوي.
                        </>
                      ) : (
                        <>
                          تم إلغاء التدعيم الآلي بالنسبة المئوية: يمكنك الآن تحديد قيمة التدعيم
                          اليدوية/المحددة (<strong className="text-[#01BC8D] font-mono">+{previewScaleInFixed}$</strong>) ليتم إضافتها.
                        </>
                      )}
                    </p>
                  </div>
                </label>
              </div>

              {/* 2. Fixed/Manual Scale-In Value Input — Hidden when scaleInSamePercentInput is selected */}
              {!scaleInSamePercentInput && (
                <div className="rounded-xl p-3 border bg-[#12171D] border-[#01BC8D] shadow-[0_0_12px_rgba(1,188,141,0.12)] transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-white">
                      قيمة التدعيم المحددة (USDT)
                    </label>
                    <span className="text-[9px] bg-[#01BC8D] text-[#0B0E11] px-1.5 py-0.5 rounded font-bold">
                      مفعّل للتدعيم
                    </span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={scaleInFixedValueInput}
                    onChange={(e) => setScaleInFixedValueInput(normalizeNumberInput(e.target.value))}
                    data-testid="setting_scale_in_fixed_input"
                    className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none"
                  />
                  <div className="flex items-center gap-1.5 mt-2">
                    {[5, 10, 25, 50].map((presetVal) => (
                      <button
                        key={presetVal}
                        type="button"
                        onClick={() => {
                          setScaleInFixedValueInput(String(presetVal));
                          onUpdateTradeSettings(
                            buildCurrentSettingsPayload({ scaleInFixedValueUsdt: presetVal }),
                            activeAccountId,
                            false
                          );
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                          previewScaleInFixed === presetVal
                            ? 'bg-[#01BC8D] text-[#0B0E11] border-[#01BC8D] font-bold'
                            : 'bg-[#0B0E11] text-[#8A99AD] border-[#232E3A] hover:text-white'
                        }`}
                      >
                        +{presetVal}$
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-[#8A99AD] mt-1.5 block leading-relaxed">
                    القيمة التي تضاف لتدعيم الصفقة عندما يقوم المتداول بتدعيم صفقته أو عند التدعيم اليدوي.
                  </span>
                </div>
              )}

              {/* 3. Partial Exit Rule: Always Withdraw Same Percentage */}
              <div className="rounded-xl p-3 border bg-[#12171D] border-[#01BC8D]/40 flex flex-col justify-between">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={partialExitSamePercentInput}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setPartialExitSamePercentInput(next);
                      onUpdateTradeSettings(
                        buildCurrentSettingsPayload({ partialExitSamePercentAsTrader: next }),
                        activeAccountId,
                        false
                      );
                    }}
                    data-testid="setting_partial_exit_same_pct_checkbox"
                    className="accent-[#01BC8D] w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-white">
                        عند سحب المتداول جزءاً من الصفقة: سحب نفس النسبة المئوية
                      </span>
                      <span className="text-[9px] bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40 px-1.5 py-0.5 rounded font-bold">
                        نفس النسبة %
                      </span>
                    </div>
                    <p className="text-[10px] text-[#8A99AD] leading-relaxed">
                      عندما يسحب المتداول جزءاً من صفقته (مثلاً <strong className="text-[#01BC8D] font-mono">-30%</strong> أو <strong className="text-[#01BC8D] font-mono">-50%</strong>)، يسحب النظام آلياً نفس النسبة المئوية من صفقتك المفتوحة ويحجز أرباح الجزء المسحوب.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* 4. Optional Late-Entry Prompt (اختيار الدخول في الصفقات أو الرفض) */}
            <div
              className={`rounded-xl p-3 border transition-all ${
                promptOnUnfavorableLateEntryInput
                  ? 'bg-[#12171D] border-[#F59E0B]/50'
                  : 'bg-[#12171D] border-[#01BC8D]'
              }`}
            >
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={promptOnUnfavorableLateEntryInput}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setPromptOnUnfavorableLateEntryInput(next);
                    onUpdateTradeSettings(
                      buildCurrentSettingsPayload({ promptOnUnfavorableLateEntry: next }),
                      activeAccountId,
                      false
                    );
                  }}
                  data-testid="setting_prompt_unfavorable_late_entry_checkbox"
                  className="accent-[#01BC8D] w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-white">
                      تفعيل خاصية اختيار الدخول في الصفقات أو الرفض (عند التأخر والسعر الأقل أفضلية)
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                        promptOnUnfavorableLateEntryInput
                          ? 'bg-[#3B2606] text-[#FBBF24] border border-[#F59E0B]/40'
                          : 'bg-[#01BC8D] text-[#0B0E11]'
                      }`}
                    >
                      {promptOnUnfavorableLateEntryInput
                        ? 'مفعّل: طلب القرار قبل الدخول'
                        : 'مشطوب: دخول آلي بسعر السوق فوراً'}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#8A99AD] leading-relaxed">
                    {promptOnUnfavorableLateEntryInput
                      ? 'عند التفعيل: إذا دخلت متأخراً وكان سعر السوق الحالي أسوأ من سعر دخول المتداول، يعرض لك التطبيق خيار الموافقة على الدخول أو الرفض. اشطب هذا الخيار للدخول آلياً في كل الأحوال.'
                      : 'تم شطب الخيار: سيتم الدخول آلياً وبشكل فوري بالسعر الحالي للسوق في صفقات المتداول حتى وإن كنت متأخراً وكان سعر السوق أقل أفضلية من سعر دخول المتداول.'}
                  </p>
                </div>
              </label>
            </div>
          </div>

          <button
            type="submit"
            data-testid="save_trade_settings_btn"
            className="w-full bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2.5 rounded-xl text-xs sm:text-sm transition-colors cursor-pointer"
          >
            حفظ الإعدادات
          </button>
        </form>
      </div>
      )}

      {/* Pro Risk Management & Smart Copy Suite Panel (Inside ACCOUNTS_SETTINGS tab) */}
      {simSubTab === 'ACCOUNTS_SETTINGS' && (
        <ProRiskSettingsPanel
          settings={settings}
          dailyPnlUsdt={paperSnapshot.dailyPnlUsdt ?? 0}
          dailyPnlPercent={paperSnapshot.dailyPnlPercent ?? 0}
          isDailyCircuitBreakerTripped={Boolean(paperSnapshot.isDailyCircuitBreakerTripped)}
          onUpdateSettings={(partial) => onUpdateTradeSettings(partial, activeAccountId, false)}
        />
      )}

      {/* قسم معالجة الصفقات المتأخرة بانتظار تأكيدك (مضغوط ونظيف في KuCoin Style) */}
      {simSubTab === 'ACTIVE' && (() => {
        const copiedTradersOnThisPage = copiedTraders.filter(
          (ct) => (ct.accountId || 'acc_default') === activeAccountId
        );
        const pendingChoicesForCopiedTradersOnPage = filterPendingChoicesForCopiedTradersOnPage(
          paperSnapshot.pendingReconnectChoices || [],
          copiedTraders,
          activeAccountId
        );

        const isPromptEnabled = settings.promptOnUnfavorableLateEntry !== false;

        return (
          <div
            data-testid="reconnect_trades_advantage_section"
            className={`bg-[#12161C] border rounded-xl p-3 space-y-2.5 ${
              pendingChoicesForCopiedTradersOnPage.length > 0
                ? 'border-[#F59E0B]/50'
                : 'border-[#1C232D]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Zap
                  className={`w-4 h-4 shrink-0 ${
                    isPromptEnabled ? 'text-[#FBBF24]' : 'text-[#01BC8D]'
                  }`}
                />
                <h3 className="font-bold text-xs sm:text-sm text-white">
                  {isPromptEnabled ? 'بانتظار تأكيدك' : 'الدخول الآلي مفعّل'}
                </h3>
                {pendingChoicesForCopiedTradersOnPage.length > 0 && (
                  <span
                    dir="ltr"
                    className="text-[10px] px-1.5 py-0.5 rounded bg-[#3B2606] text-[#FBBF24] font-mono font-bold tabular-nums"
                  >
                    {pendingChoicesForCopiedTradersOnPage.length}
                  </span>
                )}
              </div>

              <label className="flex items-center gap-1.5 bg-[#0B0E11] border border-[#1C232D] hover:border-[#01BC8D]/40 rounded-lg px-2.5 py-1 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={isPromptEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setPromptOnUnfavorableLateEntryInput(next);
                    onUpdateTradeSettings(
                      buildCurrentSettingsPayload({ promptOnUnfavorableLateEntry: next }),
                      activeAccountId,
                      false
                    );
                  }}
                  data-testid="active_toggle_prompt_late_entry_checkbox"
                  className="accent-[#01BC8D] w-3.5 h-3.5 shrink-0 cursor-pointer"
                />
                <span className="text-[11px] font-semibold text-[#EAECEF] whitespace-nowrap">
                  تأكيد الدخول المتأخر
                </span>
              </label>
            </div>

            {!isPromptEnabled ? (
              <div
                data-testid="auto_enter_late_trades_active_msg"
                className="text-[11px] text-[#01BC8D]"
              >
                يتم تنفيذ صفقات المتداول المنسوخ آلياً بسعر السوق الحالي دون انتظار تأكيد.
              </div>
            ) : copiedTradersOnThisPage.length === 0 ? (
              <div
                data-testid="no_copied_trader_pending_choices_msg"
                className="text-[11px] text-[#848E9C]"
              >
                تظهر هنا الصفقات المتأخرة ذات السعر الأقل أفضلية عند نسخ متداول في هذا الحساب.
              </div>
            ) : pendingChoicesForCopiedTradersOnPage.length === 0 ? (
              <div
                data-testid="no_unfavorable_pending_choices_msg"
                className="flex items-center justify-between gap-2 text-[11px] text-[#848E9C]"
              >
                <span className="truncate">
                  لا توجد صفقات معلقة للمتداول المنسوخ ({copiedTradersOnThisPage.map((ct) => ct.nickname).join('، ')})
                </span>
                <span className="text-[10px] text-[#01BC8D] font-mono shrink-0">
                  {copiedTradersOnThisPage.length} منسوخ
                </span>
              </div>
            ) : (
              <div className="space-y-2 pt-2 border-t border-[#1C232D]">
                <div className="grid grid-cols-1 gap-2">
                  {pendingChoicesForCopiedTradersOnPage.map((choice) => {
                    const liveNow = getSymbolPrice(choice.symbol) || choice.currentMarketPrice;
                    const isShort = choice.side === 'SHORT';
                    return (
                      <div
                        key={choice.id}
                        data-testid={`pending_reconnect_choice_card_${choice.id}`}
                        className="bg-[#0B0E11] border border-[#F59E0B]/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CoinIcon symbol={choice.symbol} size="sm" />
                            <span className="font-mono font-bold text-sm text-white">
                              {choice.symbol}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                                isShort
                                  ? 'bg-[#2B1216] text-[#F65454]'
                                  : 'bg-[#0D2B24] text-[#01BC8D]'
                              }`}
                            >
                              {choice.side} {choice.leverage}x
                            </span>
                            <span className="text-[11px] text-[#848E9C]">
                              {choice.traderName} ·{' '}
                              <span className="font-mono text-[#01BC8D]">
                                ${choice.marginUsdt.toFixed(2)}
                              </span>
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#848E9C] font-mono tabular-nums">
                            <span>
                              دخول المتداول:{' '}
                              <strong className="text-white">${choice.traderEntryPrice.toFixed(4)}</strong>{' '}
                              <span dir="ltr" className="text-[10px] text-[#848E9C] inline-block">
                                ({formatLateEntryComparisonDetails({
                                  traderEntryPrice: choice.traderEntryPrice,
                                  traderEntryTime: choice.traderEntryTime || choice.createdAt,
                                  userEntryPrice: liveNow,
                                  userEntryTime: Date.now(),
                                }).traderTimeStr})
                              </span>
                            </span>
                            <span>
                              السعر الآن:{' '}
                              <strong className="text-[#FBBF24]">${liveNow.toFixed(4)}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            data-testid={`execute_pending_choice_btn_${choice.id}`}
                            onClick={() => onExecutePendingChoice && onExecutePendingChoice(choice.id)}
                            className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>تنفيذ الآن</span>
                          </button>
                          <button
                            type="button"
                            data-testid={`dismiss_pending_choice_btn_${choice.id}`}
                            onClick={() => onDismissPendingChoice && onDismissPendingChoice(choice.id)}
                            className="bg-[#2B1216] hover:bg-[#F65454]/25 text-[#F65454] border border-[#F65454]/40 font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors whitespace-nowrap"
                          >
                            تجاهل
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Pending Limit Orders Card (Inside ACTIVE tab) */}
      {simSubTab === 'ACTIVE' &&
        (paperSnapshot.pendingLimitOrders || []).length > 0 &&
        onCancelPendingLimitOrder && (
          <PendingLimitOrdersCard
            orders={paperSnapshot.pendingLimitOrders || []}
            currentPrices={connectionState.allPrices || {}}
            onCancelOrder={onCancelPendingLimitOrder}
          />
        )}

      {/* Open Positions Card (Inside ACTIVE tab — KuCoin Futures Style) */}
      {simSubTab === 'ACTIVE' && (
      <div className="bg-[#12161C] border border-[#1C232D] rounded-xl p-3.5 sm:p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#01BC8D]" />
            <h3 className="font-bold text-sm text-white">
              المراكز المفتوحة{' '}
              <span dir="ltr" className="font-mono text-xs text-[#848E9C] tabular-nums">
                ({openPositions.length}/{settings.maxConcurrentTrades})
              </span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                handleExecuteWipeAll({
                  scope: 'ALL_ACCOUNTS',
                  removeExtraAccounts: false,
                  clearCopiedTraders: false,
                })
              }
              data-testid="wipe_all_positions_and_history_btn"
              className="text-[11px] bg-[#2B1216] hover:bg-[#F65454]/25 text-[#F65454] border border-[#F65454]/35 px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold cursor-pointer transition-colors whitespace-nowrap"
              title="مسح كل البيانات والصفقات السابقة وتصفيرها"
            >
              <Trash2 className="w-3 h-3" />
              <span>تصفير الكل</span>
            </button>
            <button
              type="button"
              onClick={onResetPaper}
              className="text-[11px] text-[#848E9C] hover:text-[#F65454] flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>تصفير الحساب</span>
            </button>
          </div>
        </div>

        {openPositions.length >= settings.maxConcurrentTrades && (
          <div className="mb-3 bg-[#0D2B24]/70 border border-[#01BC8D]/40 rounded-lg p-2.5 flex items-center gap-2 text-xs text-[#01BC8D]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              وصلت للحد الأقصى للمراكز المفتوحة ({settings.maxConcurrentTrades}). أغلق مركزاً أو ارفع الحد من الإعدادات.
            </span>
          </div>
        )}

        {openPositions.length === 0 ? (
          <p className="text-xs text-[#848E9C] leading-relaxed py-4 text-center">
            لا توجد مراكز مفتوحة حالياً. انسخ متداولاً أو افتح صفقة يدوية من الرئيسية لتظهر هنا مباشرة.
          </p>
        ) : (
          <div className="space-y-2.5">
            {openPositions.map((p) => {
              const livePrice = getSymbolPrice(p.symbol);
              const dir = p.side === 'LONG' ? 1 : -1;
              const grossPnl = (livePrice - p.entryPrice) * p.quantity * dir;
              const netPnl = grossPnl - (p.commissionUsdt || 0);
              const isProfit = netPnl >= 0;
              const marginUsed = p.marginUsdt || (p.quantity * p.entryPrice) / p.leverage;
              const roiPct = marginUsed > 0 ? (netPnl / marginUsed) * 100 : 0;
              const currentScale = p.currentScalePercent ?? 100;
              const lateEntryComp = formatLateEntryComparisonDetails({
                traderEntryPrice: p.traderEntryPrice || p.entryPrice,
                traderEntryTime: p.traderEntryTime || p.openTime,
                userEntryPrice: p.entryPrice,
                userEntryTime: p.openTime,
              });

              return (
                <div
                  key={p.id}
                  className="bg-[#0B0E11] border border-[#1C232D] rounded-xl p-3 space-y-2.5 text-xs"
                >
                  {/* KuCoin Futures Position Header Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <CoinIcon symbol={p.symbol} size="sm" />
                      <span className="font-bold text-white font-mono text-sm">{p.symbol}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold font-mono text-[10px] shrink-0 ${
                          p.side === 'LONG'
                            ? 'bg-[#0D2B24] text-[#01BC8D]'
                            : 'bg-[#2B1216] text-[#F65454]'
                        }`}
                      >
                        {p.side} {p.leverage}x
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          p.executionMode === 'REAL'
                            ? 'bg-[#01BC8D]/15 text-[#01BC8D]'
                            : 'bg-[#161B22] text-[#848E9C]'
                        }`}
                      >
                        {p.executionMode === 'REAL' ? 'KuCoin' : 'افتراضي'}
                      </span>
                      {currentScale !== 100 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#0D2B24] text-[#01BC8D]">
                          {currentScale}%
                        </span>
                      )}
                      {p.sourceTraderName && (
                        <button
                          type="button"
                          onClick={() => handleTraderClick(p.sourceTraderName, p.sourceTraderId, p.sourceType)}
                          className="bg-[#12161C] hover:bg-[#0D2B24] text-[#01BC8D] border border-[#1C232D] hover:border-[#01BC8D]/50 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                          title={`عرض تفاصيل ${p.sourceTraderName} أسفل المراكز`}
                        >
                          {p.sourceType === 'SMART_MONEY' ? (
                            <WhaleIcon className="w-3 h-3" />
                          ) : (
                            <Copy className="w-2.5 h-2.5" />
                          )}
                          <span className="font-semibold">{p.sourceTraderName}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                        </button>
                      )}
                    </div>

                    {/* Right-aligned PNL + ROI */}
                    <div dir="ltr" className="text-left font-mono tabular-nums shrink-0">
                      <div
                        className={`text-sm font-extrabold ${
                          isProfit ? 'text-[#01BC8D]' : 'text-[#F65454]'
                        }`}
                      >
                        {isProfit ? '+' : ''}
                        {netPnl.toFixed(2)} USDT
                      </div>
                      <div
                        className={`text-[10px] font-semibold ${
                          isProfit ? 'text-[#01BC8D]/90' : 'text-[#F65454]/90'
                        }`}
                      >
                        {isProfit ? '+' : ''}
                        {roiPct.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Risk & Status Tags Row (only shown when active) */}
                  {(lateEntryComp.isLateEntry ||
                    (p.stopLossPrice && p.stopLossPrice > 0) ||
                    (p.takeProfitPrice && p.takeProfitPrice > 0) ||
                    (p.trailingStopPercent && p.trailingStopPercent > 0) ||
                    (p.liquidationPrice && p.liquidationPrice > 0)) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {lateEntryComp.isLateEntry && (
                        <span
                          data-testid={`late_entry_delay_badge_${p.id}`}
                          className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-[#3B2606] text-[#FBBF24]"
                        >
                          {lateEntryComp.delayTextAr}
                        </span>
                      )}
                      {p.stopLossPrice && p.stopLossPrice > 0 && (
                        <span
                          dir="ltr"
                          data-testid={`secured_sl_badge_${p.id}`}
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#2B1216] text-[#F65454]"
                        >
                          SL {p.stopLossPrice.toFixed(4)}
                        </span>
                      )}
                      {p.takeProfitPrice && p.takeProfitPrice > 0 && (
                        <span
                          dir="ltr"
                          data-testid={`tp_badge_${p.id}`}
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#0D2B24] text-[#01BC8D]"
                        >
                          TP {p.takeProfitPrice.toFixed(4)}
                        </span>
                      )}
                      {p.trailingStopPercent && p.trailingStopPercent > 0 && (
                        <span
                          dir="ltr"
                          data-testid={`trailing_badge_${p.id}`}
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#10253A] text-[#38BDF8]"
                        >
                          Trail {p.trailingStopPercent}%
                        </span>
                      )}
                      {p.liquidationPrice && p.liquidationPrice > 0 && (
                        <span
                          dir="ltr"
                          data-testid={`liq_badge_${p.id}`}
                          className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#2B2210] text-[#F59E0B]"
                          title="سعر التصفية الآلية التقريبي"
                        >
                          Liq {p.liquidationPrice.toFixed(p.liquidationPrice >= 50 ? 2 : 4)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* KuCoin Futures 3-Column Metric Grid */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-[#1C232D] text-[11px]">
                    <div>
                      <span className="text-[10px] text-[#848E9C] block">الهامش / الحجم</span>
                      <span dir="ltr" className="inline-block font-mono font-bold text-white tabular-nums">
                        ${marginUsed.toFixed(2)}
                      </span>
                      <span dir="ltr" className="text-[10px] text-[#848E9C] font-mono block">
                        ${(marginUsed * p.leverage).toFixed(0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#848E9C] block">السعر الحالي</span>
                      <span dir="ltr" className="inline-block font-mono font-bold text-[#01BC8D] tabular-nums">
                        ${livePrice.toFixed(livePrice >= 50 ? 2 : 4)}
                      </span>
                      <span dir="ltr" className="text-[10px] text-[#848E9C] font-mono block">
                        عمولة ${(p.commissionUsdt || 0).toFixed(3)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#848E9C] block">سعر الدخول</span>
                      <span dir="ltr" className="inline-block font-mono font-bold text-white tabular-nums">
                        ${lateEntryComp.userPriceStr}
                      </span>
                      <span dir="ltr" className="text-[10px] text-[#848E9C] font-mono block truncate">
                        {lateEntryComp.userTimeStr}
                      </span>
                    </div>
                  </div>

                  {/* Entry Comparison Row (Trader vs User Entry & Timestamps) */}
                  <div
                    data-testid={`late_entry_comparison_box_${p.id}`}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px]"
                  >
                    <div
                      data-testid={`trader_entry_price_time_${p.id}`}
                      className="bg-[#12161C] border border-[#1C232D] rounded-lg px-2.5 py-1 flex items-center justify-between gap-2"
                    >
                      <span className="text-[#848E9C]">
                        دخول المتداول:{' '}
                        <strong dir="ltr" className="text-[#01BC8D] font-mono inline-block">
                          ${lateEntryComp.traderPriceStr}
                        </strong>
                      </span>
                      <span dir="ltr" className="text-[#848E9C] font-mono whitespace-nowrap">
                        {lateEntryComp.traderTimeStr}
                      </span>
                    </div>
                    <div
                      data-testid={`user_entry_price_time_${p.id}`}
                      className="bg-[#12161C] border border-[#1C232D] rounded-lg px-2.5 py-1 flex items-center justify-between gap-2"
                    >
                      <span className="text-[#848E9C]">
                        دخولي:{' '}
                        <strong dir="ltr" className="text-white font-mono inline-block">
                          ${lateEntryComp.userPriceStr}
                        </strong>
                      </span>
                      <span dir="ltr" className="text-[#01BC8D] font-mono whitespace-nowrap">
                        {lateEntryComp.userTimeStr}
                      </span>
                    </div>
                  </div>

                  {/* Crisp Single-Row Position Action Bar (Package ب Short Labels) */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {onSecurePosition && (
                        <button
                          type="button"
                          data-testid={`secure_position_btn_${p.id}`}
                          onClick={() => onSecurePosition(p.id, livePrice, 0.2)}
                          className="bg-[#0D2B24] hover:bg-[#01BC8D] text-[#01BC8D] hover:text-[#0B0E11] border border-[#01BC8D]/40 px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                          title="وضع وقف خسارة قرب السعر الحالي (-0.2% للشراء / +0.2% للبيع)"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          <span>SL السعر الحالي</span>
                        </button>
                      )}

                      {onMoveStopLossToBreakEven && (() => {
                        const breakEvenTarget =
                          p.side === 'LONG'
                            ? p.entryPrice * 1.0008
                            : p.entryPrice * 0.9992;
                        const canMoveToBreakEven =
                          livePrice > 0 &&
                          (p.side === 'LONG'
                            ? livePrice > breakEvenTarget
                            : livePrice < breakEvenTarget);
                        return (
                          <button
                            type="button"
                            data-testid={`breakeven_position_btn_${p.id}`}
                            disabled={!canMoveToBreakEven}
                            onClick={() => onMoveStopLossToBreakEven(p.id, livePrice)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors border whitespace-nowrap ${
                              canMoveToBreakEven
                                ? 'bg-[#10253A] hover:bg-[#38BDF8] text-[#38BDF8] hover:text-[#0B0E11] border-[#38BDF8]/40 cursor-pointer'
                                : 'bg-[#12161C] text-[#64748B] border-[#1C232D] cursor-not-allowed opacity-70'
                            }`}
                            title={
                              canMoveToBreakEven
                                ? 'نقل وقف الخسارة إلى سعر الدخول + 0.08% تغطية العمولة'
                                : 'يتفعل عند تجاوز الربح +0.08% فوق سعر الدخول'
                            }
                          >
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>SL سعر الدخول</span>
                          </button>
                        );
                      })()}

                      {onUpdatePositionRiskLevels && (
                        <button
                          type="button"
                          data-testid={`edit_risk_position_btn_${p.id}`}
                          onClick={() => {
                            if (editingRiskPositionId === p.id) {
                              setEditingRiskPositionId(null);
                            } else {
                              setEditingRiskPositionId(p.id);
                              setEditSlInput(p.stopLossPrice ? String(p.stopLossPrice) : '');
                              setEditTpInput(p.takeProfitPrice ? String(p.takeProfitPrice) : '');
                              setEditTrailingInput(
                                p.trailingStopPercent ? String(p.trailingStopPercent) : ''
                              );
                            }
                          }}
                          className="bg-[#161B22] hover:bg-[#1E2530] text-white border border-[#1C232D] px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Edit3 className="w-3 h-3 text-[#01BC8D]" />
                          <span>SL / TP</span>
                        </button>
                      )}

                      {onPartialExitPosition && (
                        <>
                          <button
                            type="button"
                            onClick={() => onPartialExitPosition(p.id, 25, livePrice)}
                            className="bg-[#12161C] hover:bg-[#1A2029] text-[#EAECEF] border border-[#1C232D] px-2 py-1.5 rounded-lg text-[10px] font-mono font-semibold cursor-pointer whitespace-nowrap"
                            title="سحب جزئي -25%"
                          >
                            -25%
                          </button>
                          <button
                            type="button"
                            onClick={() => onPartialExitPosition(p.id, 50, livePrice)}
                            className="bg-[#12161C] hover:bg-[#1A2029] text-[#EAECEF] border border-[#1C232D] px-2 py-1.5 rounded-lg text-[10px] font-mono font-semibold cursor-pointer whitespace-nowrap"
                            title="سحب جزئي -50%"
                          >
                            -50%
                          </button>
                        </>
                      )}

                      {onScaleInPosition && !scaleInSamePercentInput && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              onScaleInPosition(
                                p.id,
                                0,
                                livePrice,
                                Math.max(1, settings.scaleInFixedValueUsdt || 10)
                              )
                            }
                            className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] px-2 py-1.5 rounded-lg text-[10px] font-bold font-mono cursor-pointer whitespace-nowrap"
                            title={`تدعيم بقيمة +${settings.scaleInFixedValueUsdt || 10}$`}
                          >
                            +{(settings.scaleInFixedValueUsdt || 10).toFixed(0)}$
                          </button>
                          <button
                            type="button"
                            onClick={() => onScaleInPosition(p.id, 25, livePrice)}
                            className="bg-[#0D2B24] hover:bg-[#143D33] text-[#01BC8D] border border-[#01BC8D]/35 px-2 py-1.5 rounded-lg text-[10px] font-bold font-mono cursor-pointer whitespace-nowrap"
                            title="تدعيم +25%"
                          >
                            +25%
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      data-testid={`close_position_btn_${p.id}`}
                      onClick={() => onClosePosition(p.id, livePrice)}
                      className="bg-[#F65454]/15 hover:bg-[#F65454] text-[#F65454] hover:text-white border border-[#F65454]/40 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      إغلاق
                    </button>
                  </div>

                  {/* Inline SL / TP / Trailing Stop-Loss Editor */}
                  {editingRiskPositionId === p.id && onUpdatePositionRiskLevels && (
                    <div
                      data-testid={`inline_risk_editor_${p.id}`}
                      className="bg-[#0B0E11] border border-[#01BC8D]/40 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end"
                    >
                      <div>
                        <label className="block text-[10px] text-[#8A99AD] mb-1">
                          سعر وقف الخسارة (SL)
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          dir="ltr"
                          data-testid={`inline_sl_input_${p.id}`}
                          value={editSlInput}
                          onChange={(e) => setEditSlInput(e.target.value)}
                          placeholder="اختياري"
                          className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#F6465D] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#8A99AD] mb-1">
                          سعر الهدف (TP)
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          dir="ltr"
                          data-testid={`inline_tp_input_${p.id}`}
                          value={editTpInput}
                          onChange={(e) => setEditTpInput(e.target.value)}
                          placeholder="اختياري"
                          className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#8A99AD] mb-1">
                          وقف خسارة متحرك (Trailing %)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="50"
                          dir="ltr"
                          data-testid={`inline_trailing_input_${p.id}`}
                          value={editTrailingInput}
                          onChange={(e) => setEditTrailingInput(e.target.value)}
                          placeholder="مثال: 1.5"
                          className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#38BDF8] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid={`inline_risk_save_btn_${p.id}`}
                          onClick={() => {
                            const slVal = parseFloat(editSlInput);
                            const tpVal = parseFloat(editTpInput);
                            const trVal = parseFloat(editTrailingInput);
                            onUpdatePositionRiskLevels(p.id, {
                              stopLossPrice: !isNaN(slVal) && slVal > 0 ? slVal : null,
                              takeProfitPrice: !isNaN(tpVal) && tpVal > 0 ? tpVal : null,
                              trailingStopPercent: !isNaN(trVal) && trVal > 0 ? trVal : null,
                            });
                            setEditingRiskPositionId(null);
                          }}
                          className="flex-1 bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-1.5 px-3 rounded-lg text-xs cursor-pointer"
                        >
                          حفظ
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRiskPositionId(null)}
                          className="bg-[#1A222B] hover:bg-[#232E3A] text-[#8A99AD] hover:text-white py-1.5 px-2.5 rounded-lg text-xs cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Scale Adjustments Timeline for this Open Position */}
                  {p.scaleAdjustments && p.scaleAdjustments.length > 0 && (
                    <div className="bg-[#0B0E11] border border-[#232E3A] rounded-lg p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-[#8A99AD]">
                        <span className="font-bold text-[#01BC8D]">
                          سجل أوقات وأحجام الدخول والتدعيم والانسحاب الجزئي (% و USDT):
                        </span>
                        <span className="font-mono">{p.scaleAdjustments.length} عمليات</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {p.scaleAdjustments.map((adj) => {
                          const isScaleIn = adj.actionType === 'SCALE_IN';
                          const isPartial = adj.actionType === 'PARTIAL_EXIT';
                          const absPct = Math.abs(adj.volumePercent);
                          const adjTime = formatDateTimeWestern(adj.timestamp);
                          return (
                            <div
                              key={adj.id}
                              className={`px-2.5 py-1.5 rounded-lg border text-[10px] flex flex-wrap items-center gap-2 ${
                                isScaleIn
                                  ? 'bg-[#0D2B24]/50 border-[#01BC8D]/40 text-[#01BC8D]'
                                  : isPartial
                                  ? 'bg-[#0D2B24]/60 border-[#01BC8D]/40 text-[#01BC8D]'
                                  : 'bg-[#12171D] border-[#232E3A] text-white'
                              }`}
                            >
                              <span className="font-bold">
                                {adj.actionLabelAr
                                  .split(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g)
                                  .map((part, idx) =>
                                    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(part) ? (
                                      <span key={idx} dir="ltr" className="inline-block whitespace-nowrap">
                                        {part}
                                      </span>
                                    ) : (
                                      <React.Fragment key={idx}>{part}</React.Fragment>
                                    )
                                  )}
                              </span>
                              <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-[#0B0E11] whitespace-nowrap">
                                {isScaleIn
                                  ? `+${absPct}%`
                                  : isPartial
                                  ? `-${absPct}%`
                                  : `${absPct}%`}
                              </span>
                              {adj.marginDeltaUsdt !== undefined && (
                                <span dir="ltr" className="font-mono font-bold text-white bg-[#1A222B] px-1.5 py-0.5 rounded inline-block whitespace-nowrap">
                                  {adj.marginDeltaUsdt > 0 ? '+' : ''}
                                  {adj.marginDeltaUsdt.toFixed(2)}$
                                </span>
                              )}
                              <span className="text-[#8A99AD] font-mono whitespace-nowrap">
                                المتبقي: {adj.remainingPercentAfter}%
                              </span>
                              <span dir="ltr" className="text-[#8A99AD] font-mono inline-block whitespace-nowrap">@ {adj.price.toFixed(2)}</span>
                              <span dir="ltr" className="text-white font-mono inline-block whitespace-nowrap shrink-0">{adjTime}</span>
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

      {/* معلومات المتداولين والحيتان المنسوخين (أسفل نافذة المراكز مباشرة مع عرض كل المعلومات عند الاختيار دون إخفاء صفقاتي المنسوخة في الأعلى) */}
      {simSubTab === 'ACTIVE' && (
        <CopiedTraderInlineInspector
          copiedTraders={copiedTraders}
          accounts={accounts}
          activeAccountId={activeAccountId}
          activeAccountName={activeAccountName}
          settings={settings}
          tickers={connectionState.tickers}
          userOpenPositions={openPositions}
          userClosedPositions={closedPositions}
          isSyncingAll={isSyncingAll}
          selectedTrader={selectedInlineTrader}
          onSelectTrader={setSelectedInlineTrader}
          onSyncAllCopiedTraders={onSyncAllCopiedTraders}
          onRemoveCopiedTrader={onRemoveCopiedTrader}
          onNavigateToTab={onNavigateToTab}
          onOpenExternalTraderPage={onOpenTraderStats}
          onCopySinglePosition={onCopySinglePosition}
          onSyncTraderToEngine={onSyncTraderToEngine}
        />
      )}

      {/* لوحة البيانات الإحصائية لسجل الصفقات المغلقة (Inside STATS_HISTORY tab) */}
      {simSubTab === 'STATS_HISTORY' && (
      <div
        data-testid="closed_trades_dashboard_widget"
        className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#232E3A] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#01BC8D]/15 border border-[#01BC8D]/30 flex items-center justify-center text-[#01BC8D] shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
                <span>لوحة البيانات الإحصائية — سجل الصفقات المغلقة</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/30 font-mono">
                  {closedTradesStats.totalClosed} صفقة مغلقة
                </span>
              </h3>
              <p className="text-[11px] text-[#8A99AD]">
                ملخص فوري لإجمالي الربح/الخسارة (PnL %) ومعدل نجاح الصفقات (Win Rate) محسوب حصرياً من سجل الصفقات المغلقة.
              </p>
            </div>
          </div>

          {/* أزرار تصدير بيانات الأرباح التراكمية اليومية لآخر 30 يوماً */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleExport30DaysPnlData('XLS')}
              data-testid="export_30d_pnl_excel_btn"
              title="تصدير بيانات الأرباح التراكمية اليومية لآخر 30 يوماً إلى ملف Excel (.xls)"
              className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-[#01BC8D]/15 text-[#01BC8D] border border-[#01BC8D]/30 hover:bg-[#01BC8D] hover:text-[#0B0E11] transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تصدير 30D (Excel)</span>
            </button>
            <button
              type="button"
              onClick={() => handleExport30DaysPnlData('CSV')}
              data-testid="export_30d_pnl_csv_btn"
              title="تصدير بيانات الأرباح التراكمية اليومية لآخر 30 يوماً إلى ملف CSV"
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1 bg-[#0B0E11] text-[#8A99AD] border border-[#232E3A] hover:text-white hover:border-[#01BC8D]/50 transition-all cursor-pointer active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Widget 1: Total Realized PnL (%) */}
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-4 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8A99AD] font-semibold">
                إجمالي الربح / الخسارة المحقق (PnL %)
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  closedTradesStats.totalRealizedPnlUsdt >= 0
                    ? 'bg-[#0D2B24] text-[#01BC8D]'
                    : 'bg-[#2B1216] text-[#F6465D]'
                }`}
              >
                {closedTradesStats.totalRealizedPnlUsdt >= 0 ? 'ربح صافي' : 'خسارة صافية'}
              </span>
            </div>

            <div className="flex items-baseline gap-2.5 flex-wrap" dir="ltr">
              <span
                data-testid="closed_widget_pnl_percent"
                className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums ${
                  closedTradesStats.pnlPercentOfBalance >= 0
                    ? 'text-[#01BC8D]'
                    : 'text-[#F6465D]'
                }`}
              >
                {closedTradesStats.pnlPercentOfBalance >= 0 ? '+' : ''}
                {closedTradesStats.pnlPercentOfBalance.toFixed(2)}%
              </span>
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg ${
                  closedTradesStats.totalRealizedPnlUsdt >= 0
                    ? 'bg-[#01BC8D]/15 text-[#01BC8D]'
                    : 'bg-[#F6465D]/15 text-[#F6465D]'
                }`}
              >
                {closedTradesStats.totalRealizedPnlUsdt >= 0 ? '+' : ''}
                {closedTradesStats.totalRealizedPnlUsdt.toFixed(2)} USDT
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#8A99AD] pt-1 border-t border-[#1A222B]">
              <span>العائد على الهامش المغلق (ROI):</span>
              <strong
                dir="ltr"
                className={`font-mono tabular-nums ${
                  closedTradesStats.pnlPercentOfMargin >= 0
                    ? 'text-[#01BC8D]'
                    : 'text-[#F6465D]'
                }`}
              >
                {closedTradesStats.pnlPercentOfMargin >= 0 ? '+' : ''}
                {closedTradesStats.pnlPercentOfMargin.toFixed(2)}%
              </strong>
            </div>
          </div>

          {/* Widget 2: Win Rate (%) based on Closed Positions */}
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-4 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8A99AD] font-semibold">
                معدل نجاح الصفقات المغلقة (Win Rate)
              </span>
              <span className="text-[10px] font-mono text-[#01BC8D] bg-[#0D2B24] px-2 py-0.5 rounded font-bold">
                {closedTradesStats.winningTrades} / {closedTradesStats.totalClosed} رابحة
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span
                dir="ltr"
                data-testid="closed_widget_win_rate"
                className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-[#01BC8D]"
              >
                {closedTradesStats.winRatePct.toFixed(1)}%
              </span>
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-[#01BC8D]">
                  رابحة: <strong>{closedTradesStats.winningTrades}</strong>
                </span>
                <span className="text-[#232E3A]">|</span>
                <span className="text-[#F6465D]">
                  خاسرة: <strong>{closedTradesStats.losingTrades}</strong>
                </span>
              </div>
            </div>

            {/* Visual Win vs Loss Progress Bar */}
            <div className="space-y-1">
              <div className="w-full h-2 rounded-full bg-[#1A222B] overflow-hidden flex">
                <div
                  className="h-full bg-[#01BC8D] transition-all duration-300"
                  style={{
                    width: `${
                      closedTradesStats.totalClosed > 0 ? closedTradesStats.winRatePct : 0
                    }%`,
                  }}
                />
                <div
                  className="h-full bg-[#F6465D] transition-all duration-300"
                  style={{
                    width: `${
                      closedTradesStats.totalClosed > 0 ? closedTradesStats.lossRatePct : 0
                    }%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#8A99AD] font-mono">
                <span>نسبة النجاح: {closedTradesStats.winRatePct.toFixed(1)}%</span>
                <span>نسبة الخسارة: {closedTradesStats.lossRatePct.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Widget 3: Gross Profit vs Gross Loss & Profit Factor */}
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-4 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#8A99AD] font-semibold">
                تفصيل الأرباح والخسائر المحققة
              </span>
              <span className="text-[10px] font-mono text-white bg-[#1A222B] px-2 py-0.5 rounded">
                معامل الربح: {closedTradesStats.profitFactor.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <div className="bg-[#12171D] border border-[#232E3A] rounded-lg p-2">
                <span className="text-[10px] text-[#8A99AD] block">إجمالي الأرباح</span>
                <span
                  dir="ltr"
                  className="text-xs sm:text-sm font-bold font-mono text-[#01BC8D] tabular-nums block mt-0.5"
                >
                  +{closedTradesStats.grossProfitUsdt.toFixed(2)} $
                </span>
              </div>
              <div className="bg-[#12171D] border border-[#232E3A] rounded-lg p-2">
                <span className="text-[10px] text-[#8A99AD] block">إجمالي الخسائر</span>
                <span
                  dir="ltr"
                  className="text-xs sm:text-sm font-bold font-mono text-[#F6465D] tabular-nums block mt-0.5"
                >
                  -{closedTradesStats.grossLossUsdt.toFixed(2)} $
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#8A99AD] font-mono pt-1 border-t border-[#1A222B]">
              <span>متوسط الرابحة: +{closedTradesStats.avgWinUsdt.toFixed(2)}$</span>
              <span>متوسط الخاسرة: -{closedTradesStats.avgLossUsdt.toFixed(2)}$</span>
            </div>
          </div>
        </div>

        {/* رسم بياني خطي للأرباح التراكمية اليومية خلال آخر 30 يوماً بواسطة Recharts */}
        <div
          data-testid="daily_cumulative_pnl_30d_chart"
          className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-[#1A222B]">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#01BC8D] animate-pulse" />
                <h4 className="text-xs sm:text-sm font-bold text-white">
                  منحنى الأرباح التراكمية اليومية — آخر 30 يوماً (Daily Cumulative PnL — 30D)
                </h4>
              </div>
              <p className="text-[11px] text-[#8A99AD] mt-0.5">
                تتبع مسار الأرباح والخسائر التراكمية لكل يوم بناءً على تواريخ إغلاق الصفقات عبر مكتبة Recharts مع خط الصفر المرجعي.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono" dir="ltr">
              <div className="px-2.5 py-1 rounded-lg bg-[#12171D] border border-[#232E3A] flex items-center gap-1.5">
                <span className="text-[#8A99AD] text-[10px]">30D PnL:</span>
                <span
                  className={`font-bold tabular-nums ${
                    dailyCumulativePnl30Days.total30dCumulativePnl >= 0
                      ? 'text-[#01BC8D]'
                      : 'text-[#F6465D]'
                  }`}
                >
                  {dailyCumulativePnl30Days.total30dCumulativePnl >= 0 ? '+' : ''}
                  {dailyCumulativePnl30Days.total30dCumulativePnl.toFixed(2)} USDT
                </span>
                <span
                  className={`text-[10px] px-1 py-0.2 rounded ${
                    dailyCumulativePnl30Days.roi30dPercent >= 0
                      ? 'text-[#01BC8D] bg-[#01BC8D]/10'
                      : 'text-[#F6465D] bg-[#F6465D]/10'
                  }`}
                >
                  ({dailyCumulativePnl30Days.roi30dPercent >= 0 ? '+' : ''}
                  {dailyCumulativePnl30Days.roi30dPercent.toFixed(2)}%)
                </span>
              </div>

              <div className="hidden lg:flex items-center gap-2 text-[11px] text-[#8A99AD]">
                <span className="text-[#01BC8D] bg-[#0D2B24] px-2 py-0.5 rounded border border-[#01BC8D]/20">
                  أفضل يوم: +{dailyCumulativePnl30Days.bestDay}$
                </span>
                <span className="text-[#F6465D] bg-[#2B1216] px-2 py-0.5 rounded border border-[#F6465D]/20">
                  أسوأ يوم: {dailyCumulativePnl30Days.worstDay}$
                </span>
              </div>

              {/* أزرار تصدير بيانات 30 يوماً كـ Excel أو CSV في ترويسة المخطط */}
              <div className="flex items-center gap-1.5" dir="rtl">
                <button
                  type="button"
                  onClick={() => handleExport30DaysPnlData('XLS')}
                  data-testid="chart_export_30d_excel_btn"
                  title="تصدير بيانات المنحنى التراكمي لآخر 30 يوماً كملف Excel (.xls)"
                  className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-[#01BC8D]/15 text-[#01BC8D] border border-[#01BC8D]/30 hover:bg-[#01BC8D] hover:text-[#0B0E11] transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                  <span>Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport30DaysPnlData('CSV')}
                  data-testid="chart_export_30d_csv_btn"
                  title="تصدير بيانات المنحنى التراكمي لآخر 30 يوماً كملف CSV"
                  className="px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 bg-[#12171D] text-[#8A99AD] border border-[#232E3A] hover:text-white hover:border-[#01BC8D]/40 transition-all cursor-pointer active:scale-95"
                >
                  <Download className="w-3 h-3 shrink-0" />
                  <span>CSV</span>
                </button>
              </div>
            </div>
          </div>

          <div className="w-full h-[240px] pt-2" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dailyCumulativePnl30Days.data}
                margin={{ top: 12, right: 12, left: -10, bottom: 0 }}
              >
                <CartesianGrid stroke="#1A222B" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#8A99AD"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#232E3A' }}
                  minTickGap={16}
                />
                <YAxis
                  stroke="#8A99AD"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#232E3A' }}
                  tickFormatter={(val: number) => `${val >= 0 ? '+' : ''}${val}$`}
                  domain={['auto', 'auto']}
                />
                <ReferenceLine
                  y={0}
                  stroke="#8A99AD"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                  label={{
                    value: '$0.00',
                    fill: '#8A99AD',
                    fontSize: 9,
                    position: 'insideRight',
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const item = payload[0].payload;
                      const isProfit = item.cumulativePnl >= 0;
                      const isDailyProfit = item.dailyPnl >= 0;
                      return (
                        <div className="bg-[#0B0E11]/95 border border-[#232E3A] rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs font-mono space-y-1.5 min-w-[190px]">
                          <div className="text-[#8A99AD] text-[11px] pb-1 border-b border-[#1A222B] flex items-center justify-between">
                            <span>{item.fullDate || item.date}</span>
                            <span className="text-white text-[10px]">({item.label})</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[#8A99AD] text-[11px]">الربح التراكمي:</span>
                            <span
                              className={`font-bold tabular-nums ${
                                isProfit ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                              }`}
                            >
                              {isProfit ? '+' : ''}
                              {item.cumulativePnl.toFixed(2)} USDT
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[#8A99AD] text-[11px]">عائد المحفظة (ROI):</span>
                            <span
                              className={`font-bold tabular-nums ${
                                item.roiPercent >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                              }`}
                            >
                              {item.roiPercent >= 0 ? '+' : ''}
                              {item.roiPercent.toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-[#1A222B]">
                            <span className="text-[#8A99AD] text-[11px]">ربح/خسارة هذا اليوم:</span>
                            <span
                              className={`font-semibold tabular-nums ${
                                isDailyProfit ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                              }`}
                            >
                              {isDailyProfit ? '+' : ''}
                              {item.dailyPnl.toFixed(2)} USDT
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[#8A99AD]">
                            <span>صفقات مغلقة في اليوم:</span>
                            <span className="text-white font-bold">{item.tradesCount} صفقة</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="cumulativePnl"
                  name="الأرباح التراكمية"
                  stroke={dailyCumulativePnl30Days.strokeColor}
                  strokeWidth={2.5}
                  dot={{
                    r: 2.5,
                    fill: dailyCumulativePnl30Days.strokeColor,
                    strokeWidth: 0,
                  }}
                  activeDot={{
                    r: 5.5,
                    fill: '#FFFFFF',
                    stroke: dailyCumulativePnl30Days.strokeColor,
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#8A99AD] pt-1 border-t border-[#1A222B]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-0.5 rounded-full"
                  style={{ backgroundColor: dailyCumulativePnl30Days.strokeColor }}
                />
                منحنى تراكمي (30 يوماً)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t border-dashed border-[#8A99AD]" />
                خط الأساس ($0.00)
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono">
              <span>أيام تداول نشطة: {dailyCumulativePnl30Days.activeDaysCount} يوم</span>
              <span>•</span>
              <span className="text-[#01BC8D]">رابحة: {dailyCumulativePnl30Days.profitableDaysCount}</span>
              <span>•</span>
              <span className="text-[#F6465D]">خاسرة: {dailyCumulativePnl30Days.losingDaysCount}</span>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Dedicated Closed Positions Table (Inside STATS_HISTORY tab) */}
      {simSubTab === 'STATS_HISTORY' && (
      <div
        data-testid="closed_positions_table_section"
        className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232E3A] pb-3.5">
          <div>
            <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <History className="w-4 h-4 text-[#01BC8D]" />
              <span>جدول سجل الصفقات المغلقة ({closedPositions.length})</span>
            </h3>
            <p className="text-[11px] text-[#8A99AD] mt-0.5">
              سجل مفصل يوضح اسم المتداول المنسوخ، تاريخ الدخول والخروج، المدة الزمنية لاستمرار الصفقة، أسعار التنفيذ، العمولات، ونسبة وصافي الأرباح المحققة مع التصدير إلى Excel.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {closedPositions.length > 0 && onClearClosedHistory && (
              <button
                type="button"
                onClick={() => {
                  onClearClosedHistory(true);
                  setWipeSuccessMsg('تم مسح سجل الصفقات المغلقة السابقة بنجاح.');
                  setTimeout(() => setWipeSuccessMsg(null), 5000);
                }}
                data-testid="clear_closed_trades_history_btn"
                className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-[#2B1216] hover:bg-[#F6465D]/25 text-[#F6465D] border border-[#F6465D]/40 transition-all cursor-pointer"
                title="مسح جميع الصفقات المغلقة السابقة من السجل"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح سجل الصفقات المغلقة</span>
              </button>
            )}

            <button
              type="button"
              disabled={closedPositions.length === 0}
              onClick={() => handleExportClosedTradesExcel('XLS')}
              data-testid="export_closed_excel_btn"
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                closedPositions.length > 0
                  ? 'bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] cursor-pointer shadow-[0_0_12px_rgba(1,188,141,0.25)]'
                  : 'bg-[#1A222B] text-[#8A99AD]/50 border border-[#232E3A] cursor-not-allowed'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير كملف Excel (.xls)</span>
            </button>

            <button
              type="button"
              disabled={closedPositions.length === 0}
              onClick={() => handleExportClosedTradesExcel('CSV')}
              data-testid="export_closed_csv_btn"
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                closedPositions.length > 0
                  ? 'bg-[#1A222B] hover:bg-[#232E3A] text-[#01BC8D] border-[#01BC8D]/40 cursor-pointer'
                  : 'bg-[#0B0E11] text-[#8A99AD]/40 border-[#232E3A] cursor-not-allowed'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Bar for Closed Trades / Recent Orders (تصفية حسب نوع الصفقة شراء/بيع أو الرمز Symbol) */}
        <div
          data-testid="closed_trades_filter_bar"
          className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
        >
          <div>
            <label className="block text-[11px] text-[#8A99AD] font-semibold mb-1.5">
              تصفية حسب نوع الصفقة (شراء / بيع):
            </label>
            <div className="grid grid-cols-3 gap-1 bg-[#12171D] p-1 rounded-xl border border-[#232E3A]">
              <button
                type="button"
                onClick={() => setClosedSideFilter('ALL')}
                data-testid="closed_filter_side_all"
                className={`py-1.5 px-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  closedSideFilter === 'ALL'
                    ? 'bg-[#01BC8D] text-[#0B0E11]'
                    : 'text-[#8A99AD] hover:text-white'
                }`}
              >
                الكل ({closedPositions.length})
              </button>
              <button
                type="button"
                onClick={() => setClosedSideFilter('LONG')}
                data-testid="closed_filter_side_long"
                className={`py-1.5 px-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  closedSideFilter === 'LONG'
                    ? 'bg-[#01BC8D] text-[#0B0E11]'
                    : 'text-[#01BC8D] hover:bg-[#0D2B24]/60'
                }`}
              >
                شراء ({closedPositions.filter((c) => c.side === 'LONG').length})
              </button>
              <button
                type="button"
                onClick={() => setClosedSideFilter('SHORT')}
                data-testid="closed_filter_side_short"
                className={`py-1.5 px-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  closedSideFilter === 'SHORT'
                    ? 'bg-[#F6465D] text-white'
                    : 'text-[#F6465D] hover:bg-[#2B1216]/60'
                }`}
              >
                بيع ({closedPositions.filter((c) => c.side === 'SHORT').length})
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#8A99AD] font-semibold mb-1.5">
              اختيار الرمز (Symbol):
            </label>
            <select
              value={closedSymbolFilter}
              onChange={(e) => setClosedSymbolFilter(e.target.value)}
              data-testid="closed_filter_symbol_select"
              className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none cursor-pointer"
            >
              <option value="ALL">كل الرموز ({uniqueClosedSymbols.length})</option>
              {uniqueClosedSymbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#8A99AD] font-semibold mb-1.5">
              بحث فوري بالرمز (Symbol):
            </label>
            <input
              type="text"
              value={closedSymbolSearch}
              onChange={(e) => setClosedSymbolSearch(e.target.value)}
              data-testid="closed_filter_symbol_input"
              placeholder="مثال: BTC أو ETH أو SOL..."
              className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
            />
          </div>
        </div>

        {closedPositions.length === 0 ? (
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-6 text-center text-xs text-[#8A99AD]">
            لا توجد صفقات مغلقة في السجل حتى الآن. بمجرد إغلاق أي صفقة مفتوحة، ستظهر هنا في الجدول مع إمكانية تصديرها كملف Excel شامل (اسم المتداول المنسوخ، نسبة الربح المحققة، والمدة الزمنية).
          </div>
        ) : filteredClosedPositions.length === 0 ? (
          <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-6 text-center space-y-2 text-xs text-[#8A99AD]">
            <p>لا توجد صفقات مطابقة لخيارات التصفية المحددة (نوع الصفقة أو الرمز).</p>
            <button
              type="button"
              onClick={() => {
                setClosedSideFilter('ALL');
                setClosedSymbolFilter('ALL');
                setClosedSymbolSearch('');
              }}
              className="bg-[#01BC8D] text-[#0B0E11] font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer"
            >
              إعادة ضبط التصفية
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#232E3A] bg-[#0B0E11]">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-[#1A222B] text-[#8A99AD] border-b border-[#232E3A] text-[11px]">
                  <th className="py-3 px-2.5 font-bold text-center">#</th>
                  <th className="py-3 px-3 font-bold">العملة / الزوج</th>
                  <th className="py-3 px-3 font-bold">المتداول المنسوخ</th>
                  <th className="py-3 px-2.5 font-bold">قيمة الصفقة</th>
                  <th className="py-3 px-2.5 font-bold">تاريخ الدخول</th>
                  <th className="py-3 px-2.5 font-bold">تاريخ الخروج</th>
                  <th className="py-3 px-2.5 font-bold">مدة الصفقة</th>
                  <th className="py-3 px-2.5 font-bold">سعر الدخول</th>
                  <th className="py-3 px-2.5 font-bold">سعر الخروج</th>
                  <th className="py-3 px-2.5 font-bold">العمولة</th>
                  <th className="py-3 px-3 font-bold">صافي الربح (USDT)</th>
                  <th className="py-3 px-3 font-bold">نسبة الربح (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A222B]">
                {filteredClosedPositions.map((cp, index) => {
                  const rPnl = cp.realizedPnl || 0;
                  const margin = cp.initialMarginUsdt || cp.marginUsdt || settings.tradeValueUsdt;
                  const roiPct = margin > 0 ? (rPnl / margin) * 100 : 0;
                  const isProfit = rPnl >= 0;
                  const durMs = getTradeDurationMs(cp);
                  const durCompact = formatTradeDuration(durMs, 'COMPACT');
                  const durFull = formatTradeDuration(durMs, 'FULL');
                  const traderName = cp.sourceTraderName || 'تداول يدوي';
                  const isCopiedTrader =
                    Boolean(cp.sourceTraderName) &&
                    cp.sourceTraderName !== 'يدوي' &&
                    cp.sourceTraderName !== 'تداول يدوي';

                  const openTimeStr = formatDateTimeWestern(cp.openTime);

                  const closeTimeStr = cp.closeTime
                    ? formatDateTimeWestern(cp.closeTime)
                    : '--';

                  return (
                    <tr
                      key={cp.id}
                      className="hover:bg-[#12171D] transition-colors"
                    >
                      <td className="py-3 px-2.5 text-center font-mono text-[#8A99AD]">
                        {index + 1}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <CoinIcon symbol={cp.symbol} size="sm" />
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold font-mono text-white">
                              {cp.symbol}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${
                                cp.side === 'LONG'
                                  ? 'bg-[#0D2B24] text-[#01BC8D]'
                                  : 'bg-[#2B1216] text-[#F6465D]'
                              }`}
                            >
                              {cp.side} {cp.leverage}x
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isCopiedTrader ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleTraderClick(
                                cp.sourceTraderName,
                                cp.sourceTraderId,
                                cp.sourceType
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0D2B24]/70 border border-[#01BC8D]/30 text-[11px] text-[#01BC8D] hover:bg-[#0D2B24] hover:border-[#01BC8D] font-semibold cursor-pointer transition-all"
                            title={`اضغط للدخول إلى صفحة إحصائيات المتداول ${traderName}`}
                          >
                            {cp.sourceType === 'SMART_MONEY' ? (
                              <WhaleIcon className="w-3 h-3 shrink-0" />
                            ) : (
                              <Copy className="w-3 h-3 shrink-0" />
                            )}
                            <span>{traderName}</span>
                            <span className="text-[9px] opacity-80">↗</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#8A99AD] bg-[#12171D] border border-[#232E3A] px-2 py-0.5 rounded-md">
                            {traderName}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2.5 font-mono font-bold text-white tabular-nums whitespace-nowrap">
                        {margin.toFixed(2)} $
                      </td>
                      <td className="py-3 px-2.5 font-mono text-[11px] text-[#8A99AD] whitespace-nowrap">
                        <div>
                          دخولي: <span dir="ltr" className="text-white inline-block whitespace-nowrap">{openTimeStr}</span>
                        </div>
                        {cp.traderEntryTime && (
                          <div className="text-[10px] text-[#01BC8D]">
                            المتداول:{' '}
                            <span dir="ltr" className="inline-block whitespace-nowrap">
                              {
                                formatLateEntryComparisonDetails({
                                  traderEntryPrice: cp.traderEntryPrice || cp.entryPrice,
                                  traderEntryTime: cp.traderEntryTime,
                                  userEntryPrice: cp.entryPrice,
                                  userEntryTime: cp.openTime,
                                }).traderTimeStr
                              }
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2.5 font-mono text-[11px] text-[#8A99AD] whitespace-nowrap">
                        <span dir="ltr" className="inline-block whitespace-nowrap">{closeTimeStr}</span>
                      </td>
                      <td
                        className="py-3 px-2.5 whitespace-nowrap"
                        title={`المدة الكاملة: ${durFull.textAr} (${durFull.hhmmss})`}
                      >
                        <div className="inline-flex flex-col bg-[#12171D] border border-[#232E3A] px-2 py-0.5 rounded-lg">
                          <span className="text-[11px] font-bold text-white">
                            {durCompact.textAr}
                          </span>
                          <span className="text-[9px] font-mono text-[#8A99AD]" dir="ltr">
                            {durCompact.hhmmss}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2.5 font-mono text-white tabular-nums whitespace-nowrap">
                        <div>دخولي: ${cp.entryPrice.toFixed(cp.entryPrice > 50 ? 2 : 4)}</div>
                        {cp.traderEntryPrice && (
                          <div className="text-[10px] text-[#01BC8D]">
                            المتداول: ${cp.traderEntryPrice.toFixed(cp.traderEntryPrice > 50 ? 2 : 4)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2.5 font-mono text-white tabular-nums whitespace-nowrap">
                        {(cp.exitPrice || 0).toFixed((cp.exitPrice || 0) > 50 ? 2 : 4)}
                      </td>
                      <td className="py-3 px-2.5 font-mono text-[#F6465D] tabular-nums whitespace-nowrap">
                        {(cp.commissionUsdt || 0).toFixed(3)} $
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-mono tabular-nums">
                        <span
                          className={`font-bold text-xs ${
                            isProfit ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                          }`}
                        >
                          {isProfit ? '+' : ''}
                          {rPnl.toFixed(2)} USDT
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-mono tabular-nums">
                        <span
                          dir="ltr"
                          className={`inline-block px-2 py-0.5 rounded-md font-bold text-[11px] ${
                            isProfit
                              ? 'bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/30'
                              : 'bg-[#2B1216] text-[#F6465D] border border-[#F6465D]/30'
                          }`}
                        >
                          {isProfit ? '+' : ''}
                          {roiPct.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#1A222B] border-t border-[#232E3A] font-bold text-xs">
                  <td colSpan={3} className="py-3 px-3 text-white">
                    إجمالي السجل ({closedPositions.length} صفقة مغلقة)
                  </td>
                  <td className="py-3 px-2.5 font-mono text-white tabular-nums">
                    {closedPositions
                      .reduce(
                        (acc, cp) =>
                          acc + (cp.initialMarginUsdt || cp.marginUsdt || settings.tradeValueUsdt),
                        0
                      )
                      .toFixed(2)}{' '}
                    $
                  </td>
                  <td colSpan={2} className="py-3 px-2.5 text-[#8A99AD] text-[11px]">
                    رابحة: {closedPositions.filter((c) => (c.realizedPnl || 0) > 0).length} • خاسرة:{' '}
                    {closedPositions.filter((c) => (c.realizedPnl || 0) < 0).length}
                  </td>
                  <td className="py-3 px-2.5 text-[#01BC8D] text-[11px] whitespace-nowrap">
                    {(() => {
                      const totalDur = closedPositions.reduce(
                        (acc, cp) => acc + getTradeDurationMs(cp),
                        0
                      );
                      const avgDur =
                        closedPositions.length > 0 ? totalDur / closedPositions.length : 0;
                      return `متوسط: ${formatTradeDuration(avgDur, 'COMPACT').textAr}`;
                    })()}
                  </td>
                  <td colSpan={2} className="py-3 px-2.5" />
                  <td className="py-3 px-2.5 font-mono text-[#F6465D] tabular-nums">
                    {closedPositions
                      .reduce((acc, cp) => acc + (cp.commissionUsdt || 0), 0)
                      .toFixed(3)}{' '}
                    $
                  </td>
                  <td className="py-3 px-3 font-mono tabular-nums">
                    {(() => {
                      const totalPnl = closedPositions.reduce(
                        (acc, cp) => acc + (cp.realizedPnl || 0),
                        0
                      );
                      return (
                        <span className={totalPnl >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'}>
                          {totalPnl >= 0 ? '+' : ''}
                          {totalPnl.toFixed(2)} USDT
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-3 font-mono tabular-nums">
                    {(() => {
                      const totalPnl = closedPositions.reduce(
                        (acc, cp) => acc + (cp.realizedPnl || 0),
                        0
                      );
                      const totalMarg = closedPositions.reduce(
                        (acc, cp) =>
                          acc + (cp.initialMarginUsdt || cp.marginUsdt || settings.tradeValueUsdt),
                        0
                      );
                      const totalPct = totalMarg > 0 ? (totalPnl / totalMarg) * 100 : 0;
                      return (
                        <span
                          dir="ltr"
                          className={totalPct >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'}
                        >
                          {totalPct >= 0 ? '+' : ''}
                          {totalPct.toFixed(2)}%
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
};
