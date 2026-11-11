import {
  PaperPosition,
  PaperAccountSnapshot,
  TradeExecutionSettings,
  TraderOpenPosition,
  TraderLatestRecord,
  CopiedSyncLog,
} from '../types';
import { mobileNotifications } from './mobileNotifications';

const PAPER_STORAGE_KEY = 'whale_copy_paper_state_v3';
const TRADE_SETTINGS_STORAGE_KEY = 'whale_copy_trade_settings_v1';

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

export class PaperEngine {
  private initialBalance: number;
  private availableBalance: number;
  private totalCommissionsPaid: number;
  private positions: PaperPosition[];
  private settings: TradeExecutionSettings;

  constructor() {
    this.settings = this.loadSettings();
    const loaded = this.loadState();
    this.initialBalance = loaded.initialBalance;
    this.availableBalance = loaded.availableBalance;
    this.totalCommissionsPaid = loaded.totalCommissionsPaid;
    this.positions = loaded.positions;
  }

  private loadSettings(): TradeExecutionSettings {
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

  private saveSettings(): void {
    try {
      localStorage.setItem(TRADE_SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to save trade settings:', e);
    }
  }

  private loadState(): StoredPaperState {
    try {
      const raw = localStorage.getItem(PAPER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          initialBalance: Number(parsed.initialBalance ?? this.settings.virtualInitialBalance),
          availableBalance: Number(parsed.availableBalance ?? this.settings.virtualInitialBalance),
          totalCommissionsPaid: Number(parsed.totalCommissionsPaid ?? 0),
          positions: Array.isArray(parsed.positions) ? parsed.positions : [],
        };
      }
    } catch (e) {
      console.warn('Failed to load paper state', e);
    }
    return {
      initialBalance: this.settings.virtualInitialBalance,
      availableBalance: this.settings.virtualInitialBalance,
      totalCommissionsPaid: 0,
      positions: [],
    };
  }

  private saveState(): void {
    try {
      const state: StoredPaperState = {
        initialBalance: this.initialBalance,
        availableBalance: this.availableBalance,
        totalCommissionsPaid: this.totalCommissionsPaid,
        positions: this.positions,
      };
      localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save paper state', e);
    }
  }

  public getSettings(): TradeExecutionSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<TradeExecutionSettings>): TradeExecutionSettings {
    const prevInitial = this.settings.virtualInitialBalance;
    this.settings = { ...this.settings, ...partial };
    this.saveSettings();

    // If virtualInitialBalance was changed, adjust initialBalance & availableBalance by the difference
    if (
      partial.virtualInitialBalance !== undefined &&
      partial.virtualInitialBalance > 0 &&
      partial.virtualInitialBalance !== prevInitial
    ) {
      const diff = partial.virtualInitialBalance - this.initialBalance;
      this.initialBalance = partial.virtualInitialBalance;
      this.availableBalance = Math.max(0, this.availableBalance + diff);
      this.saveState();
    }

    // Recalculate open copied positions if scale-in or trade size settings were updated
    if (
      partial.scaleInSamePercentAsTrader !== undefined ||
      partial.scaleInFixedValueUsdt !== undefined ||
      partial.tradeValueUsdt !== undefined ||
      partial.leverage !== undefined
    ) {
      this.recalculateOpenCopiedPositions();
    }

    return { ...this.settings };
  }

