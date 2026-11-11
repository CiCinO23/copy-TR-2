import React, { useState } from 'react';
import {
  Key,
  CheckCircle2,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  ExternalLink,
  Zap,
  Sliders,
} from 'lucide-react';
import { KuCoinConfig, KuCoinConnectionState } from '../types';

interface KucoinApiTabProps {
  config: KuCoinConfig;
  connectionState: KuCoinConnectionState;
  onSaveAndTest: (config: KuCoinConfig) => void;
  onClearKeys: () => void;
  onRefresh: () => void;
  onOpenSimulationTab?: () => void;
}

export const KucoinApiTab: React.FC<KucoinApiTabProps> = ({
  config,
  connectionState,
  onSaveAndTest,
  onClearKeys,
  onRefresh,
  onOpenSimulationTab,
}) => {
  const [apiKey, setApiKey] = useState<string>(config.apiKey);
  const [apiSecret, setApiSecret] = useState<string>(config.apiSecret);
  const [passphrase, setPassphrase] = useState<string>(config.passphrase);
  const [marketType, setMarketType] = useState<'FUTURES' | 'SPOT'>(config.marketType);
  const [enableLiveExecution, setEnableLiveExecution] = useState<boolean>(
    config.enableLiveExecution
  );

  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [showPassphrase, setShowPassphrase] = useState<boolean>(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveAndTest({
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      passphrase: passphrase.trim(),
      apiType: config.apiType,
      marketType,
      enableLiveExecution,
      defaultLeverage: config.defaultLeverage || 5,
      maxOrderUsdt: config.maxOrderUsdt || 50,
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Title & Architecture Banner */}
      <div className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#01BC8D]/20 text-[#01BC8D] border border-[#01BC8D]/30 flex items-center justify-center font-bold text-base">
                K
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white">
                ربط منصة KuCoin API (تنفيذ الصفقات)
              </h2>
            </div>
            <p className="text-xs text-[#8A99AD] mt-1.5 leading-relaxed">
              منصة <strong className="text-[#01BC8D]">كوكوين (KuCoin)</strong> هي منصة التنفيذ الفعلي لفتح وإغلاق الصفقات وإدارة الرصيد، بينما تُدار إعدادات حجم الصفقة والرافعة والمراكز المفتوحة بشكل موحد من نافذة <strong className="text-white">التداول</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="https://www.kucoin.com/account/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-[#1A222B] hover:bg-[#212C37] text-white border border-[#232E3A] px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors"
            >
              <span>إنشاء مفتاح KuCoin API</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onRefresh}
              disabled={connectionState.isTesting}
              className="text-xs bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${connectionState.isTesting ? 'animate-spin' : ''}`} />
              <span>فحص الاتصال</span>
            </button>
          </div>
        </div>
      </div>

      {/* Connection Diagnostic Card */}
      <div
        className={`border rounded-2xl p-4 sm:p-5 transition-all ${
          connectionState.isAuthenticated
            ? 'bg-[#0D2B24] border-[#01BC8D]/50'
            : connectionState.isConnected
            ? 'bg-[#1A222B] border-[#232E3A]'
            : 'bg-[#2B1216] border-[#F6465D]/40'
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            {connectionState.isAuthenticated ? (
              <CheckCircle2 className="w-5 h-5 text-[#01BC8D]" />
            ) : (
              <Zap className="w-5 h-5 text-[#01BC8D]" />
            )}
            <h3 className="font-bold text-sm sm:text-base text-white">
              حالة الربط مع حسابك في KuCoin
            </h3>
          </div>
          {connectionState.isTesting && (
            <div className="flex items-center gap-2 text-xs text-[#01BC8D] font-semibold">
              <span className="w-4 h-4 border-2 border-[#01BC8D] border-t-transparent rounded-full animate-spin" />
              <span>جاري التحقق من المفاتيح...</span>
            </div>
          )}
        </div>

        <p
          className={`text-xs sm:text-sm font-semibold mb-2 ${
            connectionState.isAuthenticated ? 'text-[#01BC8D]' : 'text-white'
          }`}
        >
          {connectionState.statusMessageAr}
        </p>

        {connectionState.latencyMs !== null && (
          <div className="text-xs text-[#8A99AD] font-mono mb-2">
            زمن استجابة خادم KuCoin: <strong className="text-white">{connectionState.latencyMs} ms</strong>
            {connectionState.serverTimeFormatted && ` • توقيت الخادم: ${connectionState.serverTimeFormatted}`}
          </div>
        )}

        {connectionState.isAuthenticated && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-[#232E3A]/70">
            <div className="bg-[#0B0E11] p-2.5 rounded-xl">
              <span className="text-[10px] text-[#8A99AD] block">رصيد KuCoin المتاح للتداول</span>
              <span className="text-sm sm:text-base font-bold font-mono text-[#01BC8D]">
                {connectionState.availableUsdt.toFixed(2)} USDT
              </span>
            </div>

            <div className="bg-[#0B0E11] p-2.5 rounded-xl">
              <span className="text-[10px] text-[#8A99AD] block">إجمالي رصيد المحفظة</span>
              <span className="text-sm sm:text-base font-bold font-mono text-white">
                {connectionState.usdtBalance.toFixed(2)} USDT
              </span>
            </div>

            <div className="bg-[#0B0E11] p-2.5 rounded-xl col-span-2 sm:col-span-1">
              <span className="text-[10px] text-[#8A99AD] block">مراكز العقود المفتوحة بـ KuCoin</span>
              <span className="text-sm sm:text-base font-bold font-mono text-[#01BC8D]">
                {connectionState.positions.length} مركز مفتوح
              </span>
            </div>
          </div>
        )}

        {connectionState.errorMessageAr && (
          <div className="mt-2 text-xs text-[#F6465D] bg-[#2B1216]/80 p-2.5 rounded-xl border border-[#F6465D]/30">
            {connectionState.errorMessageAr}
          </div>
        )}
      </div>

      {/* API Form */}
      <form onSubmit={handleSave} className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-[#01BC8D] flex items-center gap-2">
            <Key className="w-4 h-4" />
            <span>بيانات مفتاح KuCoin API (API Key, Secret & Passphrase)</span>
          </h3>
          {onOpenSimulationTab && (
            <button
              type="button"
              onClick={onOpenSimulationTab}
              className="text-[11px] text-[#01BC8D] hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>إعدادات الصفقات والمراكز (التداول) ←</span>
            </button>
          )}
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs font-semibold text-white mb-1.5">
            مفتاح API Key (من KuCoin)
          </label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="مثال: 64b8f... (KuCoin API Key)"
            className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
          />
        </div>

        {/* API Secret */}
        <div>
          <label className="block text-xs font-semibold text-white mb-1.5">
            المفتاح السري (API Secret)
          </label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="KuCoin API Secret"
              className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl pr-3.5 pl-10 py-2.5 text-xs text-white font-mono focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute left-3 top-2.5 text-[#8A99AD] hover:text-white"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Passphrase (Mandatory for KuCoin) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-white">
              كلمة مرور المفتاح (API Passphrase)
            </label>
            <span className="text-[10px] text-[#01BC8D]">مطلوبة إلزامياً في KuCoin</span>
          </div>
          <div className="relative">
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="الكلمة التي قمت بتعيينها عند إنشاء المفتاح في كوكوين"
              className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] rounded-xl pr-3.5 pl-10 py-2.5 text-xs text-white font-mono focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassphrase(!showPassphrase)}
              className="absolute left-3 top-2.5 text-[#8A99AD] hover:text-white"
            >
              {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Market Selection */}
        <div>
          <label className="block text-[11px] text-[#8A99AD] mb-1.5">
            سوق التنفيذ المستهدف في KuCoin:
          </label>
          <div className="flex items-center border-b border-[#232E3A]">
            <button
              type="button"
              onClick={() => setMarketType('FUTURES')}
              className={`flex-1 py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                marketType === 'FUTURES'
                  ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                  : 'border-transparent text-[#8A99AD] hover:text-white'
              }`}
            >
              العقود الآجلة (KuCoin Futures)
            </button>
            <button
              type="button"
              onClick={() => setMarketType('SPOT')}
              className={`flex-1 py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                marketType === 'SPOT'
                  ? 'border-[#01BC8D] text-[#01BC8D] bg-[#01BC8D]/5'
                  : 'border-transparent text-[#8A99AD] hover:text-white'
              }`}
            >
              التداول الفوري (KuCoin Spot)
            </button>
          </div>
        </div>

        {/* Live Execution Switch */}
        <div className="bg-[#1A222B] border border-[#232E3A] rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>تفعيل تنفيذ الصفقات الحقيقية في KuCoin</span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                  enableLiveExecution ? 'bg-[#F6465D]/20 text-[#F6465D]' : 'bg-[#0D2B24] text-[#01BC8D]'
                }`}
              >
                {enableLiveExecution ? 'LIVE ORDERS' : 'PAPER / DRY-RUN'}
              </span>
            </div>
            <p className="text-[11px] text-[#8A99AD] mt-0.5">
              عند التفعيل، سيتم إرسال أوامر حقيقية لحساب كوكوين بالحجم والرافعة المحددين في نافذة التداول
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={enableLiveExecution}
              onChange={(e) => setEnableLiveExecution(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#232E3A] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#232E3A] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#01BC8D]"></div>
          </label>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={connectionState.isTesting}
            className="flex-1 bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>حفظ المفاتيح واختبار الاتصال مع كوكوين</span>
          </button>

          {(apiKey.length > 0 || config.apiKey.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setApiKey('');
                setApiSecret('');
                setPassphrase('');
                onClearKeys();
              }}
              className="bg-[#F6465D]/15 hover:bg-[#F6465D]/25 text-[#F6465D] border border-[#F6465D]/40 font-bold p-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              title="مسح مفاتيح KuCoin"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
