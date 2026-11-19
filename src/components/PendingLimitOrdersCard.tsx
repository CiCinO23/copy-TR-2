import React from 'react';
import { Clock, XCircle, TrendingUp, TrendingDown, ShieldAlert, Target, Activity } from 'lucide-react';
import { PendingLimitOrder } from '../types';
import { formatDateTimeWestern } from '../utils/formatters';

interface PendingLimitOrdersCardProps {
  orders: PendingLimitOrder[];
  currentPrices: Record<string, number>;
  onCancelOrder: (orderId: string) => void;
  compact?: boolean;
}

export const PendingLimitOrdersCard: React.FC<PendingLimitOrdersCardProps> = React.memo(
  ({ orders, currentPrices, onCancelOrder, compact = false }) => {
    if (!orders || orders.length === 0) return null;

    return (
      <div
        data-testid="pending_limit_orders_card"
        className={`bg-slate-900/80 border border-amber-500/30 rounded-2xl ${
          compact ? 'p-3.5' : 'p-4'
        } space-y-3`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>الأوامر المعلقة (Pending Limit Orders)</span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30" dir="ltr">
                  {orders.length}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                تنتظر ملامسة السعر المحدد ليتم تنفيذها تلقائياً بالسعر المستهدف
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {orders.map((order) => {
            const livePrice =
              currentPrices[order.symbol] || currentPrices[order.symbol.toUpperCase()] || 0;
            const distancePct =
              livePrice > 0
                ? (((order.limitPrice - livePrice) / livePrice) * 100).toFixed(2)
                : null;
            const isLong = order.side === 'LONG';

            return (
              <div
                key={order.id}
                className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between gap-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-white tracking-wide" dir="ltr">
                      {order.symbol}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                        isLong
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {isLong ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {isLong ? 'شراء Limit' : 'بيع Limit'}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[11px] font-bold"
                      dir="ltr"
                    >
                      {order.leverage}x
                    </span>
                  </div>

                  <button
                    type="button"
                    data-testid={`cancel_limit_order_${order.id}`}
                    onClick={() => onCancelOrder(order.id)}
                    aria-label={`إلغاء الأمر المعلق ${order.symbol}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>إلغاء الأمر</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs bg-slate-900/70 rounded-lg p-2 border border-slate-800/80">
                  <div>
                    <div className="text-[10px] text-slate-400">سعر التنفيذ المحدد</div>
                    <div className="font-mono font-bold text-amber-300" dir="ltr">
                      ${order.limitPrice}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">السعر الحالي</div>
                    <div className="font-mono font-bold text-slate-200" dir="ltr">
                      {livePrice > 0 ? `$${livePrice.toFixed(livePrice > 50 ? 2 : 4)}` : '--'}
                      {distancePct !== null && (
                        <span className="text-[10px] text-slate-400 mr-1">
                          ({Number(distancePct) > 0 ? '+' : ''}
                          {distancePct}%)
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">الهامش</div>
                    <div className="font-mono font-bold text-white" dir="ltr">
                      ${order.marginUsdt.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {order.stopLossPrice && (
                      <span className="inline-flex items-center gap-1 text-rose-300" dir="ltr">
                        <ShieldAlert className="w-3 h-3" />
                        SL: ${order.stopLossPrice}
                      </span>
                    )}
                    {order.takeProfitPrice && (
                      <span className="inline-flex items-center gap-1 text-emerald-300" dir="ltr">
                        <Target className="w-3 h-3" />
                        TP: ${order.takeProfitPrice}
                      </span>
                    )}
                    {order.trailingStopPercent && (
                      <span className="inline-flex items-center gap-1 text-sky-300" dir="ltr">
                        <Activity className="w-3 h-3" />
                        Trail: {order.trailingStopPercent}%
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-slate-500" dir="ltr">
                    {formatDateTimeWestern(order.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

PendingLimitOrdersCard.displayName = 'PendingLimitOrdersCard';