  private recalculateOpenCopiedPositions(): void {
    let totalMarginUsed = 0;
    const baseTradeVal = Math.max(1, this.settings.tradeValueUsdt || 25);
    const lev = Math.max(1, this.settings.leverage || 5);
    const samePctMode = this.settings.scaleInSamePercentAsTrader !== false;
    const fixedScaleVal = Math.max(1, this.settings.scaleInFixedValueUsdt || 10);

    for (const pos of this.positions) {
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
              // Store original trader % in a safe fallback if needed
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

    if (this.settings.mode === 'VIRTUAL') {
      this.availableBalance = Math.max(0, this.initialBalance - totalMarginUsed - this.totalCommissionsPaid);
    }
    this.saveState();
  }

  /**
   * Explicitly set or reset the Virtual Balance to a user-specified amount
   */
  public setVirtualBalance(newBalance: number, closeAllPositions: boolean = false): PaperAccountSnapshot {
    const validBalance = Math.max(1, Number(newBalance) || 1000);
    this.settings.virtualInitialBalance = validBalance;
    this.saveSettings();

    if (closeAllPositions) {
      this.initialBalance = validBalance;
      this.availableBalance = validBalance;
      this.totalCommissionsPaid = 0;
      this.positions = [];
    } else {
      // Keep open positions intact and set available balance based on new initial balance minus open margin
      let openMargin = 0;
      for (const p of this.positions) {
        if (p.status === 'OPEN') {
          openMargin += p.marginUsdt || (p.quantity * p.entryPrice) / p.leverage;
        }
      }
      this.initialBalance = validBalance;
      this.availableBalance = Math.max(0, validBalance - openMargin);
    }

    this.saveState();
    return this.getSnapshot({});
  }

  public reset(balance?: number): PaperAccountSnapshot {
    const targetBal = balance !== undefined ? balance : this.settings.virtualInitialBalance;
    return this.setVirtualBalance(targetBal, true);
  }

  public getOpenPositionsCount(): number {
    return this.positions.filter((p) => p.status === 'OPEN').length;
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
    initialMarginOverride?: number
  ): PaperPosition {
    const openCount = this.getOpenPositionsCount();
    if (openCount >= this.settings.maxConcurrentTrades) {
      throw new Error(
        `تم الوصول للحد الأقصى لعدد الصفقات المفتوحة بنفس الوقت (${this.settings.maxConcurrentTrades} صفقات). يمكنك زيادة الحد من إعدادات الصفقات أو إغلاق صفقة مفتوحة.`
      );
    }

    const safeLeverage = Math.max(1, leverage || this.settings.leverage || 5);
    const notional = quantity * entryPrice;
    const margin = notional / safeLeverage;
    const entryCommission = notional * (Math.max(0, this.settings.commissionPercent) / 100);
    const totalRequired = margin + entryCommission;

    if (this.settings.mode === 'VIRTUAL' && totalRequired > this.availableBalance) {
      throw new Error(
        `رصيد التداول الافتراضي غير كافٍ. المطلوب (شامل العمولة): ${totalRequired.toFixed(2)} USDT، المتاح: ${this.availableBalance.toFixed(2)} USDT`
      );
    }

    if (this.settings.mode === 'VIRTUAL') {
      this.availableBalance -= totalRequired;
    }
    this.totalCommissionsPaid += entryCommission;

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
      executionMode: this.settings.mode,
    };

    this.positions.unshift(newPos);
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
   * Open a position using the User's Fixed Trade Settings (قيمة الصفقة والرافعة والعمولة المحددة من المستخدم)
   * and apply the user's Scale-In (نفس النسبة المئوية من الأصل أو قيمة ثابتة بالدولار) and Partial Exit (نفس النسبة المئوية) rules.
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
  }): PaperPosition {
    const baseMarginUsdt =
      params.customMarginUsdt !== undefined && params.customMarginUsdt > 0
        ? params.customMarginUsdt
        : this.settings.tradeValueUsdt;

    const leverage =
      this.settings.enforceUserSizeOnCopy
        ? params.customLeverage || this.settings.leverage
        : params.traderLeverage || this.settings.leverage;

    const safePrice = params.entryPrice > 0 ? params.entryPrice : 50;
    const samePctMode = this.settings.scaleInSamePercentAsTrader !== false;
    const fixedScaleVal = Math.max(1, this.settings.scaleInFixedValueUsdt || 10);

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
            // التدعيم آلياً بنفس النسبة المئوية من قيمة الصفقة الأصلية
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
            // التدعيم بالقيمة الثابتة المحددة من المستخدم
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
          // عندما يسحب المتداول جزءاً من الصفقة يتم سحب نفس النسبة المئوية من الصفقة
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
      baseMarginUsdt
    );
  }

  /**
   * Reinforce / Scale-In (تدعيم الصفقة إما بنسبة مئوية من قيمة الصفقة الأصلية أو بقيمة ثابتة بالدولار USDT)
   */
  public scaleInPosition(
    positionId: string,
    addPercent: number,
    executionPrice: number,
    actionTimestamp?: number,
    customAddedMarginUsdt?: number
  ): PaperPosition {
    const pos = this.positions.find((p) => p.id === positionId && p.status === 'OPEN');
    if (!pos) {
      throw new Error('الصفقة غير موجودة أو مغلقة');
    }

    const baseMargin = pos.initialMarginUsdt || pos.marginUsdt || this.settings.tradeValueUsdt;
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
    const scaleCommission = addedNotional * (Math.max(0, this.settings.commissionPercent) / 100);
    const totalRequired = addedMargin + scaleCommission;

    if (pos.executionMode !== 'REAL' && totalRequired > this.availableBalance) {
      throw new Error(
        `الرصيد الافتراضي غير كافٍ لتدعيم الصفقة (+${addedMargin.toFixed(2)} USDT). المطلوب: ${totalRequired.toFixed(2)} USDT`
      );
    }

    if (pos.executionMode !== 'REAL') {
      this.availableBalance -= totalRequired;
    }
    this.totalCommissionsPaid += scaleCommission;

    // Weighted average entry price
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

  /**
   * Automatic Scale-In triggered when a copied trader reinforces their position:
   * - If `scaleInSamePercentAsTrader` is true: reinforces by the same % of original trade value.
   * - If `scaleInSamePercentAsTrader` is false: reinforces by the user's fixed `scaleInFixedValueUsdt`.
   */
  public scaleInFromTraderSignal(
    positionId: string,
    traderVolumePercent: number,
    executionPrice: number,
    actionTimestamp?: number
  ): PaperPosition {
    if (this.settings.scaleInSamePercentAsTrader !== false) {
      const pct = Math.max(5, Math.abs(traderVolumePercent || 25));
      return this.scaleInPosition(positionId, pct, executionPrice, actionTimestamp);
    } else {
      const fixedVal = Math.max(1, this.settings.scaleInFixedValueUsdt || 10);
      return this.scaleInPosition(positionId, 0, executionPrice, actionTimestamp, fixedVal);
    }
  }

  /**
   * Partial Withdrawal / Reduction (الانسحاب الجزئي بنفس النسبة المئوية من الصفقة عندما يسحب المتداول جزءاً من صفقته)
   */
  public partialExitPosition(
    positionId: string,
    withdrawPercent: number,
    executionPrice: number,
    actionTimestamp?: number
  ): PaperPosition {
    const pos = this.positions.find((p) => p.id === positionId && p.status === 'OPEN');
    if (!pos) {
      throw new Error('الصفقة غير موجودة أو مغلقة');
    }

    const cleanPct = Math.min(Math.max(5, Math.round(Math.abs(withdrawPercent))), 95);
    const fraction = cleanPct / 100;
    const safePrice = executionPrice > 0 ? executionPrice : pos.entryPrice;

    const closedQty = pos.quantity * fraction;
    const releasedMargin = pos.marginUsdt * fraction;
    const direction = pos.side === 'LONG' ? 1 : -1;
    const grossPnl = (safePrice - pos.entryPrice) * closedQty * direction;
    const exitNotional = closedQty * safePrice;
    const exitCommission = exitNotional * (Math.max(0, this.settings.commissionPercent) / 100);
    const netPartialPnl = grossPnl - exitCommission;

    if (pos.executionMode !== 'REAL') {
      this.availableBalance = Math.max(0, this.availableBalance + releasedMargin + netPartialPnl);
    }
    this.totalCommissionsPaid += exitCommission;

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

  public closePosition(positionId: string, exitPrice: number, exitTimestamp?: number): PaperPosition {
    const pos = this.positions.find((p) => p.id === positionId && p.status === 'OPEN');
    if (!pos) {
      throw new Error('الصفقة غير موجودة أو تم إغلاقها مسبقاً');
    }

    const direction = pos.side === 'LONG' ? 1 : -1;
    const grossPnl = (exitPrice - pos.entryPrice) * pos.quantity * direction;
    const exitNotional = pos.quantity * exitPrice;
    const exitCommission = exitNotional * (Math.max(0, this.settings.commissionPercent) / 100);
    const netPnl = grossPnl - exitCommission;
    const remainingMargin = pos.marginUsdt || (pos.quantity * pos.entryPrice) / pos.leverage;

    if (pos.executionMode !== 'REAL') {
      this.availableBalance = Math.max(0, this.availableBalance + remainingMargin + netPnl);
    }
    this.totalCommissionsPaid += exitCommission;

    const closeTs = exitTimestamp || Date.now();
    pos.status = 'CLOSED';
    pos.closeTime = closeTs;
    pos.traderExitTime = closeTs;
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
   * Synchronize a trader's open Positions and Latest records (Entry, Scale-In, Partial Exit, Full Exit)
   * into the engine strictly using the USER's configured Trade Value (قيمة الصفقة), Leverage (الرافعة),
   * Commission (العمولة), Scale-In rule, Partial-Exit rule, and Max Concurrent Open Trades.
   */
  public syncTraderPositionsAndRecords(params: {
    traderId: string;
    traderName: string;
    source: 'COPY_TRADING' | 'SMART_MONEY';
    positions: TraderOpenPosition[];
    latestRecords: TraderLatestRecord[];
    marginPerTradeUsdt?: number;
  }): CopiedSyncLog[] {
    const logs: CopiedSyncLog[] = [];
    const userMarginUsdt =
      this.settings.enforceUserSizeOnCopy
        ? this.settings.tradeValueUsdt
        : params.marginPerTradeUsdt || this.settings.tradeValueUsdt;
    const userLeverage = this.settings.leverage;

    // 1. Process EXIT, PARTIAL_EXIT, and SCALE_IN records on already open copied positions
    const recentRecords = params.latestRecords.slice(0, 10);
    for (const rec of recentRecords) {
      const matchingOpen = this.positions.find(
        (p) =>
          p.status === 'OPEN' &&
          p.symbol === rec.symbol.toUpperCase() &&
          p.sourceTraderName === params.traderName
      );

      if (matchingOpen && rec.avgPrice > 0) {
        if (rec.actionType === 'EXIT') {
          try {
            const closed = this.closePosition(matchingOpen.id, rec.avgPrice, rec.orderTime);
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
              messageAr: `خروج كامل (-100%) من ${closed.symbol} بسعر ${rec.avgPrice.toFixed(2)} USDT (الصافي: ${(closed.realizedPnl || 0).toFixed(2)} USDT)`,
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
                rec.orderTime
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
                messageAr: `انسحاب جزئي بنفس النسبة (-${withdrawPct}%) من ${updated.symbol} بسعر ${rec.avgPrice.toFixed(2)} USDT (متبقي ${updated.currentScalePercent}%)`,
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
                rec.orderTime
              );
              const lastAdj = updated.scaleAdjustments?.[updated.scaleAdjustments.length - 1];
              const modeLabel =
                this.settings.scaleInSamePercentAsTrader !== false
                  ? `بنفس النسبة (+${addPct}% من الأصل • +${(lastAdj?.marginDeltaUsdt || 0).toFixed(2)}$)`
                  : `بالقيمة المحددة (+${(this.settings.scaleInFixedValueUsdt || 10).toFixed(2)}$)`;
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
                messageAr: `تدعيم الصفقة ${modeLabel} على ${updated.symbol} بسعر ${rec.avgPrice.toFixed(2)} USDT (الحجم الحالي ${updated.currentScalePercent}%)`,
              });
            } catch (e) {
              console.warn('Scale-in sync skipped:', e);
            }
          }
        }
      }
    }

    // 2. Copy Open Positions from `Positions` tab using USER's tradeValueUsdt and leverage
    for (const pos of params.positions) {
      if (this.getOpenPositionsCount() >= this.settings.maxConcurrentTrades) {
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
          messageAr: `توقف فتح ${pos.symbol}: تم بلوغ الحد الأقصى للصفقات المفتوحة بنفس الوقت (${this.settings.maxConcurrentTrades} صفقات)`,
        });
        break;
      }

      const alreadyOpen = this.positions.find(
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
            messageAr: `نسخ مركز (${opened.symbol} ${opened.side}) بقيمة ${opened.marginUsdt.toFixed(2)}$ (${opened.leverage}x) • نسبة الحجم الحالية ${opened.currentScalePercent || 100}%`,
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
          if (this.getOpenPositionsCount() >= this.settings.maxConcurrentTrades) {
            break;
          }
          const targetSide: 'LONG' | 'SHORT' =
            rec.positionSide === 'SHORT' || (rec.positionSide === 'BOTH' && rec.side === 'SELL')
              ? 'SHORT'
              : 'LONG';

          const existingOpen = this.positions.find(
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
                messageAr: `دخول من Latest records (${opened.symbol} ${opened.side}) بحجمك المحدد (${userMarginUsdt}$ × ${opened.leverage}x)`,
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

  public getSnapshot(currentPrices: Record<string, number>): PaperAccountSnapshot {
    let totalUnrealized = 0;
    let openPositionsMargin = 0;

    for (const p of this.positions) {
      if (p.status === 'OPEN') {
        const margin = p.marginUsdt || (p.quantity * p.entryPrice) / p.leverage;
        openPositionsMargin += margin;

        const currentPrice = currentPrices[p.symbol] || p.entryPrice;
        const dir = p.side === 'LONG' ? 1 : -1;
        const uPnl = (currentPrice - p.entryPrice) * p.quantity * dir;
        totalUnrealized += uPnl;
      }
    }

    const totalEquity = this.availableBalance + openPositionsMargin + totalUnrealized;

    return {
      initialBalance: this.initialBalance,
      availableBalance: parseFloat(this.availableBalance.toFixed(4)),
      totalEquity: parseFloat(totalEquity.toFixed(4)),
      unrealizedPnl: parseFloat(totalUnrealized.toFixed(4)),
      totalCommissionsPaid: parseFloat(this.totalCommissionsPaid.toFixed(4)),
      positions: [...this.positions],
      settings: { ...this.settings },
    };
  }
}

export const paperEngine = new PaperEngine();
