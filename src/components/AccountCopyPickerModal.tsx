import React, { useState, useEffect } from 'react';
import {
  Wallet,
  CheckCircle2,
  PlusCircle,
  X,
  Layers,
  Copy,
  Sliders,
} from 'lucide-react';
import { PaperVirtualAccountSummary } from '../types';

interface AccountCopyPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleAr: string;
  subtitleAr?: string;
  targetName: string;
  accounts: PaperVirtualAccountSummary[];
  activeAccountId: string;
  copiedAccountIdsForTarget?: string[];
  onConfirmCopyToAccount: (selectedAccountId: string) => void;
  onCreateNewAccount?: (name: string, initialBalance?: number) => PaperVirtualAccountSummary | string;
}

export const AccountCopyPickerModal: React.FC<AccountCopyPickerModalProps> = ({
  isOpen,
  onClose,
  titleAr,
  subtitleAr,
  targetName,
  accounts,
  activeAccountId,
  copiedAccountIdsForTarget = [],
  onConfirmCopyToAccount,
  onCreateNewAccount,
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(activeAccountId);
  const [showNewAccountForm, setShowNewAccountForm] = useState<boolean>(false);
  const [newAccName, setNewAccName] = useState<string>('');
  const [newAccBalance, setNewAccBalance] = useState<string>('1000');

  useEffect(() => {
    if (isOpen) {
      setSelectedAccountId(activeAccountId || accounts[0]?.id || 'acc_default');
      setShowNewAccountForm(false);
      setNewAccName(`حساب ${targetName}`);
      setNewAccBalance('1000');
    }
  }, [isOpen, activeAccountId, accounts, targetName]);

  if (!isOpen) return null;

  const selectedAccount =
    accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  const handleCreateAndSelect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateNewAccount) return;
    const cleanName = newAccName.trim() || `حساب ${targetName}`;
    const cleanBal = Math.max(10, parseFloat(newAccBalance) || 1000);
    const created = onCreateNewAccount(cleanName, cleanBal);
    const newId = typeof created === 'string' ? created : created.id;
    setSelectedAccountId(newId);
    setShowNewAccountForm(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="bg-[#12171D] border border-[#01BC8D]/50 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-[#1A222B] border-b border-[#232E3A] px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0D2B24] border border-[#01BC8D]/40 flex items-center justify-center text-[#01BC8D] shrink-0">
              <Copy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                {titleAr}
              </h3>
              <p className="text-[11px] text-[#8A99AD]">
                {subtitleAr || `اختر الحساب الافتراضي الذي تريد نسخ "${targetName}" إليه`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-[#8A99AD] hover:text-white bg-[#0B0E11] hover:bg-[#232E3A] p-1.5 rounded-lg border border-[#232E3A] cursor-pointer transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: Accounts List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-[#01BC8D]" />
              <span>الحسابات الافتراضية المفتوحة ({accounts.length})</span>
            </span>

            {onCreateNewAccount && !showNewAccountForm && (
              <button
                type="button"
                onClick={() => setShowNewAccountForm(true)}
                className="text-[11px] bg-[#0D2B24] hover:bg-[#01BC8D]/20 text-[#01BC8D] border border-[#01BC8D]/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ فتح حساب جديد وتسميته</span>
              </button>
            )}
          </div>

          {/* Inline Create New Account Form */}
          {showNewAccountForm && onCreateNewAccount && (
            <form
              onSubmit={handleCreateAndSelect}
              className="bg-[#0B0E11] border border-[#01BC8D] rounded-xl p-3 space-y-2.5 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#01BC8D]">
                  إنشاء حساب افتراضي جديد بنفس الإعدادات:
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewAccountForm(false)}
                  className="text-[11px] text-[#8A99AD] hover:text-white cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#8A99AD] mb-1">
                    اسم الحساب الافتراضي الجديد:
                  </label>
                  <input
                    type="text"
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    placeholder="مثال: حساب نسخ الحيتان 2"
                    className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#8A99AD] mb-1">
                    الرصيد الابتدائي (USDT):
                  </label>
                  <input
                    type="number"
                    min="10"
                    step="any"
                    value={newAccBalance}
                    onChange={(e) => setNewAccBalance(e.target.value)}
                    className="w-full bg-[#12171D] border border-[#232E3A] focus:border-[#01BC8D] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-1.5 rounded-lg text-xs cursor-pointer transition-colors"
              >
                إنشاء الحساب واختياره للنسخ
              </button>
            </form>
          )}

          {/* Account Cards */}
          <div className="space-y-2">
            {accounts.map((acc) => {
              const isSelected = acc.id === selectedAccountId;
              const isAlreadyCopyingHere = copiedAccountIdsForTarget.includes(acc.id);
              const isFull = acc.openPositionsCount >= acc.settings.maxConcurrentTrades;

              return (
                <div
                  key={acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  data-testid={`copy_picker_account_${acc.id}`}
                  className={`rounded-xl p-3 border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#0D2B24]/60 border-[#01BC8D] shadow-[0_0_12px_rgba(1,188,141,0.18)]'
                      : 'bg-[#1A222B] border-[#232E3A] hover:border-[#01BC8D]/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-[#01BC8D] border-[#01BC8D] text-[#0B0E11]'
                            : 'border-[#8A99AD] bg-[#0B0E11]'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-white">
                            {acc.name}
                          </span>
                          {acc.id === activeAccountId && (
                            <span className="text-[9px] bg-[#0B0E11] text-[#01BC8D] border border-[#01BC8D]/30 px-1.5 py-0.5 rounded font-bold">
                              الحساب المعروض حالياً
                            </span>
                          )}
                          {isAlreadyCopyingHere && (
                            <span className="text-[9px] bg-[#01BC8D]/20 text-[#01BC8D] border border-[#01BC8D]/40 px-1.5 py-0.5 rounded font-bold">
                              منسوخ في هذا الحساب
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#8A99AD] mt-1 font-mono tabular-nums">
                          <span>
                            المتاح:{' '}
                            <strong className="text-white">
                              {acc.availableBalance.toFixed(2)} USDT
                            </strong>
                          </span>
                          <span>•</span>
                          <span>
                            الرصيد الكلي:{' '}
                            <strong className="text-[#01BC8D]">
                              {acc.totalEquity.toFixed(2)}$
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-left shrink-0 space-y-1">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isFull
                            ? 'bg-[#2B1216] text-[#F6465D] border-[#F6465D]/40'
                            : 'bg-[#0B0E11] text-[#01BC8D] border-[#232E3A]'
                        }`}
                      >
                        <Layers className="w-3 h-3" />
                        <span>
                          مفتوحة: {acc.openPositionsCount}/{acc.settings.maxConcurrentTrades}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Account's Specific Settings Pill Row */}
                  <div className="mt-2 pt-2 border-t border-[#232E3A]/80 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#8A99AD]">
                    <div className="flex items-center gap-1.5 flex-wrap font-mono">
                      <Sliders className="w-3 h-3 text-[#01BC8D]" />
                      <span>
                        قيمة الصفقة:{' '}
                        <strong className="text-white">{acc.settings.tradeValueUsdt}$</strong>
                      </span>
                      <span>•</span>
                      <span>
                        الرافعة:{' '}
                        <strong className="text-[#01BC8D]">{acc.settings.leverage}x</strong>
                      </span>
                      <span>•</span>
                      <span>
                        العمولة: <strong className="text-white">{acc.settings.commissionPercent}%</strong>
                      </span>
                    </div>
                    <span className="text-[#01BC8D] font-semibold">
                      {acc.settings.scaleInSamePercentAsTrader !== false
                        ? 'تدعيم بنفس النسبة %'
                        : `تدعيم +${acc.settings.scaleInFixedValueUsdt || 10}$`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#1A222B] border-t border-[#232E3A] px-4 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[#8A99AD] hover:text-white bg-[#0B0E11] border border-[#232E3A] cursor-pointer transition-colors"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={() => {
              if (selectedAccount) {
                onConfirmCopyToAccount(selectedAccount.id);
              }
            }}
            data-testid="confirm_account_copy_btn"
            className="flex-1 bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              تأكيد النسخ إلى «{selectedAccount?.name || 'الحساب المحدد'}» (
              {selectedAccount?.settings.tradeValueUsdt || 25}$ ×{' '}
              {selectedAccount?.settings.leverage || 5}x)
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
