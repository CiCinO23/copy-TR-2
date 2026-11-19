import { PaperPosition, TradeExecutionSettings } from '../types';
import { formatDateTimeWestern } from '../utils/formatters';

export interface TrailingStopUpdateResult {
  updated: boolean;
  stopLossPrice?: number;
  highestPriceSinceOpen?: number;
  lowestPriceSinceOpen?: number;
}

export interface SlippageGuardResult {
  allowed: boolean;
  unfavorableSlippagePercent: number;
  reasonAr?: string;
}

export interface DailyCircuitBreakerResult {
  tripped: boolean;
  dailyRealizedPnlUsdt: number;
  totalDailyPnlUsdt: number;
  dailyPnlPercent: number;
  dailyLossPercent: number;
  tradesClosedToday: number;
  reasonAr?: string;
}

export interface SymbolFilterResult {
  allowed: boolean;
  reasonAr?: string;
}

export interface TraderQualityScoreResult {
  score: number; // 0 - 100
  gradeAr: string;
  tier: 'ELITE' | 'STRONG' | 'MODERATE' | 'HIGH_RISK';
}

export interface EquityCurvePoint {
  index: number;
  timestamp: number;
  label: string;
  equity: number;
  pnlDelta: number;
  symbol?: string;
}

export interface TraderPerformanceRow {
  traderName: string;
  sourceType: 'COPY_TRADING' | 'SMART_MONEY' | 'MANUAL';
  tradesCount: number;
  winCount: number;
  lossCount: number;
  winRatePercent: number;
  netPnlUsdt: number;
  totalCommissionUsdt: number;
}

export interface ProAccountAnalytics {
  totalClosedTrades: number;
  winCount: number;
  lossCount: number;
  winRatePercent: number;
  totalRealizedPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null; // null if no losses yet and profit > 0 (displayed as ∞)
  avgWinUsdt: number;
  avgLossUsdt: number;
  expectancyUsdt: number;
  maxDrawdownPercent: number;
  bestSymbol: { symbol: string; pnl: number } | null;
  worstSymbol: { symbol: string; pnl: number } | null;
  equityCurve: EquityCurvePoint[];
  traderLeaderboard: TraderPerformanceRow[];
}

/**
 * Computes approximate isolated-margin liquidation price for a leveraged futures position.
 * Uses standard 0.5% maintenance margin rate (MMR) buffer.
 */
export function calculateLiquidationPrice(
  entryPrice: number,
  leverage: number,
  side: 'LONG' | 'SHORT',
  maintenanceMarginRate: number = 0.005
): number {
  const safeEntry = Math.max(0, Number(entryPrice) || 0);
  const safeLev = Math.max(1, Number(leverage) || 1);
  if (safeEntry <= 0) return 0;

  const moveFraction = Math.max(0.002, 1 / safeLev - maintenanceMarginRate);
  if (side === 'LONG') {
    return Number(Math.max(0.0000001, safeEntry * (1 - moveFraction)).toPrecision(7));
  }
  return Number((safeEntry * (1 + moveFraction)).toPrecision(7));
}

/**
 * Evaluates whether a position's Trailing Stop-Loss should ratchet favorably based on current market price.
 * Strictly one-way ratchet: LONG SL only moves UP, SHORT SL only moves DOWN.
 */
