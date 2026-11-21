import type {
  KuCoinPosition,
  KuCoinReconciliationDiscrepancy,
  PaperPosition,
} from '../types';
import {
  convertToKuCoinSymbol,
  KUCOIN_FUTURES_SPECS_FALLBACK,
  type KuCoinFuturesContractSpec,
} from './kucoinApi';

export interface KuCoinReconciliationReport {
  isSynced: boolean;
  discrepancies: KuCoinReconciliationDiscrepancy[];
  checkedAt: number;
  summaryAr: string;
}

/**
 * Compares open REAL-mode local positions against actual live KuCoin Futures positions.
 * Flags missing positions, untracked real exchange positions, side mismatches, and >15% contract size divergence.
 */
export function reconcilePaperWithKuCoinPositions(
  paperOpenRealPositions: PaperPosition[],
  kucoinLivePositions: KuCoinPosition[],
  specsMap?: Record<string, KuCoinFuturesContractSpec>
): KuCoinReconciliationReport {
  const discrepancies: KuCoinReconciliationDiscrepancy[] = [];
  const liveBySymbol = new Map<string, KuCoinPosition>();

  for (const kp of kucoinLivePositions || []) {
    if (!kp || !kp.isOpen || !(Math.abs(kp.currentQty) > 0)) continue;
    const sym = kp.symbol.toUpperCase().trim();
    liveBySymbol.set(sym, kp);
  }

  const paperGrouped = new Map<
    string,
    { binanceSymbol: string; side: 'LONG' | 'SHORT'; totalContracts: number; count: number }
  >();

  for (const pos of paperOpenRealPositions || []) {
    if (!pos || pos.status !== 'OPEN') continue;
    const kcSym = convertToKuCoinSymbol(pos.symbol, true);
    const spec =
      specsMap?.[kcSym] ||
      KUCOIN_FUTURES_SPECS_FALLBACK[kcSym] || {
        symbol: kcSym,
        multiplier: pos.entryPrice >= 10_000 ? 0.001 : pos.entryPrice >= 500 ? 0.01 : pos.entryPrice >= 20 ? 0.1 : 1,
        lotSize: 1,
        minOrderQty: 1,
        maxOrderQty: 1_000_000,
      };
    const estContracts = Math.max(1, Math.round(pos.quantity / Math.max(1e-9, spec.multiplier)));
    const prev = paperGrouped.get(kcSym);
    if (!prev) {
      paperGrouped.set(kcSym, {
        binanceSymbol: pos.symbol.toUpperCase(),
        side: pos.side,
        totalContracts: estContracts,
        count: 1,
      });
    } else {
      prev.totalContracts += estContracts;
      prev.count += 1;
    }
  }

  // 1. Check every local REAL-mode open position against KuCoin live positions
  for (const [kcSym, localInfo] of paperGrouped.entries()) {
    const live = liveBySymbol.get(kcSym);
    if (!live) {
      discrepancies.push({
        symbol: localInfo.binanceSymbol,
        kucoinSymbol: kcSym,
        type: 'MISSING_ON_KUCOIN',
        paperSide: localInfo.side,
        paperContracts: localInfo.totalContracts,
        kucoinContracts: 0,
        messageAr: `الصفقة ${localInfo.binanceSymbol} (${localInfo.side}) مفتوحة في التطبيق لكنها غير موجودة فعلياً على KuCoin.`,
      });
      continue;
    }

    if (live.side !== localInfo.side) {
      discrepancies.push({
        symbol: localInfo.binanceSymbol,
        kucoinSymbol: kcSym,
        type: 'SIDE_MISMATCH',
        paperSide: localInfo.side,
        kucoinSide: live.side,
        paperContracts: localInfo.totalContracts,
        kucoinContracts: live.currentQty,
        messageAr: `تعارض في الاتجاه لـ ${localInfo.binanceSymbol}: التطبيق يعرض ${localInfo.side} بينما المركز الحقيقي على KuCoin هو ${live.side}.`,
      });
      continue;
    }

    const diffRatio =
      Math.abs(live.currentQty - localInfo.totalContracts) /
      Math.max(1, live.currentQty, localInfo.totalContracts);
    if (diffRatio > 0.15) {
      discrepancies.push({
        symbol: localInfo.binanceSymbol,
        kucoinSymbol: kcSym,
        type: 'SIZE_MISMATCH',
        paperSide: localInfo.side,
        kucoinSide: live.side,
        paperContracts: localInfo.totalContracts,
        kucoinContracts: live.currentQty,
        messageAr: `اختلاف في حجم العقود لـ ${localInfo.binanceSymbol}: التطبيق يقدّر ${localInfo.totalContracts} عقد بينما الفعلي على KuCoin هو ${live.currentQty} عقد.`,
      });
    }
  }

  // 2. Check for real KuCoin positions that the app is not tracking
  for (const [kcSym, live] of liveBySymbol.entries()) {
    if (!paperGrouped.has(kcSym)) {
      const displaySym = kcSym === 'XBTUSDTM' ? 'BTCUSDT' : kcSym.replace(/USDTM$/, 'USDT');
      discrepancies.push({
        symbol: displaySym,
        kucoinSymbol: kcSym,
        type: 'UNTRACKED_ON_KUCOIN',
        kucoinSide: live.side,
        kucoinContracts: live.currentQty,
        messageAr: `يوجد مركز حقيقي مفتوح على KuCoin (${kcSym} • ${live.side} • ${live.currentQty} عقد) غير مسجل ضمن مراكز التطبيق.`,
      });
    }
  }

  const isSynced = discrepancies.length === 0;
  return {
    isSynced,
    discrepancies,
    checkedAt: Date.now(),
    summaryAr: isSynced
      ? 'جميع المراكز الحقيقية مطابقة تماماً بين التطبيق ومنصة KuCoin.'
      : `تم اكتشاف ${discrepancies.length} اختلاف بين مراكز التطبيق ومراكز KuCoin الفعلية.`,
  };
}

