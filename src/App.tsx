import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { Navigation, TabId } from './components/Navigation';
import { DashboardTab } from './components/DashboardTab';
import { BinanceApiTab } from './components/BinanceApiTab';
import { KucoinApiTab } from './components/KucoinApiTab';
import { WhalesTab } from './components/WhalesTab';
import { CopyTradingTab } from './components/CopyTradingTab';
import { SimulationTab } from './components/SimulationTab';
import { SettingsTab } from './components/SettingsTab';
import { LiveSecurityModal } from './components/LiveSecurityModal';
import {
  MobilePushToastBanner,
  MobileNotificationsCenterModal,
} from './components/MobileNotificationsModal';
import {
  BinanceConfig,
  BinanceConnectionState,
  KuCoinConfig,
  KuCoinConnectionState,
  PaperAccountSnapshot,
  TradeExecutionSettings,
  TraderOpenPosition,
  TraderLatestRecord,
  CopiedSyncLog,
  ActiveCopiedTrader,
  MobileTradeNotification,
  MobileNotificationSettings,
  KuCoinSecurityLockConfig,
} from './types';
import { Lock, Unlock } from 'lucide-react';
import {
  loadBinanceConfig,
  saveBinanceConfig,
  clearBinanceKeys,
  testConnectionAndFetchData,
  fetchAllFuturesPrices,
  addWatchedFuturesSymbol,
} from './services/binanceApi';
import {
  loadKuCoinConfig,
  saveKuCoinConfig,
  clearKuCoinConfig,
  testKuCoinConnectionAndFetchData,
  getInitialKuCoinConnectionState,
  executeKuCoinOrder,
  loadKuCoinOrderHistory,
  clearKuCoinOrderHistory,
} from './services/kucoinApi';
import {
  fetchCopyTraderFullData,
  fetchSmartMoneyWhaleDetail,
} from './services/copyAndSmartMoneyApi';
import { paperEngine } from './services/paperTrading';
import { mobileNotifications } from './services/mobileNotifications';
import { startRealtimeSyncTicker } from './services/realtimeSyncWorker';
import {
  loadKuCoinSecurityConfig,
  saveKuCoinSecurityConfig,
  shouldRequireUnlock,
} from './services/kucoinSecurityLock';

function loadAllCopiedTradersFromStorage(): ActiveCopiedTrader[] {
  const result: ActiveCopiedTrader[] = [];
  try {
    const ctRaw = localStorage.getItem('whale_copied_traders_ct');
    if (ctRaw) {
      const parsed = JSON.parse(ctRaw);
      if (Array.isArray(parsed)) result.push(...parsed);
    }
  } catch {
    // ignore
  }
  try {
    const smRaw = localStorage.getItem('whale_copied_traders_sm');
    if (smRaw) {
      const parsed = JSON.parse(smRaw);
      if (Array.isArray(parsed)) result.push(...parsed);
    }
  } catch {
    // ignore
  }
  return result;
}

