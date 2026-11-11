import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from './types';
import {
  loadBinanceConfig,
  saveBinanceConfig,
  clearBinanceKeys,
  testConnectionAndFetchData,
  addWatchedFuturesSymbol,
} from './services/binanceApi';
import {
  loadKuCoinConfig,
  saveKuCoinConfig,
  clearKuCoinConfig,
  testKuCoinConnectionAndFetchData,
  executeKuCoinOrder,
  loadKuCoinOrderHistory,
} from './services/kucoinApi';
import {
  fetchCopyTraderFullData,
  fetchSmartMoneyWhaleDetail,
} from './services/copyAndSmartMoneyApi';
import { paperEngine } from './services/paperTrading';
import { mobileNotifications } from './services/mobileNotifications';

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
  const [kucoinConnectionState, setKucoinConnectionState] = useState<KuCoinConnectionState>({
    isTesting: true,
    isConnected: false,
    isAuthenticated: false,
    serverTimeFormatted: null,
    latencyMs: null,
    usdtBalance: 1000,
    availableUsdt: 1000,
    positions: [],
    recentOrders: loadKuCoinOrderHistory(),
    statusMessageAr: 'جاري الاتصال بـ KuCoin API للتحقق من منصة التنفيذ...',
    errorMessageAr: null,
  });

  // Unified copied traders list across Copy Trading and Whales
  const [allCopiedTraders, setAllCopiedTraders] = useState<ActiveCopiedTrader[]>(
    loadAllCopiedTradersFromStorage
  );

  const refreshCopiedTradersList = useCallback(() => {
    setAllCopiedTraders(loadAllCopiedTradersFromStorage());
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
  const handleTestKuCoinConnection = useCallback(async (cfg: KuCoinConfig) => {
    setKucoinConnectionState((prev) => ({
      ...prev,
      isTesting: true,
      statusMessageAr: 'جاري فحص الاتصال ومزامنة الحساب مع KuCoin API...',
      errorMessageAr: null,
    }));

    const res = await testKuCoinConnectionAndFetchData(cfg);
    setKucoinConnectionState(res);
  }, []);

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

  // Update Trade Execution Settings (size, leverage, commission, maxConcurrentTrades, VIRTUAL/REAL mode)
  const handleUpdateTradeSettings = useCallback(
    (partial: Partial<TradeExecutionSettings>) => {
      const updated = paperEngine.updateSettings(partial);
      updatePaperSnapshot();

      // Keep KuCoin config synchronized with mode & leverage
      if (partial.mode !== undefined || partial.leverage !== undefined || partial.tradeValueUsdt !== undefined) {
        const nextKucoin: KuCoinConfig = {
          ...kucoinConfig,
          enableLiveExecution: updated.mode === 'REAL',
          defaultLeverage: updated.leverage,
          maxOrderUsdt: updated.tradeValueUsdt,
        };
        setKucoinConfig(nextKucoin);
        saveKuCoinConfig(nextKucoin);
      }
    },
    [kucoinConfig, updatePaperSnapshot]
  );

  // Set or reset Virtual Balance
  const handleSetVirtualBalance = useCallback(
    (newBalance: number, resetPositions: boolean) => {
      paperEngine.setVirtualBalance(newBalance, resetPositions);
      updatePaperSnapshot();
    },
    [updatePaperSnapshot]
  );

  // Initial load
  useEffect(() => {
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

  // Polling every 15 seconds to keep Binance market data fresh
  useEffect(() => {
    const interval = setInterval(() => {
      testConnectionAndFetchData(binanceConfig).then((res) => {
        setConnectionState(res);
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [binanceConfig]);

  // Sync a copied trader's Positions and Latest records using USER's trade settings
  const handleSyncTraderToEngine = useCallback(
    (params: {
      traderId: string;
      traderName: string;
      source: 'COPY_TRADING' | 'SMART_MONEY';
      positions: TraderOpenPosition[];
      latestRecords: TraderLatestRecord[];
      marginPerTradeUsdt: number;
    }): CopiedSyncLog[] => {
      const currentSettings = paperEngine.getSettings();
      const userTradeValue = currentSettings.enforceUserSizeOnCopy
        ? currentSettings.tradeValueUsdt
        : params.marginPerTradeUsdt || currentSettings.tradeValueUsdt;
      const userLeverage = currentSettings.leverage;

      // 1. Sync to local copy/trading engine with user's size, leverage, commission & max concurrent limit
      const logs = paperEngine.syncTraderPositionsAndRecords({
        ...params,
        marginPerTradeUsdt: userTradeValue,
      });
      updatePaperSnapshot();
      setTimeout(refreshCopiedTradersList, 100);

      // 2. Route synced entries and scale-ins to KuCoin API with user's configured settings
      for (const log of logs) {
        if (log.action === 'POSITION_SYNC' || log.action === 'ENTRY' || log.action === 'SCALE_IN') {
          if (log.quantity > 0) {
            const orderAmountUsdt =
              log.action === 'SCALE_IN'
                ? currentSettings.scaleInSamePercentAsTrader !== false
                  ? Number((userTradeValue * ((log.volumePercent || 25) / 100)).toFixed(2))
                  : Math.max(1, currentSettings.scaleInFixedValueUsdt || 10)
                : userTradeValue;

            executeKuCoinOrder({
              config: {
                ...kucoinConfig,
                enableLiveExecution: currentSettings.mode === 'REAL',
              },
              binanceSymbol: log.symbol,
              side: log.side,
              amountUsdt: orderAmountUsdt,
              entryPrice: log.price,
              leverage: userLeverage,
              sourceTraderName: params.traderName,
              sourceSignal: `Binance ${params.source} (${log.action} • ${orderAmountUsdt}$ × ${userLeverage}x)`,
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
    [kucoinConfig, updatePaperSnapshot, refreshCopiedTradersList]
  );

  // Copy a single position using USER's configured Trade Settings
  const handleCopySinglePosition = useCallback(
    (pos: TraderOpenPosition, traderName: string, marginUsdt: number) => {
      addWatchedFuturesSymbol(pos.symbol);
      const currentSettings = paperEngine.getSettings();
      const price =
        pos.markPrice > 0
          ? pos.markPrice
          : pos.entryPrice > 0
          ? pos.entryPrice
          : pricesMap[pos.symbol] || 50.0;
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
          entryPrice: price,
          traderLeverage: pos.leverage,
          customMarginUsdt: effectiveMargin,
          customLeverage: effectiveLeverage,
          sourceTraderName: traderName,
          sourceType: pos.id.startsWith('sm_') ? 'SMART_MONEY' : 'COPY_TRADING',
          traderEntryTime: pos.entryTime,
          traderScaleAdjustments: pos.scaleAdjustments,
          currentScalePercent: pos.currentScalePercent,
        });
        updatePaperSnapshot();
      } catch (e) {
        console.warn('Error copying position to engine:', e);
        return;
      }

      // Route to KuCoin with user's size & leverage
      executeKuCoinOrder({
        config: {
          ...kucoinConfig,
          enableLiveExecution: currentSettings.mode === 'REAL',
        },
        binanceSymbol: pos.symbol,
        side: pos.side,
        amountUsdt: effectiveMargin,
        entryPrice: price,
        leverage: effectiveLeverage,
        sourceTraderName: traderName,
        sourceSignal: `Single Copy (${pos.symbol} ${pos.side} • ${effectiveMargin}$ × ${effectiveLeverage}x)`,
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

  // Sync ALL currently copied traders across both Copy Trading & Whales
  const handleSyncAllCopiedTraders = useCallback(async () => {
    const list = loadAllCopiedTradersFromStorage();
    if (list.length === 0) return;
    setIsSyncingAll(true);
    const currentSettings = paperEngine.getSettings();

    for (const ct of list) {
      try {
        if (ct.source === 'COPY_TRADING') {
          const data = await fetchCopyTraderFullData(ct.traderId, null, connectionState.tickers);
          handleSyncTraderToEngine({
            traderId: ct.traderId,
            traderName: ct.nickname,
            source: 'COPY_TRADING',
            positions: data.positions,
            latestRecords: data.latestRecords,
            marginPerTradeUsdt: currentSettings.tradeValueUsdt,
          });
        } else {
          const data = await fetchSmartMoneyWhaleDetail(ct.traderId, null, connectionState.tickers);
          handleSyncTraderToEngine({
            traderId: ct.traderId,
            traderName: ct.nickname,
            source: 'SMART_MONEY',
            positions: data.positions,
            latestRecords: data.latestRecords,
            marginPerTradeUsdt: currentSettings.tradeValueUsdt,
          });
        }
      } catch (e) {
        console.warn('Failed syncing trader:', ct.nickname, e);
      }
    }
    setIsSyncingAll(false);
    updatePaperSnapshot();
  }, [connectionState.tickers, handleSyncTraderToEngine, updatePaperSnapshot]);

  // Remove a copied trader from storage
  const handleRemoveCopiedTrader = useCallback(
    (traderId: string, source: 'COPY_TRADING' | 'SMART_MONEY') => {
      const storageKey =
        source === 'COPY_TRADING' ? 'whale_copied_traders_ct' : 'whale_copied_traders_sm';
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const arr: ActiveCopiedTrader[] = JSON.parse(raw);
          const filtered = arr.filter((item) => item.traderId !== traderId);
          localStorage.setItem(storageKey, JSON.stringify(filtered));
        }
      } catch {
        // ignore
      }
      refreshCopiedTradersList();
    },
    [refreshCopiedTradersList]
  );

  // Manual trade action
  const handleOpenPaperOrder = (
    symbol: string,
    side: 'LONG' | 'SHORT',
    quantity: number,
    entryPrice: number,
    leverage: number
  ) => {
    const currentSettings = paperEngine.getSettings();
    paperEngine.openPosition(symbol, side, quantity, entryPrice, leverage, undefined, 'MANUAL');
    updatePaperSnapshot();

    executeKuCoinOrder({
      config: {
        ...kucoinConfig,
        enableLiveExecution: currentSettings.mode === 'REAL',
      },
      binanceSymbol: symbol,
      side,
      amountUsdt: (quantity * entryPrice) / leverage,
      entryPrice,
      leverage,
      sourceTraderName: 'صفقة يدوية',
      sourceSignal: 'Manual Execution',
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
    const fresh = paperEngine.reset();
    setPaperSnapshot(fresh);
  };

  const [apiSubTab, setApiSubTab] = useState<'KUCOIN' | 'BINANCE'>('KUCOIN');

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
        bannerTimer = setTimeout(() => {
          setActivePushBanner(null);
        }, 7000);
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
          />
        )}

        {(selectedTab === 'API' ||
          selectedTab === 'KuCoinAPI' ||
          selectedTab === 'BinanceAPI') && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Unified API Header & KuCoin-style Underline Tabs */}
            <div className="bg-[#12171D] border border-[#232E3A] rounded-2xl px-4 pt-3.5 pb-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2 pb-2">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">
                    ربط المنصات (API)
                  </h2>
                  <p className="text-[11px] text-[#8A99AD]">
                    كوكوين لتنفيذ الصفقات وإدارة الرصيد • باينانس لجلب معطيات المتداولين والحيتان والأسعار
                  </p>
                </div>
              </div>

              <div className="flex items-center border-t border-[#232E3A] -mx-4 px-4">
                <button
                  type="button"
                  onClick={() => setApiSubTab('KUCOIN')}
                  data-testid="api_subtab_kucoin"
                  className={`flex-1 py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
                  <span>[KuCoin للتنفيذ]</span>
                </button>

                <button
                  type="button"
                  onClick={() => setApiSubTab('BINANCE')}
                  data-testid="api_subtab_binance"
                  className={`flex-1 py-3 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
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
                  <span>[Binance للمعلومات]</span>
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
                onOpenSimulationTab={() => setSelectedTab('Simulation')}
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
            onUpdateTradeSettings={handleUpdateTradeSettings}
            onSetVirtualBalance={handleSetVirtualBalance}
            onOpenOrder={handleOpenPaperOrder}
            onClosePosition={handleClosePaperPosition}
            onScaleInPosition={handleScaleInPaperPosition}
            onPartialExitPosition={handlePartialExitPaperPosition}
            onResetPaper={handleResetPaper}
            onSyncAllCopiedTraders={handleSyncAllCopiedTraders}
            onRemoveCopiedTrader={handleRemoveCopiedTrader}
            onNavigateToTab={(tab) => {
              if (tab === 'KuCoinAPI') handleOpenKucoinApi();
              else setSelectedTab(tab);
            }}
            onOpenTraderStats={handleOpenTraderStats}
          />
        )}

        {selectedTab === 'Settings' && (
          <SettingsTab
            config={binanceConfig}
            connectionState={connectionState}
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
      />
    </div>
  );
};

export default App;
