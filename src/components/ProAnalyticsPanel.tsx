import React, { useMemo } from 'react';
import { BarChart3, Download, Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { PaperPosition } from '../types';
import { computeProAccountAnalytics, exportPositionsToCsv } from '../services/proRiskAndAnalytics';

interface ProAnalyticsPanelProps {
  positions: PaperPosition[];
  initialBalance: number;
  currentEquity: number;
  accountName: string;
}

export const ProAnalyticsPanel: React.FC<ProAnalyticsPanelProps> = React.memo(
  ({ positions, initialBalance, currentEquity, accountName }) => {
    const analytics = useMemo(
      () => computeProAccountAnalytics(positions, initialBalance, currentEquity),
      [positions, initialBalance, currentEquity]
    );

    const handleDownloadCsv = () => {
      const csv = exportPositionsToCsv(positions);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `CopyTR_${accountName.replace(/\s+/g, '_')}_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    // Build SVG Equity Curve polyline path
    const svgPath = useMemo(() => {
      const pts = analytics.equityCurve;
      if (pts.length < 2) return null;
      const width = 560;
      const height = 130;
      const padX = 12;
      const padY = 14;
      const values = pts.map((p) => p.equity);
      const minV = Math.min(...values);
      const maxV = Math.max(...values);
      const range = Math.max(1, maxV - minV);

      const coords = pts.map((p, idx) => {
        const x = padX + (idx / Math.max(1, pts.length - 1)) * (width - padX * 2);
        const y = height - padY - ((p.equity - minV) / range) * (height - padY * 2);
        return { x, y };
      });

      const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
      const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${(height - padY).toFixed(1)} L${coords[0].x.toFixed(1)},${(height - padY).toFixed(1)} Z`;
      const isPositive = pts[pts.length - 1].equity >= pts[0].equity;
      return { line, area, isPositive, minV, maxV, width, height };
    }, [analytics.equityCurve]);

    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                التحليلات الاحترافية ومنحنى النمو (Pro Analytics & Equity Curve)
              </h3>
              <p className="text-[11px] text-slate-400">
                معامل الربح، متوسط الربح/الخسارة، أقصى تراجع، وترتيب المتداولين حسب صافي الأرباح
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={positions.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500/15 hover:bg-sky-500/25 disabled:opacity-40 text-sky-300 border border-sky-500/35 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير سجل الصفقات (CSV)</span>
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[10px] text-slate-400">معامل الربح (Profit Factor)</div>
            <div className="text-base font-black font-mono text-white mt-0.5" dir="ltr">
              {analytics.profitFactor === null ? '∞' : analytics.profitFactor.toFixed(2)}
            </div>
          </div>

          <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[10px] text-slate-400">نسبة النجاح (Win Rate)</div>
            <div className="text-base font-black font-mono text-emerald-300 mt-0.5" dir="ltr">
              {analytics.winRatePercent.toFixed(1)}%
              <span className="text-[10px] text-slate-500 ml-1">
                ({analytics.winCount}/{analytics.totalClosedTrades})
              </span>
            </div>
          </div>

          <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[10px] text-slate-400">متوسط الصفقة الرابحة</div>
            <div className="text-base font-black font-mono text-emerald-400 mt-0.5" dir="ltr">
              +${analytics.avgWinUsdt.toFixed(2)}
            </div>
          </div>

          <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[10px] text-slate-400">متوسط الصفقة الخاسرة</div>
            <div className="text-base font-black font-mono text-rose-400 mt-0.5" dir="ltr">
              -${analytics.avgLossUsdt.toFixed(2)}
            </div>
          </div>

          <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[10px] text-slate-400">أقصى تراجع (Max DD)</div>
            <div className="text-base font-black font-mono text-amber-300 mt-0.5" dir="ltr">
              {analytics.maxDrawdownPercent.toFixed(2)}%
            </div>
          </div>

          <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-2.5">
            <div className="text-[10px] text-slate-400">العائد المتوقع / صفقة</div>
            <div
              className={`text-base font-black font-mono mt-0.5 ${
                analytics.expectancyUsdt >= 0 ? 'text-emerald-300' : 'text-rose-400'
              }`}
              dir="ltr"
            >
              {analytics.expectancyUsdt >= 0 ? '+' : ''}
              {analytics.expectancyUsdt.toFixed(2)}$
            </div>
          </div>
        </div>

        {/* SVG Equity Curve */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-bold text-slate-200">منحنى تطور رأس المال (Equity Curve)</span>
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400" dir="ltr">
              <span>Initial: ${initialBalance.toFixed(2)}</span>
              <span className={currentEquity >= initialBalance ? 'text-emerald-400' : 'text-rose-400'}>
                Current: ${currentEquity.toFixed(2)}
              </span>
            </div>
          </div>
          {svgPath ? (
            <svg
              viewBox={`0 0 ${svgPath.width} ${svgPath.height}`}
              className="w-full h-32 overflow-visible"
              role="img"
              aria-label="منحنى تطور رأس المال"
            >
              <defs>
                <linearGradient id="equityGradPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="equityGradNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path
                d={svgPath.area}
                fill={svgPath.isPositive ? 'url(#equityGradPos)' : 'url(#equityGradNeg)'}
              />
              <path
                d={svgPath.line}
                fill="none"
                stroke={svgPath.isPositive ? '#10b981' : '#f43f5e'}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <div className="h-24 flex items-center justify-center text-xs text-slate-500">
              أغلق صفقة واحدة على الأقل لرسم منحنى تطور رأس المال
            </div>
          )}
        </div>

        {/* Best / Worst Symbols + Per-Trader PNL Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="text-xs font-bold text-slate-200">أفضل وأسوأ عملة</div>
            {analytics.bestSymbol ? (
              <div className="flex items-center justify-between text-xs bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-2.5 py-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-300">
                  <TrendingUp className="w-3.5 h-3.5" />
                  {analytics.bestSymbol.symbol}
                </span>
                <span className="font-mono font-bold text-emerald-300" dir="ltr">
                  {analytics.bestSymbol.pnl >= 0 ? '+' : ''}
                  {analytics.bestSymbol.pnl.toFixed(2)} USDT
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-500">لا توجد بيانات كافية بعد</div>
            )}
            {analytics.worstSymbol && (
              <div className="flex items-center justify-between text-xs bg-rose-500/10 border border-rose-500/25 rounded-lg px-2.5 py-2">
                <span className="inline-flex items-center gap-1.5 font-bold text-rose-300">
                  <TrendingDown className="w-3.5 h-3.5" />
                  {analytics.worstSymbol.symbol}
                </span>
                <span className="font-mono font-bold text-rose-300" dir="ltr">
                  {analytics.worstSymbol.pnl >= 0 ? '+' : ''}
                  {analytics.worstSymbol.pnl.toFixed(2)} USDT
                </span>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-slate-950/75 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>أداء المتداولين المنسوخين (Per-Trader Leaderboard)</span>
            </div>
            {analytics.traderLeaderboard.length === 0 ? (
              <div className="text-xs text-slate-500 py-3">
                سيظهر ترتيب المتداولين المنسوخين حسب صافي أرباحهم المحققة هنا بعد إغلاق الصفقات.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="text-[10px] text-slate-400 border-b border-slate-800">
                      <th className="py-1.5 px-2">المصدر / المتداول</th>
                      <th className="py-1.5 px-2 text-center">الصفقات</th>
                      <th className="py-1.5 px-2 text-center">نسبة النجاح</th>
                      <th className="py-1.5 px-2 text-left">صافي الربح (USDT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.traderLeaderboard.slice(0, 6).map((row) => (
                      <tr key={row.traderName} className="border-b border-slate-800/50 last:border-0">
                        <td className="py-1.5 px-2 font-bold text-slate-200">{row.traderName}</td>
                        <td className="py-1.5 px-2 text-center font-mono text-slate-300" dir="ltr">
                          {row.tradesCount}
                        </td>
                        <td className="py-1.5 px-2 text-center font-mono text-sky-300" dir="ltr">
                          {row.winRatePercent.toFixed(1)}%
                        </td>
                        <td
                          className={`py-1.5 px-2 text-left font-mono font-bold ${
                            row.netPnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                          dir="ltr"
                        >
                          {row.netPnlUsdt >= 0 ? '+' : ''}
                          {row.netPnlUsdt.toFixed(2)}$
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ProAnalyticsPanel.displayName = 'ProAnalyticsPanel';