/**
 * Resolves exact KuCoin Futures exit contracts from real live position quantity (never from current tradeValueUsdt)
 * so partial exits don't drift and full exits use KuCoin's atomic `closeOrder: true`.
 */
export function resolveKuCoinExitSizing(params: {
  kucoinSymbol: string;
  isFullExit: boolean;
  exitPercent?: number;
  liveKuCoinPositions?: KuCoinPosition[];
  fallbackBaseQuantity?: number;
  multiplier?: number;
  lotSize?: number;
}): {
  useCloseOrderFlag: boolean;
  exactContracts: number;
  source: 'EXCHANGE_CLOSE_ALL' | 'LIVE_KUCOIN_QTY' | 'POSITION_BASE_QTY';
} {
  const lot = Math.max(1, Math.round(params.lotSize || 1));

  if (params.isFullExit) {
    const livePos = (params.liveKuCoinPositions || []).find(
      (p) => p.isOpen && p.symbol.toUpperCase() === params.kucoinSymbol.toUpperCase() && p.currentQty > 0
    );
    return {
      useCloseOrderFlag: true,
      exactContracts: livePos ? Math.max(lot, Math.round(livePos.currentQty)) : 0,
      source: 'EXCHANGE_CLOSE_ALL',
    };
  }

  const pct = Math.min(100, Math.max(1, Number(params.exitPercent) || 50)) / 100;
  const livePos = (params.liveKuCoinPositions || []).find(
    (p) => p.isOpen && p.symbol.toUpperCase() === params.kucoinSymbol.toUpperCase() && p.currentQty > 0
  );

  if (livePos) {
    const rawClose = livePos.currentQty * pct;
    const floored = Math.floor(rawClose / lot) * lot;
    const contracts = Math.min(livePos.currentQty, Math.max(lot, floored));
    return {
      useCloseOrderFlag: contracts >= livePos.currentQty,
      exactContracts: contracts,
      source: 'LIVE_KUCOIN_QTY',
    };
  }

  const mult = Math.max(1e-9, params.multiplier || 1);
  const totalPosContracts = Math.max(lot, Math.round((params.fallbackBaseQuantity || 0) / mult));
  const rawClose = totalPosContracts * pct;
  const contracts = Math.min(totalPosContracts, Math.max(lot, Math.floor(rawClose / lot) * lot));
  return {
    useCloseOrderFlag: pct >= 0.999,
    exactContracts: contracts,
    source: 'POSITION_BASE_QTY',
  };
}

/**
 * Builds an official KuCoin Futures exchange-native conditional Stop-Loss or Take-Profit order payload
 * (`stopPriceType: 'MP'`, `closeOrder: true`, `reduceOnly: true`) so protection stays active on KuCoin
 * even if the phone disconnects or the app is closed.
 */
export function buildKuCoinStopOrderPayload(params: {
  clientOid: string;
  kucoinSymbol: string;
  positionSide: 'LONG' | 'SHORT';
  kind: 'STOP_LOSS' | 'TAKE_PROFIT';
  triggerPrice: number;
  leverage?: number;
}): Record<string, unknown> {
  const closeSide = params.positionSide === 'LONG' ? 'sell' : 'buy';
  // LONG: SL triggers when mark price drops ('down'); TP triggers when mark price rises ('up')
  // SHORT: SL triggers when mark price rises ('up'); TP triggers when mark price drops ('down')
  const stopDirection: 'up' | 'down' =
    params.positionSide === 'LONG'
      ? params.kind === 'STOP_LOSS'
        ? 'down'
        : 'up'
      : params.kind === 'STOP_LOSS'
      ? 'up'
      : 'down';

  const formattedTrigger =
    params.triggerPrice >= 100
      ? params.triggerPrice.toFixed(2)
      : params.triggerPrice >= 1
      ? params.triggerPrice.toFixed(4)
      : params.triggerPrice.toPrecision(6);

  return {
    clientOid: params.clientOid,
    side: closeSide,
    symbol: params.kucoinSymbol,
    type: 'market',
    stop: stopDirection,
    stopPrice: formattedTrigger,
    stopPriceType: 'MP',
    closeOrder: true,
    reduceOnly: true,
    leverage: String(Math.max(1, Math.round(params.leverage || 5))),
  };
}
