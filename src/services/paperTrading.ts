import type {
  PaperPosition,
  PaperAccountSnapshot,
  PaperVirtualAccountSummary,
  TradeExecutionSettings,
  TraderOpenPosition,
  TraderLatestRecord,
  TraderPositionHistoryItem,
  CopiedSyncLog,
  PendingReconnectTradeChoice,
  ActiveCopiedTrader,
  TraderSyncCheckpoint,
  ManualAppliedDeltaExecution,
  ManualSingleCopyResult,
} from '../types';
import { mobileNotifications } from './mobileNotifications';
import {
  evaluatePreviousTradePriceAdvantage,
  calculateSecureStopLossPrice,
  isStopLossTriggered,
  resolveLiveMarketExecutionPrice,
  filterPendingChoicesForCopiedTradersOnPage,
  calculateLateEntryNetPositionState,
  shouldApplyTraderRecordAfterEntry,
  formatLateEntryComparisonDetails,
  buildStableTraderEventKey,
  hasSyncEventBeenApplied,
  calculatePositionQuantityDropPartialExitPct,
  calculatePositionQuantityIncreaseScaleInPct,
  shouldExecuteWhaleOrLiveTradeImmediately,
  buildTraderActionId,
  isTraderActionAlreadyProcessed,
  isTraderTradePermanentlyClosed,
  hasTraderEntryAlreadyBeenSynced,
  buildInitialAppliedEventKeysForOpenPosition,
  evaluateManualSinglePositionCopyPlan,
} from './tradeExecutionRules';
import { tradeSyncWorkerClient } from './tradeSyncWorkerClient';
import type {
  WorkerAccountContext,
  WorkerSyncBatchResponse,
  WorkerTraderSyncInputTask,
} from './tradeSyncWorkerLogic';

const PAPER_STORAGE_KEY = 'whale_copy_paper_state_v3';
const TRADE_SETTINGS_STORAGE_KEY = 'whale_copy_trade_settings_v1';
const MULTI_ACCOUNTS_STORAGE_KEY = 'whale_copy_multi_accounts_v1';
const ACTIVE_ACCOUNT_ID_STORAGE_KEY = 'whale_copy_active_account_id_v1';
const PENDING_CHOICES_STORAGE_KEY = 'whale_copy_pending_reconnect_choices_v1';
const DISMISSED_CHOICES_STORAGE_KEY = 'whale_copy_dismissed_reconnect_choices_v1';
const TRADER_SYNC_CHECKPOINTS_STORAGE_KEY = 'whale_copy_trader_sync_checkpoints_v1';

function getSafeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export const DEFAULT_TRADE_SETTINGS: TradeExecutionSettings = {
  mode: 'VIRTUAL',
  virtualInitialBalance: 1000.0,
  tradeValueUsdt: 25.0,
  leverage: 5,
  commissionPercent: 0.06,
  maxConcurrentTrades: 5,
  takeProfitPercent: 0,
  stopLossPercent: 0,
  enforceUserSizeOnCopy: true,
  scaleInFixedValueUsdt: 10.0,
  scaleInSamePercentAsTrader: true,
  partialExitSamePercentAsTrader: true,
  promptOnUnfavorableLateEntry: true,
};

interface StoredPaperState {
  initialBalance: number;
  availableBalance: number;
  totalCommissionsPaid: number;
  positions: PaperPosition[];
}

export interface StoredVirtualAccount {
  id: string;
  name: string;
  createdAt: number;
  initialBalance: number;
  availableBalance: number;
  totalCommissionsPaid: number;
  positions: PaperPosition[];
  settings: TradeExecutionSettings;
}

export class PaperEngine {
  private accounts: StoredVirtualAccount[] = [];
  private activeAccountId: string = 'acc_default';
  private pendingReconnectChoices: PendingReconnectTradeChoice[] = [];
  private dismissedReconnectChoiceIds: Set<string> = new Set();
  private traderSyncCheckpoints: Record<string, TraderSyncCheckpoint> = {};
  private lastKnownPrices: Record<string, number> = {};
  private batchSaveDepth: number = 0;
  private batchDirtyState: boolean = false;
  private batchDirtyPendingChoices: boolean = false;
  private batchDirtyCheckpoints: boolean = false;

  constructor() {
    this.loadMultiAccounts();
    this.loadPendingChoices();
    this.loadTraderSyncCheckpoints();
  }

  /**
   * Coalesces all storage writes (JSON.stringify + localStorage.setItem) inside `fn`
   * into a single flush at the end of the batch, avoiding main-thread serialization lag.
   */
  public runInBatch<T>(fn: () => T): T {
    this.batchSaveDepth++;
    mobileNotifications.beginBatchSave();
    try {
      return fn();
    } finally {
      this.batchSaveDepth = Math.max(0, this.batchSaveDepth - 1);
      if (this.batchSaveDepth === 0) {
        if (this.batchDirtyState) {
          this.batchDirtyState = false;
          this.batchDirtyPendingChoices = false;
          this.batchDirtyCheckpoints = false;
          this.saveState();
        } else {
          if (this.batchDirtyPendingChoices) {
            this.batchDirtyPendingChoices = false;
            this.savePendingChoices();
          }
          if (this.batchDirtyCheckpoints) {
            this.batchDirtyCheckpoints = false;
            this.saveTraderSyncCheckpoints();
          }
        }
      }
      mobileNotifications.endBatchSave();
    }
  }

  private mergeWithLastKnownPrices(incoming: Record<string, number> = {}): Record<string, number> {
    if (incoming && typeof incoming === 'object') {
      for (const [rawSym, rawPrice] of Object.entries(incoming)) {
        const num = Number(rawPrice);
        if (rawSym && Number.isFinite(num) && num > 0) {
          const cleanSym = rawSym.toUpperCase().trim();
          this.lastKnownPrices[cleanSym] = num;
          this.lastKnownPrices[rawSym] = num;
        }
      }
    }
    return { ...this.lastKnownPrices, ...(incoming || {}) };
  }

  private loadStoredCopiedTraders(): ActiveCopiedTrader[] {
    const result: ActiveCopiedTrader[] = [];
    const storage = getSafeStorage();
    if (!storage) return result;
    try {
      const ctRaw = storage.getItem('whale_copied_traders_ct');
      if (ctRaw) {
        const parsed = JSON.parse(ctRaw);
        if (Array.isArray(parsed)) result.push(...parsed);
      }
    } catch {
      // ignore
    }
    try {
      const smRaw = storage.getItem('whale_copied_traders_sm');
      if (smRaw) {
        const parsed = JSON.parse(smRaw);
        if (Array.isArray(parsed)) result.push(...parsed);
      }
    } catch {
      // ignore
    }
    return result;
  }

  private loadPendingChoices(): void {
    const storage = getSafeStorage();
    if (!storage) return;
    try {
      const rawPending = storage.getItem(PENDING_CHOICES_STORAGE_KEY);
      if (rawPending) {
        const parsed = JSON.parse(rawPending);
        if (Array.isArray(parsed)) {
          this.pendingReconnectChoices = parsed.filter(
            (c: PendingReconnectTradeChoice) => c && !String(c.id || '').startsWith('choice_sample_')
          );
        }
      }
      const rawDismissed = storage.getItem(DISMISSED_CHOICES_STORAGE_KEY);
      if (rawDismissed) {
        const parsed = JSON.parse(rawDismissed);
        if (Array.isArray(parsed)) {
          this.dismissedReconnectChoiceIds = new Set(parsed);
        }
      }
      this.prunePendingChoicesForCopiedTraders(this.loadStoredCopiedTraders());
    } catch {
      // ignore
    }
  }

  /**
   * Prunes any pending reconnect trade choices that do not belong to an actively copied trader
   * in its assigned virtual account.
   */
  public prunePendingChoicesForCopiedTraders(copiedTraders?: ActiveCopiedTrader[]): void {
    const list = copiedTraders ?? this.loadStoredCopiedTraders();
    const beforeLen = this.pendingReconnectChoices.length;
    this.pendingReconnectChoices = this.pendingReconnectChoices.filter((choice) => {
      if (!choice || String(choice.id || '').startsWith('choice_sample_')) {
        return false;
      }
      const choiceAccId = choice.accountId || 'acc_default';
      return list.some(
        (ct) =>
          (ct.accountId || 'acc_default') === choiceAccId &&
          ((ct.traderId === choice.traderId && ct.source === choice.source) ||
            ct.nickname === choice.traderName)
      );
    });
    if (this.pendingReconnectChoices.length !== beforeLen) {
      this.savePendingChoices();
    }
  }

  private savePendingChoices(): void {
    if (this.batchSaveDepth > 0) {
      this.batchDirtyPendingChoices = true;
      return;
    }
    const storage = getSafeStorage();
    if (!storage) return;
    try {
      storage.setItem(
        PENDING_CHOICES_STORAGE_KEY,
        JSON.stringify(this.pendingReconnectChoices)
      );
      storage.setItem(
        DISMISSED_CHOICES_STORAGE_KEY,
        JSON.stringify(Array.from(this.dismissedReconnectChoiceIds))
      );
    } catch {
      // ignore
    }
  }

