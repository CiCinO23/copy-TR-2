import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Activity,
  Repeat,
  Scale,
  Filter,
  RotateCcw,
  Plus,
  X,
} from 'lucide-react';
import { TradeExecutionSettings } from '../types';
import { normalizeFilterSymbol } from '../services/proRiskAndAnalytics';

interface ProRiskSettingsPanelProps {
  settings: TradeExecutionSettings;
  dailyPnlUsdt: number;
  dailyPnlPercent: number;
  isDailyCircuitBreakerTripped: boolean;
  onUpdateSettings: (partial: Partial<TradeExecutionSettings>) => void;
}

export const ProRiskSettingsPanel: React.FC<ProRiskSettingsPanelProps> = React.memo(
  ({
    settings,
    dailyPnlUsdt,
    dailyPnlPercent,
    isDailyCircuitBreakerTripped,
    onUpdateSettings,
  }) => {
    const [whitelistInput, setWhitelistInput] = useState('');
    const [blacklistInput, setBlacklistInput] = useState('');

    const allowedSymbols = settings.allowedSymbols || [];
    const blockedSymbols = settings.blockedSymbols || [];

    const handleAddWhitelist = () => {
      const sym = normalizeFilterSymbol(whitelistInput);
      if (!sym) return;
      if (!allowedSymbols.includes(sym)) {
        onUpdateSettings({
          allowedSymbols: [...allowedSymbols, sym],
          blockedSymbols: blockedSymbols.filter((s) => s !== sym),
        });
      }
      setWhitelistInput('');
    };

    const handleAddBlacklist = () => {
      const sym = normalizeFilterSymbol(blacklistInput);
      if (!sym) return;
      if (!blockedSymbols.includes(sym)) {
        onUpdateSettings({
          blockedSymbols: [...blockedSymbols, sym],
          allowedSymbols: allowedSymbols.filter((s) => s !== sym),
        });
      }
      setBlacklistInput('');
    };

    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                محرك إدارة المخاطر والنسخ الذكي (Pro Risk Engine)
              </h3>
              <p className="text-[11px] text-slate-400">
                وقف خسارة متحرك، حارس الانزلاق، قاطع الخسارة اليومية، فلاتر العملات والنسخ النسبي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                isDailyCircuitBreakerTripped
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : dailyPnlUsdt >= 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              <span>نتيجة اليوم:</span>
              <span className="font-mono" dir="ltr">
                {dailyPnlUsdt >= 0 ? '+' : ''}
                {dailyPnlUsdt.toFixed(2)} USDT ({dailyPnlPercent >= 0 ? '+' : ''}
                {dailyPnlPercent.toFixed(2)}%)
              </span>
            </div>

            {isDailyCircuitBreakerTripped && (
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    dailyCircuitBreakerPaused: false,
                    dailyLossLimitPercent: 0,
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>فك الإيقاف اليومي</span>
              </button>
            )}
          </div>
        </div>

        {isDailyCircuitBreakerTripped && (
          <div className="bg-rose-500/10 border border-rose-500/35 rounded-xl p-3 flex items-center gap-2.5 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              قاطع الخسارة اليومية (Daily Circuit Breaker) مفعّل حالياً — تم إيقاف فتح أي صفقات نسخ جديدة لحماية رأس المال مع استمرار إدارة الصفقات المفتوحة وإغلاقها بشكل طبيعي.
            </span>
          </div>
        )}

        {/* Numeric Risk Guards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1.5">
            <label
              htmlFor="pro-trailing-stop-input"
              className="text-xs font-bold text-slate-200 flex items-center gap-1.5"
            >
              <Activity className="w-3.5 h-3.5 text-sky-400" />
              <span>وقف الخسارة المتحرك الافتراضي (%)</span>
            </label>
            <input
              id="pro-trailing-stop-input"
              type="number"
              min={0}
              max={50}
              step={0.1}
              dir="ltr"
              value={settings.trailingStopPercent ?? 0}
              onChange={(e) =>
                onUpdateSettings({
                  trailingStopPercent: Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:border-sky-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400">
              0 = معطّل. يلاحق السعر باتجاه الربح ويرفع وقف الخسارة تلقائياً.
            </p>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1.5">
            <label
              htmlFor="pro-max-slippage-input"
              className="text-xs font-bold text-slate-200 flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>أقصى انزلاق سعري للنسخ (%)</span>
            </label>
            <input
              id="pro-max-slippage-input"
              type="number"
              min={0}
              max={25}
              step={0.1}
              dir="ltr"
              value={settings.maxSlippagePercent ?? 0}
              onChange={(e) =>
                onUpdateSettings({
                  maxSlippagePercent: Math.max(0, Math.min(25, Number(e.target.value) || 0)),
                })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:border-amber-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400">
              0 = بدون حد. يرفض النسخ إذا ابتعد السعر ضدك أكثر من هذه النسبة.
            </p>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1.5">
            <label
              htmlFor="pro-daily-loss-input"
              className="text-xs font-bold text-slate-200 flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>قاطع الخسارة اليومية (%)</span>
            </label>
            <input
              id="pro-daily-loss-input"
              type="number"
              min={0}
              max={100}
              step={0.5}
              dir="ltr"
              value={settings.dailyLossLimitPercent ?? 0}
              onChange={(e) =>
                onUpdateSettings({
                  dailyLossLimitPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                })
              }
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:border-rose-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400">
              0 = معطّل. يوقف النسخ تلقائياً لبقية اليوم عند بلوغ نسبة الخسارة.
            </p>
          </div>
        </div>

        {/* Smart Copy Toggles: Reverse Copy & Proportional Sizing */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Repeat className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-bold text-white">وضع النسخ العكسي (Reverse Copy)</div>
                <div className="text-[11px] text-slate-400">
                  عكس اتجاه صفقات المتداول تلقائياً (شراء ⇄ بيع)
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(settings.reverseCopyMode)}
              aria-label="تفعيل وضع النسخ العكسي"
              onClick={() => onUpdateSettings({ reverseCopyMode: !settings.reverseCopyMode })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                settings.reverseCopyMode
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-200'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {settings.reverseCopyMode ? 'مفعّل' : 'معطّل'}
            </button>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Scale className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-white">النسخ النسبي (Proportional Sizing)</div>
                  <div className="text-[11px] text-slate-400">
                    ضبط هامش الصفقة نسبياً حسب حجم المتداول ورصيدك
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(settings.proportionalCopyMode)}
                aria-label="تفعيل النسخ النسبي"
                onClick={() =>
                  onUpdateSettings({ proportionalCopyMode: !settings.proportionalCopyMode })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer shrink-0 ${
                  settings.proportionalCopyMode
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {settings.proportionalCopyMode ? 'مفعّل' : 'معطّل'}
              </button>
            </div>
            {settings.proportionalCopyMode && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <label htmlFor="pro-prop-mult" className="text-[11px] text-slate-300">
                  معامل المضاعفة النسبية (Multiplier):
                </label>
                <input
                  id="pro-prop-mult"
                  type="number"
                  min={0.1}
                  max={3}
                  step={0.1}
                  dir="ltr"
                  value={settings.proportionalCopyMultiplier ?? 1}
                  onChange={(e) =>
                    onUpdateSettings({
                      proportionalCopyMultiplier: Math.max(
                        0.1,
                        Math.min(3, Number(e.target.value) || 1)
                      ),
                    })
                  }
                  className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white text-center"
                />
              </div>
            )}
          </div>
        </div>

        {/* Symbol Whitelist & Blacklist Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Whitelist */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              <span>قائمة السماح بالعملات (Whitelist — فارغة = الكل)</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                dir="ltr"
                value={whitelistInput}
                onChange={(e) => setWhitelistInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddWhitelist()}
                placeholder="مثال: BTC أو ETHUSDT"
                aria-label="إضافة عملة إلى قائمة السماح"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddWhitelist}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة</span>
              </button>
            </div>
            {allowedSymbols.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allowedSymbols.map((sym) => (
                  <span
                    key={sym}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 text-[11px] font-mono"
                    dir="ltr"
                  >
                    {sym}
                    <button
                      type="button"
                      aria-label={`إزالة ${sym} من قائمة السماح`}
                      onClick={() =>
                        onUpdateSettings({
                          allowedSymbols: allowedSymbols.filter((s) => s !== sym),
                        })
                      }
                      className="hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Blacklist */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              <span>قائمة حظر العملات (Blacklist)</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                dir="ltr"
                value={blacklistInput}
                onChange={(e) => setBlacklistInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddBlacklist()}
                placeholder="مثال: PEPE أو MEMEUSDT"
                aria-label="إضافة عملة إلى قائمة الحظر"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:border-rose-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddBlacklist}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>حظر</span>
              </button>
            </div>
            {blockedSymbols.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {blockedSymbols.map((sym) => (
                  <span
                    key={sym}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-200 border border-rose-500/30 text-[11px] font-mono"
                    dir="ltr"
                  >
                    {sym}
                    <button
                      type="button"
                      aria-label={`إزالة ${sym} من قائمة الحظر`}
                      onClick={() =>
                        onUpdateSettings({
                          blockedSymbols: blockedSymbols.filter((s) => s !== sym),
                        })
                      }
                      className="hover:text-white cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

ProRiskSettingsPanel.displayName = 'ProRiskSettingsPanel';