export const App: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState<TabId>('Dashboard');
  const [autoCopy, setAutoCopy] = useState<boolean>(() => {
    return localStorage.getItem('whale_auto_copy_active') === 'true';
  });
  const [showLiveDialog, setShowLiveDialog] = useState<boolean>(false);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);

  // Binance State (Used ONLY for Information / Market Data / Signals / Lead Traders)
  const [binanceConfig, setBinanceConfig] = useState<BinanceConfig>(loadBinanceConfig);
  const [connectionState, setConnectionState] = useState<BinanceConnectionState>({
    isTesting: true,
    isConnected: false,
    isAuthenticated: false,
    latencyMs: null,
    serverTimeFormatted: null,
    accountUsdtBalance: null,
    accountAvailableBalance: null,
    totalWalletBalance: null,
    totalUnrealizedProfit: null,
    assets: [],
    positions: [],
    statusMessageAr: 'جاري الاتصال بـ Binance لجلب معلومات المتداولين والأسعار...',
    errorMessageAr: null,
    tickers: [],
    whaleInsights: [],
  });

  // KuCoin State (Used for Execution & Real/Simulated Orders)
  const [kucoinConfig, setKucoinConfig] = useState<KuCoinConfig>(loadKuCoinConfig);
  const [kucoinConnectionState, setKucoinConnectionState] = useState<KuCoinConnectionState>(() =>
    getInitialKuCoinConnectionState(loadKuCoinConfig())
  );

  // Unified copied traders list across Copy Trading and Whales
  const [allCopiedTraders, setAllCopiedTraders] = useState<ActiveCopiedTrader[]>(
    loadAllCopiedTradersFromStorage
  );

  const refreshCopiedTradersList = useCallback(() => {
    const nextList = loadAllCopiedTradersFromStorage();
    paperEngine.prunePendingChoicesForCopiedTraders(nextList);
    setAllCopiedTraders(nextList);
  }, []);

  // Live prices map from Binance tickers and all-symbols price map
  const pricesMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (connectionState.allPrices) {
      Object.assign(map, connectionState.allPrices);
    }
    for (const t of connectionState.tickers) {
      const p = parseFloat(t.lastPrice.replace(/,/g, ''));
      if (!isNaN(p) && p > 0) map[t.symbol] = p;
    }
    return map;
  }, [connectionState.tickers, connectionState.allPrices]);

  const [paperSnapshot, setPaperSnapshot] = useState<PaperAccountSnapshot>(() =>
    paperEngine.getSnapshot({})
  );

  const updatePaperSnapshot = useCallback(() => {
    setPaperSnapshot(paperEngine.getSnapshot(pricesMap));
  }, [pricesMap]);

  // Handle auto-copy toggle
  const handleSetAutoCopy = (val: boolean) => {
    setAutoCopy(val);
    localStorage.setItem('whale_auto_copy_active', String(val));
  };

  // Test connection and fetch Binance market data
  const handleTestBinanceConnection = useCallback(async (cfg: BinanceConfig) => {
    setConnectionState((prev) => ({
      ...prev,
      isTesting: true,
      statusMessageAr: 'جاري جلب معلومات السوق والمتداولين من باينانس...',
      errorMessageAr: null,
    }));

    const result = await testConnectionAndFetchData(cfg);
    setConnectionState(result);
  }, []);

  // Test connection to KuCoin API
  const handleTestKuCoinConnection = useCallback(
    async (cfg: KuCoinConfig, forceRealBalance: boolean = false) => {
      setKucoinConnectionState((prev) => ({
        ...prev,
        isTesting: true,
        statusMessageAr: forceRealBalance
          ? 'جاري جلب الرصيد الحقيقي ومزامنة محفظة KuCoin...'
          : 'جاري فحص الاتصال ومزامنة الحساب مع KuCoin API...',
        errorMessageAr: null,
      }));

      const res = await testKuCoinConnectionAndFetchData(cfg, { forceRealBalance });
      setKucoinConnectionState(res);
    },
    []
  );

  // Save KuCoin config & test
  const handleSaveKuCoin = (updated: KuCoinConfig) => {
    setKucoinConfig(updated);
    saveKuCoinConfig(updated);
    // Sync trading mode if user toggled live execution in KuCoin tab
    paperEngine.updateSettings({
      mode: updated.enableLiveExecution ? 'REAL' : 'VIRTUAL',
      leverage: updated.defaultLeverage || paperEngine.getSettings().leverage,
    });
    updatePaperSnapshot();
    handleTestKuCoinConnection(updated);
  };

  const handleClearKuCoin = () => {
    const cleared = clearKuCoinConfig();
    setKucoinConfig(cleared);
    handleTestKuCoinConnection(cleared);
  };

  const handleClearKuCoinOrders = () => {
    clearKuCoinOrderHistory();
    setKucoinConnectionState((prev) => ({
      ...prev,
      recentOrders: [],
    }));
  };

  // Save Binance config & retest
  const handleSaveAndTestBinance = (updated: BinanceConfig) => {
    setBinanceConfig(updated);
    saveBinanceConfig(updated);
    handleTestBinanceConnection(updated);
  };

  const handleClearBinanceKeys = () => {
    const cleared = clearBinanceKeys();
    setBinanceConfig(cleared);
    handleTestBinanceConnection(cleared);
  };

  // Multi-Account Management Handlers (فتح وتسمية وإدارة عدة حسابات افتراضية في نفس الوقت)
  const handleSelectVirtualAccount = useCallback(
    (accountId: string) => {
      const snap = paperEngine.setActiveAccount(accountId, pricesMap);
      setPaperSnapshot(snap);
    },
    [pricesMap]
  );

  const handleCreateVirtualAccount = useCallback(
    (name: string, initialBalance?: number): string => {
      const created = paperEngine.createAccount(name, initialBalance, true);
      updatePaperSnapshot();
      return created.id;
    },
    [updatePaperSnapshot]
  );

  const handleRenameVirtualAccount = useCallback(
    (accountId: string, newName: string) => {
      const cleanName = newName.trim();
      if (!cleanName) return;
      paperEngine.renameAccount(accountId, cleanName);

      // Update accountName in copied traders storage
      ['whale_copied_traders_ct', 'whale_copied_traders_sm'].forEach((key) => {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const arr: ActiveCopiedTrader[] = JSON.parse(raw);
            const updated = arr.map((ct) =>
              (ct.accountId || 'acc_default') === accountId
                ? { ...ct, accountName: cleanName }
                : ct
            );
            localStorage.setItem(key, JSON.stringify(updated));
          }
        } catch {
          // ignore
        }
      });

      refreshCopiedTradersList();
      updatePaperSnapshot();
    },
    [refreshCopiedTradersList, updatePaperSnapshot]
  );

  const handleDeleteVirtualAccount = useCallback(
    (accountId: string) => {
      const snap = paperEngine.deleteAccount(accountId, pricesMap);
      setPaperSnapshot(snap);

      // Remove copied traders linked exclusively to the deleted account
      ['whale_copied_traders_ct', 'whale_copied_traders_sm'].forEach((key) => {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const arr: ActiveCopiedTrader[] = JSON.parse(raw);
            const filtered = arr.filter((ct) => (ct.accountId || 'acc_default') !== accountId);
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        } catch {
          // ignore
        }
      });
      refreshCopiedTradersList();
    },
    [pricesMap, refreshCopiedTradersList]
  );

  // Update Trade Execution Settings (size, leverage, commission, maxConcurrentTrades, VIRTUAL/REAL mode)
  const handleUpdateTradeSettings = useCallback(
    (
      partial: Partial<TradeExecutionSettings>,
      accountId?: string,
      applyToAllAccounts: boolean = false
    ) => {
      const targetAccId = accountId || paperEngine.getActiveAccountId();
      const updated = paperEngine.updateSettings(partial, targetAccId, applyToAllAccounts);

      // Keep copied traders' stored marginUsdt synchronized with the updated tradeValueUsdt
      if (partial.tradeValueUsdt !== undefined && partial.tradeValueUsdt > 0) {
        const newTradeVal = partial.tradeValueUsdt;
        ['whale_copied_traders_ct', 'whale_copied_traders_sm'].forEach((key) => {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const arr: ActiveCopiedTrader[] = JSON.parse(raw);
              const synced = arr.map((ct) => {
                const ctAccId = ct.accountId || 'acc_default';
                if (applyToAllAccounts || ctAccId === targetAccId) {
                  return { ...ct, marginUsdt: newTradeVal };
                }
                return ct;
              });
              localStorage.setItem(key, JSON.stringify(synced));
            }
          } catch {
            // ignore
          }
        });
        refreshCopiedTradersList();
      }

      updatePaperSnapshot();

      // Keep KuCoin config synchronized with mode & leverage
      if (
        partial.mode !== undefined ||
        partial.leverage !== undefined ||
        partial.tradeValueUsdt !== undefined
      ) {
        setKucoinConfig((prev) => {
          const nextKucoin: KuCoinConfig = {
            ...prev,
            enableLiveExecution: updated.mode === 'REAL',
            defaultLeverage: updated.leverage,
            maxOrderUsdt: updated.tradeValueUsdt,
          };
          saveKuCoinConfig(nextKucoin);
          return nextKucoin;
        });
      }
    },
    [refreshCopiedTradersList, updatePaperSnapshot]
  );

  // Set or reset Virtual Balance
  const handleSetVirtualBalance = useCallback(
    (newBalance: number, resetPositions: boolean, accountId?: string) => {
      paperEngine.setVirtualBalance(newBalance, resetPositions, accountId);
      updatePaperSnapshot();
    },
    [updatePaperSnapshot]
  );

  // Initial load (run once on mount)
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    handleTestBinanceConnection(binanceConfig);
    handleTestKuCoinConnection(kucoinConfig);
  }, [binanceConfig, kucoinConfig, handleTestBinanceConnection, handleTestKuCoinConnection]);

  // Update paper snapshot whenever ticker prices update
  useEffect(() => {
    updatePaperSnapshot();
  }, [pricesMap, updatePaperSnapshot]);

  // Refresh copied traders list when switching tabs
  useEffect(() => {
    refreshCopiedTradersList();
  }, [selectedTab, refreshCopiedTradersList]);

  // Stable refs so real-time background workers and intervals NEVER tear down or suffer stale closures
  const pricesMapRef = useRef<Record<string, number>>(pricesMap);
  pricesMapRef.current = pricesMap;
  const tickersRef = useRef(connectionState.tickers);
  tickersRef.current = connectionState.tickers;
  const kucoinConfigRef = useRef(kucoinConfig);
  kucoinConfigRef.current = kucoinConfig;
  const binanceConfigRef = useRef(binanceConfig);
  binanceConfigRef.current = binanceConfig;
  const handleSelectVirtualAccountRef = useRef(handleSelectVirtualAccount);
  handleSelectVirtualAccountRef.current = handleSelectVirtualAccount;

  // Sync a copied trader's Positions and Latest records using the target Account's trade settings
  const handleSyncTraderToEngine = useCallback(
    (params: {
      traderId: string;
      traderName: string;
      source: 'COPY_TRADING' | 'SMART_MONEY';
      positions: TraderOpenPosition[];
      latestRecords: TraderLatestRecord[];
      marginPerTradeUsdt: number;
      accountId?: string;
      overridePrices?: Record<string, number>;
    }): CopiedSyncLog[] => {
      const targetAcc = paperEngine.getAccount(params.accountId);
      const currentSettings = targetAcc.settings;
      const userTradeValue = currentSettings.enforceUserSizeOnCopy
        ? currentSettings.tradeValueUsdt
        : params.marginPerTradeUsdt || currentSettings.tradeValueUsdt;
      const userLeverage = currentSettings.leverage;
      const livePrices =
        params.overridePrices && Object.keys(params.overridePrices).length > 0
          ? { ...pricesMapRef.current, ...params.overridePrices }
          : pricesMapRef.current;

      // 1. Sync to target virtual account with live market prices, auto exits/partial exits & reconnect price advantage evaluation
      const logs = paperEngine.syncTraderPositionsAndRecords({
        traderId: params.traderId,
        traderName: params.traderName,
        source: params.source,
        positions: params.positions,
        latestRecords: params.latestRecords,
        marginPerTradeUsdt: userTradeValue,
        accountId: targetAcc.id,
        currentPrices: livePrices,
        checkReconnectAdvantage: true,
      });
      setPaperSnapshot(paperEngine.getSnapshot(livePrices));
      setTimeout(refreshCopiedTradersList, 50);

      // 2. Route synced entries, scale-ins, partial exits, and full exits to KuCoin API at current market price
      for (const log of logs) {
        if (
          log.action === 'POSITION_SYNC' ||
          log.action === 'ENTRY' ||
          log.action === 'SCALE_IN' ||
          log.action === 'PARTIAL_EXIT' ||
          log.action === 'EXIT'
        ) {
          if (log.quantity > 0) {
            const isClosingAction = log.action === 'EXIT' || log.action === 'PARTIAL_EXIT';
            const executionSide: 'LONG' | 'SHORT' = isClosingAction
              ? log.side === 'LONG'
                ? 'SHORT'
                : 'LONG'
              : log.side;

            const orderAmountUsdt =
              log.action === 'SCALE_IN'
                ? currentSettings.scaleInSamePercentAsTrader !== false
                  ? Number((userTradeValue * (Math.abs(log.volumePercent || 25) / 100)).toFixed(2))
                  : Math.max(1, currentSettings.scaleInFixedValueUsdt || 10)
                : log.action === 'PARTIAL_EXIT'
                ? Number((userTradeValue * (Math.abs(log.volumePercent || 30) / 100)).toFixed(2))
                : userTradeValue;

            executeKuCoinOrder({
              config: {
                ...kucoinConfigRef.current,
                enableLiveExecution: currentSettings.mode === 'REAL',
              },
              binanceSymbol: log.symbol,
              side: executionSide,
              amountUsdt: orderAmountUsdt,
              entryPrice: log.price,
              leverage: userLeverage,
              sourceTraderName: `${params.traderName} (${targetAcc.name})`,
              sourceSignal: `Binance ${params.source} [${targetAcc.name}] (${log.action} بالسعر الحالي • ${orderAmountUsdt}$ × ${userLeverage}x)`,
            })
              .then((ord) => {
                setKucoinConnectionState((prev) => ({
                  ...prev,
                  recentOrders: [ord, ...prev.recentOrders.filter((r) => r.id !== ord.id)].slice(
                    0,
                    50
                  ),
                }));
              })
              .catch((err) => {
                console.warn('KuCoin order execution error:', err);
              });
          }
        }
      }

      return logs;
    },
    [refreshCopiedTradersList]
  );

  // Copy a single position using the target Account's configured Trade Settings at the CURRENT LIVE MARKET PRICE
  const handleCopySinglePosition = useCallback(
    (pos: TraderOpenPosition, traderName: string, marginUsdt: number, accountId?: string) => {
      addWatchedFuturesSymbol(pos.symbol);
      const targetAcc = paperEngine.getAccount(accountId);
      const currentSettings = targetAcc.settings;
      const sym = pos.symbol.toUpperCase();
      // Always execute at the current live market price (السعر الحالي للسوق وليس برقم ثابت)
      const liveMarketPrice =
        pricesMap[sym] && pricesMap[sym] > 0
          ? pricesMap[sym]
          : pos.markPrice > 0
          ? pos.markPrice
          : pos.entryPrice > 0
          ? pos.entryPrice
          : 50.0;
      const effectiveMargin = currentSettings.enforceUserSizeOnCopy
        ? currentSettings.tradeValueUsdt
        : marginUsdt || currentSettings.tradeValueUsdt;
      const effectiveLeverage = currentSettings.enforceUserSizeOnCopy
        ? currentSettings.leverage
        : Math.min(Math.max(pos.leverage || currentSettings.leverage, 1), 50);

      try {
        paperEngine.openPositionWithUserSettings({
          symbol: pos.symbol,
          side: pos.side,
          entryPrice: liveMarketPrice,
          traderEntryPrice: pos.entryPrice > 0 ? pos.entryPrice : liveMarketPrice,
          traderLeverage: pos.leverage,
          customMarginUsdt: effectiveMargin,
          customLeverage: effectiveLeverage,
          sourceTraderName: traderName,
          sourceType: pos.id.startsWith('sm_') ? 'SMART_MONEY' : 'COPY_TRADING',
          traderEntryTime: pos.entryTime,
          traderScaleAdjustments: pos.scaleAdjustments,
          currentScalePercent: pos.currentScalePercent,
          accountId: targetAcc.id,
        });
        updatePaperSnapshot();
      } catch (e) {
        console.warn('Error copying position to engine:', e);
        return;
      }

      // Route to KuCoin with target account's size & leverage at current market price
      executeKuCoinOrder({
        config: {
          ...kucoinConfig,
          enableLiveExecution: currentSettings.mode === 'REAL',
        },
        binanceSymbol: pos.symbol,
        side: pos.side,
        amountUsdt: effectiveMargin,
        entryPrice: liveMarketPrice,
        leverage: effectiveLeverage,
        sourceTraderName: `${traderName} (${targetAcc.name})`,
        sourceSignal: `Single Copy Market [${targetAcc.name}] (${pos.symbol} ${pos.side} @ السعر الحالي ${liveMarketPrice} • ${effectiveMargin}$ × ${effectiveLeverage}x)`,
      })
        .then((ord) => {
          setKucoinConnectionState((prev) => ({
            ...prev,
            recentOrders: [ord, ...prev.recentOrders.filter((r) => r.id !== ord.id)].slice(0, 50),
          }));
        })
        .catch((err) => {
          console.warn('KuCoin execution failed:', err);
        });
    },
    [kucoinConfig, pricesMap, updatePaperSnapshot]
  );

  // Sync ALL currently copied traders across both Copy Trading & Whales in parallel at real-time speed
  const isSyncInFlightRef = useRef<boolean>(false);
  const pendingResyncRef = useRef<boolean>(false);
  const handleSyncTraderToEngineRef = useRef(handleSyncTraderToEngine);
  handleSyncTraderToEngineRef.current = handleSyncTraderToEngine;

  const handleSyncAllCopiedTraders = useCallback(async () => {
    if (mobileNotifications.isAppStoppedByFullExit()) return;
    const list = loadAllCopiedTradersFromStorage();
    if (list.length === 0) return;

    if (isSyncInFlightRef.current) {
      pendingResyncRef.current = true;
      return;
    }

    isSyncInFlightRef.current = true;
    setIsSyncingAll(true);

    try {
      // Fetch fresh live market prices concurrently alongside all copied traders (no sequential blocking!)
      const freshPricesPromise = fetchAllFuturesPrices(binanceConfigRef.current).catch(
        () => pricesMapRef.current
      );

      const traderDataPromises = list.map(async (ct) => {
        const targetAcc = paperEngine.getAccount(ct.accountId);
        if (ct.source === 'COPY_TRADING') {
          const data = await fetchCopyTraderFullData(ct.traderId, null, tickersRef.current);
          return { ct, targetAcc, data };
        } else {
          const data = await fetchSmartMoneyWhaleDetail(ct.traderId, null, tickersRef.current);
          return { ct, targetAcc, data };
        }
      });

      const [freshPrices, results] = await Promise.all([
        freshPricesPromise,
        Promise.allSettled(traderDataPromises),
      ]);

      const mergedPrices = { ...pricesMapRef.current, ...(freshPrices || {}) };
      pricesMapRef.current = mergedPrices;

      for (const res of results) {
        if (res.status === 'fulfilled') {
          const { ct, targetAcc, data } = res.value;
          handleSyncTraderToEngineRef.current({
            traderId: ct.traderId,
            traderName: ct.nickname,
            source: ct.source,
            positions: data.positions,
            latestRecords: data.latestRecords,
            marginPerTradeUsdt: targetAcc.settings.tradeValueUsdt,
            accountId: targetAcc.id,
            overridePrices: mergedPrices,
          });
        } else {
          console.warn('Failed syncing trader:', res.reason);
        }
      }

      setPaperSnapshot(paperEngine.getSnapshot(mergedPrices));
    } finally {
      isSyncInFlightRef.current = false;
      setIsSyncingAll(false);
      if (pendingResyncRef.current) {
        pendingResyncRef.current = false;
        setTimeout(() => {
          handleSyncAllCopiedTraders();
        }, 150);
      }
    }
  }, []);

  // Immediate initial sync once market tickers connect
  const hasInitialTraderSyncRunRef = useRef(false);
  useEffect(() => {
    if (connectionState.tickers.length > 0 && !hasInitialTraderSyncRunRef.current) {
      hasInitialTraderSyncRunRef.current = true;
      handleSyncAllCopiedTraders();
    }
  }, [connectionState.tickers.length, handleSyncAllCopiedTraders]);

  // Real-time continuous background synchronization:
  // Uses an unthrottled Blob Web Worker ticker (every 2.5s) + Service Worker heartbeat + immediate foreground/network events
  useEffect(() => {
    const syncWorker = startRealtimeSyncTicker(() => {
      if (mobileNotifications.isAppStoppedByFullExit()) return;
      handleSyncAllCopiedTraders();
    }, 2500);

    // Refresh full 24h market metadata every 15s independently without ever blocking copied-trader sync
    const marketInfoInterval = setInterval(() => {
      if (mobileNotifications.isAppStoppedByFullExit()) return;
      testConnectionAndFetchData(binanceConfigRef.current)
        .then((res) => {
          setConnectionState(res);
        })
        .catch(() => {});
    }, 15000);

    const handleImmediateSyncWakeup = () => {
      if (mobileNotifications.isAppStoppedByFullExit()) return;
      handleSyncAllCopiedTraders();
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        testConnectionAndFetchData(binanceConfigRef.current)
          .then((res) => {
            setConnectionState(res);
          })
          .catch(() => {});
      }
    };

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'SW_BACKGROUND_HEARTBEAT') {
        if (!mobileNotifications.isAppStoppedByFullExit()) {
          handleSyncAllCopiedTraders();
        }
      } else if (data.type === 'NOTIFICATION_CLICKED_FROM_LOCKSCREEN') {
        if (data.data?.accountId) {
          handleSelectVirtualAccountRef.current(data.data.accountId);
        }
        setSelectedTab('Simulation');
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleImmediateSyncWakeup);
      window.addEventListener('focus', handleImmediateSyncWakeup);
      window.addEventListener('pageshow', handleImmediateSyncWakeup);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleImmediateSyncWakeup);
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      syncWorker.stop();
      clearInterval(marketInfoInterval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleImmediateSyncWakeup);
        window.removeEventListener('focus', handleImmediateSyncWakeup);
        window.removeEventListener('pageshow', handleImmediateSyncWakeup);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleImmediateSyncWakeup);
      }
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [handleSyncAllCopiedTraders]);

  // Remove a copied trader from storage (optionally scoped to a specific virtual account)
  const handleRemoveCopiedTrader = useCallback(
    (traderId: string, source: 'COPY_TRADING' | 'SMART_MONEY', accountId?: string) => {
      const storageKey =
        source === 'COPY_TRADING' ? 'whale_copied_traders_ct' : 'whale_copied_traders_sm';
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const arr: ActiveCopiedTrader[] = JSON.parse(raw);
          const filtered = arr.filter((item) => {
            if (item.traderId !== traderId) return true;
            if (accountId && (item.accountId || 'acc_default') !== accountId) return true;
            return false;
          });
          localStorage.setItem(storageKey, JSON.stringify(filtered));
        }
      } catch {
        // ignore
      }
      refreshCopiedTradersList();
      updatePaperSnapshot();
    },
    [refreshCopiedTradersList, updatePaperSnapshot]
  );

  // Manual trade action (Always executes at Current Live Market Price)
  const handleOpenPaperOrder = (
    symbol: string,
    side: 'LONG' | 'SHORT',
    quantity: number,
    entryPrice: number,
    leverage: number
  ) => {
    const sym = symbol.toUpperCase();
    const liveMarketPrice =
      pricesMap[sym] && pricesMap[sym] > 0 ? pricesMap[sym] : entryPrice;
    const currentSettings = paperEngine.getSettings();
    const effectiveNotional = quantity * entryPrice;
    const liveQty = liveMarketPrice > 0 ? effectiveNotional / liveMarketPrice : quantity;

    paperEngine.openPosition(
      sym,
      side,
      liveQty,
      liveMarketPrice,
      leverage,
      undefined,
      'MANUAL'
    );
    updatePaperSnapshot();

    executeKuCoinOrder({
      config: {
        ...kucoinConfig,
        enableLiveExecution: currentSettings.mode === 'REAL',
      },
      binanceSymbol: sym,
      side,
      amountUsdt: (liveQty * liveMarketPrice) / leverage,
      entryPrice: liveMarketPrice,
      leverage,
      sourceTraderName: 'صفقة يدوية (بالسعر الحالي)',
      sourceSignal: 'Manual Market Execution (بالسعر الحالي للسوق)',
    })
      .then((ord) => {
        setKucoinConnectionState((prev) => ({
          ...prev,
          recentOrders: [ord, ...prev.recentOrders.filter((r) => r.id !== ord.id)].slice(0, 50),
        }));
      })
      .catch(console.warn);
  };

  const handleClosePaperPosition = (positionId: string, exitPrice: number) => {
    paperEngine.closePosition(positionId, exitPrice);
    updatePaperSnapshot();
  };

  const handleSecurePaperPosition = useCallback(
    (positionId: string, currentPrice: number, bufferPercent: number = 0.2) => {
      paperEngine.securePositionNearCurrentPrice(positionId, currentPrice, bufferPercent);
      updatePaperSnapshot();
    },
    [updatePaperSnapshot]
  );

  const handleExecutePendingReconnectChoice = useCallback(
    (choiceId: string) => {
      const opened = paperEngine.executePendingReconnectChoice(choiceId, pricesMap);
      updatePaperSnapshot();
      if (opened) {
        const targetAcc = paperEngine.getAccount(opened.accountId);
        executeKuCoinOrder({
          config: {
            ...kucoinConfig,
            enableLiveExecution: targetAcc.settings.mode === 'REAL',
          },
          binanceSymbol: opened.symbol,
          side: opened.side,
          amountUsdt: opened.marginUsdt,
          entryPrice: opened.entryPrice,
          leverage: opened.leverage,
          sourceTraderName: `${opened.sourceTraderName || 'متداول'} (${targetAcc.name})`,
          sourceSignal: `تأكيد تنفيذ صفقة سابقة بالسعر الحالي (${opened.symbol} ${opened.side} @ ${opened.entryPrice})`,
        })
          .then((ord) => {
            setKucoinConnectionState((prev) => ({
              ...prev,
              recentOrders: [ord, ...prev.recentOrders.filter((r) => r.id !== ord.id)].slice(0, 50),
            }));
          })
          .catch(console.warn);
      }
    },
    [kucoinConfig, pricesMap, updatePaperSnapshot]
  );

  const handleDismissPendingReconnectChoice = useCallback(
    (choiceId: string) => {
      paperEngine.dismissPendingReconnectChoice(choiceId);
      updatePaperSnapshot();
    },
    [updatePaperSnapshot]
  );

  const handleTriggerSampleReconnectChoice = useCallback(() => {
    paperEngine.triggerSampleReconnectChoiceNotification(pricesMap);
    updatePaperSnapshot();
  }, [pricesMap, updatePaperSnapshot]);

  const handleScaleInPaperPosition = (
    positionId: string,
    addPercent: number,
    price: number,
    customAddedMarginUsdt?: number
  ) => {
    paperEngine.scaleInPosition(positionId, addPercent, price, Date.now(), customAddedMarginUsdt);
    updatePaperSnapshot();
  };

  const handlePartialExitPaperPosition = (
    positionId: string,
    withdrawPercent: number,
    price: number
  ) => {
    paperEngine.partialExitPosition(positionId, withdrawPercent, price, Date.now());
    updatePaperSnapshot();
  };

  const handleResetPaper = () => {
    paperEngine.reset();
    updatePaperSnapshot();
  };

  const handleClearClosedHistory = useCallback(
    (allAccounts: boolean = false) => {
      paperEngine.clearClosedPositions(undefined, allAccounts);
      updatePaperSnapshot();
    },
    [updatePaperSnapshot]
  );

  const handleClearAllPaperData = useCallback(
    (options?: {
      scope?: 'ACTIVE_ACCOUNT' | 'ALL_ACCOUNTS';
      removeExtraAccounts?: boolean;
      clearCopiedTraders?: boolean;
    }) => {
      paperEngine.clearAllDataAndReset({
        scope: options?.scope || 'ALL_ACCOUNTS',
        removeExtraAccounts: options?.removeExtraAccounts || false,
      });

      clearKuCoinOrderHistory();
      setKucoinConnectionState((prev) => ({
        ...prev,
        recentOrders: [],
      }));

      mobileNotifications.clearAllNotifications();

      if (options?.clearCopiedTraders) {
        try {
          localStorage.removeItem('whale_copied_traders_ct');
          localStorage.removeItem('whale_copied_traders_sm');
        } catch {
          // ignore
        }
        refreshCopiedTradersList();
      } else if (options?.removeExtraAccounts) {
        const activeId = paperEngine.getActiveAccountId();
        const activeName = paperEngine.getActiveAccountName();
        ['whale_copied_traders_ct', 'whale_copied_traders_sm'].forEach((key) => {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const arr: ActiveCopiedTrader[] = JSON.parse(raw);
              const updated = arr.map((ct) => ({
                ...ct,
                accountId: activeId,
                accountName: activeName,
              }));
              localStorage.setItem(key, JSON.stringify(updated));
            }
          } catch {
            // ignore
          }
        });
        refreshCopiedTradersList();
      }

      updatePaperSnapshot();
    },
    [refreshCopiedTradersList, updatePaperSnapshot]
  );

  const [apiSubTab, setApiSubTab] = useState<'KUCOIN' | 'BINANCE'>('KUCOIN');

  // KuCoin Live Execution Tab Security Lock (PIN Code & Fingerprint)
  const [kucoinSecurityConfig, setKucoinSecurityConfig] = useState<KuCoinSecurityLockConfig>(() =>
    loadKuCoinSecurityConfig()
  );
  const [kucoinUnlockState, setKucoinUnlockState] = useState<{
    isUnlocked: boolean;
    lastUnlockedAt: number | null;
  }>({
    isUnlocked: true,
    lastUnlockedAt: Date.now(),
  });

  const isKucoinSecurityUnlocked = useMemo(() => {
    return !shouldRequireUnlock(kucoinSecurityConfig, {
      isUnlocked: kucoinUnlockState.isUnlocked,
      lastUnlockedAt: kucoinUnlockState.lastUnlockedAt,
      now: Date.now(),
    });
  }, [kucoinSecurityConfig, kucoinUnlockState]);

  const handleUnlockKucoinSecurity = useCallback(
    (_method: 'PIN' | 'BIOMETRIC', updatedCredentialId?: string | null) => {
      if (updatedCredentialId && updatedCredentialId !== kucoinSecurityConfig.biometricCredentialId) {
        const nextCfg = saveKuCoinSecurityConfig({ biometricCredentialId: updatedCredentialId });
        setKucoinSecurityConfig(nextCfg);
      }
      setKucoinUnlockState({
        isUnlocked: true,
        lastUnlockedAt: Date.now(),
      });
    },
    [kucoinSecurityConfig.biometricCredentialId]
  );

  const handleLockKucoinSecurityNow = useCallback(() => {
    setKucoinUnlockState({
      isUnlocked: false,
      lastUnlockedAt: null,
    });
  }, []);

  const handleUpdateKucoinSecurityConfig = useCallback(
    (partial: Partial<KuCoinSecurityLockConfig>) => {
      const updated = saveKuCoinSecurityConfig(partial);
      setKucoinSecurityConfig(updated);
    },
    []
  );

  // Target trader / whale selection when navigating from SimulationTab
  const [targetTraderId, setTargetTraderId] = useState<string | null>(null);
  const [targetWhaleId, setTargetWhaleId] = useState<string | null>(null);

  const handleOpenTraderStats = useCallback(
    (traderId: string, source: 'COPY_TRADING' | 'SMART_MONEY', traderName?: string) => {
      if (source === 'SMART_MONEY') {
        setTargetWhaleId(traderId);
        setSelectedTab('Whales');
      } else {
        setTargetTraderId(traderId);
        setSelectedTab('Copy Trading');
      }
    },
    []
  );

  // Mobile Trade Notifications State
  const [showNotificationsCenter, setShowNotificationsCenter] = useState<boolean>(false);
  const [notificationsList, setNotificationsList] = useState<MobileTradeNotification[]>(() =>
    mobileNotifications.getNotifications()
  );
  const [notificationSettings, setNotificationSettings] = useState<MobileNotificationSettings>(() =>
    mobileNotifications.getSettings()
  );
  const [activePushBanner, setActivePushBanner] = useState<MobileTradeNotification | null>(null);

  useEffect(() => {
    let bannerTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = mobileNotifications.subscribe((latest, all, settings) => {
      setNotificationsList(all);
      setNotificationSettings(settings);
      if (latest && settings.enabled && settings.inAppBannerEnabled) {
        setActivePushBanner(latest);
        if (bannerTimer) clearTimeout(bannerTimer);
        const duration = latest.actionType === 'RECONNECT_TRADE_CHOICE' ? 18000 : 7000;
        bannerTimer = setTimeout(() => {
          setActivePushBanner(null);
        }, duration);
      }
    });
    return () => {
      unsubscribe();
      if (bannerTimer) clearTimeout(bannerTimer);
    };
  }, []);

  const unreadNotificationsCount = useMemo(
    () => notificationsList.filter((n) => !n.read).length,
    [notificationsList]
  );

  const openPositionsCount = useMemo(
    () => paperSnapshot.positions.filter((p) => p.status === 'OPEN').length,
    [paperSnapshot.positions]
  );

  const handleOpenKucoinApi = useCallback(() => {
    setApiSubTab('KUCOIN');
    setSelectedTab('API');
  }, []);

  const handleOpenBinanceApi = useCallback(() => {
    setApiSubTab('BINANCE');
    setSelectedTab('API');
  }, []);

  const handleOpenNotificationsCenter = useCallback(() => {
    setShowNotificationsCenter(true);
    mobileNotifications.markAllAsRead();
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0E11] text-white flex flex-col font-sans selection:bg-[#01BC8D]/30 content-safe pl-safe pr-safe">
      {/* Top In-App Mobile Push Notification Banner */}
      <MobilePushToastBanner
        notification={activePushBanner}
        onDismiss={() => setActivePushBanner(null)}
        onOpenSimulation={() => setSelectedTab('Simulation')}
        onOpenCenter={handleOpenNotificationsCenter}
        onSelectAccount={handleSelectVirtualAccount}
        onExecutePendingChoice={handleExecutePendingReconnectChoice}
        onDismissPendingChoice={handleDismissPendingReconnectChoice}
      />

      {/* Top Header Bar */}
      <Header
        connectionState={connectionState}
        kucoinConnectionState={kucoinConnectionState}
        isSettingsActive={selectedTab === 'Settings'}
        activeApiSubTab={
          selectedTab === 'API' || selectedTab === 'KuCoinAPI' || selectedTab === 'BinanceAPI'
            ? apiSubTab
            : null
        }
        unreadNotificationsCount={unreadNotificationsCount}
        notificationsEnabled={notificationSettings.enabled}
        onOpenNotifications={handleOpenNotificationsCenter}
        onOpenApiTab={handleOpenBinanceApi}
        onOpenKucoinTab={handleOpenKucoinApi}
        onOpenSettingsTab={() => setSelectedTab('Settings')}
        onOpenHomeTab={() => setSelectedTab('Dashboard')}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 sm:py-6">
        {selectedTab === 'Dashboard' && (
          <DashboardTab
            connectionState={connectionState}
            kucoinConnectionState={kucoinConnectionState}
            paperSnapshot={paperSnapshot}
            config={binanceConfig}
            onOpenKucoinSetup={handleOpenKucoinApi}
            onRefreshMarket={() => handleTestBinanceConnection(binanceConfig)}
            onRefreshKucoin={() => handleTestKuCoinConnection(kucoinConfig)}
            onFetchRealKucoinBalance={() => handleTestKuCoinConnection(kucoinConfig, true)}
          />
        )}

        {(selectedTab === 'API' ||
          selectedTab === 'KuCoinAPI' ||
          selectedTab === 'BinanceAPI') && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-[#12171D] border border-[#1E2733] rounded-2xl px-4 pt-3.5 pb-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 pb-2.5">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">
                    ربط المنصات
                  </h2>
                  <p className="text-xs text-[#8A99AD] mt-0.5">
                    كوكوين لتنفيذ الصفقات وإدارة الرصيد • باينانس لجلب بيانات المتداولين والحيتان والأسعار
                  </p>
                </div>
              </div>

              <div className="flex items-center border-t border-[#1E2733] -mx-4 px-4">
                <button
                  type="button"
                  onClick={() => {
                    setApiSubTab('KUCOIN');
                  }}
                  data-testid="api_subtab_kucoin"
                  className={`flex-1 py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    apiSubTab === 'KUCOIN'
                      ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                      : 'border-transparent text-[#8A99AD] hover:text-white'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      kucoinConnectionState.isConnected ? 'bg-[#01BC8D]' : 'bg-[#F6465D]'
                    }`}
                  />
                  <span>كوكوين للتنفيذ</span>
                  {kucoinSecurityConfig.enabled &&
                    (isKucoinSecurityUnlocked ? (
                      <Unlock className="w-3.5 h-3.5 text-[#01BC8D]" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-[#01BC8D]" />
                    ))}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setApiSubTab('BINANCE');
                  }}
                  data-testid="api_subtab_binance"
                  className={`flex-1 py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    apiSubTab === 'BINANCE'
                      ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                      : 'border-transparent text-[#8A99AD] hover:text-white'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      connectionState.isConnected ? 'bg-[#01BC8D]' : 'bg-[#F6465D]'
                    }`}
                  />
                  <span>باينانس للمعلومات</span>
                </button>
              </div>
            </div>

            {apiSubTab === 'KUCOIN' ? (
              <KucoinApiTab
                config={kucoinConfig}
                connectionState={kucoinConnectionState}
                onSaveAndTest={handleSaveKuCoin}
                onClearKeys={handleClearKuCoin}
                onRefresh={() => handleTestKuCoinConnection(kucoinConfig)}
                onClearOrderHistory={handleClearKuCoinOrders}
                onOpenSimulationTab={() => setSelectedTab('Simulation')}
                securityConfig={kucoinSecurityConfig}
                isSecurityUnlocked={isKucoinSecurityUnlocked}
                onUnlockSecurity={handleUnlockKucoinSecurity}
                onLockSecurityNow={handleLockKucoinSecurityNow}
                onUpdateSecurityConfig={handleUpdateKucoinSecurityConfig}
                onOpenSettingsTab={() => setSelectedTab('Settings')}
              />
            ) : (
              <BinanceApiTab
                config={binanceConfig}
                connectionState={connectionState}
                onSaveAndTest={handleSaveAndTestBinance}
                onClearKeys={handleClearBinanceKeys}
              />
            )}
          </div>
        )}

        {selectedTab === 'Whales' && (
          <WhalesTab
            connectionState={connectionState}
            kucoinConfig={kucoinConfig}
            kucoinConnectionState={kucoinConnectionState}
            tradeSettings={paperSnapshot.settings}
            openPositionsCount={openPositionsCount}
            accounts={paperSnapshot.accounts}
            activeAccountId={paperSnapshot.activeAccountId}
            onCreateAccount={handleCreateVirtualAccount}
            onRefresh={() => handleTestBinanceConnection(binanceConfig)}
            onOpenKucoin={handleOpenKucoinApi}
            onSyncTraderToEngine={handleSyncTraderToEngine}
            onCopySinglePosition={handleCopySinglePosition}
            onOpenSimulationTab={() => setSelectedTab('Simulation')}
            targetWhaleId={targetWhaleId}
            onClearTargetWhaleId={() => setTargetWhaleId(null)}
          />
        )}

        {selectedTab === 'Copy Trading' && (
          <CopyTradingTab
            connectionState={connectionState}
            kucoinConfig={kucoinConfig}
            kucoinConnectionState={kucoinConnectionState}
            tradeSettings={paperSnapshot.settings}
            openPositionsCount={openPositionsCount}
            accounts={paperSnapshot.accounts}
            activeAccountId={paperSnapshot.activeAccountId}
            onCreateAccount={handleCreateVirtualAccount}
            auto={autoCopy}
            onAutoChange={handleSetAutoCopy}
            onOpenApi={handleOpenBinanceApi}
            onOpenKucoin={handleOpenKucoinApi}
            onSyncTraderToEngine={handleSyncTraderToEngine}
            onCopySinglePosition={handleCopySinglePosition}
            onOpenSimulationTab={() => setSelectedTab('Simulation')}
            targetTraderId={targetTraderId}
            onClearTargetTraderId={() => setTargetTraderId(null)}
          />
        )}

        {selectedTab === 'Simulation' && (
          <SimulationTab
            connectionState={connectionState}
            kucoinConnectionState={kucoinConnectionState}
            paperSnapshot={paperSnapshot}
            copiedTraders={allCopiedTraders}
            isSyncingAll={isSyncingAll}
            onSelectAccount={handleSelectVirtualAccount}
            onCreateAccount={handleCreateVirtualAccount}
            onRenameAccount={handleRenameVirtualAccount}
            onDeleteAccount={handleDeleteVirtualAccount}
            onUpdateTradeSettings={handleUpdateTradeSettings}
            onSetVirtualBalance={handleSetVirtualBalance}
            onOpenOrder={handleOpenPaperOrder}
            onClosePosition={handleClosePaperPosition}
            onSecurePosition={handleSecurePaperPosition}
            onExecutePendingChoice={handleExecutePendingReconnectChoice}
            onDismissPendingChoice={handleDismissPendingReconnectChoice}
            onTriggerSampleReconnectChoice={handleTriggerSampleReconnectChoice}
            onScaleInPosition={handleScaleInPaperPosition}
            onPartialExitPosition={handlePartialExitPaperPosition}
            onResetPaper={handleResetPaper}
            onClearAllPaperData={handleClearAllPaperData}
            onClearClosedHistory={handleClearClosedHistory}
            onSyncAllCopiedTraders={handleSyncAllCopiedTraders}
            onRemoveCopiedTrader={handleRemoveCopiedTrader}
            onNavigateToTab={(tab) => {
              if (tab === 'KuCoinAPI') handleOpenKucoinApi();
              else setSelectedTab(tab);
            }}
            onOpenTraderStats={handleOpenTraderStats}
            notificationSettings={notificationSettings}
            onUpdateNotificationSettings={(partial) => mobileNotifications.updateSettings(partial)}
            onOpenNotificationsCenter={handleOpenNotificationsCenter}
            securityConfig={kucoinSecurityConfig}
            isSecurityUnlocked={isKucoinSecurityUnlocked}
            onUnlockSecurity={handleUnlockKucoinSecurity}
            onLockSecurityNow={handleLockKucoinSecurityNow}
          />
        )}

        {selectedTab === 'Settings' && (
          <SettingsTab
            config={binanceConfig}
            connectionState={connectionState}
            notificationSettings={notificationSettings}
            onUpdateNotificationSettings={(partial) => mobileNotifications.updateSettings(partial)}
            securityConfig={kucoinSecurityConfig}
            onUpdateSecurityConfig={handleUpdateKucoinSecurityConfig}
            onLockSecurityNow={handleLockKucoinSecurityNow}
            onLive={() => setShowLiveDialog(true)}
            onOpenApiSetup={handleOpenKucoinApi}
            onOpenNotifications={handleOpenNotificationsCenter}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <Navigation
        currentTab={selectedTab}
        onSelectTab={(tab) => {
          if (tab === 'API') {
            setSelectedTab('API');
          } else {
            setSelectedTab(tab);
          }
        }}
      />

      {/* Live Trading Security Modal */}
      <LiveSecurityModal
        isOpen={showLiveDialog}
        onClose={() => setShowLiveDialog(false)}
        onOpenApiTab={handleOpenKucoinApi}
      />

      {/* Mobile Trade Notifications Center Modal */}
      <MobileNotificationsCenterModal
        isOpen={showNotificationsCenter}
        onClose={() => setShowNotificationsCenter(false)}
        notifications={notificationsList}
        settings={notificationSettings}
        onUpdateSettings={(partial) => mobileNotifications.updateSettings(partial)}
        onMarkAllRead={() => mobileNotifications.markAllAsRead()}
        onClearAll={() => mobileNotifications.clearAllNotifications()}
        onNavigateToSimulation={() => setSelectedTab('Simulation')}
        onSelectAccount={handleSelectVirtualAccount}
        onExecutePendingChoice={handleExecutePendingReconnectChoice}
        onDismissPendingChoice={handleDismissPendingReconnectChoice}
      />
    </div>
  );
};

export default App;