  private loadTraderSyncCheckpoints(): void {
    const storage = getSafeStorage();
    if (!storage) return;
    try {
      const raw = storage.getItem(TRADER_SYNC_CHECKPOINTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          this.traderSyncCheckpoints = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  private saveTraderSyncCheckpoints(): void {
    if (this.batchSaveDepth > 0) {
      this.batchDirtyCheckpoints = true;
      return;
    }
    const storage = getSafeStorage();
    if (!storage) return;
    try {
      storage.setItem(
        TRADER_SYNC_CHECKPOINTS_STORAGE_KEY,
        JSON.stringify(this.traderSyncCheckpoints)
      );
    } catch {
      // ignore
    }
  }

  public getTraderSyncCheckpointKey(
    traderId: string,
    source: 'COPY_TRADING' | 'SMART_MONEY' = 'COPY_TRADING',
    accountId?: string
  ): string {
    const accId = accountId || this.getActiveAccountId();
    return `${accId}::${source}::${traderId}`;
  }

  public getTraderSyncCheckpoint(
    traderId: string,
    source: 'COPY_TRADING' | 'SMART_MONEY' = 'COPY_TRADING',
    accountId?: string
  ): TraderSyncCheckpoint | null {
    const key = this.getTraderSyncCheckpointKey(traderId, source, accountId);
    const cp = this.traderSyncCheckpoints[key];
    return cp ? { ...cp, processedActionIds: [...cp.processedActionIds] } : null;
  }

  public hasProcessedTraderAction(
    traderId: string,
    actionId: string,
    source: 'COPY_TRADING' | 'SMART_MONEY' = 'COPY_TRADING',
    accountId?: string
  ): boolean {
    const cp = this.getTraderSyncCheckpoint(traderId, source, accountId);
    if (!cp || !actionId) return false;
    return cp.lastProcessedActionId === actionId || cp.processedActionIds.includes(actionId);
  }

  private getOrCreateTraderSyncCheckpoint(params: {
    traderId: string;
    traderName: string;
    source: 'COPY_TRADING' | 'SMART_MONEY';
    accountId: string;
  }): TraderSyncCheckpoint {
    const key = this.getTraderSyncCheckpointKey(params.traderId, params.source, params.accountId);
    if (!this.traderSyncCheckpoints[key]) {
      this.traderSyncCheckpoints[key] = {
        key,
        accountId: params.accountId,
        source: params.source,
        traderId: params.traderId,
        traderName: params.traderName,
        version: 0,
        lastProcessedActionId: null,
        lastProcessedTimestamp: 0,
        processedActionIds: [],
        lastActionsBySymbol: {},
        updatedAt: Date.now(),
      };
    } else if (params.traderName && !this.traderSyncCheckpoints[key].traderName) {
      this.traderSyncCheckpoints[key].traderName = params.traderName;
    }
    return this.traderSyncCheckpoints[key];
  }

  private recordTraderSyncAction(
    checkpoint: TraderSyncCheckpoint,
    params: {
      actionId: string;
      candidateKeys?: string[];
      symbol: string;
      actionType: 'ENTRY' | 'SCALE_IN' | 'PARTIAL_EXIT' | 'FULL_EXIT';
      timestamp?: number;
      explicitVersion?: number;
    }
  ): void {
    const now = Date.now();
    const ts = params.timestamp && params.timestamp > 0 ? params.timestamp : now;
    checkpoint.version =
      params.explicitVersion !== undefined
        ? Math.max(checkpoint.version, params.explicitVersion)
        : checkpoint.version + 1;
    checkpoint.lastProcessedActionId = params.actionId;
    checkpoint.lastProcessedTimestamp = Math.max(checkpoint.lastProcessedTimestamp || 0, ts);
    checkpoint.updatedAt = now;

    const allKeys = [params.actionId, ...(params.candidateKeys || [])].filter(Boolean);
    const nextList = [...checkpoint.processedActionIds];
    for (const k of allKeys) {
      if (!nextList.includes(k)) {
        nextList.push(k);
      }
    }
    checkpoint.processedActionIds = nextList.slice(-200);

    const symKey = String(params.symbol || '').toUpperCase().trim();
    if (symKey) {
      if (!checkpoint.lastActionsBySymbol) {
        checkpoint.lastActionsBySymbol = {};
      }
      checkpoint.lastActionsBySymbol[symKey] = {
        actionId: params.actionId,
        actionType: params.actionType,
        timestamp: ts,
      };
    }
    this.saveTraderSyncCheckpoints();
  }

  private loadLegacySettings(): TradeExecutionSettings {
    const storage = getSafeStorage();
    if (!storage) return { ...DEFAULT_TRADE_SETTINGS };
    try {
      const raw = storage.getItem(TRADE_SETTINGS_STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_TRADE_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('Failed to load trade settings:', e);
    }
    return { ...DEFAULT_TRADE_SETTINGS };
  }

  private loadLegacyState(settings: TradeExecutionSettings): StoredPaperState {
    const storage = getSafeStorage();
    if (storage) {
      try {
        const raw = storage.getItem(PAPER_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            initialBalance: Number(parsed.initialBalance ?? settings.virtualInitialBalance),
            availableBalance: Number(parsed.availableBalance ?? settings.virtualInitialBalance),
            totalCommissionsPaid: Number(parsed.totalCommissionsPaid ?? 0),
            positions: Array.isArray(parsed.positions) ? parsed.positions : [],
          };
        }
      } catch (e) {
        console.warn('Failed to load paper state', e);
      }
    }
    return {
      initialBalance: settings.virtualInitialBalance,
      availableBalance: settings.virtualInitialBalance,
      totalCommissionsPaid: 0,
      positions: [],
    };
  }

  private loadMultiAccounts(): void {
    const storage = getSafeStorage();
    if (storage) {
      try {
        const rawAccounts = storage.getItem(MULTI_ACCOUNTS_STORAGE_KEY);
        const rawActiveId = storage.getItem(ACTIVE_ACCOUNT_ID_STORAGE_KEY);

        if (rawAccounts) {
          const parsed = JSON.parse(rawAccounts);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.accounts = parsed.map((acc: any, index: number) => {
              const mergedSettings: TradeExecutionSettings = {
                ...DEFAULT_TRADE_SETTINGS,
                ...(acc.settings || {}),
              };
              const accId = acc.id || `acc_${index + 1}`;
              const accName = acc.name || `الحساب الافتراضي ${index + 1}`;
              return {
                id: accId,
                name: accName,
                createdAt: Number(acc.createdAt || Date.now()),
                initialBalance: Number(acc.initialBalance ?? mergedSettings.virtualInitialBalance),
                availableBalance: Number(acc.availableBalance ?? mergedSettings.virtualInitialBalance),
                totalCommissionsPaid: Number(acc.totalCommissionsPaid ?? 0),
                positions: Array.isArray(acc.positions)
                  ? acc.positions.map((p: PaperPosition) => ({
                      ...p,
                      accountId: p.accountId || accId,
                      accountName: p.accountName || accName,
                    }))
                  : [],
                settings: mergedSettings,
              };
            });

            if (rawActiveId && this.accounts.some((a) => a.id === rawActiveId)) {
              this.activeAccountId = rawActiveId;
            } else {
              this.activeAccountId = this.accounts[0].id;
            }
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to load multi-accounts state:', e);
      }
    }

    // Migrate legacy single-account data into the first virtual account
    const legacySettings = this.loadLegacySettings();
    const legacyState = this.loadLegacyState(legacySettings);
    const defaultId = 'acc_default';
    const defaultName = 'الحساب الافتراضي 1';

    const initialAccount: StoredVirtualAccount = {
      id: defaultId,
      name: defaultName,
      createdAt: Date.now(),
      initialBalance: legacyState.initialBalance,
      availableBalance: legacyState.availableBalance,
      totalCommissionsPaid: legacyState.totalCommissionsPaid,
      positions: legacyState.positions.map((p) => ({
        ...p,
        accountId: defaultId,
        accountName: defaultName,
      })),
      settings: legacySettings,
    };

    this.accounts = [initialAccount];
    this.activeAccountId = defaultId;
    this.saveState();
  }

  private saveState(): void {
    if (this.batchSaveDepth > 0) {
      this.batchDirtyState = true;
      return;
    }
    const storage = getSafeStorage();
    if (!storage) return;
    try {
      storage.setItem(MULTI_ACCOUNTS_STORAGE_KEY, JSON.stringify(this.accounts));
      storage.setItem(ACTIVE_ACCOUNT_ID_STORAGE_KEY, this.activeAccountId);
      this.savePendingChoices();
      this.saveTraderSyncCheckpoints();

      // Keep legacy keys in sync with the active account for backward compatibility
      const activeAcc = this.getAccount();
      storage.setItem(TRADE_SETTINGS_STORAGE_KEY, JSON.stringify(activeAcc.settings));
      const legacyState: StoredPaperState = {
        initialBalance: activeAcc.initialBalance,
        availableBalance: activeAcc.availableBalance,
        totalCommissionsPaid: activeAcc.totalCommissionsPaid,
        positions: activeAcc.positions,
      };
      storage.setItem(PAPER_STORAGE_KEY, JSON.stringify(legacyState));
    } catch (e) {
      console.warn('Failed to save multi-account paper state', e);
    }
  }

  public getAccount(accountId?: string): StoredVirtualAccount {
    if (accountId) {
      const found = this.accounts.find((a) => a.id === accountId);
      if (found) return found;
    }
    const active = this.accounts.find((a) => a.id === this.activeAccountId);
    if (active) return active;
    return this.accounts[0];
  }

  public getActiveAccountId(): string {
    return this.getAccount().id;
  }

  public getActiveAccountName(): string {
    return this.getAccount().name;
  }

  public setActiveAccount(accountId: string, currentPrices: Record<string, number> = {}): PaperAccountSnapshot {
    const target = this.accounts.find((a) => a.id === accountId);
    if (target) {
      this.activeAccountId = target.id;
      this.saveState();
    }
    return this.getSnapshot(currentPrices);
  }

  public createAccount(
    name: string,
    initialBalance?: number,
    copySettingsFromActive: boolean = true
  ): StoredVirtualAccount {
    const activeAcc = this.getAccount();
    const cleanName = name.trim() || `حساب افتراضي ${this.accounts.length + 1}`;
    const baseSettings: TradeExecutionSettings = copySettingsFromActive
      ? { ...activeAcc.settings, mode: 'VIRTUAL' }
      : { ...DEFAULT_TRADE_SETTINGS, mode: 'VIRTUAL' };

    const validBal =
      initialBalance !== undefined && initialBalance > 0
        ? Number(initialBalance)
        : Number(baseSettings.virtualInitialBalance || 1000);

    baseSettings.virtualInitialBalance = validBal;

    const newAcc: StoredVirtualAccount = {
      id: `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      createdAt: Date.now(),
      initialBalance: validBal,
      availableBalance: validBal,
      totalCommissionsPaid: 0,
      positions: [],
      settings: baseSettings,
    };

    this.accounts.push(newAcc);
    this.activeAccountId = newAcc.id;
    this.saveState();
    return newAcc;
  }

  public renameAccount(accountId: string, newName: string): void {
    const clean = newName.trim();
    if (!clean) return;
    const target = this.accounts.find((a) => a.id === accountId);
    if (target) {
      target.name = clean;
      target.positions.forEach((p) => {
        p.accountName = clean;
      });
      this.saveState();
    }
  }

  public deleteAccount(accountId: string, currentPrices: Record<string, number> = {}): PaperAccountSnapshot {
    if (this.accounts.length <= 1) {
      return this.getSnapshot(currentPrices);
    }
    mobileNotifications.resetAccountDrawdownAlert(accountId);
    this.accounts = this.accounts.filter((a) => a.id !== accountId);
    if (!this.accounts.some((a) => a.id === this.activeAccountId)) {
      this.activeAccountId = this.accounts[0].id;
    }
    this.saveState();
    return this.getSnapshot(currentPrices);
  }

  public getAccountsSummaries(currentPrices: Record<string, number> = {}): PaperVirtualAccountSummary[] {
    const effectivePrices = this.mergeWithLastKnownPrices(currentPrices);
    return this.accounts.map((acc) => {
      let totalUnrealized = 0;
      let openPositionsMargin = 0;
      let openCount = 0;
      let closedCount = 0;

      for (const p of acc.positions) {
        if (p.status === 'OPEN') {
          openCount++;
          const margin = p.marginUsdt || (p.quantity * p.entryPrice) / p.leverage;
          openPositionsMargin += margin;
          const currentPrice =
            effectivePrices[p.symbol] ||
            effectivePrices[p.symbol.toUpperCase()] ||
            p.entryPrice;
          const dir = p.side === 'LONG' ? 1 : -1;
          totalUnrealized += (currentPrice - p.entryPrice) * p.quantity * dir;
        } else {
          closedCount++;
        }
      }

      const totalEquity = acc.availableBalance + openPositionsMargin + totalUnrealized;
      const drawdownPercent =
        acc.initialBalance > 0 && totalEquity < acc.initialBalance
          ? parseFloat((((acc.initialBalance - totalEquity) / acc.initialBalance) * 100).toFixed(2))
          : 0;

      return {
        id: acc.id,
        name: acc.name,
        createdAt: acc.createdAt,
        initialBalance: acc.initialBalance,
        availableBalance: parseFloat(acc.availableBalance.toFixed(4)),
        totalEquity: parseFloat(totalEquity.toFixed(4)),
        unrealizedPnl: parseFloat(totalUnrealized.toFixed(4)),
        totalCommissionsPaid: parseFloat(acc.totalCommissionsPaid.toFixed(4)),
        openPositionsCount: openCount,
        closedPositionsCount: closedCount,
        drawdownPercent,
        settings: { ...acc.settings },
      };
    });
  }

  public getSettings(accountId?: string): TradeExecutionSettings {
    const acc = this.getAccount(accountId);
    return { ...acc.settings };
  }

  public updateSettings(
    partial: Partial<TradeExecutionSettings>,
    accountId?: string,
    applyToAllAccounts: boolean = false
  ): TradeExecutionSettings {
    const targetAccounts = applyToAllAccounts ? this.accounts : [this.getAccount(accountId)];

    for (const acc of targetAccounts) {
      const prevInitial = acc.settings.virtualInitialBalance;
      acc.settings = { ...acc.settings, ...partial };

      // If virtualInitialBalance was changed, adjust initialBalance & availableBalance by the difference
      if (
        partial.virtualInitialBalance !== undefined &&
        partial.virtualInitialBalance > 0 &&
        partial.virtualInitialBalance !== prevInitial
      ) {
        const diff = partial.virtualInitialBalance - acc.initialBalance;
        acc.initialBalance = partial.virtualInitialBalance;
        acc.availableBalance = Math.max(0, acc.availableBalance + diff);
        mobileNotifications.resetAccountDrawdownAlert(acc.id);
      }

      // Recalculate open copied positions if scale-in or trade size settings were updated
      if (
        partial.scaleInSamePercentAsTrader !== undefined ||
        partial.scaleInFixedValueUsdt !== undefined ||
        partial.tradeValueUsdt !== undefined ||
        partial.leverage !== undefined
      ) {
        this.recalculateOpenCopiedPositions(acc);
      }

      // If promptOnUnfavorableLateEntry was turned off, clear pending manual choices for this account
      // so the next sync cycle enters automatically at live market price
      if (partial.promptOnUnfavorableLateEntry === false) {
        this.pendingReconnectChoices = this.pendingReconnectChoices.filter(
          (c) => (c.accountId || 'acc_default') !== acc.id
        );
      }
    }

    this.saveState();
    return { ...this.getAccount(accountId).settings };
  }

  private recalculateOpenCopiedPositions(acc: StoredVirtualAccount): void {
    const openPositions = acc.positions.filter((p) => p.status === 'OPEN');
    if (openPositions.length === 0) {
      return;
    }

    let oldMarginUsed = 0;
    for (const p of openPositions) {
      oldMarginUsed += p.marginUsdt || (p.quantity * p.entryPrice) / p.leverage;
    }

    let newMarginUsed = 0;
    const baseTradeVal = Math.max(1, acc.settings.tradeValueUsdt || 25);
    const lev = Math.max(1, acc.settings.leverage || 5);
    const samePctMode = acc.settings.scaleInSamePercentAsTrader !== false;
    const fixedScaleVal = Math.max(1, acc.settings.scaleInFixedValueUsdt || 10);

    for (const pos of acc.positions) {
      if (pos.status === 'OPEN' && pos.sourceType && pos.sourceType !== 'MANUAL') {
        const initialMargin = baseTradeVal;
        pos.initialMarginUsdt = initialMargin;
        pos.leverage = lev;

        if (pos.scaleAdjustments && pos.scaleAdjustments.length > 0) {
          let runningMargin = initialMargin;
          let runningScalePct = 100;

          pos.scaleAdjustments = pos.scaleAdjustments.map((adj) => {
            const p = adj.price > 0 ? adj.price : pos.entryPrice;
            if (adj.actionType === 'INITIAL_ENTRY') {
              const initScalePct =
                adj.volumePercent && adj.volumePercent > 0 ? adj.volumePercent : 100;
              runningMargin = Number((initialMargin * (initScalePct / 100)).toFixed(2));
              runningScalePct = initScalePct;
              const sideLabel = pos.side === 'LONG' ? 'شراء Long' : 'بيع Short';
              const comp = formatLateEntryComparisonDetails({
                traderEntryPrice: adj.traderEntryPrice || pos.traderEntryPrice || p,
                traderEntryTime: adj.traderEntryTime || pos.traderEntryTime || pos.openTime,
                userEntryPrice: p,
                userEntryTime: pos.openTime || adj.timestamp,
              });
              const baseLabel =
                initScalePct !== 100
                  ? `دخول مباشر بقيمة الصفقة المتبقية (${sideLabel} ${initScalePct}% • ${runningMargin.toFixed(2)}$ بدون تكرار العمليات السابقة)`
                  : `فتح الصفقة الأولي (${sideLabel} 100% • ${runningMargin.toFixed(2)}$)`;
              return {
                ...adj,
                volumePercent: initScalePct,
                remainingPercentAfter: initScalePct,
                executedQty: Number(((runningMargin * lev) / p).toFixed(5)),
                marginDeltaUsdt: runningMargin,
                traderEntryPrice: adj.traderEntryPrice || pos.traderEntryPrice || p,
                traderEntryTime: adj.traderEntryTime || pos.traderEntryTime || pos.openTime,
                actionLabelAr: `${baseLabel} — ${comp.combinedSummaryAr}`,
              };
            }

            if (adj.actionType === 'SCALE_IN') {
              const origPct = Math.max(5, Math.abs(adj.volumePercent || 25));
              if (samePctMode) {
                const addedMargin = Number((initialMargin * (origPct / 100)).toFixed(2));
                runningMargin = Number((runningMargin + addedMargin).toFixed(2));
                runningScalePct += origPct;
                return {
                  ...adj,
                  volumePercent: origPct,
                  remainingPercentAfter: runningScalePct,
                  executedQty: Number(((addedMargin * lev) / p).toFixed(5)),
                  marginDeltaUsdt: addedMargin,
                  actionLabelAr: `تدعيم آلي بنفس النسبة (+${origPct}% من الأصل • +${addedMargin.toFixed(2)}$)`,
                };
              } else {
                const addedMargin = Number(fixedScaleVal.toFixed(2));
                const equivPct = Math.max(1, Math.round((addedMargin / initialMargin) * 100));
                runningMargin = Number((runningMargin + addedMargin).toFixed(2));
                runningScalePct += equivPct;
                return {
                  ...adj,
                  volumePercent: equivPct,
                  remainingPercentAfter: runningScalePct,
                  executedQty: Number(((addedMargin * lev) / p).toFixed(5)),
                  marginDeltaUsdt: addedMargin,
                  actionLabelAr: `تدعيم بالقيمة المحددة (+${addedMargin.toFixed(2)}$ • يعادل +${equivPct}%)`,
                };
              }
            }

            if (adj.actionType === 'PARTIAL_EXIT') {
              const withdrawPct = Math.min(95, Math.max(5, Math.abs(adj.volumePercent || 25)));
              const withdrawnMargin = Number((runningMargin * (withdrawPct / 100)).toFixed(2));
              runningMargin = Number(Math.max(0.5, runningMargin - withdrawnMargin).toFixed(2));
              runningScalePct = Math.max(5, Math.round(runningScalePct * (1 - withdrawPct / 100)));
              return {
                ...adj,
                volumePercent: -withdrawPct,
                remainingPercentAfter: runningScalePct,
                executedQty: Number(((withdrawnMargin * lev) / p).toFixed(5)),
                marginDeltaUsdt: -withdrawnMargin,
                actionLabelAr: `انسحاب جزئي بنفس النسبة (-${withdrawPct}% • سحب ${withdrawnMargin.toFixed(2)}$ • متبقي ${runningScalePct}%)`,
              };
            }

            return adj;
          });

          pos.marginUsdt = runningMargin;
          pos.currentScalePercent = runningScalePct;
          pos.quantity = Number(((runningMargin * lev) / pos.entryPrice).toFixed(5));
        } else {
          pos.marginUsdt = initialMargin;
          pos.quantity = Number(((initialMargin * lev) / pos.entryPrice).toFixed(5));
        }
      }

      if (pos.status === 'OPEN') {
        newMarginUsed += pos.marginUsdt || (pos.quantity * pos.entryPrice) / pos.leverage;
      }
    }

    if (acc.settings.mode === 'VIRTUAL') {
      const marginDiff = oldMarginUsed - newMarginUsed;
      acc.availableBalance = Math.max(0, acc.availableBalance + marginDiff);
    }
    this.saveState();
  }

  /**
   * Explicitly set or reset the Virtual Balance to a user-specified amount
   */
  public setVirtualBalance(
    newBalance: number,
    closeAllPositions: boolean = false,
    accountId?: string
  ): PaperAccountSnapshot {
    const acc = this.getAccount(accountId);
    const validBalance = Math.max(1, Number(newBalance) || 1000);
    acc.settings.virtualInitialBalance = validBalance;

    if (closeAllPositions) {
      acc.initialBalance = validBalance;
      acc.availableBalance = validBalance;
      acc.totalCommissionsPaid = 0;
      acc.positions = [];
      this.pendingReconnectChoices = this.pendingReconnectChoices.filter(
        (c) => (c.accountId || 'acc_default') !== acc.id
      );
      for (const id of Array.from(this.dismissedReconnectChoiceIds)) {
        if (id.startsWith(`choice_${acc.id}_`)) {
          this.dismissedReconnectChoiceIds.delete(id);
        }
      }
      for (const key of Object.keys(this.traderSyncCheckpoints)) {
        if (this.traderSyncCheckpoints[key]?.accountId === acc.id) {
          delete this.traderSyncCheckpoints[key];
        }
      }
      this.savePendingChoices();
      this.saveTraderSyncCheckpoints();
    } else {
      let openMargin = 0;
      for (const p of acc.positions) {
        if (p.status === 'OPEN') {
          openMargin += p.marginUsdt || (p.quantity * p.entryPrice) / p.leverage;
        }
      }
      acc.initialBalance = validBalance;
      acc.availableBalance = Math.max(0, validBalance - openMargin);
    }

    mobileNotifications.resetAccountDrawdownAlert(acc.id);
    this.saveState();
    return this.getSnapshot({});
  }

  public reset(balance?: number, accountId?: string): PaperAccountSnapshot {
    const acc = this.getAccount(accountId);
    const targetBal = balance !== undefined ? balance : acc.settings.virtualInitialBalance;
    return this.setVirtualBalance(targetBal, true, acc.id);
  }

  /**
   * Clear closed positions history only (keeping open positions intact)
   */
  public clearClosedPositions(accountId?: string, allAccounts: boolean = false): PaperAccountSnapshot {
    const targets = allAccounts ? this.accounts : [this.getAccount(accountId)];
    for (const acc of targets) {
      acc.positions = acc.positions.filter((p) => p.status === 'OPEN');
      let openCommissions = 0;
      let openMargin = 0;
      for (const p of acc.positions) {
        openCommissions += p.commissionUsdt || 0;
        openMargin += p.marginUsdt || (p.quantity * p.entryPrice) / p.leverage;
      }
      acc.totalCommissionsPaid = openCommissions;
      acc.availableBalance = Math.max(0, acc.initialBalance - openMargin - openCommissions);
      mobileNotifications.resetAccountDrawdownAlert(acc.id);
    }
    this.saveState();
    return this.getSnapshot({});
  }

  /**
   * Clear all previous operations, open & closed trades, and reset balances to initial capital
   * while preserving user's saved Trade Settings.
   */
  public clearAllDataAndReset(options?: {
    scope?: 'ACTIVE_ACCOUNT' | 'ALL_ACCOUNTS';
    removeExtraAccounts?: boolean;
  }): PaperAccountSnapshot {
    const scope = options?.scope || 'ALL_ACCOUNTS';
    const removeExtra = options?.removeExtraAccounts || false;

    if (scope === 'ALL_ACCOUNTS') {
      this.pendingReconnectChoices = [];
      this.dismissedReconnectChoiceIds.clear();
      this.traderSyncCheckpoints = {};
      this.lastKnownPrices = {};
    } else {
      const activeId = this.getActiveAccountId();
      this.pendingReconnectChoices = this.pendingReconnectChoices.filter(
        (c) => c.accountId !== activeId
      );
      for (const key of Object.keys(this.traderSyncCheckpoints)) {
        if (this.traderSyncCheckpoints[key]?.accountId === activeId) {
          delete this.traderSyncCheckpoints[key];
        }
      }
    }

    if (removeExtra && this.accounts.length > 1) {
      const primary = this.accounts[0];
      this.accounts.forEach((a) => mobileNotifications.resetAccountDrawdownAlert(a.id));
      primary.positions = [];
      primary.totalCommissionsPaid = 0;
      primary.initialBalance = Math.max(1, primary.settings.virtualInitialBalance || primary.initialBalance || 1000);
      primary.availableBalance = primary.initialBalance;
      this.accounts = [primary];
      this.activeAccountId = primary.id;
      this.saveState();
      return this.getSnapshot({});
    }

    const targets = scope === 'ALL_ACCOUNTS' ? this.accounts : [this.getAccount()];
    for (const acc of targets) {
      acc.positions = [];
      acc.totalCommissionsPaid = 0;
      acc.initialBalance = Math.max(1, acc.settings.virtualInitialBalance || acc.initialBalance || 1000);
      acc.availableBalance = acc.initialBalance;
      mobileNotifications.resetAccountDrawdownAlert(acc.id);
    }

    this.saveState();
    return this.getSnapshot({});
  }

  public getOpenPositionsCount(accountId?: string): number {
    const acc = this.getAccount(accountId);
    return acc.positions.filter((p) => p.status === 'OPEN').length;
  }

  private recordAppliedSyncEventIds(pos: PaperPosition, keys?: string[]): void {
    if (!keys || keys.length === 0) return;
    const existing = pos.appliedSyncEventIds ? [...pos.appliedSyncEventIds] : [];
    for (const key of keys) {
      if (key && !existing.includes(key)) {
        existing.push(key);
      }
    }
    pos.appliedSyncEventIds = existing.slice(-100);
  }

  private findAccountAndPosition(
    positionId: string,
    accountId?: string
  ): { acc: StoredVirtualAccount; pos: PaperPosition } {
    if (accountId) {
      const targetAcc = this.getAccount(accountId);
      const pos = targetAcc.positions.find((p) => p.id === positionId && p.status === 'OPEN');
      if (pos) return { acc: targetAcc, pos };
    }
    for (const acc of this.accounts) {
      const pos = acc.positions.find((p) => p.id === positionId && p.status === 'OPEN');
      if (pos) return { acc, pos };
    }
    throw new Error('الصفقة غير موجودة أو مغلقة');
  }

  public openPosition(
    symbol: string,
    side: 'LONG' | 'SHORT',
    quantity: number,
    entryPrice: number,
    leverage?: number,
    sourceTraderName?: string,
    sourceType?: 'COPY_TRADING' | 'SMART_MONEY' | 'MANUAL',
    sourceTraderId?: string,
    traderEntryTime?: number,
    initialScaleAdjustments?: PaperPosition['scaleAdjustments'],
    currentScalePercent?: number,
    initialMarginOverride?: number,
    accountId?: string,
    traderEntryPrice?: number
  ): PaperPosition {
    const acc = this.getAccount(accountId);
    const openCount = this.getOpenPositionsCount(acc.id);
    if (openCount >= acc.settings.maxConcurrentTrades) {
      throw new Error(
        `تم الوصول للحد الأقصى لعدد الصفقات المفتوحة بنفس الوقت في "${acc.name}" (${acc.settings.maxConcurrentTrades} صفقات). يمكنك زيادة الحد من إعدادات الصفقات أو إغلاق صفقة مفتوحة.`
      );
    }

    const safeLeverage = Math.max(1, leverage || acc.settings.leverage || 5);
    const notional = quantity * entryPrice;
    const margin = notional / safeLeverage;
    const entryCommission = notional * (Math.max(0, acc.settings.commissionPercent) / 100);
    const totalRequired = margin + entryCommission;

    if (acc.settings.mode === 'VIRTUAL' && totalRequired > acc.availableBalance) {
      throw new Error(
        `رصيد "${acc.name}" غير كافٍ. المطلوب (شامل العمولة): ${totalRequired.toFixed(2)} USDT، المتاح: ${acc.availableBalance.toFixed(2)} USDT`
      );
    }

    if (acc.settings.mode === 'VIRTUAL') {
      acc.availableBalance -= totalRequired;
    }
    acc.totalCommissionsPaid += entryCommission;

    const now = Date.now();
    const posId = `trade_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const cleanQty = Number(quantity.toFixed(5));
    const cleanMargin = Number(margin.toFixed(2));
    const baseInitialMargin =
      initialMarginOverride && initialMarginOverride > 0
        ? Number(initialMarginOverride.toFixed(2))
        : cleanMargin;

    const defaultComp = formatLateEntryComparisonDetails({
      traderEntryPrice: traderEntryPrice && traderEntryPrice > 0 ? traderEntryPrice : entryPrice,
      traderEntryTime: traderEntryTime || now,
      userEntryPrice: entryPrice,
      userEntryTime: now,
    });

    const defaultAdjustments: PaperPosition['scaleAdjustments'] =
      initialScaleAdjustments && initialScaleAdjustments.length > 0
        ? initialScaleAdjustments
        : [
            {
              id: `${posId}_init`,
              actionType: 'INITIAL_ENTRY',
              actionLabelAr:
                sourceType && sourceType !== 'MANUAL'
                  ? `فتح الصفقة بالسعر الحالي للسوق (${side === 'LONG' ? 'شراء Long' : 'بيع Short'} 100% • ${baseInitialMargin.toFixed(2)}$) — ${defaultComp.combinedSummaryAr}`
                  : `فتح الصفقة بالسعر الحالي للسوق (${side === 'LONG' ? 'شراء Long' : 'بيع Short'} 100% • ${baseInitialMargin.toFixed(2)}$)`,
              timestamp: now,
              volumePercent: 100,
              remainingPercentAfter: 100,
              executedQty: cleanQty,
              price: entryPrice,
              traderEntryPrice: traderEntryPrice && traderEntryPrice > 0 ? traderEntryPrice : entryPrice,
              traderEntryTime: traderEntryTime || now,
              marginDeltaUsdt: baseInitialMargin,
            },
          ];

    const newPos: PaperPosition = {
      id: posId,
      symbol: symbol.toUpperCase(),
      side,
      quantity: cleanQty,
      marginUsdt: cleanMargin,
      initialMarginUsdt: baseInitialMargin,
      entryPrice,
      traderEntryPrice: traderEntryPrice && traderEntryPrice > 0 ? traderEntryPrice : entryPrice,
      leverage: safeLeverage,
      commissionUsdt: Number(entryCommission.toFixed(4)),
      status: 'OPEN',
      openTime: now,
      traderEntryTime: traderEntryTime || now,
      currentScalePercent: currentScalePercent || 100,
      scaleAdjustments: defaultAdjustments,
      sourceTraderId,
      sourceTraderName,
      sourceType: sourceType || 'MANUAL',
      executionMode: acc.settings.mode,
      accountId: acc.id,
      accountName: acc.name,
    };

    acc.positions.unshift(newPos);
    this.saveState();

    mobileNotifications.notifyTradeEvent({
      actionType: 'OPEN_TRADE',
      position: newPos,
      executionPrice: entryPrice,
      volumePercent: newPos.currentScalePercent || 100,
      marginDeltaUsdt: cleanMargin,
    });

    return newPos;
  }

  /**
   * Open a position using the target Account's Fixed Trade Settings at the Current Market Price
   */
  public openPositionWithUserSettings(params: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number; // Always the current live market price
    traderEntryPrice?: number; // Original entry price of the trader
    traderLeverage?: number;
    customMarginUsdt?: number;
    customLeverage?: number;
    sourceTraderId?: string;
    sourceTraderName?: string;
    sourceType?: 'COPY_TRADING' | 'SMART_MONEY' | 'MANUAL';
    traderEntryTime?: number;
    traderScaleAdjustments?: PaperPosition['scaleAdjustments'];
    currentScalePercent?: number;
    accountId?: string;
    initialAppliedEventKeys?: string[];
    lastSyncedTraderQty?: number;
  }): PaperPosition {
    const acc = this.getAccount(params.accountId);
    const accSettings = acc.settings;

    const baseMarginUsdt =
      accSettings.enforceUserSizeOnCopy
        ? accSettings.tradeValueUsdt
        : params.customMarginUsdt !== undefined && params.customMarginUsdt > 0
        ? params.customMarginUsdt
        : accSettings.tradeValueUsdt;

    const leverage =
      accSettings.enforceUserSizeOnCopy
        ? accSettings.leverage
        : params.traderLeverage || params.customLeverage || accSettings.leverage;

    const safePrice = params.entryPrice > 0 ? params.entryPrice : 50;
    const samePctMode = accSettings.scaleInSamePercentAsTrader !== false;
    const fixedScaleVal = Math.max(1, accSettings.scaleInFixedValueUsdt || 10);

    // Enter directly with the net remaining position value (e.g. 150% or 50%) in ONE single operation
    // without repeating or replaying all past scale-in and partial-exit operations!
    const lateEntryState = calculateLateEntryNetPositionState({
      baseMarginUsdt,
      leverage,
      executionPrice: safePrice,
      side: params.side,
      traderEntryPrice: params.traderEntryPrice,
      traderEntryTime: params.traderEntryTime,
      traderCurrentScalePercent: params.currentScalePercent,
      traderScaleAdjustments: params.traderScaleAdjustments,
      scaleInSamePercentAsTrader: samePctMode,
      scaleInFixedValueUsdt: fixedScaleVal,
      entryTimestamp: Date.now(),
    });

    const openedPos = this.openPosition(
      params.symbol,
      params.side,
      lateEntryState.directQuantity,
      safePrice,
      leverage,
      params.sourceTraderName,
      params.sourceType,
      params.sourceTraderId,
      params.traderEntryTime,
      [lateEntryState.singleDirectAdjustment],
      lateEntryState.netScalePercent,
      baseMarginUsdt,
      acc.id,
      params.traderEntryPrice
    );

    const foldedKeys = [
      ...buildInitialAppliedEventKeysForOpenPosition(params.symbol, params.traderScaleAdjustments),
      ...(params.initialAppliedEventKeys || []),
    ];
    if (foldedKeys.length > 0) {
      this.recordAppliedSyncEventIds(openedPos, foldedKeys);
    }
    if (params.lastSyncedTraderQty !== undefined && params.lastSyncedTraderQty > 0) {
      openedPos.lastSyncedTraderQty = Math.abs(params.lastSyncedTraderQty);
      openedPos.lastSyncedTraderUpdateTime = Date.now();
    }
    if (foldedKeys.length > 0 || (params.lastSyncedTraderQty !== undefined && params.lastSyncedTraderQty > 0)) {
      this.saveState();
    }

    return openedPos;
  }

  /**
   * Manual Single Position Copy or Delta Sync:
   * - If the trade is NOT yet copied in the target account -> opens it once ('OPENED_NEW').
   * - If the trade IS already copied & open in the target account:
   *   - If there are NO uncopied partial exits or scale-ins -> does nothing ('NO_CHANGES_ALREADY_COPIED').
   *   - If there ARE uncopied partial exits or scale-ins -> applies ONLY the uncopied changes ('SYNCED_DELTAS_ONLY')
   *     without repeating or duplicating the position from scratch.
   */
  public copyOrSyncSinglePositionManually(params: {
    pos: TraderOpenPosition;
    traderName: string;
    traderId?: string;
    sourceType?: 'COPY_TRADING' | 'SMART_MONEY' | 'MANUAL';
    entryPrice: number;
    customMarginUsdt?: number;
    customLeverage?: number;
    accountId?: string;
  }): ManualSingleCopyResult {
    const acc = this.getAccount(params.accountId);
    const safePrice =
      params.entryPrice > 0
        ? params.entryPrice
        : params.pos.markPrice > 0
        ? params.pos.markPrice
        : params.pos.entryPrice;

    const openPositionsInAcc = acc.positions.filter((p) => p.status === 'OPEN');
    const plan = evaluateManualSinglePositionCopyPlan({
      incomingPos: params.pos,
      traderName: params.traderName,
      traderId: params.traderId,
      existingOpenPositions: openPositionsInAcc,
      executionPrice: safePrice,
    });

    if (plan.decision === 'OPEN_NEW') {
      const openedPos = this.openPositionWithUserSettings({
        symbol: params.pos.symbol,
        side: params.pos.side,
        entryPrice: safePrice,
        traderEntryPrice: params.pos.entryPrice,
        traderLeverage: params.pos.leverage,
        customMarginUsdt: params.customMarginUsdt,
        customLeverage: params.customLeverage,
        sourceTraderId: params.traderId,
        sourceTraderName: params.traderName,
        sourceType: params.sourceType || 'COPY_TRADING',
        traderEntryTime: params.pos.entryTime,
        traderScaleAdjustments: params.pos.scaleAdjustments,
        currentScalePercent: params.pos.currentScalePercent,
        accountId: acc.id,
        initialAppliedEventKeys: plan.initialAppliedEventKeys,
        lastSyncedTraderQty: Math.abs(Number(params.pos.positionAmount || 0)),
      });

      return {
        status: 'OPENED_NEW',
        position: openedPos,
        appliedDeltas: [],
        messageAr: `تم نسخ وفتح صفقة ${openedPos.symbol} (${openedPos.side}) في "${acc.name}" بسعر السوق الحالي (${safePrice.toFixed(2)}$) ورافعة ${openedPos.leverage}x (هامش: ${openedPos.marginUsdt.toFixed(2)} USDT)`,
      };
    }

    const existingPos = plan.existingPosition!;
    if (plan.decision === 'DO_NOTHING_ALREADY_COPIED' || plan.deltaActions.length === 0) {
      return {
        status: 'NO_CHANGES_ALREADY_COPIED',
        position: existingPos,
        appliedDeltas: [],
        messageAr: `صفقة ${existingPos.symbol} (${existingPos.side}) منسوخة ومفتوحة مسبقاً في "${acc.name}" — لا توجد أي سحوبات جزئية أو تدعيمات جديدة غير منسوخة`,
      };
    }

    let updatedPos = existingPos;
    const appliedDeltas: ManualAppliedDeltaExecution[] = [];
    const summaryLabels: string[] = [];

    for (const delta of plan.deltaActions) {
      const prevMargin = updatedPos.marginUsdt;
      const prevQty = updatedPos.quantity;
      const execPrice = delta.price > 0 ? delta.price : safePrice;

      if (delta.actionType === 'SCALE_IN') {
        updatedPos = this.scaleInFromTraderSignal(
          updatedPos.id,
          delta.volumePercent,
          execPrice,
          delta.timestamp,
          acc.id,
          {
            sourceEventId: delta.sourceEventId,
            appliedEventKeys: delta.candidateKeys,
            eventKey: `${acc.id}_${updatedPos.id}_${delta.sourceEventId}`,
          }
        );
        const marginDelta = Math.max(0.5, Number((updatedPos.marginUsdt - prevMargin).toFixed(2)));
        const qtyDelta = Math.max(0.00001, Number((updatedPos.quantity - prevQty).toFixed(5)));
        appliedDeltas.push({
          actionType: 'SCALE_IN',
          volumePercent: delta.volumePercent,
          price: execPrice,
          marginDeltaUsdt: marginDelta,
          executedQty: qtyDelta,
          leverage: updatedPos.leverage,
        });
        summaryLabels.push(`تدعيم +${delta.volumePercent}%`);
      } else if (delta.actionType === 'PARTIAL_EXIT') {
        updatedPos = this.partialExitPosition(
          updatedPos.id,
          delta.volumePercent,
          execPrice,
          delta.timestamp,
          acc.id,
          {
            sourceEventId: delta.sourceEventId,
            appliedEventKeys: delta.candidateKeys,
            eventKey: `${acc.id}_${updatedPos.id}_${delta.sourceEventId}`,
          }
        );
        const marginDelta = Math.max(0.25, Number((prevMargin - updatedPos.marginUsdt).toFixed(2)));
        const qtyDelta = Math.max(0.00001, Number((prevQty - updatedPos.quantity).toFixed(5)));
        appliedDeltas.push({
          actionType: 'PARTIAL_EXIT',
          volumePercent: delta.volumePercent,
          price: execPrice,
          marginDeltaUsdt: marginDelta,
          executedQty: qtyDelta,
          leverage: updatedPos.leverage,
        });
        summaryLabels.push(`سحب جزئي -${delta.volumePercent}%`);
      }
    }

    const latestTraderQty = Math.abs(Number(params.pos.positionAmount || 0));
    if (latestTraderQty > 0) {
      updatedPos.lastSyncedTraderQty = latestTraderQty;
    }
    updatedPos.lastSyncedTraderUpdateTime = params.pos.lastUpdateTime || Date.now();
    this.saveState();

    return {
      status: 'SYNCED_DELTAS_ONLY',
      position: updatedPos,
      appliedDeltas,
      messageAr: `الصفقة منسوخة مسبقاً في "${acc.name}" — تم نسخ التغييرات غير المنسوخة فقط (${summaryLabels.join(' ، ')}) على ${updatedPos.symbol} بدون تكرار الصفقة من جديد`,
    };
  }

  /**
   * تأمين الصفقة (Secure Position): Places a protective Stop-Loss near the current live market price
   */
  public securePositionNearCurrentPrice(
    positionId: string,
    currentMarketPrice: number,
    bufferPercent: number = 0.2,
    accountId?: string
  ): PaperPosition {
    const { pos } = this.findAccountAndPosition(positionId, accountId);
    const safeCurrent = currentMarketPrice > 0 ? currentMarketPrice : pos.entryPrice;
    const safeBuffer = Math.min(Math.max(0.05, bufferPercent || 0.2), 5);
    const stopLossPrice = calculateSecureStopLossPrice({
      side: pos.side,
      currentMarketPrice: safeCurrent,
      bufferPercent: safeBuffer,
    });

    pos.stopLossPrice = stopLossPrice;
    pos.isSecuredNearCurrent = true;
    pos.securedBufferPercent = safeBuffer;

    this.saveState();

    mobileNotifications.notifyPositionSecured({
      position: pos,
      currentPrice: safeCurrent,
      stopLossPrice,
    });

    return pos;
  }

  /**
   * Automatically checks and executes any triggered Stop-Loss on open positions across all accounts
   */
  public checkAndExecuteStopLosses(currentPrices: Record<string, number>): CopiedSyncLog[] {
    const logs: CopiedSyncLog[] = [];
    if (!currentPrices || Object.keys(currentPrices).length === 0) return logs;

    for (const acc of this.accounts) {
      const openList = acc.positions.filter((p) => p.status === 'OPEN');
      for (const pos of openList) {
        const livePrice = currentPrices[pos.symbol];
        if (!livePrice || livePrice <= 0) continue;

        if (
          pos.stopLossPrice &&
          pos.stopLossPrice > 0 &&
          isStopLossTriggered({
            side: pos.side,
            stopLossPrice: pos.stopLossPrice,
            currentMarketPrice: livePrice,
          })
        ) {
          try {
            const closed = this.closePosition(pos.id, livePrice, Date.now(), acc.id);
            logs.push({
              id: `log_sl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              timestamp: Date.now(),
              traderId: pos.sourceTraderId || 'secured_sl',
              traderName: pos.sourceTraderName || 'تأمين الصفقة',
              source: pos.sourceType === 'SMART_MONEY' ? 'SMART_MONEY' : 'COPY_TRADING',
              action: 'EXIT',
              volumePercent: -100,
              symbol: closed.symbol,
              side: closed.side,
              price: livePrice,
              quantity: closed.quantity,
              leverage: closed.leverage,
              accountId: acc.id,
              accountName: acc.name,
              messageAr: `[${acc.name}] تم تفعيل وقف الخسارة الآمن (تأمين الصفقة) وإغلاق ${closed.symbol} بالسعر الحالي ${livePrice.toFixed(4)} USDT`,
            });
          } catch (e) {
            console.warn('Stop-loss execution failed:', e);
          }
        }
      }
    }
    return logs;
  }

  /**
   * Reinforce / Scale-In
   */
  public scaleInPosition(
    positionId: string,
    addPercent: number,
    executionPrice: number,
    actionTimestamp?: number,
    customAddedMarginUsdt?: number,
    accountId?: string,
    options?: { sourceEventId?: string; appliedEventKeys?: string[]; eventKey?: string }
  ): PaperPosition {
    const { acc, pos } = this.findAccountAndPosition(positionId, accountId);

    const baseMargin = pos.initialMarginUsdt || pos.marginUsdt || acc.settings.tradeValueUsdt;
    const isFixedUsdtMode = customAddedMarginUsdt !== undefined && customAddedMarginUsdt > 0;

    const addedMargin = isFixedUsdtMode
      ? Number(customAddedMarginUsdt.toFixed(2))
      : Number((baseMargin * (Math.min(Math.max(1, Math.round(addPercent)), 500) / 100)).toFixed(2));

    const cleanPct = isFixedUsdtMode
      ? Math.max(1, Math.round((addedMargin / baseMargin) * 100))
      : Math.min(Math.max(1, Math.round(addPercent)), 500);

    const addedNotional = addedMargin * pos.leverage;
    const safePrice = executionPrice > 0 ? executionPrice : pos.entryPrice;
    const addedQty = addedNotional / safePrice;
    const scaleCommission = addedNotional * (Math.max(0, acc.settings.commissionPercent) / 100);
    const totalRequired = addedMargin + scaleCommission;

    if (pos.executionMode !== 'REAL' && totalRequired > acc.availableBalance) {
      throw new Error(
        `الرصيد الافتراضي في "${acc.name}" غير كافٍ لتدعيم الصفقة (+${addedMargin.toFixed(2)} USDT). المطلوب: ${totalRequired.toFixed(2)} USDT`
      );
    }

    if (pos.executionMode !== 'REAL') {
      acc.availableBalance -= totalRequired;
    }
    acc.totalCommissionsPaid += scaleCommission;

    const oldNotional = pos.quantity * pos.entryPrice;
    const newTotalQty = pos.quantity + addedQty;
    const newAvgEntry = newTotalQty > 0 ? (oldNotional + addedNotional) / newTotalQty : safePrice;

    pos.entryPrice = Number(newAvgEntry.toFixed(safePrice > 50 ? 2 : 5));
    pos.quantity = Number(newTotalQty.toFixed(5));
    pos.marginUsdt = Number((pos.marginUsdt + addedMargin).toFixed(2));
    pos.commissionUsdt = Number(((pos.commissionUsdt || 0) + scaleCommission).toFixed(4));
    pos.currentScalePercent = (pos.currentScalePercent || 100) + cleanPct;

    const ts = actionTimestamp || Date.now();
    if (!pos.scaleAdjustments) pos.scaleAdjustments = [];
    pos.scaleAdjustments.push({
      id: `${pos.id}_scale_in_${ts}_${pos.scaleAdjustments.length}`,
      actionType: 'SCALE_IN',
      actionLabelAr: isFixedUsdtMode
        ? `تدعيم بالقيمة المحددة (+${addedMargin.toFixed(2)}$ • يعادل +${cleanPct}%)`
        : `تدعيم بنفس النسبة (+${cleanPct}% من الأصل • +${addedMargin.toFixed(2)}$)`,
      timestamp: ts,
      volumePercent: cleanPct,
      remainingPercentAfter: pos.currentScalePercent,
      executedQty: Number(addedQty.toFixed(5)),
      price: safePrice,
      marginDeltaUsdt: addedMargin,
      sourceEventId: options?.sourceEventId,
    });
    this.recordAppliedSyncEventIds(
      pos,
      options?.appliedEventKeys || (options?.sourceEventId ? [options.sourceEventId] : undefined)
    );

    this.saveState();

    mobileNotifications.notifyTradeEvent({
      actionType: 'SCALE_IN',
      position: pos,
      executionPrice: safePrice,
      volumePercent: cleanPct,
      marginDeltaUsdt: addedMargin,
      eventKey: options?.eventKey || options?.sourceEventId,
    });

    return pos;
  }

  public scaleInFromTraderSignal(
    positionId: string,
    traderVolumePercent: number,
    executionPrice: number,
    actionTimestamp?: number,
    accountId?: string,
    options?: { sourceEventId?: string; appliedEventKeys?: string[]; eventKey?: string }
  ): PaperPosition {
    const { acc } = this.findAccountAndPosition(positionId, accountId);
    if (acc.settings.scaleInSamePercentAsTrader !== false) {
      const pct = Math.max(5, Math.abs(traderVolumePercent || 25));
      return this.scaleInPosition(positionId, pct, executionPrice, actionTimestamp, undefined, acc.id, options);
    } else {
      const fixedVal = Math.max(1, acc.settings.scaleInFixedValueUsdt || 10);
      return this.scaleInPosition(positionId, 0, executionPrice, actionTimestamp, fixedVal, acc.id, options);
    }
  }

  /**
   * Partial Withdrawal / Reduction
   */
  public partialExitPosition(
    positionId: string,
    withdrawPercent: number,
    executionPrice: number,
    actionTimestamp?: number,
    accountId?: string,
    options?: { sourceEventId?: string; appliedEventKeys?: string[]; eventKey?: string }
  ): PaperPosition {
    const { acc, pos } = this.findAccountAndPosition(positionId, accountId);

    const cleanPct = Math.min(Math.max(5, Math.round(Math.abs(withdrawPercent))), 95);
    const fraction = cleanPct / 100;
    const safePrice = executionPrice > 0 ? executionPrice : pos.entryPrice;

    const closedQty = pos.quantity * fraction;
    const releasedMargin = pos.marginUsdt * fraction;
    const direction = pos.side === 'LONG' ? 1 : -1;
    const grossPnl = (safePrice - pos.entryPrice) * closedQty * direction;
    const exitNotional = closedQty * safePrice;
    const exitCommission = exitNotional * (Math.max(0, acc.settings.commissionPercent) / 100);
    const netPartialPnl = grossPnl - exitCommission;

    if (pos.executionMode !== 'REAL') {
      acc.availableBalance = Math.max(0, acc.availableBalance + releasedMargin + netPartialPnl);
    }
    acc.totalCommissionsPaid += exitCommission;

    pos.quantity = Number(Math.max(0.00001, pos.quantity - closedQty).toFixed(5));
    pos.marginUsdt = Number(Math.max(0.25, pos.marginUsdt - releasedMargin).toFixed(2));
    pos.commissionUsdt = Number(((pos.commissionUsdt || 0) + exitCommission).toFixed(4));
    pos.realizedPnl = Number(((pos.realizedPnl || 0) + netPartialPnl).toFixed(4));

    const prevScale = pos.currentScalePercent || 100;
    const nextScale = Math.max(1, Math.round(prevScale * (1 - fraction)));
    pos.currentScalePercent = nextScale;

    const ts = actionTimestamp || Date.now();
    if (!pos.scaleAdjustments) pos.scaleAdjustments = [];
    pos.scaleAdjustments.push({
      id: `${pos.id}_partial_exit_${ts}_${pos.scaleAdjustments.length}`,
      actionType: 'PARTIAL_EXIT',
      actionLabelAr: `انسحاب جزئي بنفس النسبة (-${cleanPct}% • سحب ${releasedMargin.toFixed(2)}$ • متبقي ${nextScale}%)`,
      timestamp: ts,
      volumePercent: -cleanPct,
      remainingPercentAfter: nextScale,
      executedQty: Number(closedQty.toFixed(5)),
      price: safePrice,
      realizedPnlDelta: Number(netPartialPnl.toFixed(2)),
      marginDeltaUsdt: -Number(releasedMargin.toFixed(2)),
      sourceEventId: options?.sourceEventId,
    });
    this.recordAppliedSyncEventIds(
      pos,
      options?.appliedEventKeys || (options?.sourceEventId ? [options.sourceEventId] : undefined)
    );

    this.saveState();

    mobileNotifications.notifyTradeEvent({
      actionType: 'PARTIAL_EXIT',
      position: pos,
      executionPrice: safePrice,
      volumePercent: -cleanPct,
      marginDeltaUsdt: -Number(releasedMargin.toFixed(2)),
      realizedPnlDeltaUsdt: Number(netPartialPnl.toFixed(2)),
      eventKey: options?.eventKey || options?.sourceEventId,
    });

    mobileNotifications.checkAccountsDrawdown(
      this.getAccountsSummaries({ [pos.symbol]: safePrice })
    );

    return pos;
  }

  public closePosition(
    positionId: string,
    exitPrice: number,
    exitTimestamp?: number,
    accountId?: string,
    options?: { sourceEventId?: string; appliedEventKeys?: string[]; eventKey?: string }
  ): PaperPosition {
    const { acc, pos } = this.findAccountAndPosition(positionId, accountId);

    const direction = pos.side === 'LONG' ? 1 : -1;
    const grossPnl = (exitPrice - pos.entryPrice) * pos.quantity * direction;
    const exitNotional = pos.quantity * exitPrice;
    const exitCommission = exitNotional * (Math.max(0, acc.settings.commissionPercent) / 100);
    const netPnl = grossPnl - exitCommission;
    const remainingMargin = pos.marginUsdt || (pos.quantity * pos.entryPrice) / pos.leverage;

    if (pos.executionMode !== 'REAL') {
      acc.availableBalance = Math.max(0, acc.availableBalance + remainingMargin + netPnl);
    }
    acc.totalCommissionsPaid += exitCommission;

    const rawCloseTs = exitTimestamp || Date.now();
    const closeTs = rawCloseTs >= pos.openTime ? rawCloseTs : Date.now();
    pos.status = 'CLOSED';
    pos.closeTime = closeTs;
    pos.traderExitTime = rawCloseTs;
    pos.exitPrice = exitPrice;
    pos.currentScalePercent = 0;
    pos.commissionUsdt = Number(((pos.commissionUsdt || 0) + exitCommission).toFixed(4));
    pos.realizedPnl = parseFloat(
      ((pos.realizedPnl || 0) + netPnl - (pos.commissionUsdt - exitCommission)).toFixed(4)
    );

    if (!pos.scaleAdjustments) pos.scaleAdjustments = [];
    pos.scaleAdjustments.push({
      id: `${pos.id}_full_exit_${closeTs}`,
      actionType: 'FULL_EXIT',
      actionLabelAr: 'خروج كامل وإغلاق الصفقة (-100%)',
      timestamp: closeTs,
      volumePercent: -100,
      remainingPercentAfter: 0,
      executedQty: pos.quantity,
      price: exitPrice,
      realizedPnlDelta: Number(netPnl.toFixed(2)),
      marginDeltaUsdt: -Number(remainingMargin.toFixed(2)),
      sourceEventId: options?.sourceEventId,
    });
    this.recordAppliedSyncEventIds(
      pos,
      options?.appliedEventKeys || (options?.sourceEventId ? [options.sourceEventId] : undefined)
    );

    this.saveState();

    mobileNotifications.notifyTradeEvent({
      actionType: 'FULL_EXIT',
      position: pos,
      executionPrice: exitPrice,
      volumePercent: -100,
      marginDeltaUsdt: -Number(remainingMargin.toFixed(2)),
      realizedPnlDeltaUsdt: Number((pos.realizedPnl ?? netPnl).toFixed(2)),
      eventKey: options?.eventKey || options?.sourceEventId,
    });

    mobileNotifications.checkAccountsDrawdown(
      this.getAccountsSummaries({ [pos.symbol]: exitPrice })
    );

    return pos;
  }

  /**
   * Execute a pending reconnect/previous trade choice at the current live market price
   */
  public executePendingReconnectChoice(
    choiceId: string,
    currentPrices: Record<string, number> = {}
  ): PaperPosition | null {
    const idx = this.pendingReconnectChoices.findIndex((c) => c.id === choiceId);
    if (idx === -1) return null;
    const choice = this.pendingReconnectChoices[idx];
    this.pendingReconnectChoices.splice(idx, 1);
    this.savePendingChoices();

    const livePrice = resolveLiveMarketExecutionPrice(
      choice.symbol,
      currentPrices,
      choice.currentMarketPrice,
      choice.traderEntryPrice
    );

    const opened = this.openPositionWithUserSettings({
      symbol: choice.symbol,
      side: choice.side,
      entryPrice: livePrice,
      traderEntryPrice: choice.traderEntryPrice,
      traderLeverage: choice.leverage,
      customMarginUsdt: choice.marginUsdt,
      customLeverage: choice.leverage,
      sourceTraderId: choice.traderId,
      sourceTraderName: choice.traderName,
      sourceType: choice.source,
      traderEntryTime: choice.traderEntryTime,
      traderScaleAdjustments: choice.traderScaleAdjustments,
      currentScalePercent: choice.currentScalePercent,
      accountId: choice.accountId,
    });

    return opened;
  }

  /**
   * Dismiss a pending reconnect/previous trade choice so it is not executed
   */
  public dismissPendingReconnectChoice(choiceId: string): void {
    const idx = this.pendingReconnectChoices.findIndex((c) => c.id === choiceId);
    if (idx !== -1) {
      const choice = this.pendingReconnectChoices[idx];
      this.dismissedReconnectChoiceIds.add(choice.id);
      this.pendingReconnectChoices.splice(idx, 1);
      this.savePendingChoices();
    } else {
      this.dismissedReconnectChoiceIds.add(choiceId);
      this.savePendingChoices();
    }
  }

  /**
   * Trigger a realistic sample previous trade choice notification (for testing/demonstration)
   */
  public triggerSampleReconnectChoiceNotification(
    currentPrices: Record<string, number> = {},
    accountId?: string
  ): PendingReconnectTradeChoice {
    const acc = this.getAccount(accountId);
    const liveBtc = resolveLiveMarketExecutionPrice('BTCUSDT', currentPrices, 68450, 68450);
    // Simulate a previous SHORT trade where current price is LOWER than entry price (unfavorable for new SHORT entry)
    const traderEntry = Number((liveBtc * 1.015).toFixed(2));
    const evalRes = evaluatePreviousTradePriceAdvantage({
      side: 'SHORT',
      traderEntryPrice: traderEntry,
      currentMarketPrice: liveBtc,
    });

    const sampleChoice: PendingReconnectTradeChoice = {
      id: `choice_sample_${Date.now()}`,
      createdAt: Date.now(),
      traderId: 'ct_lead_whale_1',
      traderName: 'AlphaWhale_Pro',
      source: 'COPY_TRADING',
      accountId: acc.id,
      accountName: acc.name,
      symbol: 'BTCUSDT',
      side: 'SHORT',
      traderEntryPrice: traderEntry,
      currentMarketPrice: liveBtc,
      priceDiffPercent: evalRes.priceDiffPercent,
      leverage: acc.settings.leverage || 5,
      marginUsdt: acc.settings.tradeValueUsdt || 25,
      traderEntryTime: Date.now() - 1800000,
      currentScalePercent: 100,
    };

    this.pendingReconnectChoices = [
      sampleChoice,
      ...this.pendingReconnectChoices.filter((c) => c.id !== sampleChoice.id),
    ];
    this.savePendingChoices();
    mobileNotifications.notifyReconnectTradeChoice({
      ...sampleChoice,
      choiceId: sampleChoice.id,
      sourceType: sampleChoice.source,
    });
    return sampleChoice;
  }

  /**
   * Synchronize a trader's open Positions and Latest records into a specific virtual account:
   * - Automatically executes full EXIT and PARTIAL_EXIT when the trader withdraws or closes positions
   * - Opens trades at the current live market price (السعر الحالي للسوق)
   * - For existing/previous trades upon opening/reconnecting:
   *   - Executes immediately if current price is favorable (SHORT & current >= entry, or LONG & current <= entry)
   *   - Prompts user with an in-app notification choice if current price is unfavorable
   */
  public syncTraderPositionsAndRecords(params: {
    traderId: string;
    traderName: string;
    source: 'COPY_TRADING' | 'SMART_MONEY';
    positions: TraderOpenPosition[];
    latestRecords: TraderLatestRecord[];
    positionHistory?: TraderPositionHistoryItem[];
    marginPerTradeUsdt?: number;
    accountId?: string;
    currentPrices?: Record<string, number>;
    checkReconnectAdvantage?: boolean;
    forceImmediateExecution?: boolean;
    copiedStartedAt?: number;
    syncVersion?: number;
    actionId?: string;
    isPartialOrRateLimited?: boolean;
    precomputedByWorker?: boolean;
  }): CopiedSyncLog[] {
    return this.runInBatch(() => this.syncTraderPositionsAndRecordsInternal(params));
  }

  private syncTraderPositionsAndRecordsInternal(params: {
    traderId: string;
    traderName: string;
    source: 'COPY_TRADING' | 'SMART_MONEY';
    positions: TraderOpenPosition[];
    latestRecords: TraderLatestRecord[];
    positionHistory?: TraderPositionHistoryItem[];
    marginPerTradeUsdt?: number;
    accountId?: string;
    currentPrices?: Record<string, number>;
    checkReconnectAdvantage?: boolean;
    forceImmediateExecution?: boolean;
    copiedStartedAt?: number;
    syncVersion?: number;
    actionId?: string;
    isPartialOrRateLimited?: boolean;
    precomputedByWorker?: boolean;
  }): CopiedSyncLog[] {
    const acc = this.getAccount(params.accountId);
    const checkpoint = this.getOrCreateTraderSyncCheckpoint({
      traderId: params.traderId,
      traderName: params.traderName,
      source: params.source,
      accountId: acc.id,
    });

    // Skip duplicate/stale sync request if this exact version or actionId was already processed for this trader
    if (
      (params.syncVersion !== undefined && params.syncVersion <= checkpoint.version) ||
      (params.actionId &&
        isTraderActionAlreadyProcessed({
          checkpoint,
          candidateActionIds: [params.actionId],
        }))
    ) {
      return [];
    }

    const logs: CopiedSyncLog[] = [];
    const liveMap = params.currentPrices || {};
    const shouldCheckAdvantage =
      params.checkReconnectAdvantage !== false &&
      acc.settings.promptOnUnfavorableLateEntry !== false;

    const storedCopied = this.loadStoredCopiedTraders();
    const matchedCopiedEntry = storedCopied.find(
      (ct) =>
        (ct.accountId || 'acc_default') === acc.id &&
        (ct.traderId === params.traderId || ct.nickname === params.traderName)
    );
    const effectiveCopiedStartedAt = params.copiedStartedAt || matchedCopiedEntry?.startedAt || 0;

    const userMarginUsdt =
      acc.settings.enforceUserSizeOnCopy
        ? acc.settings.tradeValueUsdt
        : params.marginPerTradeUsdt || acc.settings.tradeValueUsdt;
    const userLeverage = acc.settings.leverage;

    // Track which positions executed a PARTIAL_EXIT or SCALE_IN during this sync cycle
    // so the exact same trader move is NEVER applied twice across `latestRecords`, `scaleAdjustments`, and `positionAmount` deltas
    const partialExitAppliedThisTick = new Set<string>();
    const scaleInAppliedThisTick = new Set<string>();

    // 1. Process EXIT, PARTIAL_EXIT, and SCALE_IN records from `latestRecords` in chronological order (oldest -> newest)
    const recentRecords = [...params.latestRecords.slice(0, 20)].sort(
      (a, b) => (a.orderTime || 0) - (b.orderTime || 0)
    );
    for (const rec of recentRecords) {
      const recSide: 'LONG' | 'SHORT' | null =
        rec.positionSide === 'LONG' || rec.positionSide === 'SHORT'
          ? rec.positionSide
          : null;

      const matchingOpen = acc.positions.find(
        (p) =>
          p.status === 'OPEN' &&
          p.symbol.toUpperCase() === rec.symbol.toUpperCase() &&
          (!recSide || p.side === recSide) &&
          (p.sourceTraderId === params.traderId || p.sourceTraderName === params.traderName)
      );

      if (matchingOpen) {
        const traderPos = params.positions.find(
          (tp) =>
            tp.symbol.toUpperCase() === matchingOpen.symbol.toUpperCase() &&
            tp.side === matchingOpen.side
        );
        const liveExecPrice = resolveLiveMarketExecutionPrice(
          rec.symbol,
          liveMap,
          traderPos?.markPrice || rec.avgPrice,
          matchingOpen.entryPrice
        );

        if (rec.actionType === 'EXIT') {
          const isAfterOurEntry = shouldApplyTraderRecordAfterEntry({
            recordTimestamp: rec.orderTime,
            userPositionOpenTime: matchingOpen.openTime,
          });
          const eventKey = buildStableTraderEventKey({
            kind: 'REC',
            symbol: rec.symbol,
            actionType: 'FULL_EXIT',
            timestamp: rec.orderTime,
            volumePercent: -100,
            quantity: rec.executedQty,
          });
          const traderActionId = buildTraderActionId({
            traderId: params.traderId,
            symbol: rec.symbol,
            actionType: 'FULL_EXIT',
            rawId: rec.id,
            timestamp: rec.orderTime,
            volumePercent: 100,
            quantity: rec.executedQty,
          });
          const candidateKeys = [traderActionId, eventKey, `rec_id:${rec.id}`];
          const alreadyApplied =
            hasSyncEventBeenApplied({
              appliedSyncEventIds: matchingOpen.appliedSyncEventIds,
              scaleAdjustments: matchingOpen.scaleAdjustments,
              candidateKeys,
              actionType: 'FULL_EXIT',
              eventTimestamp: rec.orderTime,
            }) ||
            isTraderActionAlreadyProcessed({
              checkpoint,
              candidateActionIds: candidateKeys,
              symbol: rec.symbol,
              actionType: 'FULL_EXIT',
              eventTimestamp: rec.orderTime,
            });
          // Apply EXIT if it occurred after our entry OR trader no longer has the position open
          if ((isAfterOurEntry || !traderPos) && !alreadyApplied) {
            try {
              const closed = this.closePosition(matchingOpen.id, liveExecPrice, rec.orderTime, acc.id, {
                sourceEventId: eventKey,
                appliedEventKeys: candidateKeys,
                eventKey: `${acc.id}_${matchingOpen.id}_${eventKey}`,
              });
              this.recordTraderSyncAction(checkpoint, {
                actionId: traderActionId,
                candidateKeys,
                symbol: rec.symbol,
                actionType: 'FULL_EXIT',
                timestamp: rec.orderTime,
                explicitVersion: params.syncVersion,
              });
              logs.push({
                id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                timestamp: rec.orderTime || Date.now(),
                traderId: params.traderId,
                traderName: params.traderName,
                source: params.source,
                action: 'EXIT',
                volumePercent: -100,
                symbol: closed.symbol,
                side: closed.side,
                price: liveExecPrice,
                quantity: closed.quantity,
                leverage: closed.leverage,
                accountId: acc.id,
                accountName: acc.name,
                messageAr: `[${acc.name}] خروج آلي كامل (-100%) من ${closed.symbol} بالسعر الحالي ${liveExecPrice.toFixed(2)} USDT عند انسحاب المتداول (الصافي: ${(closed.realizedPnl || 0).toFixed(2)} USDT)`,
              });
            } catch (e) {
              console.warn('Exit sync skipped:', e);
            }
          }
        } else if (rec.actionType === 'PARTIAL_EXIT') {
          const isAfterOurEntry = shouldApplyTraderRecordAfterEntry({
            recordTimestamp: rec.orderTime,
            userPositionOpenTime: matchingOpen.openTime,
          });
          const withdrawPct = Math.min(95, Math.max(5, Math.abs(rec.volumePercent || 30)));
          const eventKey = buildStableTraderEventKey({
            kind: 'REC',
            symbol: rec.symbol,
            actionType: 'PARTIAL_EXIT',
            timestamp: rec.orderTime,
            volumePercent: withdrawPct,
            quantity: rec.executedQty,
          });
          const traderActionId = buildTraderActionId({
            traderId: params.traderId,
            symbol: rec.symbol,
            actionType: 'PARTIAL_EXIT',
            rawId: rec.id,
            timestamp: rec.orderTime,
            volumePercent: withdrawPct,
            quantity: rec.executedQty,
          });
          const candidateKeys = [traderActionId, eventKey, `rec_id:${rec.id}`];
          const alreadyApplied =
            hasSyncEventBeenApplied({
              appliedSyncEventIds: matchingOpen.appliedSyncEventIds,
              scaleAdjustments: matchingOpen.scaleAdjustments,
              candidateKeys,
              actionType: 'PARTIAL_EXIT',
              eventTimestamp: rec.orderTime,
            }) ||
            isTraderActionAlreadyProcessed({
              checkpoint,
              candidateActionIds: candidateKeys,
              symbol: rec.symbol,
              actionType: 'PARTIAL_EXIT',
              eventTimestamp: rec.orderTime,
            });

          if (isAfterOurEntry && !alreadyApplied) {
            try {
              const updated = this.partialExitPosition(
                matchingOpen.id,
                withdrawPct,
                liveExecPrice,
                rec.orderTime,
                acc.id,
                {
                  sourceEventId: eventKey,
                  appliedEventKeys: candidateKeys,
                  eventKey: `${acc.id}_${matchingOpen.id}_${eventKey}`,
                }
              );
              partialExitAppliedThisTick.add(matchingOpen.id);
              this.recordTraderSyncAction(checkpoint, {
                actionId: traderActionId,
                candidateKeys,
                symbol: rec.symbol,
                actionType: 'PARTIAL_EXIT',
                timestamp: rec.orderTime,
                explicitVersion: params.syncVersion,
              });
              if (traderPos) {
                updated.lastSyncedTraderQty = traderPos.positionAmount;
                updated.lastSyncedTraderUpdateTime = traderPos.lastUpdateTime || rec.orderTime;
                this.saveState();
              }
              logs.push({
                id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                timestamp: rec.orderTime || Date.now(),
                traderId: params.traderId,
                traderName: params.traderName,
                source: params.source,
                action: 'PARTIAL_EXIT',
                volumePercent: -withdrawPct,
                symbol: updated.symbol,
                side: updated.side,
                price: liveExecPrice,
                quantity: updated.quantity,
                leverage: updated.leverage,
                accountId: acc.id,
                accountName: acc.name,
                messageAr: `[${acc.name}] انسحاب جزئي آلي بنفس النسبة (-${withdrawPct}%) من ${updated.symbol} بالسعر الحالي ${liveExecPrice.toFixed(2)} USDT (متبقي ${updated.currentScalePercent}%)`,
              });
            } catch (e) {
              console.warn('Partial exit sync skipped:', e);
            }
          }
        } else if (rec.actionType === 'SCALE_IN') {
          const isAfterOurEntry = shouldApplyTraderRecordAfterEntry({
            recordTimestamp: rec.orderTime,
            userPositionOpenTime: matchingOpen.openTime,
          });
          const addPct = Math.max(5, Math.abs(rec.volumePercent || 30));
          const eventKey = buildStableTraderEventKey({
            kind: 'REC',
            symbol: rec.symbol,
            actionType: 'SCALE_IN',
            timestamp: rec.orderTime,
            volumePercent: addPct,
            quantity: rec.executedQty,
          });
          const traderActionId = buildTraderActionId({
            traderId: params.traderId,
            symbol: rec.symbol,
            actionType: 'SCALE_IN',
            rawId: rec.id,
            timestamp: rec.orderTime,
            volumePercent: addPct,
            quantity: rec.executedQty,
          });
          const candidateKeys = [traderActionId, eventKey, `rec_id:${rec.id}`];
          const alreadyApplied =
            hasSyncEventBeenApplied({
              appliedSyncEventIds: matchingOpen.appliedSyncEventIds,
              scaleAdjustments: matchingOpen.scaleAdjustments,
              candidateKeys,
              actionType: 'SCALE_IN',
              eventTimestamp: rec.orderTime,
            }) ||
            isTraderActionAlreadyProcessed({
              checkpoint,
              candidateActionIds: candidateKeys,
              symbol: rec.symbol,
              actionType: 'SCALE_IN',
              eventTimestamp: rec.orderTime,
            });

          if (isAfterOurEntry && !alreadyApplied) {
            try {
              const updated = this.scaleInFromTraderSignal(
                matchingOpen.id,
                addPct,
                liveExecPrice,
                rec.orderTime,
                acc.id,
                {
                  sourceEventId: eventKey,
                  appliedEventKeys: candidateKeys,
                  eventKey: `${acc.id}_${matchingOpen.id}_${eventKey}`,
                }
              );
              scaleInAppliedThisTick.add(matchingOpen.id);
              this.recordTraderSyncAction(checkpoint, {
                actionId: traderActionId,
                candidateKeys,
                symbol: rec.symbol,
                actionType: 'SCALE_IN',
                timestamp: rec.orderTime,
                explicitVersion: params.syncVersion,
              });
              if (traderPos) {
                updated.lastSyncedTraderQty = traderPos.positionAmount;
                updated.lastSyncedTraderUpdateTime = traderPos.lastUpdateTime || rec.orderTime;
                this.saveState();
              }
              const lastAdj = updated.scaleAdjustments?.[updated.scaleAdjustments.length - 1];
              const modeLabel =
                acc.settings.scaleInSamePercentAsTrader !== false
                  ? `بنفس النسبة (+${addPct}% من الأصل • +${(lastAdj?.marginDeltaUsdt || 0).toFixed(2)}$)`
                  : `بالقيمة المحددة (+${(acc.settings.scaleInFixedValueUsdt || 10).toFixed(2)}$)`;
              logs.push({
                id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                timestamp: rec.orderTime || Date.now(),
                traderId: params.traderId,
                traderName: params.traderName,
                source: params.source,
                action: 'SCALE_IN',
                volumePercent: lastAdj?.volumePercent || addPct,
                symbol: updated.symbol,
                side: updated.side,
                price: liveExecPrice,
                quantity: updated.quantity,
                leverage: updated.leverage,
                accountId: acc.id,
                accountName: acc.name,
                messageAr: `[${acc.name}] تدعيم الصفقة ${modeLabel} على ${updated.symbol} بالسعر الحالي ${liveExecPrice.toFixed(2)} USDT (الحجم الحالي ${updated.currentScalePercent}%)`,
              });
            } catch (e) {
              console.warn('Scale-in sync skipped:', e);
            }
          }
        }
      }
    }

    // 1.B: Detect full exits and partial withdrawals directly from `params.positions` changes
    const openTraderPositionsInAcc = acc.positions.filter(
      (p) =>
        p.status === 'OPEN' &&
        (p.sourceTraderId === params.traderId || p.sourceTraderName === params.traderName)
    );

    for (const userOpenPos of openTraderPositionsInAcc) {
      const stillOpenByTrader = params.positions.find(
        (tp) =>
          tp.symbol.toUpperCase() === userOpenPos.symbol.toUpperCase() &&
          tp.side === userOpenPos.side
      );

      const liveExecPrice = resolveLiveMarketExecutionPrice(
        userOpenPos.symbol,
        liveMap,
        stillOpenByTrader?.markPrice,
        userOpenPos.entryPrice
      );

      if (!stillOpenByTrader && !params.isPartialOrRateLimited) {
        const isTransientEmptyResponse =
          params.positions.length === 0 &&
          params.latestRecords.length === 0 &&
          (!params.positionHistory || params.positionHistory.length === 0);
        const justOpenedFromRecord =
          params.positions.length === 0 && Date.now() - userOpenPos.openTime < 5000;
        if (!justOpenedFromRecord && !isTransientEmptyResponse) {
          try {
            const eventKey = buildStableTraderEventKey({
              kind: 'QTY_DROP',
              symbol: userOpenPos.symbol,
              actionType: 'FULL_EXIT',
              timestamp: Math.floor(Date.now() / 10000),
              volumePercent: 100,
              quantity: 0,
            });
            const traderActionId = buildTraderActionId({
              traderId: params.traderId,
              symbol: userOpenPos.symbol,
              actionType: 'FULL_EXIT',
              timestamp: userOpenPos.openTime,
              volumePercent: 100,
              quantity: 0,
            });
            const candidateKeys = [traderActionId, eventKey];
            const alreadyClosedByCheckpoint = isTraderActionAlreadyProcessed({
              checkpoint,
              candidateActionIds: candidateKeys,
              symbol: userOpenPos.symbol,
              actionType: 'FULL_EXIT',
              eventTimestamp: Date.now(),
            });
            if (!alreadyClosedByCheckpoint) {
              const closed = this.closePosition(userOpenPos.id, liveExecPrice, Date.now(), acc.id, {
                sourceEventId: eventKey,
                appliedEventKeys: candidateKeys,
                eventKey: `${acc.id}_${userOpenPos.id}_${eventKey}`,
              });
              this.recordTraderSyncAction(checkpoint, {
                actionId: traderActionId,
                candidateKeys,
                symbol: userOpenPos.symbol,
                actionType: 'FULL_EXIT',
                timestamp: Date.now(),
                explicitVersion: params.syncVersion,
              });
              logs.push({
                id: `log_auto_exit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                timestamp: Date.now(),
                traderId: params.traderId,
                traderName: params.traderName,
                source: params.source,
                action: 'EXIT',
                volumePercent: -100,
                symbol: closed.symbol,
                side: closed.side,
                price: liveExecPrice,
                quantity: closed.quantity,
                leverage: closed.leverage,
                accountId: acc.id,
                accountName: acc.name,
                messageAr: `[${acc.name}] إغلاق آلي كامل (-100%) لصفقة ${closed.symbol} بالسعر الحالي ${liveExecPrice.toFixed(2)} USDT بعد خروج المتداول ${params.traderName}`,
              });
            }
          } catch (e) {
            console.warn('Auto close on missing trader position failed:', e);
          }
        }
      } else if (stillOpenByTrader) {
        // Initialize baseline trader quantity on first observation so subsequent real reductions are accurately detected
        if (userOpenPos.lastSyncedTraderQty === undefined && stillOpenByTrader.positionAmount > 0) {
          userOpenPos.lastSyncedTraderQty = stillOpenByTrader.positionAmount;
          userOpenPos.lastSyncedTraderUpdateTime =
            stillOpenByTrader.lastUpdateTime || stillOpenByTrader.entryTime || Date.now();
          this.saveState();
        }

        // Apply any NEW explicit PARTIAL_EXIT adjustments in `stillOpenByTrader.scaleAdjustments`
        if (
          !partialExitAppliedThisTick.has(userOpenPos.id) &&
          stillOpenByTrader.scaleAdjustments &&
          stillOpenByTrader.scaleAdjustments.length > 0
        ) {
          for (const adj of stillOpenByTrader.scaleAdjustments) {
            if (adj.actionType === 'PARTIAL_EXIT') {
              const isAfterOurEntry = shouldApplyTraderRecordAfterEntry({
                recordTimestamp: adj.timestamp,
                userPositionOpenTime: userOpenPos.openTime,
              });
              const withdrawPct = Math.min(95, Math.max(5, Math.abs(adj.volumePercent || 30)));
              const adjKey = buildStableTraderEventKey({
                kind: 'ADJ',
                symbol: stillOpenByTrader.symbol,
                actionType: 'PARTIAL_EXIT',
                timestamp: adj.timestamp,
                volumePercent: withdrawPct,
                quantity: adj.executedQty,
                rawId: adj.id,
              });
              const traderActionId = buildTraderActionId({
                traderId: params.traderId,
                symbol: stillOpenByTrader.symbol,
                actionType: 'PARTIAL_EXIT',
                rawId: adj.id,
                timestamp: adj.timestamp,
                volumePercent: withdrawPct,
                quantity: adj.executedQty,
              });
              const candidateKeys = [traderActionId, adjKey, adj.id, `adj:${adj.id}`];
              const alreadyApplied =
                hasSyncEventBeenApplied({
                  appliedSyncEventIds: userOpenPos.appliedSyncEventIds,
                  scaleAdjustments: userOpenPos.scaleAdjustments,
                  candidateKeys,
                  actionType: 'PARTIAL_EXIT',
                  eventTimestamp: adj.timestamp,
                }) ||
                isTraderActionAlreadyProcessed({
                  checkpoint,
                  candidateActionIds: candidateKeys,
                  symbol: stillOpenByTrader.symbol,
                  actionType: 'PARTIAL_EXIT',
                  eventTimestamp: adj.timestamp,
                });

              if (isAfterOurEntry && !alreadyApplied) {
                try {
                  const updated = this.partialExitPosition(
                    userOpenPos.id,
                    withdrawPct,
                    liveExecPrice,
                    adj.timestamp,
                    acc.id,
                    {
                      sourceEventId: adjKey,
                      appliedEventKeys: candidateKeys,
                      eventKey: `${acc.id}_${userOpenPos.id}_${adjKey}`,
                    }
                  );
                  partialExitAppliedThisTick.add(userOpenPos.id);
                  this.recordTraderSyncAction(checkpoint, {
                    actionId: traderActionId,
                    candidateKeys,
                    symbol: stillOpenByTrader.symbol,
                    actionType: 'PARTIAL_EXIT',
                    timestamp: adj.timestamp,
                    explicitVersion: params.syncVersion,
                  });
                  updated.lastSyncedTraderQty = stillOpenByTrader.positionAmount;
                  updated.lastSyncedTraderUpdateTime =
                    stillOpenByTrader.lastUpdateTime || adj.timestamp;
                  this.saveState();
                  logs.push({
                    id: `log_auto_partial_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    timestamp: adj.timestamp || Date.now(),
                    traderId: params.traderId,
                    traderName: params.traderName,
                    source: params.source,
                    action: 'PARTIAL_EXIT',
                    volumePercent: -withdrawPct,
                    symbol: updated.symbol,
                    side: updated.side,
                    price: liveExecPrice,
                    quantity: updated.quantity,
                    leverage: updated.leverage,
                    accountId: acc.id,
                    accountName: acc.name,
                    messageAr: `[${acc.name}] انسحاب جزئي آلي (-${withdrawPct}%) من ${updated.symbol} بالسعر الحالي ${liveExecPrice.toFixed(2)} USDT تزامناً مع المتداول`,
                  });
                } catch (e) {
                  console.warn('Auto partial exit from position adjustments skipped:', e);
                }
              }
            } else if (adj.actionType === 'SCALE_IN' && !scaleInAppliedThisTick.has(userOpenPos.id)) {
              const isAfterOurEntry = shouldApplyTraderRecordAfterEntry({
                recordTimestamp: adj.timestamp,
                userPositionOpenTime: userOpenPos.openTime,
              });
              const addPct = Math.max(5, Math.abs(adj.volumePercent || 30));
              const adjKey = buildStableTraderEventKey({
                kind: 'ADJ',
                symbol: stillOpenByTrader.symbol,
                actionType: 'SCALE_IN',
                timestamp: adj.timestamp,
                volumePercent: addPct,
                quantity: adj.executedQty,
                rawId: adj.id,
              });
              const traderActionId = buildTraderActionId({
                traderId: params.traderId,
                symbol: stillOpenByTrader.symbol,
                actionType: 'SCALE_IN',
                rawId: adj.id,
                timestamp: adj.timestamp,
                volumePercent: addPct,
                quantity: adj.executedQty,
              });
              const candidateKeys = [traderActionId, adjKey, adj.id, `adj:${adj.id}`];
              const alreadyApplied =
                hasSyncEventBeenApplied({
                  appliedSyncEventIds: userOpenPos.appliedSyncEventIds,
                  scaleAdjustments: userOpenPos.scaleAdjustments,
                  candidateKeys,
                  actionType: 'SCALE_IN',
                  eventTimestamp: adj.timestamp,
                }) ||
                isTraderActionAlreadyProcessed({
                  checkpoint,
                  candidateActionIds: candidateKeys,
                  symbol: stillOpenByTrader.symbol,
                  actionType: 'SCALE_IN',
                  eventTimestamp: adj.timestamp,
                });

              if (isAfterOurEntry && !alreadyApplied) {
                try {
                  const updated = this.scaleInFromTraderSignal(
                    userOpenPos.id,
                    addPct,
                    liveExecPrice,
                    adj.timestamp,
                    acc.id,
                    {
                      sourceEventId: adjKey,
                      appliedEventKeys: candidateKeys,
                      eventKey: `${acc.id}_${userOpenPos.id}_${adjKey}`,
                    }
                  );
                  scaleInAppliedThisTick.add(userOpenPos.id);
                  this.recordTraderSyncAction(checkpoint, {
                    actionId: traderActionId,
                    candidateKeys,
                    symbol: stillOpenByTrader.symbol,
                    actionType: 'SCALE_IN',
                    timestamp: adj.timestamp,
                    explicitVersion: params.syncVersion,
                  });
                  updated.lastSyncedTraderQty = stillOpenByTrader.positionAmount;
                  updated.lastSyncedTraderUpdateTime =
                    stillOpenByTrader.lastUpdateTime || adj.timestamp;
                  this.saveState();
                  const lastAdj = updated.scaleAdjustments?.[updated.scaleAdjustments.length - 1];
                  logs.push({
                    id: `log_auto_scale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    timestamp: adj.timestamp || Date.now(),
                    traderId: params.traderId,
                    traderName: params.traderName,
                    source: params.source,
                    action: 'SCALE_IN',
                    volumePercent: lastAdj?.volumePercent || addPct,
                    symbol: updated.symbol,
                    side: updated.side,
                    price: liveExecPrice,
                    quantity: updated.quantity,
                    leverage: updated.leverage,
                    accountId: acc.id,
                    accountName: acc.name,
                    messageAr: `[${acc.name}] تدعيم فوري آلي (+${addPct}%) على ${updated.symbol} بالسعر الحالي ${liveExecPrice.toFixed(2)} USDT تزامناً مع الحوت/المتداول`,
                  });
                } catch (e) {
                  console.warn('Auto scale-in from position adjustments skipped:', e);
                }
              }
            }
          }
        }

        // Live Delta Detection:
        // 1) If the trader/whale genuinely reduced their live `positionAmount` (>= 5%) since last poll -> execute PARTIAL_EXIT ONCE
        // 2) If the trader/whale genuinely increased their live `positionAmount` (>= 5%) since last poll -> execute SCALE_IN ONCE
        if (
          !partialExitAppliedThisTick.has(userOpenPos.id) &&
          userOpenPos.lastSyncedTraderQty &&
          stillOpenByTrader.positionAmount > 0
        ) {
          const dropPct = calculatePositionQuantityDropPartialExitPct({
            previousQty: userOpenPos.lastSyncedTraderQty,
            currentQty: stillOpenByTrader.positionAmount,
          });
          if (dropPct >= 5) {
            const eventTs = stillOpenByTrader.lastUpdateTime || Date.now();
            const qtyDropKey = buildStableTraderEventKey({
              kind: 'QTY_DROP',
              symbol: stillOpenByTrader.symbol,
              actionType: 'PARTIAL_EXIT',
              timestamp: eventTs,
              volumePercent: dropPct,
              quantity: stillOpenByTrader.positionAmount,
            });
            const traderActionId = buildTraderActionId({
              traderId: params.traderId,
              symbol: stillOpenByTrader.symbol,
              actionType: 'PARTIAL_EXIT',
              timestamp: eventTs,
              volumePercent: dropPct,
              quantity: stillOpenByTrader.positionAmount,
            });
            const candidateKeys = [traderActionId, qtyDropKey];
            const alreadyApplied =
              hasSyncEventBeenApplied({
                appliedSyncEventIds: userOpenPos.appliedSyncEventIds,
                scaleAdjustments: userOpenPos.scaleAdjustments,
                candidateKeys,
                actionType: 'PARTIAL_EXIT',
                eventTimestamp: stillOpenByTrader.lastUpdateTime,
              }) ||
              isTraderActionAlreadyProcessed({
                checkpoint,
                candidateActionIds: candidateKeys,
                symbol: stillOpenByTrader.symbol,
                actionType: 'PARTIAL_EXIT',
                eventTimestamp: stillOpenByTrader.lastUpdateTime,
              });
            if (!alreadyApplied) {
              try {
                const updated = this.partialExitPosition(
                  userOpenPos.id,
                  dropPct,
                  liveExecPrice,
                  eventTs,
                  acc.id,
                  {
                    sourceEventId: qtyDropKey,
                    appliedEventKeys: candidateKeys,
                    eventKey: `${acc.id}_${userOpenPos.id}_${qtyDropKey}`,
                  }
                );
                partialExitAppliedThisTick.add(userOpenPos.id);
                this.recordTraderSyncAction(checkpoint, {
                  actionId: traderActionId,
                  candidateKeys,
                  symbol: stillOpenByTrader.symbol,
                  actionType: 'PARTIAL_EXIT',
                  timestamp: eventTs,
                  explicitVersion: params.syncVersion,
                });
                updated.lastSyncedTraderQty = stillOpenByTrader.positionAmount;
                updated.lastSyncedTraderUpdateTime = eventTs;
                this.saveState();
                logs.push({
                  id: `log_qty_drop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  timestamp: Date.now(),
                  traderId: params.traderId,
                  traderName: params.traderName,
                  source: params.source,
                  action: 'PARTIAL_EXIT',
                  volumePercent: -dropPct,
                  symbol: updated.symbol,
                  side: updated.side,
                  price: liveExecPrice,
                  quantity: updated.quantity,
                  leverage: updated.leverage,
                  accountId: acc.id,
                  accountName: acc.name,
                  messageAr: `[${acc.name}] سحب جزئي فوري (-${dropPct}%) من ${updated.symbol} بالسعر الحالي ${liveExecPrice.toFixed(2)} USDT تزامناً مع تقليص المتداول لمركزه`,
                });
              } catch (e) {
                console.warn('Live qty drop partial exit skipped:', e);
              }
            }
          }
        }

        if (
          !scaleInAppliedThisTick.has(userOpenPos.id) &&
          !partialExitAppliedThisTick.has(userOpenPos.id) &&
          userOpenPos.lastSyncedTraderQty &&
          stillOpenByTrader.positionAmount > 0
        ) {
          const addPct = calculatePositionQuantityIncreaseScaleInPct({
            previousQty: userOpenPos.lastSyncedTraderQty,
            currentQty: stillOpenByTrader.positionAmount,
          });
          if (addPct >= 5) {
            const eventTs = stillOpenByTrader.lastUpdateTime || Date.now();
            const qtyScaleKey = buildStableTraderEventKey({
              kind: 'QTY_SCALE',
              symbol: stillOpenByTrader.symbol,
              actionType: 'SCALE_IN',
              timestamp: eventTs,
              volumePercent: addPct,
              quantity: stillOpenByTrader.positionAmount,
            });
            const traderActionId = buildTraderActionId({
              traderId: params.traderId,
              symbol: stillOpenByTrader.symbol,
              actionType: 'SCALE_IN',
              timestamp: eventTs,
              volumePercent: addPct,
              quantity: stillOpenByTrader.positionAmount,
            });
            const candidateKeys = [traderActionId, qtyScaleKey];
            const alreadyApplied =
              hasSyncEventBeenApplied({
                appliedSyncEventIds: userOpenPos.appliedSyncEventIds,
                scaleAdjustments: userOpenPos.scaleAdjustments,
                candidateKeys,
                actionType: 'SCALE_IN',
                eventTimestamp: stillOpenByTrader.lastUpdateTime,
              }) ||
              isTraderActionAlreadyProcessed({
                checkpoint,
                candidateActionIds: candidateKeys,
                symbol: stillOpenByTrader.symbol,
                actionType: 'SCALE_IN',
                eventTimestamp: stillOpenByTrader.lastUpdateTime,
              });
            if (!alreadyApplied) {
              try {
                const updated = this.scaleInFromTraderSignal(
                  userOpenPos.id,
                  addPct,
                  liveExecPrice,
                  eventTs,
                  acc.id,
                  {
                    sourceEventId: qtyScaleKey,
                    appliedEventKeys: candidateKeys,
                    eventKey: `${acc.id}_${userOpenPos.id}_${qtyScaleKey}`,
                  }
                );
                scaleInAppliedThisTick.add(userOpenPos.id);
                this.recordTraderSyncAction(checkpoint, {
                  actionId: traderActionId,
                  candidateKeys,
                  symbol: stillOpenByTrader.symbol,
                  actionType: 'SCALE_IN',
                  timestamp: eventTs,
                  explicitVersion: params.syncVersion,
                });
                updated.lastSyncedTraderQty = stillOpenByTrader.positionAmount;
                updated.lastSyncedTraderUpdateTime = eventTs;
                this.saveState();
                const lastAdj = updated.scaleAdjustments?.[updated.scaleAdjustments.length - 1];
                logs.push({
                  id: `log_qty_scale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  timestamp: Date.now(),
                  traderId: params.traderId,
                  traderName: params.traderName,
                  source: params.source,
                  action: 'SCALE_IN',
                  volumePercent: lastAdj?.volumePercent || addPct,
                  symbol: updated.symbol,
                  side: updated.side,
                  price: liveExecPrice,
                  quantity: updated.quantity,
                  leverage: updated.leverage,
                  accountId: acc.id,
                  accountName: acc.name,
                  messageAr: `[${acc.name}] تدعيم فوري (+${addPct}%) على ${updated.symbol} بالسعر الحالي ${liveExecPrice.toFixed(2)} USDT تزامناً مع زيادة الحوت/المتداول لحجم مركزه`,
                });
              } catch (e) {
                console.warn('Live qty increase scale-in skipped:', e);
              }
            }
          }
        }

        // Keep baseline trader qty synchronized when trader maintains position within < 5% noise
        if (
          !scaleInAppliedThisTick.has(userOpenPos.id) &&
          !partialExitAppliedThisTick.has(userOpenPos.id) &&
          stillOpenByTrader.positionAmount > 0 &&
          userOpenPos.lastSyncedTraderQty !== stillOpenByTrader.positionAmount
        ) {
          userOpenPos.lastSyncedTraderQty = stillOpenByTrader.positionAmount;
          userOpenPos.lastSyncedTraderUpdateTime =
            stillOpenByTrader.lastUpdateTime || userOpenPos.lastSyncedTraderUpdateTime;
          this.saveState();
        }
      }
    }

    // Remove any pending choices for this trader in this account that are no longer open in `params.positions`,
    // are already open in `acc.positions`, belong to `SMART_MONEY` whales (which execute immediately),
    // or when the user disabled the prompt option
    this.pendingReconnectChoices = this.pendingReconnectChoices.filter((c) => {
      if ((c.accountId || 'acc_default') !== acc.id) return true;
      if (c.traderId !== params.traderId && c.traderName !== params.traderName) return true;
      if (params.source === 'SMART_MONEY' || params.forceImmediateExecution || !shouldCheckAdvantage) {
        return false;
      }
      const stillOpenInTrader = params.positions.some(
        (tp) => tp.symbol.toUpperCase() === c.symbol.toUpperCase() && tp.side === c.side
      );
      const alreadyOpenInAcc = acc.positions.some(
        (p) =>
          p.status === 'OPEN' &&
          p.symbol.toUpperCase() === c.symbol.toUpperCase() &&
          p.side === c.side &&
          (p.sourceTraderId === params.traderId || p.sourceTraderName === params.traderName)
      );
      return stillOpenInTrader && !alreadyOpenInAcc;
    });
    this.savePendingChoices();

    // 2. Copy ONLY genuinely active open positions from `Positions` tab (never permanently closed or already-synced trades)
    for (const pos of params.positions) {
      if (
        !params.precomputedByWorker &&
        isTraderTradePermanentlyClosed({
          symbol: pos.symbol,
          side: pos.side,
          entryTime: pos.entryTime,
          latestRecords: params.latestRecords,
          positionHistory: params.positionHistory,
        })
      ) {
        const staleChoiceId = `choice_${acc.id}_${params.traderId}_${pos.symbol.toUpperCase()}_${pos.side}`;
        if (this.pendingReconnectChoices.some((c) => c.id === staleChoiceId)) {
          this.pendingReconnectChoices = this.pendingReconnectChoices.filter(
            (c) => c.id !== staleChoiceId
          );
          this.savePendingChoices();
        }
        continue;
      }

      if (
        hasTraderEntryAlreadyBeenSynced({
          traderId: params.traderId,
          traderName: params.traderName,
          symbol: pos.symbol,
          side: pos.side,
          rawPositionId: pos.id,
          entryTime: pos.entryTime,
          accountPositions: acc.positions,
          checkpoint,
        })
      ) {
        continue;
      }

      if (this.getOpenPositionsCount(acc.id) >= acc.settings.maxConcurrentTrades) {
        logs.push({
          id: `log_limit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: Date.now(),
          traderId: params.traderId,
          traderName: params.traderName,
          source: params.source,
          action: 'POSITION_SYNC',
          symbol: pos.symbol,
          side: pos.side,
          price: pos.markPrice || pos.entryPrice,
          quantity: 0,
          leverage: userLeverage,
          accountId: acc.id,
          accountName: acc.name,
          messageAr: `[${acc.name}] توقف فتح ${pos.symbol}: تم بلوغ الحد الأقصى للصفقات المفتوحة بنفس الوقت (${acc.settings.maxConcurrentTrades} صفقات)`,
        });
        break;
      }

      // Resolve the LIVE current market price (السعر الحالي للسوق وليس رقماً ثابتاً)
      const liveMarketPrice = resolveLiveMarketExecutionPrice(
        pos.symbol,
        liveMap,
        pos.markPrice,
        pos.entryPrice
      );
      const traderEntryPrice = pos.entryPrice > 0 ? pos.entryPrice : liveMarketPrice;

      // Whale trades (SMART_MONEY), explicit copy actions, and newly opened live trades (< 3m or after copiedStartedAt)
      // execute IMMEDIATELY in the exact same moment without waiting for manual confirmation
      const executeImmediately = shouldExecuteWhaleOrLiveTradeImmediately({
        source: params.source,
        entryTime: pos.entryTime,
        copiedStartedAt: effectiveCopiedStartedAt,
        promptOnUnfavorableLateEntry: shouldCheckAdvantage,
        forceImmediateExecution: params.forceImmediateExecution,
      });

      const evalResult = evaluatePreviousTradePriceAdvantage({
        side: pos.side,
        traderEntryPrice,
        currentMarketPrice: liveMarketPrice,
        promptOnUnfavorableLateEntry: !executeImmediately,
      });

      const choiceId = `choice_${acc.id}_${params.traderId}_${pos.symbol.toUpperCase()}_${pos.side}`;

      if (!executeImmediately && evalResult.decision === 'PROMPT_USER_CHOICE') {
        if (!this.dismissedReconnectChoiceIds.has(choiceId)) {
          const existingChoice = this.pendingReconnectChoices.find((c) => c.id === choiceId);
          const choiceObj: PendingReconnectTradeChoice = {
            id: choiceId,
            createdAt: existingChoice?.createdAt || Date.now(),
            traderId: params.traderId,
            traderName: params.traderName,
            source: params.source,
            accountId: acc.id,
            accountName: acc.name,
            symbol: pos.symbol.toUpperCase(),
            side: pos.side,
            traderEntryPrice,
            currentMarketPrice: liveMarketPrice,
            priceDiffPercent: evalResult.priceDiffPercent,
            leverage: userLeverage,
            marginUsdt: userMarginUsdt,
            traderEntryTime: pos.entryTime,
            traderScaleAdjustments: pos.scaleAdjustments,
            currentScalePercent: pos.currentScalePercent,
          };

          if (!existingChoice) {
            this.pendingReconnectChoices.unshift(choiceObj);
            this.savePendingChoices();
            mobileNotifications.notifyReconnectTradeChoice({
              ...choiceObj,
              choiceId: choiceObj.id,
              sourceType: choiceObj.source,
            });
          } else {
            Object.assign(existingChoice, choiceObj);
            this.savePendingChoices();
          }
        }
        continue;
      }

      // Price is in the user's favor OR whale/live trade executes immediately -> Execute at the CURRENT LIVE MARKET PRICE!
      this.pendingReconnectChoices = this.pendingReconnectChoices.filter((c) => c.id !== choiceId);
      this.savePendingChoices();

      try {
        const opened = this.openPositionWithUserSettings({
          symbol: pos.symbol,
          side: pos.side,
          entryPrice: liveMarketPrice,
          traderEntryPrice,
          traderLeverage: pos.leverage,
          customMarginUsdt: userMarginUsdt,
          customLeverage: userLeverage,
          sourceTraderId: params.traderId,
          sourceTraderName: params.traderName,
          sourceType: params.source,
          traderEntryTime: pos.entryTime,
          traderScaleAdjustments: pos.scaleAdjustments,
          currentScalePercent: pos.currentScalePercent,
          accountId: acc.id,
        });
        opened.lastSyncedTraderQty = pos.positionAmount;
        opened.lastSyncedTraderUpdateTime = pos.lastUpdateTime || pos.entryTime;
        this.saveState();

        const entryActionId = buildTraderActionId({
          traderId: params.traderId,
          symbol: pos.symbol,
          actionType: 'ENTRY',
          rawId: pos.id,
          timestamp: pos.entryTime,
          volumePercent: opened.currentScalePercent || 100,
          quantity: pos.positionAmount,
        });
        const entryTimeActionId = buildTraderActionId({
          traderId: params.traderId,
          symbol: pos.symbol,
          actionType: 'ENTRY',
          timestamp: pos.entryTime,
        });
        this.recordTraderSyncAction(checkpoint, {
          actionId: entryActionId,
          candidateKeys: [entryActionId, entryTimeActionId],
          symbol: pos.symbol,
          actionType: 'ENTRY',
          timestamp: pos.entryTime || opened.openTime,
          explicitVersion: params.syncVersion,
        });

        const compDetails = formatLateEntryComparisonDetails({
          traderEntryPrice,
          traderEntryTime: pos.entryTime,
          userEntryPrice: opened.entryPrice,
          userEntryTime: opened.openTime,
        });
        logs.push({
          id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: opened.openTime || Date.now(),
          traderId: params.traderId,
          traderName: params.traderName,
          source: params.source,
          action: 'POSITION_SYNC',
          volumePercent: opened.currentScalePercent || 100,
          symbol: opened.symbol,
          side: opened.side,
          price: opened.entryPrice,
          traderEntryPrice,
          traderEntryTime: pos.entryTime,
          userEntryTime: opened.openTime,
          quantity: opened.quantity,
          leverage: opened.leverage,
          accountId: acc.id,
          accountName: acc.name,
          messageAr: `[${acc.name}] دخول مباشر بقيمة الصفقة المتبقية (${opened.currentScalePercent || 100}% • ${opened.marginUsdt.toFixed(2)}$) على ${opened.symbol} ${opened.side} — ${compDetails.combinedSummaryAr}`,
        });
      } catch (err: any) {
        console.warn('Could not open synced position:', err);
      }
    }

    // Record explicit caller batch actionId / syncVersion if supplied
    if (
      params.actionId ||
      (params.syncVersion !== undefined && params.syncVersion > checkpoint.version)
    ) {
      if (params.actionId && !checkpoint.processedActionIds.includes(params.actionId)) {
        checkpoint.processedActionIds = [...checkpoint.processedActionIds, params.actionId].slice(-200);
        checkpoint.lastProcessedActionId = params.actionId;
      }
      if (params.syncVersion !== undefined && params.syncVersion > checkpoint.version) {
        checkpoint.version = params.syncVersion;
      }
      checkpoint.updatedAt = Date.now();
      this.saveTraderSyncCheckpoints();
    }

    return logs;
  }

  /**
   * Builds a lightweight, serializable snapshot of account contexts and checkpoints
   * to send to the dedicated Web Worker (`tradeSync.worker.ts`).
   */
  public buildWorkerAccountContexts(
    tasks: WorkerTraderSyncInputTask[]
  ): Record<string, WorkerAccountContext> {
    const accountsByKey: Record<string, WorkerAccountContext> = {};
    for (const task of tasks) {
      const acc = this.getAccount(task.accountId);
      const cpKey = this.getTraderSyncCheckpointKey(task.traderId, task.source, acc.id);
      const cp = this.traderSyncCheckpoints[cpKey] || null;
      const ctx: WorkerAccountContext = {
        accountId: acc.id,
        accountName: acc.name,
        settings: { ...acc.settings },
        positions: acc.positions,
        checkpoint: cp,
      };
      accountsByKey[cpKey] = ctx;
      if (!accountsByKey[acc.id]) {
        accountsByKey[acc.id] = ctx;
      }
    }
    return accountsByKey;
  }

  /**
   * Applies the precomputed sync batch returned by the Web Worker in a single fast main-thread batch commit.
   */
  public applyWorkerPrecomputedSyncBatch(
    workerResponse: WorkerSyncBatchResponse,
    currentPrices: Record<string, number> = {}
  ): CopiedSyncLog[] {
    return this.runInBatch(() => {
      const allLogs: CopiedSyncLog[] = [];
      for (const res of workerResponse.results || []) {
        if (res.staleChoiceIdsToRemove && res.staleChoiceIdsToRemove.length > 0) {
          const removeSet = new Set(res.staleChoiceIdsToRemove);
          const beforeLen = this.pendingReconnectChoices.length;
          this.pendingReconnectChoices = this.pendingReconnectChoices.filter(
            (c) => !removeSet.has(c.id)
          );
          if (this.pendingReconnectChoices.length !== beforeLen) {
            this.savePendingChoices();
          }
        }

        if (res.isSkippedStale || !res.hasActionableChanges) {
          continue;
        }

        const taskLogs = this.syncTraderPositionsAndRecordsInternal({
          traderId: res.traderId,
          traderName: res.traderName,
          source: res.source,
          positions: res.filteredPositions,
          latestRecords: res.actionableRecords,
          marginPerTradeUsdt: res.marginPerTradeUsdt,
          accountId: res.accountId,
          currentPrices,
          checkReconnectAdvantage: res.checkReconnectAdvantage,
          forceImmediateExecution: res.forceImmediateExecution,
          copiedStartedAt: res.copiedStartedAt,
          syncVersion: res.syncVersion,
          actionId: res.actionId,
          isPartialOrRateLimited: res.isPartialOrRateLimited,
          precomputedByWorker: true,
        });
        if (taskLogs.length > 0) {
          allLogs.push(...taskLogs);
        }
      }
      return allLogs;
    });
  }

  /**
   * Offloads a batch of trader/whale sync payloads to the dedicated Web Worker (`tradeSync.worker.ts`)
   * so all heavy filtering, sorting, closed-trade detection, and deduplication run off the main UI thread,
   * then applies only the actionable changes in a single batched commit.
   */
  public async syncMultipleTradersOffMainThread(
    tasks: Array<Omit<WorkerTraderSyncInputTask, 'taskId'> & { taskId?: string }>,
    currentPrices: Record<string, number> = {}
  ): Promise<{ logs: CopiedSyncLog[]; workerResponse: WorkerSyncBatchResponse }> {
    const normalizedTasks: WorkerTraderSyncInputTask[] = (tasks || []).map((t, idx) => ({
      ...t,
      taskId: t.taskId || `task_${t.accountId || 'acc_default'}_${t.traderId}_${idx}`,
      accountId: t.accountId || this.getActiveAccountId(),
    }));

    const effectivePrices = this.mergeWithLastKnownPrices(currentPrices);
    const accountsByKey = this.buildWorkerAccountContexts(normalizedTasks);

    const workerResponse = await tradeSyncWorkerClient.offloadSyncBatchToWorker({
      tasks: normalizedTasks,
      accountsByKey,
      currentPrices: effectivePrices,
    });

    const logs = this.applyWorkerPrecomputedSyncBatch(workerResponse, effectivePrices);
    return { logs, workerResponse };
  }

  public getSnapshot(currentPrices: Record<string, number>, accountId?: string): PaperAccountSnapshot {
    const effectivePrices = this.mergeWithLastKnownPrices(currentPrices);
    // Automatically check and execute any Stop-Loss (including secured near-current-price stop-loss)
    this.checkAndExecuteStopLosses(effectivePrices);

    const acc = this.getAccount(accountId);
    let totalUnrealized = 0;
    let openPositionsMargin = 0;

    for (const p of acc.positions) {
      if (p.status === 'OPEN') {
        const margin = p.marginUsdt || (p.quantity * p.entryPrice) / p.leverage;
        openPositionsMargin += margin;

        const currentPrice =
          effectivePrices[p.symbol] ||
          effectivePrices[p.symbol.toUpperCase()] ||
          p.entryPrice;
        const dir = p.side === 'LONG' ? 1 : -1;
        const uPnl = (currentPrice - p.entryPrice) * p.quantity * dir;
        totalUnrealized += uPnl;
      }
    }

    const totalEquity = acc.availableBalance + openPositionsMargin + totalUnrealized;
    const summaries = this.getAccountsSummaries(effectivePrices);

    // Check if any virtual account reached the configured Drawdown threshold and dispatch an instant Push Notification
    mobileNotifications.checkAccountsDrawdown(summaries);

    // Strictly filter pendingReconnectChoices to only trades belonging to the copied trader(s) in this active account
    // (or empty when the user unchecked promptOnUnfavorableLateEntry to auto-enter at market price)
    const storedCopiedTraders = this.loadStoredCopiedTraders();
    this.prunePendingChoicesForCopiedTraders(storedCopiedTraders);
    const activeAccountPendingChoices =
      acc.settings.promptOnUnfavorableLateEntry === false
        ? []
        : filterPendingChoicesForCopiedTradersOnPage(
            this.pendingReconnectChoices,
            storedCopiedTraders,
            acc.id
          ).filter(
            (c) =>
              !acc.positions.some(
                (p) =>
                  p.status === 'OPEN' &&
                  p.symbol.toUpperCase() === c.symbol.toUpperCase() &&
                  p.side === c.side &&
                  (p.sourceTraderId === c.traderId || p.sourceTraderName === c.traderName)
              )
          );

    return {
      activeAccountId: acc.id,
      activeAccountName: acc.name,
      accounts: summaries,
      initialBalance: acc.initialBalance,
      availableBalance: parseFloat(acc.availableBalance.toFixed(4)),
      totalEquity: parseFloat(totalEquity.toFixed(4)),
      unrealizedPnl: parseFloat(totalUnrealized.toFixed(4)),
      totalCommissionsPaid: parseFloat(acc.totalCommissionsPaid.toFixed(4)),
      positions: [...acc.positions],
      settings: { ...acc.settings },
      pendingReconnectChoices: activeAccountPendingChoices,
    };
  }

  /**
   * Returns current historical memory cache stats for PaperEngine
   */
  public getMemoryCacheStats(): {
    closedPositionsCount: number;
    checkpointEntriesCount: number;
    dismissedChoicesCount: number;
    estimatedKb: number;
  } {
    let closedPositionsCount = 0;
    for (const acc of this.accounts) {
      for (const p of acc.positions) {
        if (p.status === 'CLOSED') closedPositionsCount += 1;
      }
    }
    let checkpointEntriesCount = 0;
    for (const cp of Object.values(this.traderSyncCheckpoints)) {
      checkpointEntriesCount +=
        (cp.processedActionIds?.length || 0) + Object.keys(cp.lastActionsBySymbol || {}).length;
    }
    const dismissedChoicesCount = this.dismissedReconnectChoiceIds.size;
    const estimatedKb = Math.round(
      closedPositionsCount * 0.9 + checkpointEntriesCount * 0.12 + dismissedChoicesCount * 0.08
    );
    return {
      closedPositionsCount,
      checkpointEntriesCount,
      dismissedChoicesCount,
      estimatedKb,
    };
  }

  /**
   * Purges expired history logs (CLOSED positions, old per-symbol sync checkpoints, and stale pending choices)
   * that exceeded maxAgeMs (defaults to 30 days) across all virtual accounts.
   * Never modifies or deletes active OPEN positions or virtual account balances.
   */
  public purgeExpiredHistoryLogs(
    maxAgeMs: number = 30 * 24 * 60 * 60 * 1000,
    nowMs: number = Date.now()
  ): {
    removedClosedPositions: number;
    removedCheckpoints: number;
    removedStaleChoices: number;
    totalRemoved: number;
  } {
    const cutoffTimestamp = nowMs - Math.max(24 * 60 * 60 * 1000, maxAgeMs);
    let removedClosedPositions = 0;
    let removedCheckpoints = 0;
    let removedStaleChoices = 0;

    let accountsChanged = false;
    for (const acc of this.accounts) {
      const beforeLen = acc.positions.length;
      acc.positions = acc.positions.filter((p) => {
        if (p.status === 'OPEN') return true;
        const ts = Number(p.closeTime || p.openTime || 0);
        if (ts > 0 && ts < cutoffTimestamp) {
          removedClosedPositions += 1;
          return false;
        }
        return true;
      });
      if (acc.positions.length !== beforeLen) {
        accountsChanged = true;
      }
    }
    if (accountsChanged) {
      this.saveState();
    }

    let checkpointsChanged = false;
    for (const cp of Object.values(this.traderSyncCheckpoints)) {
      if (cp.lastActionsBySymbol) {
        for (const [sym, actionMeta] of Object.entries(cp.lastActionsBySymbol)) {
          const ts = Number(actionMeta?.timestamp || 0);
          if (ts > 0 && ts < cutoffTimestamp) {
            delete cp.lastActionsBySymbol[sym];
            removedCheckpoints += 1;
            checkpointsChanged = true;
          }
        }
      }
    }
    if (checkpointsChanged) {
      this.saveTraderSyncCheckpoints();
    }

    if (this.pendingReconnectChoices.length > 0) {
      const beforeChoices = this.pendingReconnectChoices.length;
      this.pendingReconnectChoices = this.pendingReconnectChoices.filter((choice) => {
        const ts = Number(choice.createdAt || choice.traderEntryTime || 0);
        if (ts > 0 && ts < cutoffTimestamp) {
          removedStaleChoices += 1;
          return false;
        }
        return true;
      });
      if (this.pendingReconnectChoices.length !== beforeChoices) {
        this.savePendingChoices();
      }
    }

    return {
      removedClosedPositions,
      removedCheckpoints,
      removedStaleChoices,
      totalRemoved: removedClosedPositions + removedCheckpoints + removedStaleChoices,
    };
  }

  /**
   * Trims excess historical closed positions and old sync checkpoint IDs to free memory
   * on low-end devices without touching OPEN positions or virtual account balances.
   */
  public trimHistoricalMemoryCache(options?: {
    maxClosedPerAccount?: number;
    maxCheckpointItems?: number;
    maxDismissedChoices?: number;
    maxHistoryAgeMs?: number;
    nowMs?: number;
  }): number {
    const expiredResult = this.purgeExpiredHistoryLogs(
      options?.maxHistoryAgeMs ?? 30 * 24 * 60 * 60 * 1000,
      options?.nowMs ?? Date.now()
    );
    const maxClosed = Math.max(10, options?.maxClosedPerAccount ?? 50);
    const maxCpItems = Math.max(30, options?.maxCheckpointItems ?? 120);
    const maxDismissed = Math.max(20, options?.maxDismissedChoices ?? 100);
    let trimmedCount = expiredResult.totalRemoved;

    let accountsChanged = false;
    for (const acc of this.accounts) {
      const openPos = acc.positions.filter((p) => p.status === 'OPEN');
      const closedPos = acc.positions.filter((p) => p.status === 'CLOSED');
      if (closedPos.length > maxClosed) {
        closedPos.sort((a, b) => (b.closeTime || b.openTime) - (a.closeTime || a.openTime));
        const keptClosed = closedPos.slice(0, maxClosed);
        trimmedCount += closedPos.length - keptClosed.length;
        acc.positions = [...openPos, ...keptClosed];
        accountsChanged = true;
      }
      // Also trim excess appliedSyncEventIds on open positions beyond 60
      for (const p of openPos) {
        if (p.appliedSyncEventIds && p.appliedSyncEventIds.length > 60) {
          trimmedCount += p.appliedSyncEventIds.length - 60;
          p.appliedSyncEventIds = p.appliedSyncEventIds.slice(-60);
          accountsChanged = true;
        }
      }
    }
    if (accountsChanged) {
      this.saveState();
    }

    let checkpointsChanged = false;
    for (const cp of Object.values(this.traderSyncCheckpoints)) {
      if (cp.processedActionIds && cp.processedActionIds.length > maxCpItems) {
        trimmedCount += cp.processedActionIds.length - maxCpItems;
        cp.processedActionIds = cp.processedActionIds.slice(-maxCpItems);
        checkpointsChanged = true;
      }
    }
    if (checkpointsChanged) {
      this.saveTraderSyncCheckpoints();
    }

    if (this.dismissedReconnectChoiceIds.size > maxDismissed) {
      const arr = Array.from(this.dismissedReconnectChoiceIds);
      const excess = arr.length - maxDismissed;
      trimmedCount += excess;
      this.dismissedReconnectChoiceIds = new Set(arr.slice(-maxDismissed));
      this.savePendingChoices();
    }

    return trimmedCount;
  }
}

export const paperEngine = new PaperEngine();
