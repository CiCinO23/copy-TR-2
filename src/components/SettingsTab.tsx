import React from 'react';
import { Key, ShieldCheck, BellRing } from 'lucide-react';
import { BinanceConfig, BinanceConnectionState } from '../types';
import { BINANCE_ENVIRONMENTS } from '../services/binanceApi';

interface SettingsTabProps {
  config: BinanceConfig;
  connectionState: BinanceConnectionState;
  onLive: () => void;
  onOpenApiSetup: () => void;
  onOpenNotifications?: () => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  config,
  connectionState,
  onLive,
  onOpenApiSetup,
  onOpenNotifications,
}) => {
  const envInfo = BINANCE_ENVIRONMENTS[config.environment];

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide">
          الإعدادات وإدارة المخاطر
        </h2>
        <p className="text-xs text-[#8A99AD] mt-0.5">
          ضبط معايير الأمان، الربط المباشر، وتفضيلات المحرك وتنبيهات الموبايل
        </p>
      </div>

      {/* Main Settings Card */}
      <div className="bg-[#12171D] border border-[#232E3A] rounded-2xl p-4 sm:p-5 space-y-4">
        <div>
          <div className="text-xs sm:text-sm font-semibold text-white">
            السوق: العقود الآجلة الدائمة USDⓈ-M Futures
          </div>
          <div className="text-xs text-[#01BC8D] mt-0.5">
            البيئة النشطة: {envInfo?.titleAr || config.environment}
          </div>
          <div className="text-xs text-[#8A99AD] mt-0.5">
            حالة الاتصال:{' '}
            <span
              className={
                connectionState.isAuthenticated || connectionState.isConnected
                  ? 'text-[#01BC8D]'
                  : 'text-[#F6465D]'
              }
            >
              {connectionState.statusMessageAr}
            </span>
          </div>
        </div>

        <div className="h-px bg-[#232E3A]" />

        {/* Open Mobile Notifications button */}
        {onOpenNotifications && (
          <button
            onClick={onOpenNotifications}
            data-testid="settings_open_notifications_button"
            className="w-full bg-[#0D2B24] hover:bg-[#01BC8D]/25 border border-[#01BC8D] text-[#01BC8D] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors cursor-pointer"
          >
            <BellRing className="w-4 h-4" />
            <span>إعدادات وسجل تنبيهات الموبايل (فتح صفقات، التدعيم، والخروج)</span>
          </button>
        )}

        {/* Open API setup button */}
        <button
          onClick={onOpenApiSetup}
          data-testid="settings_open_api_button"
          className="w-full bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors cursor-pointer"
        >
          <Key className="w-4 h-4" />
          <span>إدارة ربط المنصات (KuCoin & Binance API)</span>
        </button>

        {/* Review Live Trading button */}
        <button
          onClick={onLive}
          data-testid="settings_live_review_button"
          className="w-full border border-[#01BC8D] hover:bg-[#01BC8D]/15 text-[#01BC8D] font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm transition-colors cursor-pointer"
        >
          مراجعة أمان التداول المباشر (Live Mode)
        </button>

        {/* Notice */}
        <p className="text-[11px] text-[#8A99AD] leading-relaxed pt-2 border-t border-[#232E3A]">
          تنبيه أمني: مفاتيح باينانس تعمل بوضع القراءة فقط (Read-Only) لجلب بيانات السوق والمتداولين، بينما يتم تنفيذ الصفقات عبر حسابك في KuCoin وفق الإعدادات الموحدة في نافذة التداول.
        </p>
      </div>

      {/* Safety Specs */}
      <div className="bg-[#1A222B] border border-[#232E3A] rounded-2xl p-4 space-y-2">
        <h3 className="font-bold text-xs text-[#01BC8D] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          <span>معايير إدارة المخاطر المفروضة</span>
        </h3>
        <div className="text-xs text-[#8A99AD] space-y-1">
          <div>• التحكم الموحد في قيمة الصفقة والرافعة والعمولة من نافذة التداول</div>
          <div>• تنبيهات فورية على الموبايل عند فتح الصفقات، التدعيم، السحب الجزئي، والإغلاق الكامل</div>
          <div>• مراقبة مستمرة للسيولة (Open Interest) قبل تنفيذ أي أمر</div>
          <div>• عدم حفظ المفاتيح في خوادم سحابية خارجية (تخزين محلي آمن في المتصفح فقط)</div>
        </div>
      </div>
    </div>
  );
};
