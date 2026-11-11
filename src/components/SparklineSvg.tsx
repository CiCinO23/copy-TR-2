import React from 'react';
import { Sliders } from 'lucide-react';
import { TradeExecutionSettings } from '../types';

interface SparklineSvgProps {
  points?: number[];
  seedKey: string;
  isPositive: boolean;
  className?: string;
}

export const SparklineSvg: React.FC<SparklineSvgProps> = ({
  points,
  seedKey,
  isPositive,
  className = 'w-24 h-10',
}) => {
  const series = React.useMemo(() => {
    if (points && points.length >= 2) {
      return points;
    }
    let hash = 0;
    for (let i = 0; i < seedKey.length; i++) {
      hash = (hash * 31 + seedKey.charCodeAt(i)) % 10000;
    }
    const generated: number[] = [];
    let current = 50;
    for (let i = 0; i < 12; i++) {
      const step = Math.sin((hash + i * 17) * 0.35) * 8 + (isPositive ? 3.2 : -3.2);
      current += step;
      generated.push(current);
    }
    return generated;
  }, [points, seedKey, isPositive]);

  const minVal = Math.min(...series);
  const maxVal = Math.max(...series);
  const range = Math.max(maxVal - minVal, 1);
  const w = 100;
  const h = 36;

  const coords = series.map((v, idx) => {
    const x = (idx / Math.max(series.length - 1, 1)) * w;
    const y = h - 4 - ((v - minVal) / range) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylinePoints = coords.join(' ');
  const areaPoints = `0,${h} ${polylinePoints} ${w},${h}`;
  const strokeColor = isPositive ? '#01BC8D' : '#F6465D';
  const gradId = `spark_${seedKey.replace(/[^a-zA-Z0-9]/g, '')}_${isPositive ? 'up' : 'dn'}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`${className} overflow-visible shrink-0`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylinePoints}
      />
    </svg>
  );
};

interface QuickTradeBarProps {
  tradeSettings?: TradeExecutionSettings;
  openPositionsCount: number;
  autoCopy?: boolean;
  onAutoCopyChange?: (val: boolean) => void;
  onEditClick: () => void;
}

export const QuickTradeBar: React.FC<QuickTradeBarProps> = ({
  tradeSettings,
  openPositionsCount,
  autoCopy,
  onAutoCopyChange,
  onEditClick,
}) => {
  if (!tradeSettings) return null;

  const isReal = tradeSettings.mode === 'REAL';

  return (
    <div className="bg-[#12171D] border border-[#232E3A] rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-sm">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[#8A99AD]">
        <span className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isReal ? 'bg-[#01BC8D] shadow-[0_0_8px_#01BC8D]' : 'bg-[#00C8FF]'
            }`}
          />
          <span>الوضع:</span>
          <strong className={isReal ? 'text-[#01BC8D]' : 'text-white'}>
            {isReal ? 'حقيقي (KuCoin)' : 'افتراضي'}
          </strong>
        </span>

        <span className="text-[#232E3A]">|</span>

        <span>
          حجم الصفقة:{' '}
          <strong className="text-white font-mono tabular-nums">
            {tradeSettings.tradeValueUsdt}$
          </strong>
        </span>

        <span className="text-[#232E3A]">|</span>

        <span>
          الرافعة:{' '}
          <strong className="text-[#01BC8D] font-mono tabular-nums">
            {tradeSettings.leverage}x
          </strong>
        </span>

        <span className="text-[#232E3A]">|</span>

        <span>
          الصفقات النشطة:{' '}
          <strong className="text-[#01BC8D] font-mono tabular-nums">
            {openPositionsCount}/{tradeSettings.maxConcurrentTrades}
          </strong>
        </span>

        <span className="text-[#232E3A]">|</span>

        <span>
          التدعيم:{' '}
          <strong className="text-[#00C8FF] font-mono tabular-nums">
            {tradeSettings.scaleInSamePercentAsTrader !== false
              ? 'نفس النسبة %'
              : `+${tradeSettings.scaleInFixedValueUsdt ?? 10}$`}
          </strong>
        </span>
      </div>

      <div className="flex items-center gap-2.5 mr-auto sm:mr-0">
        {onAutoCopyChange !== undefined && (
          <label className="flex items-center gap-1.5 cursor-pointer bg-[#0B0E11] border border-[#232E3A] px-2.5 py-1 rounded-lg">
            <input
              type="checkbox"
              checked={Boolean(autoCopy)}
              onChange={(e) => onAutoCopyChange(e.target.checked)}
              className="accent-[#01BC8D] w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-[11px] font-bold text-white">نسخ تلقائي</span>
          </label>
        )}

        <button
          type="button"
          onClick={onEditClick}
          className="bg-[#01BC8D]/15 hover:bg-[#01BC8D] text-[#01BC8D] hover:text-[#0B0E11] border border-[#01BC8D]/40 px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>تعديل سريع</span>
        </button>
      </div>
    </div>
  );
};