export function updateTrailingStopForPosition(
  position: Pick<
    PaperPosition,
    'side' | 'entryPrice' | 'stopLossPrice' | 'trailingStopPercent' | 'highestPriceSinceOpen' | 'lowestPriceSinceOpen'
  >,
  currentPrice: number
): TrailingStopUpdateResult {
  const trailPct = Number(position.trailingStopPercent || 0);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || trailPct <= 0) {
    return {
      updated: false,
      stopLossPrice: position.stopLossPrice,
      highestPriceSinceOpen: position.highestPriceSinceOpen,
      lowestPriceSinceOpen: position.lowestPriceSinceOpen,
    };
  }

  const clampedPct = Math.min(50, Math.max(0.1, trailPct));
  let updated = false;
  let nextStop = position.stopLossPrice;
  let highest = position.highestPriceSinceOpen ?? position.entryPrice;
  let lowest = position.lowestPriceSinceOpen ?? position.entryPrice;

  if (position.side === 'LONG') {
    if (currentPrice > highest) {
      highest = currentPrice;
      updated = true;
    }
    const candidateSl = Number((highest * (1 - clampedPct / 100)).toPrecision(7));
    if (nextStop === undefined || nextStop <= 0 || candidateSl > nextStop) {
      nextStop = candidateSl;
      updated = true;
    }
  } else {
    if (currentPrice < lowest) {
      lowest = currentPrice;
      updated = true;
    }
    const candidateSl = Number((lowest * (1 + clampedPct / 100)).toPrecision(7));
    if (nextStop === undefined || nextStop <= 0 || candidateSl < nextStop) {
      nextStop = candidateSl;
      updated = true;
    }
  }

  return {
    updated,
    stopLossPrice: nextStop,
    highestPriceSinceOpen: highest,
    lowestPriceSinceOpen: lowest,
  };
}

/**
 * Evaluates Max Slippage Guard before copying a trader's position.
 * Only blocks when market moved UNFAVORABLY beyond `maxSlippagePercent`.
 * Favorable price improvements (better entry than trader) are always allowed.
 */
export function evaluateCopySlippageGuard(
  traderEntryPrice: number,
  currentMarketPrice: number,
  side: 'LONG' | 'SHORT',
  maxSlippagePercent?: number
): SlippageGuardResult {
  const limit = Number(maxSlippagePercent || 0);
  if (
    !Number.isFinite(traderEntryPrice) ||
    traderEntryPrice <= 0 ||
    !Number.isFinite(currentMarketPrice) ||
    currentMarketPrice <= 0
  ) {
    return { allowed: true, unfavorableSlippagePercent: 0 };
  }

  const rawUnfavorable =
    side === 'LONG'
      ? ((currentMarketPrice - traderEntryPrice) / traderEntryPrice) * 100
      : ((traderEntryPrice - currentMarketPrice) / traderEntryPrice) * 100;

  const unfavorableSlippagePercent = Number(Math.max(0, rawUnfavorable).toFixed(3));

  if (limit > 0 && unfavorableSlippagePercent > limit) {
    return {
      allowed: false,
      unfavorableSlippagePercent,
      reasonAr: `تم تجاوز الحد الأقصى للانزلاق السعري (${unfavorableSlippagePercent.toFixed(2)}% > ${limit}%)`,
    };
  }

  return {
    allowed: true,
    unfavorableSlippagePercent,
  };
}

/**
 * Evaluates daily account PNL (UTC day) and checks Daily Loss Circuit Breaker.
 */
