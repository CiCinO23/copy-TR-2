import React, { useState } from 'react';
import {
  CheckCircle2,
  Info,
  Key,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { BinanceConfig, BinanceConnectionState, BinanceEnvironment } from '../types';
import { BINANCE_ENVIRONMENTS } from '../services/binanceApi';

interface BinanceApiTabProps {
  config: BinanceConfig;
  connectionState: BinanceConnectionState;
  onSaveAndTest: (config: BinanceConfig) => void;
  onClearKeys: () => void;
}

export const BinanceApiTab: React.FC<BinanceApiTabProps> = ({
  config,
  connectionState,
  onSaveAndTest,
  onClearKeys,
}) => {
  const [selectedEnv, setSelectedEnv] = useState<BinanceEnvironment>(config.environment);
  const [baseUrl, setBaseUrl] = useState<string>(config.customBaseUrl);
  const [apiKey, setApiKey] = useState<string>(config.apiKey);
  const [apiSecret, setApiSecret] = useState<string>(config.apiSecret);
  const [readOnlyMode, setReadOnlyMode] = useState<boolean>(config.readOnlyMode);
  const [showSecret, setShowSecret] = useState<boolean>(false);

  const handleSelectEnv = (env: BinanceEnvironment) => {
    setSelectedEnv(env);
    setBaseUrl(BINANCE_ENVIRONMENTS[env]?.defaultUrl || '');
  };

  const handleSave = () => {
    onSaveAndTest({
      environment: selectedEnv,
      customBaseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      recvWindow: config.recvWindow || 5000,
      readOnlyMode,
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide">
          إعدادات الربط مع Binance API
        </h2>
        <p className="text-xs sm:text-sm text-[#8A99AD] mt-1 leading-relaxed">
          تمت تهيئة المفاتيح للاتصال بحساب باينانس الحقيقي لجلب الأرصدة والمراكز وتدفقات أسواق العقود الآجلة USDⓈ-M.
        </p>
      </div>

      {/* Connection Status Diagnostics Card */}
      <div
        className={`border rounded-2xl p-4 sm:p-5 transition-all ${
          connectionState.isAuthenticated
            ? 'bg-[#0D2B24] border-[#01BC8D]/40'
            : 'bg-[#1A222B] border-[#232E3A]'
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            {connectionState.isAuthenticated ? (
              <CheckCircle2 className="w-5 h-5 text-[#01BC8D]" />
            ) : (
              <Info className="w-5 h-5 text-[#01BC8D]" />
            )}
            <h3 className="font-bold text-base text-white">حالة الاتصال والتحقق</h3>
          </div>
          {connectionState.isTesting && (
            <div className="flex items-center gap-2 text-xs text-[#01BC8D] font-semibold">
              <span className="w-4 h-4 border-2 border-[#01BC8D] border-t-transparent rounded-full animate-spin" />
              <span>جاري الفحص...</span>
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
          <div className="text-xs text-[#8A99AD] font-mono mb-1">
            زمن الاستجابة (Ping): <strong className="text-white">{connectionState.latencyMs} ms</strong>
          </div>
        )}

        {connectionState.accountUsdtBalance && (
          <div className="text-xs text-[#01BC8D] font-mono font-bold mt-1">
            إجمالي رصيد العقود الآجلة: {connectionState.accountUsdtBalance} (المتاح:{' '}
            {connectionState.accountAvailableBalance || '--'})
          </div>
        )}

        {connectionState.errorMessageAr && (
          <p className="text-xs text-[#F6465D] bg-[#2B1216] p-2.5 rounded-lg border border-[#F6465D]/30 mt-3">
            {connectionState.errorMessageAr}
          </p>
        )}
      </div>

      {/* Environment Selection Card */}
      <div className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 sm:p-5">
        <h3 className="font-bold text-sm text-[#01BC8D] mb-3">1. بيئة الاتصال (Environment)</h3>

        <div className="space-y-2 mb-4">
          {Object.values(BINANCE_ENVIRONMENTS).map((env) => {
            const isSelected = selectedEnv === env.key;
            return (
              <div
                key={env.key}
                data-testid={`env_option_${env.key}`}
                onClick={() => handleSelectEnv(env.key)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                  isSelected
                    ? 'bg-[#1A222B] border-[#01BC8D]'
                    : 'bg-[#12171D] border-[#232E3A] hover:border-[#8A99AD]/50'
                }`}
              >
                <input
                  type="radio"
                  name="env"
                  checked={isSelected}
                  onChange={() => handleSelectEnv(env.key)}
                  className="mt-1 accent-[#01BC8D]"
                />
                <div className="flex-1">
                  <div className="text-xs sm:text-sm font-bold text-white">{env.titleAr}</div>
                  <div className="text-[11px] text-[#8A99AD] mt-0.5">{env.descriptionAr}</div>
                  <div className="text-[11px] text-[#01BC8D]/80 font-mono mt-0.5">{env.defaultUrl}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <label className="block text-xs font-medium text-[#8A99AD] mb-1.5">
            رابط الخادم (Base URL)
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            data-testid="input_base_url"
            dir="ltr"
            className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] focus:outline-none rounded-xl px-3.5 py-2.5 text-xs text-white font-mono transition-colors"
          />
        </div>
      </div>

      {/* API Keys Input Card */}
      <div className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 sm:p-5">
        <h3 className="font-bold text-sm text-[#01BC8D] mb-1">
          2. مفاتيح الربط (Binance API Credentials)
        </h3>
        <p className="text-xs text-[#8A99AD] mb-4">
          تم ملء المفاتيح الخاصة بك بنجاح للربط المباشر مع حسابك.
        </p>

        {/* API Key */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-[#8A99AD] mb-1.5">
            مفتاح API (API Key)
          </label>
          <div className="relative">
            <span className="absolute right-3.5 top-3 text-[#01BC8D]">
              <Key className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              data-testid="input_api_key"
              dir="ltr"
              placeholder="Binance Futures API Key"
              className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] focus:outline-none rounded-xl pr-10 pl-3.5 py-2.5 text-xs text-white font-mono transition-colors"
            />
          </div>
        </div>

        {/* API Secret */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-[#8A99AD] mb-1.5">
            المفتاح السري (Secret Key)
          </label>
          <div className="relative">
            <span className="absolute right-3.5 top-3 text-[#01BC8D]">
              <Lock className="w-4 h-4" />
            </span>
            <input
              type={showSecret ? 'text' : 'password'}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              data-testid="input_api_secret"
              dir="ltr"
              placeholder="Binance Futures API Secret"
              className="w-full bg-[#0B0E11] border border-[#232E3A] focus:border-[#01BC8D] focus:outline-none rounded-xl pr-10 pl-10 py-2.5 text-xs text-white font-mono transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              data-testid="toggle_secret_visibility"
              className="absolute left-3.5 top-3 text-[#8A99AD] hover:text-white"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Read-Only Mode Switch */}
        <div className="flex items-center justify-between py-3 border-t border-[#232E3A] mb-4">
          <div>
            <div className="text-xs sm:text-sm font-semibold text-white">
              وضع القراءة الآمنة فقط (Read-Only)
            </div>
            <div className="text-[11px] text-[#8A99AD]">
              منع إرسال أوامر بيع أو شراء حقيقية من التطبيق للحماية
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={readOnlyMode}
              onChange={(e) => setReadOnlyMode(e.target.checked)}
              data-testid="switch_read_only"
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#232E3A] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#232E3A] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#01BC8D]"></div>
          </label>
        </div>

        {/* Save & Test Button */}
        <button
          onClick={handleSave}
          disabled={connectionState.isTesting}
          data-testid="save_and_test_api_button"
          className="w-full bg-[#01BC8D] hover:bg-[#00D49F] disabled:opacity-50 text-[#0B0E11] font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>
            {connectionState.isTesting
              ? 'جاري فحص الاتصال وتحديث البيانات...'
              : 'حفظ الإعدادات وإعادة اختبار الاتصال بـ باينانس'}
          </span>
        </button>

        {/* Clear keys button */}
        {(apiKey || apiSecret) && (
          <button
            onClick={() => {
              setApiKey('');
              setApiSecret('');
              onClearKeys();
            }}
            className="w-full mt-2 border border-[#F6465D]/40 hover:bg-[#F6465D]/15 text-[#F6465D] font-semibold py-2 px-4 rounded-xl flex items-center justify-center gap-2 text-xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>مسح المفاتيح المحفوظة</span>
          </button>
        )}
      </div>

      {/* Security Best Practices Card */}
      <div className="bg-[#231D18] border border-[#01BC8D]/30 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2 text-[#01BC8D]">
          <ShieldCheck className="w-5 h-5" />
          <h4 className="font-bold text-xs sm:text-sm">إرشادات أمان مفاتيح باينانس</h4>
        </div>
        <ul className="text-xs text-[#8A99AD] space-y-1.5 leading-relaxed">
          <li>• تم قفل التطبيق بوضع القراءة الآمنة (Read-Only) لمنع أي عمليات غير مقصودة.</li>
          <li>• لا تقم مطلقاً بتفعيل صلاحية السحب (Enable Withdrawals) في مفاتيح باينانس.</li>
          <li>• يمكنك التحقق من الرصيد والصفقات وتدفقات الحيتان في أي وقت بالضغط على زر التحديث.</li>
        </ul>
      </div>
    </div>
  );
};
