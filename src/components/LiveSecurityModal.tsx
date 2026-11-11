import React from 'react';
import { ShieldAlert, Key, X } from 'lucide-react';

interface LiveSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApiTab: () => void;
}

export const LiveSecurityModal: React.FC<LiveSecurityModalProps> = ({
  isOpen,
  onClose,
  onOpenApiTab,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#12171D] border border-[#01BC8D]/40 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          data-testid="dialog_close_button"
          className="absolute top-4 left-4 p-1 rounded-lg text-[#8A99AD] hover:text-white hover:bg-[#1A222B] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-[#01BC8D]/15 text-[#01BC8D]">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">مراجعة أمان التداول المباشر</h3>
        </div>

        <p className="text-sm text-[#8A99AD] leading-relaxed mb-6">
          حسابك متصل حالياً في وضع القراءة الآمنة (Read-Only) مع باينانس. لتنفيذ صفقات حقيقية، تأكد من ضبط حدود الرافعة المالية ونسب المخاطرة من شاشة الإعدادات، واستخدام مفتاح معتمد ومقيد بعنوان IP.
        </p>

        <div className="bg-[#0B0E11] p-3 rounded-xl border border-[#232E3A] mb-6 text-xs text-[#8A99AD] space-y-1">
          <div className="text-[#01BC8D] font-semibold flex items-center gap-1.5">
            <span>✓</span> وضع الحماية (Read-Only Safety) مفعل افتراضياً
          </div>
          <div className="text-[#01BC8D] font-semibold flex items-center gap-1.5">
            <span>✓</span> منع السحب المفروض من لوحة Binance API
          </div>
          <div className="text-[#01BC8D] font-semibold flex items-center gap-1.5">
            <span>⚡</span> التداول التجريبي (المحاكاة) متاح دون أي مخاطر
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              onClose();
              onOpenApiTab();
            }}
            data-testid="dialog_open_api_button"
            className="flex-1 bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer text-sm"
          >
            <Key className="w-4 h-4" />
            <span>مراجعة المفاتيح والربط</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-[#232E3A] hover:bg-[#1A222B] text-[#8A99AD] hover:text-white transition-colors cursor-pointer text-sm font-semibold"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