export function evaluateDailyLossCircuitBreaker(params: {
  positions: PaperPosition[];
  unrealizedPnlUsdt: number;
  initialBalance: number;
  dailyLossLimitPercent?: number;
  manualCircuitBreakerPaused?: boolean;
  nowMs?: number;
}): DailyCircuitBreakerResult {
  const nowMs = params.nowMs ?? Date.now();
  const startOfDay = new Date(nowMs);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayMs = startOfDay.getTime();

  let dailyRealizedPnlUsdt = 0;
  let tradesClosedToday = 0;

  for (const pos of params.positions) {
    if (pos.status === 'CLOSED' && (pos.closeTime || 0) >= startOfDayMs) {
      dailyRealizedPnlUsdt += Number(pos.realizedPnl || 0);
      tradesClosedToday += 1;
    }
  }

  const totalDailyPnlUsdt = Number((dailyRealizedPnlUsdt + (params.unrealizedPnlUsdt || 0)).toFixed(2));
  const baseCapital = Math.max(1, Number(params.initialBalance) || 1000);
  const dailyPnlPercent = Number(((totalDailyPnlUsdt / baseCapital) * 100).toFixed(2));
  const dailyLossPercent = totalDailyPnlUsdt < 0 ? Number((Math.abs(totalDailyPnlUsdt) / baseCapital * 100).toFixed(2)) : 0;

  const limitPct = Math.max(0, Number(params.dailyLossLimitPercent || 0));

  if (params.manualCircuitBreakerPaused) {
    return {
      tripped: true,
      dailyRealizedPnlUsdt: Number(dailyRealizedPnlUsdt.toFixed(2)),
      totalDailyPnlUsdt,
      dailyPnlPercent,
      dailyLossPercent,
      tradesClosedToday,
      reasonAr: 'تم إيقاف النسخ مؤقتاً عبر قاطع الدائرة اليومي — يمكنك إعادة التفعيل من إعدادات المخاطر.',
    };
  }

  if (limitPct > 0 && dailyLossPercent >= limitPct) {
    return {
      tripped: true,
      dailyRealizedPnlUsdt: Number(dailyRealizedPnlUsdt.toFixed(2)),
      totalDailyPnlUsdt,
      dailyPnlPercent,
      dailyLossPercent,
      tradesClosedToday,
      reasonAr: `تفعيل قاطع الخسارة اليومية: بلغت خسارة اليوم ${dailyLossPercent.toFixed(2)}% (الحد الأقصى ${limitPct}%)`,
    };
  }

  return {
    tripped: false,
    dailyRealizedPnlUsdt: Number(dailyRealizedPnlUsdt.toFixed(2)),
    totalDailyPnlUsdt,
    dailyPnlPercent,
    dailyLossPercent,
    tradesClosedToday,
  };
}

/**
 * Normalizes a symbol token for whitelist/blacklist matching (accepts BTC or BTCUSDT).
 */
export function normalizeFilterSymbol(raw: string): string {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  if (!clean) return '';
  return clean.endsWith('USDT') ? clean : `${clean}USDT`;
}

/**
 * Checks if a symbol is allowed by Whitelist (allowedSymbols) and Blacklist (blockedSymbols).
 */
export function isSymbolAllowedByFilter(
  symbol: string,
  allowedSymbols?: string[],
  blockedSymbols?: string[]
): SymbolFilterResult {
  const target = normalizeFilterSymbol(symbol);
  if (!target) return { allowed: false, reasonAr: 'رمز عملة غير صالح' };

  const blockedSet = new Set(
    (blockedSymbols || []).map(normalizeFilterSymbol).filter(Boolean)
  );
  if (blockedSet.has(target)) {
    return {
      allowed: false,
      reasonAr: `العملة ${target} محظورة ضمن القائمة السوداء (Blacklist)`,
    };
  }

  const allowedList = (allowedSymbols || []).map(normalizeFilterSymbol).filter(Boolean);
  if (allowedList.length > 0 && !allowedList.includes(target)) {
    return {
      allowed: false,
      reasonAr: `العملة ${target} غير مدرجة ضمن القائمة البيضاء المسموح بنسخها (Whitelist)`,
    };
  }

  return { allowed: true };
}

/**
 * Resolves the effective side when Reverse Copy (Anti-Copy) is enabled or disabled.
 */
export function resolveEffectiveCopySide(
  sourceSide: 'LONG' | 'SHORT',
  reverseCopyMode?: boolean
): 'LONG' | 'SHORT' {
  if (!reverseCopyMode) return sourceSide;
  return sourceSide === 'LONG' ? 'SHORT' : 'LONG';
}

/**
 * Calculates margin in USDT when Proportional Sizing is enabled vs Fixed User Trade Value.
 */
