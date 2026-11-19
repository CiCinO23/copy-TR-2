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
import { AppErrorBoundary } from './components/AppErrorBoundary';
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
  TraderPositionHistoryItem,
  CopiedSyncLog,
  ActiveCopiedTrader,
  MobileTradeNotification,
  MobileNotificationSettings,
  KuCoinSecurityLockConfig,
  ManualSingleCopyResult,
} from './types';
import { Lock, Unlock } from 'lucide-react';
import {
  loadBinanceConfig,
  saveBinanceConfig,
  clearBinanceKeys,
  testConnectionAndFetchData,
  fetchAllFuturesPrices,
  addWatchedFuturesSymbol,
  pingBinanceServer,
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
  fetchKuCoinFuturesContracts,
  pingKuCoinServer,
  type KuCoinOrderRequestParams,
} from './services/kucoinApi';
import {
  fetchCopyTraderFullData,
  fetchSmartMoneyWhaleDetail,
} from './services/copyAndSmartMoneyApi';
import { paperEngine } from './services/paperTrading';
import { mobileNotifications } from './services/mobileNotifications';
import { createCentralizedSyncScheduler } from './services/realtimeSyncWorker';
import { memoryCleanupService } from './services/memoryCleanup';
import { shouldAbortStaleInFlightSync } from './services/syncResilience';
import {
  BinanceFuturesPriceStream,
  type WebSocketStreamStatus,
} from './services/binanceWebSocket';
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
  const [wsStatus, setWsStatus] = useState<WebSocketStreamStatus>('DISCONNECTED');

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

  const routeDrainedAutoLogsRef = useRef<((logs: CopiedSyncLog[]) => void) | null>(null);

  const updatePaperSnapshot = useCallback(() => {
    const snap = paperEngine.getSnapshot(pricesMap);
    setPaperSnapshot(snap);
    const autoLogs = paperEngine.drainTriggeredAutoLogs();
    if (autoLogs.length > 0) {
      routeDrainedAutoLogsRef.current?.(autoLogs);
    }
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

  // Exclusive Settings Vault Handlers (v2.1 / v2.23)
  const handleSaveKuCoinSecrets = useCallback(
    (secrets: { apiSecret: string; passphrase: string }) => {
      setKucoinConfig((prev) => {
        const next: KuCoinConfig = {
          ...prev,
          apiSecret: secrets.apiSecret.trim(),
          passphrase: secrets.passphrase.trim(),
        };
        saveKuCoinConfig(next);
        return next;
      });
    },
    []
  );

  const handleSaveBinanceSecret = useCallback((apiSecret: string) => {
    setBinanceConfig((prev) => {
      const next: BinanceConfig = {
        ...prev,
        apiSecret: apiSecret.trim(),
      };
      saveBinanceConfig(next);
      return next;
    });
  }, []);

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

      if (partial.promptOnUnfavorableLateEntry === false) {
        setTimeout(() => {
          handleSyncAllCopiedTradersRef.current?.();
        }, 50);
      }

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

  // Initial load (run once on mount) + warm KuCoin Futures contract multipliers cache
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    handleTestBinanceConnection(binanceConfig);
    handleTestKuCoinConnection(kucoinConfig);
    fetchKuCoinFuturesContracts().catch(() => {});
  }, [binanceConfig, kucoinConfig, handleTestBinanceConnection, handleTestKuCoinConnection]);

  // Real-time Binance USDⓈ-M Futures WebSocket Price Stream (!miniTicker@arr, 300ms throttled batching)
  const lastWsPriceTickAtRef = useRef<number>(0);
  const wsStreamRef = useRef<BinanceFuturesPriceStream | null>(null);
  useEffect(() => {
    const stream = new BinanceFuturesPriceStream(
      {
        onStatusChange: (status) => {
          setWsStatus(status);
        },
        onPriceBatch: (batch) => {
          if (mobileNotifications.isAppStoppedByFullExit()) return;
          lastWsPriceTickAtRef.current = Date.now();
          const merged: Record<string, number> = {
            ...pricesMapRef.current,
            ...batch,
          };
          pricesMapRef.current = merged;

          // Evaluate auto SL / TP / Trailing-Stop / Liquidation & Pending Limit Orders at sub-second latency
          const nextSnap = paperEngine.getSnapshot(merged);
          const autoLogs = paperEngine.drainTriggeredAutoLogs();
          if (autoLogs.length > 0) {
            routeDrainedAutoLogsRef.current?.(autoLogs);
          }

          React.startTransition(() => {
            setPaperSnapshot(nextSnap);
            setConnectionState((prev) => ({
              ...prev,
              allPrices: {
                ...(prev.allPrices || {}),
                ...batch,
              },
              tickers: prev.tickers.map((t) => {
                const live = batch[t.symbol];
                if (!live || live <= 0) return t;
                const formatted =
                  live >= 100
                    ? live.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : live >= 1
                    ? live.toFixed(4)
                    : live.toFixed(6);
                return { ...t, lastPrice: formatted };
              }),
            }));
          });
        },
      },
      300
    );

    wsStreamRef.current = stream;
    stream.start(binanceConfig.environment);
    return () => {
      wsStreamRef.current = null;
      stream.stop();
    };
  }, [binanceConfig.environment]);

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
  const handleSyncAllCopiedTradersRef = useRef<(() => Promise<void>) | null>(null);

  // Sync a copied trader's Positions and Latest records using the target Account's trade settings
  const handleSyncTraderToEngine = useCallback(
    (params: {
      traderId: string;
      traderName: string;
      source: 'COPY_TRADING' | 'SMART_MONEY';
      positions: TraderOpenPosition[];
      latestRecords: TraderLatestRecord[];
      positionHistory?: TraderPositionHistoryItem[];
      marginPerTradeUsdt: number;
      accountId?: string;
      overridePrices?: Record<string, number>;
      isPartialOrRateLimited?: boolean;
      forceImmediateExecution?: boolean;
      copiedStartedAt?: number;
    }): CopiedSyncLog[] => {
      const targetAcc = paperEngine.getAccount(params.accountId);
      const currentSettings = targetAcc.settings;
      const userTradeValue = currentSettings.enforceUserSizeOnCopy
        ? currentSettings.tradeValueUsdt
        : params.marginPerTradeUsdt || currentSettings.tradeValueUsdt;
      const userLeverage = currentSettings.leverage;

      // Ensure all symbols from whale/trader open positions are watched and have their live markPrice in the price map
      const positionMarkPrices: Record<string, number> = {};
      for (const pos of params.positions) {
        if (pos?.symbol) {
          const sym = pos.symbol.toUpperCase().trim();
          addWatchedFuturesSymbol(sym);
          if (pos.markPrice && pos.markPrice > 0) {
            positionMarkPrices[sym] = pos.markPrice;
          }
        }
      }

      const livePrices: Record<string, number> = {
        ...positionMarkPrices,
        ...pricesMapRef.current,
        ...(params.overridePrices || {}),
      };
      pricesMapRef.current = livePrices;

      // 1. Sync to target virtual account with live market prices, auto exits/partial exits & immediate whale trade execution
      const logs = paperEngine.syncTraderPositionsAndRecords({
        traderId: params.traderId,
        traderName: params.traderName,
        source: params.source,
        positions: params.positions,
        latestRecords: params.latestRecords,
        positionHistory: params.positionHistory,
        marginPerTradeUsdt: userTradeValue,
        accountId: targetAcc.id,
        currentPrices: livePrices,
        checkReconnectAdvantage: currentSettings.promptOnUnfavorableLateEntry !== false,
        forceImmediateExecution:
          params.forceImmediateExecution || params.source === 'SMART_MONEY',
        copiedStartedAt: params.copiedStartedAt,
        isPartialOrRateLimited: params.isPartialOrRateLimited,
      });

      React.startTransition(() => {
        setPaperSnapshot(paperEngine.getSnapshot(livePrices));
      });
      setTimeout(refreshCopiedTradersList, 50);

      // 2. Route synced entries, scale-ins, partial exits, and full exits to KuCoin API simultaneously via Promise.all
      const batchOrders: KuCoinOrderRequestParams[] = [];
      for (const log of logs) {
        if (
          (log.action === 'POSITION_SYNC' ||
            log.action === 'ENTRY' ||
            log.action === 'SCALE_IN' ||
            log.action === 'PARTIAL_EXIT' ||
            log.action === 'EXIT') &&
          log.quantity > 0
        ) {
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

          batchOrders.push({
            config: {
              ...kucoinConfigRef.current,
              enableLiveExecution: currentSettings.mode === 'REAL',
            },
            binanceSymbol: log.symbol,
            side: executionSide,
            amountUsdt: orderAmountUsdt,
            entryPrice: log.price,
            leverage: userLeverage,
            reduceOnly: isClosingAction,
            sourceTraderName: `${params.traderName} (${targetAcc.name})`,
            sourceSignal: `Binance ${params.source} [${targetAcc.name}] (${log.action} بالسعر الحالي • ${orderAmountUsdt}$ × ${userLeverage}x)`,
          });
        }
      }

      if (batchOrders.length > 0) {
        executeKuCoinOrder(batchOrders)
          .then((executedOrders) => {
            if (executedOrders.length === 0) return;
            const newIds = new Set(executedOrders.map((o) => o.id));
            setKucoinConnectionState((prev) => ({
              ...prev,
              recentOrders: [
                ...executedOrders,
                ...prev.recentOrders.filter((r) => !newIds.has(r.id)),
              ].slice(0, 50),
            }));
          })
          .catch((err) => {
            console.warn('KuCoin batch order execution error:', err);
          });
      }

      return logs;
    },
    [refreshCopiedTradersList]
  );

  const routeSyncedLogsToKuCoin = useCallback((logs: CopiedSyncLog[]) => {
    const batchOrders: KuCoinOrderRequestParams[] = [];
    for (const log of logs) {
      if (
        (log.action === 'POSITION_SYNC' ||
          log.action === 'ENTRY' ||
          log.action === 'SCALE_IN' ||
          log.action === 'PARTIAL_EXIT' ||
          log.action === 'EXIT') &&
        log.quantity > 0
      ) {
        const targetAcc = paperEngine.getAccount(log.accountId);
        const currentSettings = targetAcc.settings;
        const userTradeValue = currentSettings.tradeValueUsdt;
        const userLeverage = log.leverage || currentSettings.leverage;
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

        batchOrders.push({
          config: {
            ...kucoinConfigRef.current,
            enableLiveExecution: currentSettings.mode === 'REAL',
          },
          binanceSymbol: log.symbol,
          side: executionSide,
          amountUsdt: orderAmountUsdt,
          entryPrice: log.price,
          leverage: userLeverage,
          reduceOnly: isClosingAction,
          sourceTraderName: `${log.traderName} (${targetAcc.name})`,
          sourceSignal: `Binance ${log.source} [${targetAcc.name}] (${log.action} بالسعر الحالي • ${orderAmountUsdt}$ × ${userLeverage}x)`,
        });
      }
    }

    if (batchOrders.length > 0) {
      executeKuCoinOrder(batchOrders)
        .then((executedOrders) => {
          if (executedOrders.length === 0) return;
          const newIds = new Set(executedOrders.map((o) => o.id));
          setKucoinConnectionState((prev) => ({
            ...prev,
            recentOrders: [
              ...executedOrders,
              ...prev.recentOrders.filter((r) => !newIds.has(r.id)),
            ].slice(0, 50),
          }));
        })
        .catch((err) => {
          console.warn('KuCoin batch order execution error:', err);
        });
    }
  }, []);

  routeDrainedAutoLogsRef.current = routeSyncedLogsToKuCoin;

  // Copy a single position using the target Account's configured Trade Settings at the CURRENT LIVE MARKET PRICE
  // If already copied with no uncopied changes -> do nothing.
  // If already copied with uncopied partial exits or scale-ins -> copy only the uncopied changes without duplicating the trade.
  const handleCopySinglePosition = useCallback(
    (
      pos: TraderOpenPosition,
      traderName: string,
      marginUsdt: number,
      accountId?: string
    ): ManualSingleCopyResult | undefined => {
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

      let copyResult: ManualSingleCopyResult;
      try {
        copyResult = paperEngine.copyOrSyncSinglePositionManually({
          pos,
          traderName,
          sourceType: pos.id.startsWith('sm_') ? 'SMART_MONEY' : 'COPY_TRADING',
          entryPrice: liveMarketPrice,
          customMarginUsdt: effectiveMargin,
          customLeverage: effectiveLeverage,
          accountId: targetAcc.id,
        });
        updatePaperSnapshot();
      } catch (e) {
        console.warn('Error copying position to engine:', e);
        return undefined;
      }

      // 1. If the trade is already copied and has no uncopied partial exits or scale-ins, do nothing
      if (copyResult.status === 'NO_CHANGES_ALREADY_COPIED') {
        return copyResult;
      }

      // 2. If the trade is already copied and had uncopied partial exits or scale-ins, route ONLY those deltas simultaneously to KuCoin via Promise.all
      if (copyResult.status === 'SYNCED_DELTAS_ONLY') {
        const deltaOrders: KuCoinOrderRequestParams[] = copyResult.appliedDeltas.map((delta) => {
          const orderSide: 'LONG' | 'SHORT' =
            delta.actionType === 'PARTIAL_EXIT'
              ? pos.side === 'LONG'
                ? 'SHORT'
                : 'LONG'
              : pos.side;
          const signalLabel =
            delta.actionType === 'PARTIAL_EXIT'
              ? `Manual Delta Sync Partial Exit -${delta.volumePercent}% [${targetAcc.name}] (${pos.symbol})`
              : `Manual Delta Sync Scale-In +${delta.volumePercent}% [${targetAcc.name}] (${pos.symbol})`;

          return {
            config: {
              ...kucoinConfig,
              enableLiveExecution: currentSettings.mode === 'REAL',
            },
            binanceSymbol: pos.symbol,
            side: orderSide,
            amountUsdt: Math.max(1, delta.marginDeltaUsdt),
            entryPrice: delta.price > 0 ? delta.price : liveMarketPrice,
            leverage: delta.leverage || effectiveLeverage,
            reduceOnly: delta.actionType === 'PARTIAL_EXIT',
            sourceTraderName: `${traderName} (${targetAcc.name})`,
            sourceSignal: signalLabel,
          };
        });

        if (deltaOrders.length > 0) {
          executeKuCoinOrder(deltaOrders)
            .then((executedOrders) => {
              if (executedOrders.length === 0) return;
              const newIds = new Set(executedOrders.map((o) => o.id));
              setKucoinConnectionState((prev) => ({
                ...prev,
                recentOrders: [
                  ...executedOrders,
                  ...prev.recentOrders.filter((r) => !newIds.has(r.id)),
                ].slice(0, 50),
              }));
            })
            .catch((err) => {
              console.warn('KuCoin delta batch execution failed:', err);
            });
        }
        return copyResult;
      }

      // 3. Newly opened position: route initial entry to KuCoin once
      executeKuCoinOrder({
        config: {
          ...kucoinConfig,
          enableLiveExecution: currentSettings.mode === 'REAL',
        },
        binanceSymbol: pos.symbol,
        side: pos.side,
        amountUsdt: copyResult.position.marginUsdt || effectiveMargin,
        entryPrice: liveMarketPrice,
        leverage: copyResult.position.leverage || effectiveLeverage,
        sourceTraderName: `${traderName} (${targetAcc.name})`,
        sourceSignal: `Single Copy Market [${targetAcc.name}] (${pos.symbol} ${pos.side} @ السعر الحالي ${liveMarketPrice} • ${copyResult.position.marginUsdt || effectiveMargin}$ × ${copyResult.position.leverage || effectiveLeverage}x)`,
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

      return copyResult;
    },
    [kucoinConfig, pricesMap, updatePaperSnapshot]
  );

  // Sync ALL currently copied traders & whales in parallel with sleep-recovery abort guards
  const isSyncInFlightRef = useRef<boolean>(false);
  const syncStartedAtRef = useRef<number>(0);
  const pendingResyncRef = useRef<boolean>(false);
  const activeSyncAbortControllerRef = useRef<AbortController | null>(null);

  // Lightweight independent ping probes for Binance & KuCoin Header indicators
  const refreshExchangePings = useCallback(async () => {
    if (mobileNotifications.isAppStoppedByFullExit()) return;
    const [binanceProbe, kucoinProbe] = await Promise.all([
      pingBinanceServer(binanceConfigRef.current, 3500).catch(() => ({
        reachable: false,
        latencyMs: null,
      })),
      pingKuCoinServer(3500).catch(() => ({
        reachable: false,
        latencyMs: null,
        serverTimestamp: Date.now(),
      })),
    ]);

    React.startTransition(() => {
      setConnectionState((prev) => ({
        ...prev,
        isConnected: binanceProbe.reachable ? true : prev.tickers.length > 0 ? prev.isConnected : false,
        latencyMs: binanceProbe.latencyMs,
      }));
      setKucoinConnectionState((prev) => ({
        ...prev,
        isConnected: kucoinProbe.reachable ? true : prev.isAuthenticated ? prev.isConnected : false,
        latencyMs: kucoinProbe.latencyMs,
      }));
    });
  }, []);

  const handleSyncAllCopiedTraders = useCallback(
    async (syncOpts?: { urgent?: boolean; reason?: string }) => {
      if (mobileNotifications.isAppStoppedByFullExit()) return;
      const list = loadAllCopiedTradersFromStorage();

      // Keep Service Worker updated with active copied traders so it can poll on lock-screen if OS suspends main thread
      const currentSnap = paperEngine.getSnapshot(pricesMapRef.current);
      const knownOpenKeys = currentSnap.positions
        .filter((p) => p.status === 'OPEN' && p.sourceTraderId)
        .map((p) => `${p.sourceTraderId}_${p.symbol.toUpperCase()}_${p.side}`);
      mobileNotifications.syncCopiedTradersStateToServiceWorker(list, knownOpenKeys);

      if (list.length === 0) return;

      const now = Date.now();
      const isUrgent = Boolean(syncOpts?.urgent);

      if (isSyncInFlightRef.current) {
        const shouldAbortStale = shouldAbortStaleInFlightSync({
          isSyncInFlight: true,
          syncStartedAt: syncStartedAtRef.current,
          now,
          isWakeupOrUrgent: isUrgent,
          normalDeadlockMs: 8000,
          wakeupStaleMs: 1800,
        });

        if (shouldAbortStale) {
          // Abort hung pre-sleep sockets immediately so fresh post-sleep trades execute without delay
          try {
            activeSyncAbortControllerRef.current?.abort();
          } catch {
            // ignore
          }
          activeSyncAbortControllerRef.current = null;
          isSyncInFlightRef.current = false;
        } else {
          pendingResyncRef.current = true;
          return;
        }
      }

      const syncController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      activeSyncAbortControllerRef.current = syncController;
      isSyncInFlightRef.current = true;
      syncStartedAtRef.current = now;
      setIsSyncingAll(true);

      let hardTimeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const syncTaskPromise = (async () => {
          // Do NOT block trader/whale ingestion on the heavy 800-symbol REST price list:
          // Use live WebSocket prices when fresh (< 5s), otherwise race REST prices against a fast 1.5s fallback!
          const wsFresh = Date.now() - lastWsPriceTickAtRef.current < 5000;
          const freshPricesPromise: Promise<Record<string, number>> = wsFresh
            ? Promise.resolve(pricesMapRef.current)
            : Promise.race([
                fetchAllFuturesPrices(binanceConfigRef.current).catch(() => pricesMapRef.current),
                new Promise<Record<string, number>>((resolve) =>
                  setTimeout(() => resolve(pricesMapRef.current), 1500)
                ),
              ]);

          const traderDataPromises = list.map(async (ct) => {
            const targetAcc = paperEngine.getAccount(ct.accountId);
            if (ct.source === 'COPY_TRADING') {
              const data = await fetchCopyTraderFullData(ct.traderId, null, tickersRef.current, {
                forceRefresh: true,
                signal: syncController?.signal,
              });
              return { ct, targetAcc, data };
            } else {
              const data = await fetchSmartMoneyWhaleDetail(ct.traderId, null, tickersRef.current, {
                forceRefresh: true,
                signal: syncController?.signal,
              });
              return { ct, targetAcc, data };
            }
          });

          const [freshPrices, results] = await Promise.all([
            freshPricesPromise,
            Promise.allSettled(traderDataPromises),
          ]);

          // If a newer urgent wakeup sync aborted this older batch, discard stale results cleanly
          if (syncController?.signal.aborted) {
            return;
          }

          const mergedPrices: Record<string, number> = {
            ...pricesMapRef.current,
            ...(freshPrices || {}),
          };

          const workerTasks: Array<{
            taskId: string;
            traderId: string;
            traderName: string;
            source: 'COPY_TRADING' | 'SMART_MONEY';
            accountId: string;
            positions: TraderOpenPosition[];
            latestRecords: TraderLatestRecord[];
            positionHistory?: TraderPositionHistoryItem[];
            marginPerTradeUsdt?: number;
            checkReconnectAdvantage?: boolean;
            forceImmediateExecution?: boolean;
            copiedStartedAt?: number;
            isPartialOrRateLimited?: boolean;
          }> = [];

          for (let idx = 0; idx < results.length; idx++) {
            const res = results[idx];
            if (res.status === 'fulfilled') {
              const { ct, targetAcc, data } = res.value;
              for (const pos of data.positions || []) {
                if (pos?.symbol) {
                  const sym = pos.symbol.toUpperCase().trim();
                  addWatchedFuturesSymbol(sym);
                  if (pos.markPrice && pos.markPrice > 0 && !mergedPrices[sym]) {
                    mergedPrices[sym] = pos.markPrice;
                  }
                }
              }
              workerTasks.push({
                taskId: `sync_${targetAcc.id}_${ct.source}_${ct.traderId}_${idx}`,
                traderId: ct.traderId,
                traderName: ct.nickname,
                source: ct.source,
                accountId: targetAcc.id,
                positions: data.positions || [],
                latestRecords: data.latestRecords || [],
                positionHistory: data.positionHistory,
                marginPerTradeUsdt: targetAcc.settings.tradeValueUsdt,
                checkReconnectAdvantage: targetAcc.settings.promptOnUnfavorableLateEntry !== false,
                forceImmediateExecution: ct.source === 'SMART_MONEY',
                copiedStartedAt: ct.startedAt,
                isPartialOrRateLimited: Boolean((data as any).isPartialOrRateLimited),
              });
            } else {
              console.warn('Failed syncing trader:', res.reason);
            }
          }

          pricesMapRef.current = mergedPrices;

          if (workerTasks.length > 0) {
            const { logs } = await paperEngine.syncMultipleTradersOffMainThread(
              workerTasks,
              mergedPrices
            );
            if (logs.length > 0) {
              routeSyncedLogsToKuCoin(logs);
            }
          }

          const updatedSnapshot = paperEngine.getSnapshot(mergedPrices);
          React.startTransition(() => {
            setPaperSnapshot(updatedSnapshot);
            refreshCopiedTradersList();
          });
        })();

        const timeoutGuardPromise = new Promise<void>((resolve) => {
          hardTimeoutId = setTimeout(() => {
            try {
              syncController?.abort();
            } catch {
              // ignore
            }
            resolve();
          }, 7500);
        });

        await Promise.race([syncTaskPromise, timeoutGuardPromise]);
      } finally {
        if (hardTimeoutId) clearTimeout(hardTimeoutId);
        if (activeSyncAbortControllerRef.current === syncController) {
          activeSyncAbortControllerRef.current = null;
          isSyncInFlightRef.current = false;
          setIsSyncingAll(false);
        }
        if (pendingResyncRef.current) {
          pendingResyncRef.current = false;
          setTimeout(() => {
            handleSyncAllCopiedTraders();
          }, 120);
        }
      }
    },
    [refreshCopiedTradersList, routeSyncedLogsToKuCoin]
  );

  handleSyncAllCopiedTradersRef.current = handleSyncAllCopiedTraders;

  // Immediate initial sync once market tickers connect
  const hasInitialTraderSyncRunRef = useRef(false);
  useEffect(() => {
    if (connectionState.tickers.length > 0 && !hasInitialTraderSyncRunRef.current) {
      hasInitialTraderSyncRunRef.current = true;
      handleSyncAllCopiedTraders({ urgent: true, reason: 'initial_connect' });
    }
  }, [connectionState.tickers.length, handleSyncAllCopiedTraders]);

  // Immediate dual-exchange ping measurement on startup
  useEffect(() => {
    refreshExchangePings();
  }, [refreshExchangePings]);

  // Centralized Background Scheduler:
  // Coordinates real-time copied traders & whales sync (1.5s visible / 2.5s hidden + sleep-drift recovery),
  // separate Binance & KuCoin ping probes (8s visible), and 24h market metadata refresh (15s visible-only).
  useEffect(() => {
    const scheduler = createCentralizedSyncScheduler({
      shouldPauseAll: () => mobileNotifications.isAppStoppedByFullExit(),
      onServiceWorkerHeartbeatAck: () => {
        mobileNotifications.acknowledgeServiceWorkerHeartbeat();
      },
      onVisibilityStateChange: (state) => {
        mobileNotifications.notifyServiceWorkerVisibility(state);
      },
      onWakeupSync: () => {
        // Re-ensure Binance WebSocket price stream is live right after phone sleep / background resume
        if (Date.now() - lastWsPriceTickAtRef.current > 6000 && wsStreamRef.current) {
          wsStreamRef.current.start(binanceConfigRef.current.environment);
        }
      },
      onServiceWorkerNotificationClick: (data) => {
        if (data?.accountId) {
          handleSelectVirtualAccountRef.current(data.accountId);
        }
        setSelectedTab('Simulation');
      },
      wakeupDebounceMs: 400,
    });

    // Task 1: Real-time copied traders & whales synchronization (1.5s visible / 2.5s hidden + instant wakeup recovery)
    scheduler.registerTask({
      id: 'copied-traders-sync',
      intervalMs: 1500,
      hiddenIntervalMs: 2500,
      runWhenHidden: true,
      runOnWakeup: true,
      minDedupGapMs: 350,
      onTick: (meta) => {
        handleSyncAllCopiedTraders({
          urgent: Boolean(meta?.urgent),
          reason: meta?.reason || 'interval',
        });
      },
    });

    // Task 2: Lightweight separate Binance & KuCoin ping probes (8s visible + immediate on wakeup)
    scheduler.registerTask({
      id: 'exchange-ping-sync',
      intervalMs: 8000,
      runWhenHidden: false,
      runOnWakeup: true,
      minDedupGapMs: 2000,
      onTick: () => {
        refreshExchangePings();
      },
    });

    // Task 3: Full 24h market metadata refresh (runs ONLY when app is visible; interval handle is cleaned up when hidden)
    scheduler.registerTask({
      id: 'market-metadata-sync',
      intervalMs: 15000,
      runWhenHidden: false,
      runOnWakeup: true,
      minDedupGapMs: 2500,
      onTick: () => {
        testConnectionAndFetchData(binanceConfigRef.current)
          .then((res) => {
            setConnectionState(res);
          })
          .catch(() => {});
      },
    });

    // Task 4: Periodic Memory Cleanup & Cache Eviction Guard (prevents OOM crashes on low-end devices)
    scheduler.registerTask({
      id: 'memory-cleanup-guard',
      intervalMs: 30000,
      hiddenIntervalMs: 45000,
      runWhenHidden: true,
      runOnWakeup: false,
      minDedupGapMs: 5000,
      onTick: () => {
        memoryCleanupService.checkAndCleanupIfNeeded('PERIODIC');
      },
    });

    scheduler.start();

    return () => {
      scheduler.stop();
    };
  }, [handleSyncAllCopiedTraders, refreshExchangePings]);

  // Startup History Logs Cleanup (> 30 days): runs automatically on application startup
  // to purge expired closed trades, notifications, sync checkpoints, and KuCoin order logs
  useEffect(() => {
    const startupResult = memoryCleanupService.runStartupHistoryCleanup();
    if (startupResult.totalExpiredLogsRemoved > 0) {
      setPaperSnapshot(paperEngine.getSnapshot(pricesMapRef.current));
      setNotificationsList(mobileNotifications.getNotifications());
      if (startupResult.removedKuCoinOrders > 0) {
        setKucoinConnectionState((prev) => ({
          ...prev,
          recentOrders: loadKuCoinOrderHistory(),
        }));
      }
    }
  }, []);

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

  // Manual trade action (Supports Market or Custom Entry Price, Stop-Loss, Take-Profit, Trailing Stop, Leverage, and Account Selection)
  const handleOpenPaperOrder = (
    symbol: string,
    side: 'LONG' | 'SHORT',
    quantity: number,
    entryPrice: number,
    leverage: number,
    options?: {
      stopLossPrice?: number;
      takeProfitPrice?: number;
      trailingStopPercent?: number;
      accountId?: string;
      useCustomPrice?: boolean;
    }
  ) => {
    const sym = symbol.toUpperCase();
    const targetAccId = options?.accountId || paperEngine.getActiveAccountId();
    const targetAcc = paperEngine.getAccount(targetAccId);
    const liveMarketPrice =
      options?.useCustomPrice && entryPrice > 0
        ? entryPrice
        : pricesMap[sym] && pricesMap[sym] > 0
        ? pricesMap[sym]
        : entryPrice;
    const effectiveNotional = quantity * entryPrice;
    const liveQty = liveMarketPrice > 0 ? effectiveNotional / liveMarketPrice : quantity;

    paperEngine.openPosition(
      sym,
      side,
      liveQty,
      liveMarketPrice,
      leverage,
      undefined,
      'MANUAL',
      undefined,
      undefined,
      undefined,
      100,
      effectiveNotional / Math.max(1, leverage),
      targetAcc.id,
      liveMarketPrice,
      options?.stopLossPrice,
      options?.takeProfitPrice,
      options?.trailingStopPercent
    );
    updatePaperSnapshot();

    const slNote =
      options?.stopLossPrice && options.stopLossPrice > 0 ? ` • SL: ${options.stopLossPrice}` : '';
    const tpNote =
      options?.takeProfitPrice && options.takeProfitPrice > 0
        ? ` • TP: ${options.takeProfitPrice}`
        : '';

    executeKuCoinOrder({
      config: {
        ...kucoinConfig,
        enableLiveExecution: targetAcc.settings.mode === 'REAL',
      },
      binanceSymbol: sym,
      side,
      amountUsdt: (liveQty * liveMarketPrice) / leverage,
      entryPrice: liveMarketPrice,
      leverage,
      sourceTraderName: `تداول يدوي (${targetAcc.name})`,
      sourceSignal: `Manual Execution (${sym} ${side} @ ${liveMarketPrice} × ${leverage}x${slNote}${tpNote})`,
    })
      .then((ord) => {
        setKucoinConnectionState((prev) => ({
          ...prev,
          recentOrders: [ord, ...prev.recentOrders.filter((r) => r.id !== ord.id)].slice(0, 50),
        }));
      })
      .catch(console.warn);
  };

  const handleCreatePendingLimitOrder = useCallback(
    (params: {
      symbol: string;
      side: 'LONG' | 'SHORT';
      limitPrice: number;
      marginUsdt: number;
      leverage: number;
      stopLossPrice?: number;
      takeProfitPrice?: number;
      trailingStopPercent?: number;
      accountId?: string;
    }) => {
      const created = paperEngine.createPendingLimitOrder(params);
      updatePaperSnapshot();
      return created;
    },
    [updatePaperSnapshot]
  );

  const handleCancelPendingLimitOrder = useCallback(
    (orderId: string) => {
      paperEngine.cancelPendingLimitOrder(orderId);
      updatePaperSnapshot();
    },
    [updatePaperSnapshot]
  );

  const handleClosePaperPosition = (positionId: string, exitPrice: number) => {
    const existing = paperSnapshot.positions.find((p) => p.id === positionId);
    const closed = paperEngine.closePosition(positionId, exitPrice);
    updatePaperSnapshot();

    const targetPos = closed || existing;
    if (targetPos) {
      const targetAcc = paperEngine.getAccount(targetPos.accountId);
      if (targetAcc.settings.mode === 'REAL') {
        const closeSide: 'LONG' | 'SHORT' = targetPos.side === 'LONG' ? 'SHORT' : 'LONG';
        executeKuCoinOrder({
          config: {
            ...kucoinConfigRef.current,
            enableLiveExecution: true,
          },
          binanceSymbol: targetPos.symbol,
          side: closeSide,
          amountUsdt: Math.max(1, targetPos.marginUsdt || targetAcc.settings.tradeValueUsdt),
          entryPrice: exitPrice,
          leverage: targetPos.leverage,
          reduceOnly: true,
          sourceTraderName: `${targetPos.sourceTraderName || 'تداول يدوي'} (${targetAcc.name})`,
          sourceSignal: `Manual Full Close (${targetPos.symbol} @ ${exitPrice})`,
        })
          .then((ord) => {
            setKucoinConnectionState((prev) => ({
              ...prev,
              recentOrders: [ord, ...prev.recentOrders.filter((r) => r.id !== ord.id)].slice(0, 50),
            }));
          })
          .catch(console.warn);
      }
    }
  };

  const handleUpdatePositionRiskLevels = useCallback(
    (
      positionId: string,
      levels: {
        stopLossPrice?: number | null;
        takeProfitPrice?: number | null;
        trailingStopPercent?: number | null;
      }
    ) => {
      paperEngine.updatePositionRiskLevels(positionId, levels);
      updatePaperSnapshot();
    },
    [updatePaperSnapshot]
  );

  const handleMoveStopLossToBreakEven = useCallback(
    (positionId: string, currentPrice?: number) => {
      try {
        paperEngine.moveStopLossToBreakEven(positionId, undefined, currentPrice);
        updatePaperSnapshot();
      } catch (err) {
        console.warn('Break-Even guard:', err instanceof Error ? err.message : err);
      }
    },
    [updatePaperSnapshot]
  );

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
    const existing = paperSnapshot.positions.find((p) => p.id === positionId);
    paperEngine.scaleInPosition(positionId, addPercent, price, Date.now(), customAddedMarginUsdt);
    updatePaperSnapshot();

    if (existing) {
      const targetAcc = paperEngine.getAccount(existing.accountId);
      if (targetAcc.settings.mode === 'REAL') {
        const addedMargin =
          customAddedMarginUsdt && customAddedMarginUsdt > 0
            ? customAddedMarginUsdt
            : Number(
                (
                  (existing.initialMarginUsdt || existing.marginUsdt || 25) *
                  (Math.max(1, addPercent) / 100)
                ).toFixed(2)
              );
        executeKuCoinOrder({
          config: {
            ...kucoinConfigRef.current,
            enableLiveExecution: true,
          },
          binanceSymbol: existing.symbol,
          side: existing.side,
          amountUsdt: Math.max(1, addedMargin),
          entryPrice: price,
          leverage: existing.leverage,
          reduceOnly: false,
          sourceTraderName: `${existing.sourceTraderName || 'تداول يدوي'} (${targetAcc.name})`,
          sourceSignal: `Manual Scale-In (${existing.symbol} +${addedMargin}$ @ ${price})`,
        })
          .then((ord) => {
            setKucoinConnectionState((prev) => ({
              ...prev,
              recentOrders: [ord, ...prev.recentOrders.filter((r) => r.id !== ord.id)].slice(0, 50),
            }));
          })
          .catch(console.warn);
      }
    }
  };

  const handlePartialExitPaperPosition = (
    positionId: string,
    withdrawPercent: number,
    price: number
  ) => {
    const existing = paperSnapshot.positions.find((p) => p.id === positionId);
    paperEngine.partialExitPosition(positionId, withdrawPercent, price, Date.now());
    updatePaperSnapshot();

    if (existing) {
      const targetAcc = paperEngine.getAccount(existing.accountId);
      if (targetAcc.settings.mode === 'REAL') {
        const closeSide: 'LONG' | 'SHORT' = existing.side === 'LONG' ? 'SHORT' : 'LONG';
        const exitMargin = Number(
          ((existing.marginUsdt || 25) * (Math.min(100, Math.max(1, withdrawPercent)) / 100)).toFixed(2)
        );
        executeKuCoinOrder({
          config: {
            ...kucoinConfigRef.current,
            enableLiveExecution: true,
          },
          binanceSymbol: existing.symbol,
          side: closeSide,
          amountUsdt: Math.max(1, exitMargin),
          entryPrice: price,
          leverage: existing.leverage,
          reduceOnly: true,
          sourceTraderName: `${existing.sourceTraderName || 'تداول يدوي'} (${targetAcc.name})`,
          sourceSignal: `Manual Partial Exit -${withdrawPercent}% (${existing.symbol} @ ${price})`,
        })
          .then((ord) => {
            setKucoinConnectionState((prev) => ({
              ...prev,
              recentOrders: [ord, ...prev.recentOrders.filter((r) => r.id !== ord.id)].slice(0, 50),
            }));
          })
          .catch(console.warn);
      }
    }
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
  const lastActivityTouchRef = useRef<number>(Date.now());

  // Keep security session alive while the user is actively interacting with the app so it never auto-locks mid-use
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const extendSessionOnActivity = () => {
      const now = Date.now();
      if (now - lastActivityTouchRef.current < 15000) return;
      lastActivityTouchRef.current = now;
      setKucoinUnlockState((prev) => {
        if (!prev.isUnlocked) return prev;
        return {
          isUnlocked: true,
          lastUnlockedAt: now,
        };
      });
    };
    window.addEventListener('pointerdown', extendSessionOnActivity, { passive: true });
    window.addEventListener('keydown', extendSessionOnActivity, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', extendSessionOnActivity);
      window.removeEventListener('keydown', extendSessionOnActivity);
    };
  }, []);

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
      const now = Date.now();
      lastActivityTouchRef.current = now;
      setKucoinUnlockState({
        isUnlocked: true,
        lastUnlockedAt: now,
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

  // Anti-Accidental Exit & In-App Back Navigation Guard (prevents Android/Browser Back button or edge-swipe from closing the app while in use)
  const [backExitPromptVisible, setBackExitPromptVisible] = useState<boolean>(false);
  const lastBackPressTimeRef = useRef<number>(0);
  const backToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabHistoryRef = useRef<TabId[]>([]);
  const selectedTabRef = useRef<TabId>(selectedTab);
  selectedTabRef.current = selectedTab;
  const showNotificationsRef = useRef<boolean>(showNotificationsCenter);
  showNotificationsRef.current = showNotificationsCenter;
  const showLiveDialogRef = useRef<boolean>(showLiveDialog);
  showLiveDialogRef.current = showLiveDialog;

  useEffect(() => {
    const history = tabHistoryRef.current;
    if (history[history.length - 1] !== selectedTab) {
      history.push(selectedTab);
      if (history.length > 15) history.shift();
    }
  }, [selectedTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleInAppBackNavigation = (): boolean => {
      // 1. Close open global modals first
      if (showNotificationsRef.current) {
        setShowNotificationsCenter(false);
        return true;
      }
      if (showLiveDialogRef.current) {
        setShowLiveDialog(false);
        return true;
      }

      // 2. Close open sub-views (e.g. Trader detail, Whale detail, or Copy modal)
      if (window.__copyTrSubViewBackHandler && window.__copyTrSubViewBackHandler()) {
        return true;
      }

      // 3. Navigate back to previous tab or Dashboard if not already on Dashboard
      if (selectedTabRef.current !== 'Dashboard') {
        const history = tabHistoryRef.current;
        if (history.length > 1) {
          history.pop(); // remove current
          const prevTab = history.pop() || 'Dashboard';
          setSelectedTab(prevTab);
        } else {
          setSelectedTab('Dashboard');
        }
        return true;
      }

      // 4. On root Dashboard tab: require double-press within 2.5s before minimizing/exiting
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2500) {
        setBackExitPromptVisible(false);
        return false; // Allow native BackHandler to move task to background
      }

      lastBackPressTimeRef.current = now;
      setBackExitPromptVisible(true);
      if (backToastTimerRef.current) clearTimeout(backToastTimerRef.current);
      backToastTimerRef.current = setTimeout(() => {
        setBackExitPromptVisible(false);
      }, 2500);
      return true;
    };

    window.__copyTrHandleBackPress = handleInAppBackNavigation;

    // Push a guard state in mobile browser / PWA so edge-swipe Back triggers popstate instead of closing the tab
    try {
      window.history.pushState({ copyTrGuard: true }, '', window.location.href);
    } catch {
      // ignore
    }

    const handlePopState = () => {
      const consumed = handleInAppBackNavigation();
      if (consumed) {
        try {
          window.history.pushState({ copyTrGuard: true }, '', window.location.href);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (backToastTimerRef.current) clearTimeout(backToastTimerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0E11] text-white flex flex-col font-sans selection:bg-[#01BC8D]/30 content-safe pl-safe pr-safe">
      {/* Double-Back Exit Protection Toast */}
      {backExitPromptVisible && (
        <div
          data-testid="back_exit_protection_toast"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#161D26] border border-[#01BC8D]/60 text-white text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in duration-150"
        >
          <span className="w-2 h-2 rounded-full bg-[#01BC8D] animate-pulse" />
          <span>اضغط زر الرجوع مرة أخرى خلال ثانيتين لتصغير التطبيق (حماية من الإغلاق بالخطأ)</span>
        </div>
      )}

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
        <AppErrorBoundary key={selectedTab}>
        {selectedTab === 'Dashboard' && (
          <DashboardTab
            connectionState={connectionState}
            kucoinConnectionState={kucoinConnectionState}
            paperSnapshot={paperSnapshot}
            pendingLimitOrders={paperSnapshot.pendingLimitOrders}
            wsStatus={wsStatus}
            config={binanceConfig}
            onOpenKucoinSetup={handleOpenKucoinApi}
            onRefreshMarket={() => handleTestBinanceConnection(binanceConfig)}
            onRefreshKucoin={() => handleTestKuCoinConnection(kucoinConfig)}
            onFetchRealKucoinBalance={() => handleTestKuCoinConnection(kucoinConfig, true)}
            onOpenOrder={handleOpenPaperOrder}
            onCreatePendingLimitOrder={handleCreatePendingLimitOrder}
            onCancelPendingLimitOrder={handleCancelPendingLimitOrder}
            onSelectAccount={handleSelectVirtualAccount}
            onNavigateToTrading={() => setSelectedTab('Simulation')}
          />
        )}

        {(selectedTab === 'API' ||
          selectedTab === 'KuCoinAPI' ||
          selectedTab === 'BinanceAPI') && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-[#12161C] border border-[#1C232D] rounded-xl px-4 pt-3 pb-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 pb-2">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  ربط المنصات
                </h2>
                <span className="text-[11px] text-[#848E9C]">
                  كوكوين للتنفيذ · باينانس للبيانات
                </span>
              </div>

              <div className="flex items-center border-t border-[#1C232D] -mx-4 px-4">
                <button
                  type="button"
                  onClick={() => {
                    setApiSubTab('KUCOIN');
                  }}
                  data-testid="api_subtab_kucoin"
                  className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                    apiSubTab === 'KUCOIN'
                      ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                      : 'border-transparent text-[#848E9C] hover:text-white'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      kucoinConnectionState.isConnected ? 'bg-[#01BC8D]' : 'bg-[#F65454]'
                    }`}
                  />
                  <span>كوكوين</span>
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
                  className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                    apiSubTab === 'BINANCE'
                      ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                      : 'border-transparent text-[#848E9C] hover:text-white'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      connectionState.isConnected ? 'bg-[#01BC8D]' : 'bg-[#F65454]'
                    }`}
                  />
                  <span>باينانس</span>
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
                onOpenSettingsTab={() => setSelectedTab('Settings')}
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
            onUpdatePositionRiskLevels={handleUpdatePositionRiskLevels}
            onMoveStopLossToBreakEven={handleMoveStopLossToBreakEven}
            onCancelPendingLimitOrder={handleCancelPendingLimitOrder}
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
            onCopySinglePosition={handleCopySinglePosition}
            onSyncTraderToEngine={handleSyncTraderToEngine}
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
            kucoinConfig={kucoinConfig}
            onSaveKuCoinSecrets={handleSaveKuCoinSecrets}
            onSaveBinanceSecret={handleSaveBinanceSecret}
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
        </AppErrorBoundary>
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
