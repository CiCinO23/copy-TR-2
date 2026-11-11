import {
  PaperPosition,
  PaperAccountSnapshot,
  PaperVirtualAccountSummary,
  TradeExecutionSettings,
  TraderOpenPosition,
  TraderLatestRecord,
  CopiedSyncLog,
} from '../types';
import { mobileNotifications } from './mobileNotifications';

const PAPER_STORAGE_KEY = 'whale_copy_paper_state_v3';
const TRADE_SETTINGS_STORAGE_KEY = 'whale_copy_trade_settings_v1';
const MULTI_ACCOUNTS_STORAGE_KEY = 'whale_copy_multi_accounts_v1';
const ACTIVE_ACCOUNT_ID_STORAGE_KEY = 'whale_copy_active_account_id_v1';

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

  constructor() {
    this.loadMultiAccounts();
  }

  private loadLegacySettings(): TradeExecutionSettings {
    try {
      const raw = localStorage.getItem(TRADE_SETTINGS_STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_TRADE_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('Failed to load trade settings:', e);
    }
    return { ...DEFAULT_TRADE_SETTINGS };
  }

  private loadLegacyState(settings: TradeExecutionSettings): StoredPaperState {
    try {
      const raw = localStorage.getItem(PAPER_STORAGE_KEY);
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
    return {
      initialBalance: settings.virtualInitialBalance,
      availableBalance: settings.virtualInitialBalance,
      totalCommissionsPaid: 0,
      positions: [],
    };
  }

  private loadMultiAccounts(): void {
    try {
      const rawAccounts = localStorage.getItem(MULTI_ACCOUNTS_STORAGE_KEY);
      const rawActiveId = localStorage.getItem(ACTIVE_ACCOUNT_ID_STORAGE_KEY);

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
    try {
      localStorage.setItem(MULTI_ACCOUNTS_STORAGE_KEY, JSON.stringify(this.accounts));
      localStorage.setItem(ACTIVE_ACCOUNT_ID_STORAGE_KEY, this.activeAccountId);

      // Keep legacy keys in sync with the active account for backward compatibility
      const activeAcc = this.getAccount();
      localStorage.setItem(TRADE_SETTINGS_STORAGE_KEY, JSON.stringify(activeAcc.settings));
      const legacyState: StoredPaperState = {
        initialBalance: activeAcc.initialBalance,
        availableBalance: activeAcc.availableBalance,
        totalCommissionsPaid: activeAcc.totalCommissionsPaid,
        positions: activeAcc.positions,
      };
      localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(legacyState));
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
    this.accounts = this.accounts.filter((a) => a.id !== accountId);
    if (!this.accounts.some((a) => a.id === this.activeAccountId)) {
      this.activeAccountId = this.accounts[0].id;
    }
    this.saveState();
    return this.getSnapshot(currentPrices);
  }

  public getAccountsSummaries(currentPrices: Record<string, number> = {}): PaperVirtualAccountSummary[] {
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
          const currentPrice = currentPrices[p.symbol] || p.entryPrice;
          const dir = p.side === 'LONG' ? 1 : -1;
          totalUnrealized += (currentPrice - p.entryPrice) * p.quantity * dir;
        } else {
          closedCount++;
        }
      }

      const totalEquity = acc.availableBalance + openPositionsMargin + totalUnrealized;
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
    accountId?: string
  ): TradeExecutionSettings {
    const acc = this.getAccount(accountId);
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

    this.saveState();
    return { ...acc.settings };
  }

  private recalculateOpenCopiedPositions(acc: StoredVirtualAccount): void {
    let totalMarginUsed = 0;
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
              runningMargin = initialMargin;
              runningScalePct = 100;
              return {
                ...adj,
                volumePercent: 100,
                remainingPercentAfter: 100,
                executedQty: Number(((initialMargin * lev) / p).toFixed(5)),
                marginDeltaUsdt: initialMargin,
                actionLabelAr: `فتح الصفقة الأولي (${pos.side === 'LONG' ? 'شراء Long' : 'بيع Short'} 100% • ${initialMargin.toFixed(2)}$)`,
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
        totalMarginUsed += pos.marginUsdt || (pos.quantity * pos.entryPrice) / pos.leverage;
      }
    }

    if (acc.settings.mode === 'VIRTUAL') {
      acc.availableBalance = Math.max(0, acc.initialBalance - totalMarginUsed - acc.totalCommissionsPaid);
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

    this.saveState();
    return this.getSnapshot({});
  }

  public reset(balance?: number, accountId?: string): PaperAccountSnapshot {
    const acc = this.getAccount(accountId);
    const targetBal = balance !== undefined ? balance : acc.settings.virtualInitialBalance;
    return this.setVirtualBalance(targetBal, true, acc.id);
  }

  public getOpenPositionsCount(accountId?: string): number {
    const acc = this.getAccount(accountId);
    return acc.positions.filter((p) => p.status === 'OPEN').length;
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
    accountId?: string
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

    const defaultAdjustments: PaperPosition['scaleAdjustments'] =
      initialScaleAdjustments && initialScaleAdjustments.length > 0
        ? initialScaleAdjustments
        : [
            {
              id: `${posId}_init`,
              actionType: 'INITIAL_ENTRY',
              actionLabelAr: `فتح الصفقة الأولي (${side === 'LONG' ? 'شراء Long' : 'بيع Short'} 100% • ${baseInitialMargin.toFixed(2)}$)`,
              timestamp: traderEntryTime || now,
              volumePercent: 100,
              remainingPercentAfter: 100,
              executedQty: cleanQty,
              price: entryPrice,
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
   * Open a position using the target Account's Fixed Trade Settings
   */
  public openPositionWithUserSettings(params: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
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

    let finalMarginUsdt = baseMarginUsdt;
    let finalScalePercent = params.currentScalePercent || 100;
    let mappedAdjustments: PaperPosition['scaleAdjustments'] | undefined = undefined;

    if (params.traderScaleAdjustments && params.traderScaleAdjustments.length > 0) {
      let runningMargin = baseMarginUsdt;
      let runningScalePct = 100;

      mappedAdjustments = params.traderScaleAdjustments.map((adj) => {
        const p = adj.price > 0 ? adj.price : safePrice;

        if (adj.actionType === 'INITIAL_ENTRY') {
          runningMargin = baseMarginUsdt;
          runningScalePct = 100;
          return {
            ...adj,
            volumePercent: 100,
            remainingPercentAfter: 100,
            executedQty: Number(((baseMarginUsdt * leverage) / p).toFixed(5)),
            marginDeltaUsdt: baseMarginUsdt,
            actionLabelAr: `فتح الصفقة الأولي (${params.side === 'LONG' ? 'شراء Long' : 'بيع Short'} 100% • ${baseMarginUsdt.toFixed(2)}$)`,
          };
        }

        if (adj.actionType === 'SCALE_IN') {
          const traderPct = Math.max(5, Math.abs(adj.volumePercent || 25));
          if (samePctMode) {
            const addedMargin = Number((baseMarginUsdt * (traderPct / 100)).toFixed(2));
            runningMargin = Number((runningMargin + addedMargin).toFixed(2));
            runningScalePct += traderPct;
            return {
              ...adj,
              volumePercent: traderPct,
              remainingPercentAfter: runningScalePct,
              executedQty: Number(((addedMargin * leverage) / p).toFixed(5)),
              marginDeltaUsdt: addedMargin,
              actionLabelAr: `تدعيم آلي بنفس النسبة (+${traderPct}% من الأصل • +${addedMargin.toFixed(2)}$)`,
            };
          } else {
            const addedMargin = Number(fixedScaleVal.toFixed(2));
            const equivPct = Math.max(1, Math.round((addedMargin / baseMarginUsdt) * 100));
            runningMargin = Number((runningMargin + addedMargin).toFixed(2));
            runningScalePct += equivPct;
            return {
              ...adj,
              volumePercent: equivPct,
              remainingPercentAfter: runningScalePct,
              executedQty: Number(((addedMargin * leverage) / p).toFixed(5)),
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
            executedQty: Number(((withdrawnMargin * leverage) / p).toFixed(5)),
            marginDeltaUsdt: -withdrawnMargin,
            actionLabelAr: `انسحاب جزئي بنفس النسبة (-${withdrawPct}% • سحب ${withdrawnMargin.toFixed(2)}$ • متبقي ${runningScalePct}%)`,
          };
        }

        return {
          ...adj,
          executedQty: Number((((baseMarginUsdt * leverage) / p) * (Math.abs(adj.volumePercent) / 100)).toFixed(5)),
        };
      });

      finalMarginUsdt = runningMargin;
      finalScalePercent = runningScalePct;
    }

    const notional = finalMarginUsdt * leverage;
    const quantity = notional / safePrice;

    return this.openPosition(
      params.symbol,
      params.side,
      quantity,
      safePrice,
      leverage,
      params.sourceTraderName,
      params.sourceType,
      params.sourceTraderId,
      params.traderEntryTime,
      mappedAdjustments,
      finalScalePercent,
      baseMarginUsdt,
      acc.id
    );
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
    accountId?: string
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
      id: `${pos.id}_scale_in_${ts}`,
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
    });

    this.saveState();

    mobileNotifications.notifyTradeEvent({
      actionType: 'SCALE_IN',
      position: pos,
      executionPrice: safePrice,
      volumePercent: cleanPct,
      marginDeltaUsdt: addedMargin,
    });

    return pos;
  }

  public scaleInFromTraderSignal(
    positionId: string,
    traderVolumePercent: number,
    executionPrice: number,
    actionTimestamp?: number,
    accountId?: string
  ): PaperPosition {
    const { acc } = this.findAccountAndPosition(positionId, accountId);
    if (acc.settings.scaleInSamePercentAsTrader !== false) {
      const pct = Math.max(5, Math.abs(traderVolumePercent || 25));
      return this.scaleInPosition(positionId, pct, executionPrice, actionTimestamp, undefined, acc.id);
    } else {
      const fixedVal = Math.max(1, acc.settings.scaleInFixedValueUsdt || 10);
      return this.scaleInPosition(positionId, 0, executionPrice, actionTimestamp, fixedVal, acc.id);
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
    accountId?: string
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
    pos.marginUsdt = Number(Math.max(0.5, pos.marginUsdt - releasedMargin).toFixed(2));
    pos.commissionUsdt = Number(((pos.commissionUsdt || 0) + exitCommission).toFixed(4));
    pos.realizedPnl = Number(((pos.realizedPnl || 0) + netPartialPnl).toFixed(4));

    const prevScale = pos.currentScalePercent || 100;
    const nextScale = Math.max(5, Math.round(prevScale * (1 - fraction)));
    pos.currentScalePercent = nextScale;

    const ts = actionTimestamp || Date.now();
    if (!pos.scaleAdjustments) pos.scaleAdjustments = [];
    pos.scaleAdjustments.push({
      id: `${pos.id}_partial_exit_${ts}`,
      actionType: 'PARTIAL_EXIT',
      actionLabelAr: `انسحاب جزئي بنفس النسبة (-${cleanPct}% • سحب ${releasedMargin.toFixed(2)}$ • متبقي ${nextScale}%)`,
      timestamp: ts,
      volumePercent: -cleanPct,
      remainingPercentAfter: nextScale,
      executedQty: Number(closedQty.toFixed(5)),
      price: safePrice,
      realizedPnlDelta: Number(netPartialPnl.toFixed(2)),
      marginDeltaUsdt: -Number(releasedMargin.toFixed(2)),
    });

    this.saveState();

    mobileNotifications.notifyTradeEvent({
      actionType: 'PARTIAL_EXIT',
      position: pos,
      executionPrice: safePrice,
      volumePercent: -cleanPct,
      marginDeltaUsdt: -Number(releasedMargin.toFixed(2)),
      realizedPnlDeltaUsdt: Number(netPartialPnl.toFixed(2)),
    });

    return pos;
  }

  public closePosition(
    positionId: string,
    exitPrice: number,
    exitTimestamp?: number,
    accountId?: string
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
    });

    this.saveState();

    mobileNotifications.notifyTradeEvent({
      actionType: 'FULL_EXIT',
      position: pos,
      executionPrice: exitPrice,
      volumePercent: -100,
      marginDeltaUsdt: -Number(remainingMargin.toFixed(2)),
      realizedPnlDeltaUsdt: Number((pos.realizedPnl ?? netPnl).toFixed(2)),
    });

    return pos;
  }

  /**
   * Synchronize a trader's open Positions and Latest records into a specific virtual account
   */
  public syncTraderPositionsAndRecords(params: {
    traderId: string;
    traderName: string;
    source: 'COPY_TRADING' | 'SMART_MONEY';
    positions: TraderOpenPosition[];
    latestRecords: TraderLatestRecord[];
    marginPerTradeUsdt?: number;
    accountId?: string;
  }): CopiedSyncLog[] {
    const acc = this.getAccount(params.accountId);
    const logs: CopiedSyncLog[] = [];
    const userMarginUsdt =
      acc.settings.enforceUserSizeOnCopy
        ? acc.settings.tradeValueUsdt
        : params.marginPerTradeUsdt || acc.settings.tradeValueUsdt;
    const userLeverage = acc.settings.leverage;

    // 1. Process EXIT, PARTIAL_EXIT, and SCALE_IN records on already open copied positions in this account
    const recentRecords = params.latestRecords.slice(0, 10);
    for (const rec of recentRecords) {
      const matchingOpen = acc.positions.find(
        (p) =>
          p.status === 'OPEN' &&
          p.symbol === rec.symbol.toUpperCase() &&
          p.sourceTraderName === params.traderName
      );

      if (matchingOpen && rec.avgPrice > 0) {
        if (rec.actionType === 'EXIT') {
          try {
            const closed = this.closePosition(matchingOpen.id, rec.avgPrice, rec.orderTime, acc.id);
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
              price: rec.avgPrice,
              quantity: closed.quantity,
              leverage: closed.leverage,
              accountId: acc.id,
              accountName: acc.name,
              messageAr: `[${acc.name}] خروج كامل (-100%) من ${closed.symbol} بسعر ${rec.avgPrice.toFixed(2)} USDT (الصافي: ${(closed.realizedPnl || 0).toFixed(2)} USDT)`,
            });
          } catch (e) {
            console.warn('Exit sync skipped:', e);
          }
        } else if (rec.actionType === 'PARTIAL_EXIT') {
          const alreadyApplied = matchingOpen.scaleAdjustments?.some(
            (a) => Math.abs(a.timestamp - rec.orderTime) < 60000 && a.actionType === 'PARTIAL_EXIT'
          );
          if (!alreadyApplied) {
            try {
              const withdrawPct = Math.abs(rec.volumePercent || 30);
              const updated = this.partialExitPosition(
                matchingOpen.id,
                withdrawPct,
                rec.avgPrice,
                rec.orderTime,
                acc.id
              );
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
                price: rec.avgPrice,
                quantity: updated.quantity,
                leverage: updated.leverage,
                accountId: acc.id,
                accountName: acc.name,
                messageAr: `[${acc.name}] انسحاب جزئي بنفس النسبة (-${withdrawPct}%) من ${updated.symbol} بسعر ${rec.avgPrice.toFixed(2)} USDT (متبقي ${updated.currentScalePercent}%)`,
              });
            } catch (e) {
              console.warn('Partial exit sync skipped:', e);
            }
          }
        } else if (rec.actionType === 'SCALE_IN') {
          const alreadyApplied = matchingOpen.scaleAdjustments?.some(
            (a) => Math.abs(a.timestamp - rec.orderTime) < 60000 && a.actionType === 'SCALE_IN'
          );
          if (!alreadyApplied) {
            try {
              const addPct = Math.abs(rec.volumePercent || 30);
              const updated = this.scaleInFromTraderSignal(
                matchingOpen.id,
                addPct,
                rec.avgPrice,
                rec.orderTime,
                acc.id
              );
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
                price: rec.avgPrice,
                quantity: updated.quantity,
                leverage: updated.leverage,
                accountId: acc.id,
                accountName: acc.name,
                messageAr: `[${acc.name}] تدعيم الصفقة ${modeLabel} على ${updated.symbol} بسعر ${rec.avgPrice.toFixed(2)} USDT (الحجم الحالي ${updated.currentScalePercent}%)`,
              });
            } catch (e) {
              console.warn('Scale-in sync skipped:', e);
            }
          }
        }
      }
    }

    // 2. Copy Open Positions from `Positions` tab using target account's tradeValueUsdt and leverage
    for (const pos of params.positions) {
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

      const alreadyOpen = acc.positions.find(
        (p) =>
          p.status === 'OPEN' &&
          p.symbol === pos.symbol.toUpperCase() &&
          p.side === pos.side &&
          p.sourceTraderName === params.traderName
      );

      if (!alreadyOpen) {
        const price = pos.markPrice > 0 ? pos.markPrice : pos.entryPrice;
        try {
          const opened = this.openPositionWithUserSettings({
            symbol: pos.symbol,
            side: pos.side,
            entryPrice: price,
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
          logs.push({
            id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            timestamp: pos.entryTime || Date.now(),
            traderId: params.traderId,
            traderName: params.traderName,
            source: params.source,
            action: 'POSITION_SYNC',
            volumePercent: opened.currentScalePercent || 100,
            symbol: opened.symbol,
            side: opened.side,
            price: opened.entryPrice,
            quantity: opened.quantity,
            leverage: opened.leverage,
            accountId: acc.id,
            accountName: acc.name,
            messageAr: `[${acc.name}] نسخ مركز (${opened.symbol} ${opened.side}) بقيمة ${opened.marginUsdt.toFixed(2)}$ (${opened.leverage}x) • نسبة الحجم الحالية ${opened.currentScalePercent || 100}%`,
          });
        } catch (err: any) {
          console.warn('Could not open synced position:', err);
        }
      }
    }

    // 3. If trader had no open `Positions`, check `Latest records` ENTRY signals
    if (params.positions.length === 0) {
      for (const rec of recentRecords) {
        if (rec.actionType === 'ENTRY' || rec.actionType === 'SCALE_IN') {
          if (this.getOpenPositionsCount(acc.id) >= acc.settings.maxConcurrentTrades) {
            break;
          }
          const targetSide: 'LONG' | 'SHORT' =
            rec.positionSide === 'SHORT' || (rec.positionSide === 'BOTH' && rec.side === 'SELL')
              ? 'SHORT'
              : 'LONG';

          const existingOpen = acc.positions.find(
            (p) =>
              p.status === 'OPEN' &&
              p.symbol === rec.symbol.toUpperCase() &&
              p.sourceTraderName === params.traderName
          );
          if (!existingOpen && rec.avgPrice > 0) {
            try {
              const opened = this.openPositionWithUserSettings({
                symbol: rec.symbol,
                side: targetSide,
                entryPrice: rec.avgPrice,
                customMarginUsdt: userMarginUsdt,
                customLeverage: userLeverage,
                sourceTraderId: params.traderId,
                sourceTraderName: params.traderName,
                sourceType: params.source,
                traderEntryTime: rec.entryTime || rec.orderTime,
                accountId: acc.id,
              });
              logs.push({
                id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                timestamp: rec.orderTime || Date.now(),
                traderId: params.traderId,
                traderName: params.traderName,
                source: params.source,
                action: 'ENTRY',
                volumePercent: rec.volumePercent || 100,
                symbol: opened.symbol,
                side: opened.side,
                price: opened.entryPrice,
                quantity: opened.quantity,
                leverage: opened.leverage,
                accountId: acc.id,
                accountName: acc.name,
                messageAr: `[${acc.name}] دخول من Latest records (${opened.symbol} ${opened.side}) بحجمك المحدد (${userMarginUsdt}$ × ${opened.leverage}x)`,
              });
            } catch (e) {
              console.warn('Entry sync skipped:', e);
            }
          }
        }
      }
    }

    return logs;
  }

  public getSnapshot(currentPrices: Record<string, number>, accountId?: string): PaperAccountSnapshot {
    const acc = this.getAccount(accountId);
    let totalUnrealized = 0;
    let openPositionsMargin = 0;

    for (const p of acc.positions) {
      if (p.status === 'OPEN') {
        const margin = p.marginUsdt || (p.quantity * p.entryPrice) / p.leverage;
        openPositionsMargin += margin;

        const currentPrice = currentPrices[p.symbol] || p.entryPrice;
        const dir = p.side === 'LONG' ? 1 : -1;
        const uPnl = (currentPrice - p.entryPrice) * p.quantity * dir;
        totalUnrealized += uPnl;
      }
    }

    const totalEquity = acc.availableBalance + openPositionsMargin + totalUnrealized;
    const summaries = this.getAccountsSummaries(currentPrices);

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
    };
  }
}

export const paperEngine = new PaperEngine();