export function calculateProportionalCopyMargin(params: {
  settings: Pick<
    TradeExecutionSettings,
    'tradeValueUsdt' | 'proportionalCopyMode' | 'proportionalCopyMultiplier'
  >;
  traderNotionalUsdt?: number;
  traderLeverage?: number;
  traderReferenceEquityUsdt?: number;
  userAccountEquityUsdt: number;
  availableBalanceUsdt: number;
}): number {
  const baseMargin = Math.max(5, Number(params.settings.tradeValueUsdt) || 25);
  if (!params.settings.proportionalCopyMode) {
    return Math.min(baseMargin, Math.max(5, params.availableBalanceUsdt));
  }

  const traderNotional = Math.max(0, Number(params.traderNotionalUsdt || 0));
  const traderLev = Math.max(1, Number(params.traderLeverage || 10));
  const traderMargin = traderNotional > 0 ? traderNotional / traderLev : 0;
  const traderRefEquity = Math.max(1000, Number(params.traderReferenceEquityUsdt || 50000));

  if (traderMargin <= 0 || params.userAccountEquityUsdt <= 0) {
    return Math.min(baseMargin, Math.max(5, params.availableBalanceUsdt));
  }

  const traderAllocationRatio = Math.min(0.35, Math.max(0.01, traderMargin / traderRefEquity));
  const multiplier = Math.min(3, Math.max(0.1, Number(params.settings.proportionalCopyMultiplier ?? 1)));
  const proportionalMargin = params.userAccountEquityUsdt * traderAllocationRatio * multiplier;

  // Clamp safely between 5 USDT and 40% of available balance
  const maxSafe = Math.max(5, params.availableBalanceUsdt * 0.4);
  return Number(Math.min(maxSafe, Math.max(5, proportionalMargin)).toFixed(2));
}

/**
 * Institutional 0-100 Trader Quality Score combining Win Rate, ROI/MDD ratio,
 * Sharpe Ratio, Active Consistency (leadingDays), and Net Profit stability.
 */
export function calculateTraderQualityScore(metrics: {
  roi: number; // percentage e.g. 85.4 or decimal 0.854 (caller should pass percentage; if abs<=3 & winRate<=1 handled smartly)
  winRate: number; // 0-100
  mdd: number; // 0-100 positive percentage (drawdown)
  sharpRatio?: number | null;
  leadingDays?: number;
  pnl?: number;
}): TraderQualityScoreResult {
  const roiPct = Number.isFinite(metrics.roi) ? metrics.roi : 0;
  const winRatePct = Math.min(100, Math.max(0, Number.isFinite(metrics.winRate) ? metrics.winRate : 50));
  const mddPct = Math.min(100, Math.max(0, Math.abs(Number.isFinite(metrics.mdd) ? metrics.mdd : 15)));
  const sharpe = metrics.sharpRatio !== null && metrics.sharpRatio !== undefined && Number.isFinite(metrics.sharpRatio)
    ? metrics.sharpRatio
    : 1.2;
  const days = Math.max(1, Number(metrics.leadingDays || 30));
  const pnl = Number(metrics.pnl || 0);

  // 1. Win Rate component (0..28)
  const winScore = Math.min(28, Math.max(0, ((winRatePct - 35) / 55) * 28));

  // 2. Risk-adjusted ROI / MDD component (0..32)
  const effectiveMdd = Math.max(4, mddPct);
  const calmarLike = roiPct / effectiveMdd;
  const roiScore = Math.min(32, Math.max(0, (calmarLike / 6) * 32));

  // 3. Drawdown discipline penalty/bonus (0..18)
  const mddScore = Math.min(18, Math.max(0, ((45 - mddPct) / 40) * 18));

  // 4. Sharpe ratio (0..12)
  const sharpeScore = Math.min(12, Math.max(0, (sharpe / 4) * 12));

  // 5. Experience & Positive PnL consistency (0..10)
  const daysScore = Math.min(6, (days / 90) * 6);
  const pnlBonus = pnl > 0 ? 4 : pnl < 0 ? 0 : 2;

  const rawTotal = winScore + roiScore + mddScore + sharpeScore + daysScore + pnlBonus;
  const score = Math.round(Math.min(100, Math.max(5, rawTotal)));

  if (score >= 82) {
    return { score, gradeAr: 'نخبة مؤسسية', tier: 'ELITE' };
  }
  if (score >= 66) {
    return { score, gradeAr: 'أداء قوي', tier: 'STRONG' };
  }
  if (score >= 48) {
    return { score, gradeAr: 'متوازن', tier: 'MODERATE' };
  }
  return { score, gradeAr: 'مخاطرة عالية', tier: 'HIGH_RISK' };
}

/**
 * Computes comprehensive professional account analytics:
 * Equity Curve, Profit Factor, Win Rate, Avg Win/Loss, Expectancy, Max Drawdown,
 * Best/Worst Symbol, and Per-Trader PNL Leaderboard.
 */
export function computeProAccountAnalytics(
  positions: PaperPosition[],
  initialBalance: number,
  currentEquity: number
): ProAccountAnalytics {
  const safeInitial = Math.max(1, Number(initialBalance) || 1000);
  const closed = positions
    .filter((p) => p.status === 'CLOSED')
    .sort((a, b) => (a.closeTime || a.openTime || 0) - (b.closeTime || b.openTime || 0));

  let winCount = 0;
  let lossCount = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalRealizedPnl = 0;

  const symbolPnlMap = new Map<string, number>();
  const traderMap = new Map<string, TraderPerformanceRow>();

  const equityCurve: EquityCurvePoint[] = [
    {
      index: 0,
      timestamp: closed.length > 0 ? Math.max(0, (closed[0].openTime || Date.now()) - 60_000) : Date.now(),
      label: 'البداية',
      equity: Number(safeInitial.toFixed(2)),
      pnlDelta: 0,
    },
  ];

  let runningEquity = safeInitial;
  let peakEquity = safeInitial;
  let maxDrawdownPercent = 0;

  closed.forEach((pos, idx) => {
    const pnl = Number(pos.realizedPnl || 0);
    totalRealizedPnl += pnl;

    if (pnl >= 0) {
      winCount += 1;
      grossProfit += pnl;
    } else {
      lossCount += 1;
      grossLoss += Math.abs(pnl);
    }

    // Equity curve & peak drawdown tracking
    runningEquity = Math.max(0, runningEquity + pnl);
    if (runningEquity > peakEquity) peakEquity = runningEquity;
    const ddPct = peakEquity > 0 ? ((peakEquity - runningEquity) / peakEquity) * 100 : 0;
    if (ddPct > maxDrawdownPercent) maxDrawdownPercent = ddPct;

    const ts = pos.closeTime || pos.openTime || Date.now();
    equityCurve.push({
      index: idx + 1,
      timestamp: ts,
      label: `#${idx + 1} ${pos.symbol.replace('USDT', '')}`,
      equity: Number(runningEquity.toFixed(2)),
      pnlDelta: Number(pnl.toFixed(2)),
      symbol: pos.symbol,
    });

    // Per-symbol aggregation
    symbolPnlMap.set(pos.symbol, (symbolPnlMap.get(pos.symbol) || 0) + pnl);

    // Per-trader leaderboard aggregation
    const tName = pos.sourceTraderName || (pos.sourceType === 'MANUAL' ? 'تداول يدوي' : 'متداول غير محدد');
    const existing = traderMap.get(tName) || {
      traderName: tName,
      sourceType: pos.sourceType || 'MANUAL',
      tradesCount: 0,
      winCount: 0,
      lossCount: 0,
      winRatePercent: 0,
      netPnlUsdt: 0,
      totalCommissionUsdt: 0,
    };
    existing.tradesCount += 1;
    if (pnl >= 0) existing.winCount += 1;
    else existing.lossCount += 1;
    existing.netPnlUsdt = Number((existing.netPnlUsdt + pnl).toFixed(2));
    existing.totalCommissionUsdt = Number(
      (existing.totalCommissionUsdt + Number(pos.commissionUsdt || 0)).toFixed(2)
    );
    existing.winRatePercent = Number(((existing.winCount / existing.tradesCount) * 100).toFixed(1));
    traderMap.set(tName, existing);
  });

  // Append current live equity point if different from last realized equity
  if (Math.abs(currentEquity - runningEquity) > 0.01) {
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const liveDd = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
    if (liveDd > maxDrawdownPercent) maxDrawdownPercent = liveDd;
    equityCurve.push({
      index: equityCurve.length,
      timestamp: Date.now(),
      label: 'الآن',
      equity: Number(currentEquity.toFixed(2)),
      pnlDelta: Number((currentEquity - runningEquity).toFixed(2)),
    });
  }

  let bestSymbol: { symbol: string; pnl: number } | null = null;
  let worstSymbol: { symbol: string; pnl: number } | null = null;
  for (const [symbol, pnl] of symbolPnlMap.entries()) {
    const rounded = Number(pnl.toFixed(2));
    if (!bestSymbol || rounded > bestSymbol.pnl) bestSymbol = { symbol, pnl: rounded };
    if (!worstSymbol || rounded < worstSymbol.pnl) worstSymbol = { symbol, pnl: rounded };
  }

  const totalClosedTrades = closed.length;
  const winRatePercent = totalClosedTrades > 0 ? Number(((winCount / totalClosedTrades) * 100).toFixed(1)) : 0;
  const avgWinUsdt = winCount > 0 ? Number((grossProfit / winCount).toFixed(2)) : 0;
  const avgLossUsdt = lossCount > 0 ? Number((grossLoss / lossCount).toFixed(2)) : 0;
  const profitFactor =
    grossLoss > 0
      ? Number((grossProfit / grossLoss).toFixed(2))
      : grossProfit > 0
      ? null
      : 0;
  const expectancyUsdt =
    totalClosedTrades > 0 ? Number((totalRealizedPnl / totalClosedTrades).toFixed(2)) : 0;

  const traderLeaderboard = Array.from(traderMap.values()).sort(
    (a, b) => b.netPnlUsdt - a.netPnlUsdt
  );

  return {
    totalClosedTrades,
    winCount,
    lossCount,
    winRatePercent,
    totalRealizedPnl: Number(totalRealizedPnl.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    profitFactor,
    avgWinUsdt,
    avgLossUsdt,
    expectancyUsdt,
    maxDrawdownPercent: Number(maxDrawdownPercent.toFixed(2)),
    bestSymbol,
    worstSymbol,
    equityCurve,
    traderLeaderboard,
  };
}

/**
 * Generates a UTF-8 BOM CSV string of trading history for Excel / Google Sheets export.
 */
export function exportPositionsToCsv(positions: PaperPosition[]): string {
  const headers = [
    'ID',
    'Symbol',
    'Side',
    'Status',
    'Source',
    'Trader',
    'Leverage',
    'Margin_USDT',
    'Quantity',
    'Entry_Price',
    'Exit_Price',
    'Stop_Loss',
    'Take_Profit',
    'Trailing_Stop_Pct',
    'Commission_USDT',
    'Realized_PNL_USDT',
    'Close_Reason',
    'Open_Time',
    'Close_Time',
  ];

  const escapeCsv = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = positions.map((p) =>
    [
      p.id,
      p.symbol,
      p.side,
      p.status,
      p.sourceType || 'MANUAL',
      p.sourceTraderName || 'Manual',
      `${p.leverage}x`,
      Number(p.marginUsdt || 0).toFixed(2),
      Number(p.quantity || 0).toFixed(6),
      p.entryPrice,
      p.exitPrice ?? '',
      p.stopLossPrice ?? '',
      p.takeProfitPrice ?? '',
      p.trailingStopPercent ?? '',
      Number(p.commissionUsdt || 0).toFixed(4),
      p.realizedPnl !== undefined ? Number(p.realizedPnl).toFixed(2) : '',
      p.closeReason || '',
      p.openTime ? formatDateTimeWestern(p.openTime) : '',
      p.closeTime ? formatDateTimeWestern(p.closeTime) : '',
    ]
      .map(escapeCsv)
      .join(',')
  );

  // UTF-8 BOM guarantees clean Arabic rendering in Microsoft Excel
  return `\uFEFF${headers.join(',')}\n${rows.join('\n')}`;
}
