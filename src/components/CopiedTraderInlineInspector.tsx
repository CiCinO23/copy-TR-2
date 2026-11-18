import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  RefreshCw,
  Trash2,
  ExternalLink,
  Layers,
  History,
  Activity,
  Copy,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ActiveCopiedTrader,
  PaperPosition,
  PaperVirtualAccountSummary,
  TradeExecutionSettings,
  MarketTicker,
  TraderOpenPosition,
  TraderPositionHistoryItem,
  TraderLatestRecord,
  ManualSingleCopyResult,
} from '../types';
import {
  fetchCopyTraderFullData,
  fetchSmartMoneyWhaleDetail,
} from '../services/copyAndSmartMoneyApi';
import { TraderAvatar } from './TraderAvatar';
import { CoinIcon } from './CoinIcon';
import { WhaleIcon } from './WhaleIcon';
import { formatDateTimeWestern } from '../utils/formatters';

export interface SelectedInlineTraderTarget {
  traderId: string;
  traderName: string;
  source: 'COPY_TRADING' | 'SMART_MONEY';
  accountId?: string;
  avatarUrl?: string;
}

interface CopiedTraderInlineInspectorProps {
  copiedTraders: ActiveCopiedTrader[];
  accounts: PaperVirtualAccountSummary[];
  activeAccountId: string;
  activeAccountName: string;
  settings: TradeExecutionSettings;
  tickers: MarketTicker[];
  userOpenPositions: PaperPosition[];
  userClosedPositions: PaperPosition[];
  isSyncingAll?: boolean;
  selectedTrader: SelectedInlineTraderTarget | null;
  onSelectTrader: (trader: SelectedInlineTraderTarget | null) => void;
  onSyncAllCopiedTraders: () => void;
  onRemoveCopiedTrader: (
    traderId: string,
    source: 'COPY_TRADING' | 'SMART_MONEY',
    accountId?: string
  ) => void;
  onNavigateToTab: (tab: 'Copy Trading' | 'Whales' | 'KuCoinAPI') => void;
  onOpenExternalTraderPage?: (
    traderId: string,
    source: 'COPY_TRADING' | 'SMART_MONEY',
    traderName?: string
  ) => void;
  onCopySinglePosition?: (
    pos: TraderOpenPosition,
    traderName: string,
    marginUsdt: number,
    accountId?: string
  ) => ManualSingleCopyResult | undefined;
  onSyncTraderToEngine?: (params: {
    traderId: string;
    traderName: string;
    source: 'COPY_TRADING' | 'SMART_MONEY';
    positions: TraderOpenPosition[];
    latestRecords: TraderLatestRecord[];
    positionHistory?: TraderPositionHistoryItem[];
    marginPerTradeUsdt: number;
    accountId?: string;
  }) => any;
}

interface LoadedTraderFullInfo {
  traderId: string;
  nickname: string;
  avatarUrl: string;
  description: string;
  source: 'COPY_TRADING' | 'SMART_MONEY';
  roi: number;
  pnl: number;
  winRate: number;
  mdd: number;
  aumOrMargin: number;
  subscribersCount: number;
  leadingDays: number;
  positions: TraderOpenPosition[];
  positionHistory: TraderPositionHistoryItem[];
  latestRecords: TraderLatestRecord[];
}

export const CopiedTraderInlineInspector: React.FC<CopiedTraderInlineInspectorProps> = ({
  copiedTraders,
  accounts,
  activeAccountId,
  activeAccountName,
  settings,
  tickers,
  userOpenPositions,
  userClosedPositions,
  isSyncingAll = false,
  selectedTrader,
  onSelectTrader,
  onSyncAllCopiedTraders,
  onRemoveCopiedTrader,
  onNavigateToTab,
  onOpenExternalTraderPage,
  onCopySinglePosition,
  onSyncTraderToEngine,
}) => {
  const [copiedTradersScope, setCopiedTradersScope] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [inspectorSectionFilter, setInspectorSectionFilter] = useState<
    'ALL' | 'OPEN_POSITIONS' | 'CLOSED_HISTORY' | 'LATEST_RECORDS' | 'MY_COPIED'
  >('ALL');
  const [isLoadingTraderInfo, setIsLoadingTraderInfo] = useState<boolean>(false);
  const [loadedInfo, setLoadedInfo] = useState<LoadedTraderFullInfo | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadSelectedTraderDetails = useCallback(
    async (target: SelectedInlineTraderTarget, forceRefresh: boolean = false) => {
      setIsLoadingTraderInfo(true);
      try {
        if (target.source === 'SMART_MONEY') {
          const data = await fetchSmartMoneyWhaleDetail(target.traderId, null, tickers, {
            forceRefresh,
          });
          setLoadedInfo({
            traderId: target.traderId,
            nickname:
              data.profile.traderName &&
              data.profile.traderName !== 'Smart Money Whale'
                ? data.profile.traderName
                : target.traderName || data.profile.traderName,
            avatarUrl: data.profile.avatarUrl || target.avatarUrl || '',
            description:
              data.profile.introduction ||
              'محفظة حوت موثقة (Smart Money Whale) للعقود الآجلة الدائمة USDⓈ-M.',
            source: 'SMART_MONEY',
            roi: Number(data.profile.roi || 0),
            pnl: Number(data.profile.pnl || 0),
            winRate: Number(data.profile.winRate || 72),
            mdd: Number(data.profile.mdd || 8.5),
            aumOrMargin: Number(data.profile.umMarginBalance || 0),
            subscribersCount: Number(data.profile.subscribers || 0),
            leadingDays: Number(data.profile.daysActive || 180),
            positions: data.positions || [],
            positionHistory: data.positionHistory || [],
            latestRecords: data.latestRecords || [],
          });
        } else {
          const data = await fetchCopyTraderFullData(target.traderId, null, tickers, {
            forceRefresh,
          });
          setLoadedInfo({
            traderId: target.traderId,
            nickname:
              data.detail.nickname &&
              data.detail.nickname !== 'Binance Lead Trader'
                ? data.detail.nickname
                : target.traderName || data.detail.nickname,
            avatarUrl: data.detail.avatarUrl || target.avatarUrl || '',
            description:
              data.detail.description ||
              'متداول عقود آجلة USDⓈ-M على منصة باينانس (Binance Copy Trading).',
            source: 'COPY_TRADING',
            roi: Number(data.detail.roi || 0),
            pnl: Number(data.detail.pnl || 0),
            winRate: Number(data.detail.winRate || 70),
            mdd: Number(data.detail.mdd || 10),
            aumOrMargin: Number(data.detail.aum || data.detail.marginBalance || 0),
            subscribersCount: Number(data.detail.currentCopyCount || 0),
            leadingDays: Number(data.detail.leadingDays || 120),
            positions: data.positions || [],
            positionHistory: data.positionHistory || [],
            latestRecords: data.latestRecords || [],
          });
        }
      } catch (err) {
        console.warn('Failed loading inline trader details:', err);
      } finally {
        setIsLoadingTraderInfo(false);
      }
    },
    [tickers]
  );

  useEffect(() => {
    if (selectedTrader) {
      loadSelectedTraderDetails(selectedTrader, false);
    } else {
      setLoadedInfo(null);
    }
  }, [selectedTrader, loadSelectedTraderDetails]);

  const displayedTraders =
    copiedTradersScope === 'ACTIVE' && accounts.length > 1
      ? copiedTraders.filter((ct) => (ct.accountId || 'acc_default') === activeAccountId)
      : copiedTraders;

  const myTradesFromSelectedTrader = React.useMemo(() => {
    if (!selectedTrader) return [];
    const allMyPositions = [...userOpenPositions, ...userClosedPositions];
    return allMyPositions.filter(
      (p) =>
        (p.sourceTraderId && p.sourceTraderId === selectedTrader.traderId) ||
        (p.sourceTraderName &&
          p.sourceTraderName.trim().toLowerCase() ===
            selectedTrader.traderName.trim().toLowerCase())
    );
  }, [selectedTrader, userOpenPositions, userClosedPositions]);

  const handleManualCopyPositionClick = (pos: TraderOpenPosition) => {
    if (!selectedTrader || !onCopySinglePosition) return;
    const targetAccId = selectedTrader.accountId || activeAccountId;
    const targetAcc = accounts.find((a) => a.id === targetAccId);
    const marginUsdt = targetAcc?.settings?.tradeValueUsdt ?? settings.tradeValueUsdt;

    const res = onCopySinglePosition(
      pos,
      loadedInfo?.nickname || selectedTrader.traderName,
      marginUsdt,
      targetAccId
    );
    if (res && typeof res === 'object' && 'messageAr' in res) {
      setActionFeedback(res.messageAr);
    } else {
      setActionFeedback(`تم إرسال أمر نسخ/مزامنة صفقة ${pos.symbol} (${pos.side}) إلى حسابك.`);
    }
    setTimeout(() => setActionFeedback(null), 5000);
  };

  const handleSyncSelectedTraderNow = () => {
    if (!selectedTrader || !loadedInfo) return;
    const targetAccId = selectedTrader.accountId || activeAccountId;
    const targetAcc = accounts.find((a) => a.id === targetAccId);
    const marginUsdt = targetAcc?.settings?.tradeValueUsdt ?? settings.tradeValueUsdt;

    if (onSyncTraderToEngine) {
      onSyncTraderToEngine({
        traderId: selectedTrader.traderId,
        traderName: loadedInfo.nickname,
        source: selectedTrader.source,
        positions: loadedInfo.positions,
        latestRecords: loadedInfo.latestRecords,
        positionHistory: loadedInfo.positionHistory,
        marginPerTradeUsdt: marginUsdt,
        accountId: targetAccId,
      });
      setActionFeedback(`تمت مزامنة جميع صفقات المتداول «${loadedInfo.nickname}» مع حسابك بنجاح.`);
      setTimeout(() => setActionFeedback(null), 4500);
    } else {
      onSyncAllCopiedTraders();
    }
  };

  return (
    <div
      data-testid="copied_traders_below_positions_section"
      className="bg-[#12171D] border border-[#1E2733] rounded-2xl p-4 sm:p-5 space-y-4"
    >
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#1E2733] pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0D2B24] border border-[#01BC8D]/40 flex items-center justify-center text-[#01BC8D] shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-white flex items-center gap-2 flex-wrap">
              <span>المتداولون والحيتان المنسوخون ({copiedTraders.length})</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/30">
                اضغط على أي متداول لعرض كافة صفقاته هنا دون إخفاء صفقاتك بالأعلى
              </span>
            </h3>
            <p className="text-[11px] text-[#8A99AD] mt-0.5">
              اختر أي متداول منسوخ بالأسفل لاستعراض صفقاته المفتوحة والمغلقة وسجل عملياته وإحصائياته مباشرة أسفل نافذة المراكز.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 1 && (
            <div className="flex items-center bg-[#0B0E11] border border-[#232E3A] rounded-xl p-1 text-[11px]">
              <button
                type="button"
                onClick={() => setCopiedTradersScope('ACTIVE')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  copiedTradersScope === 'ACTIVE'
                    ? 'bg-[#01BC8D] text-[#0B0E11]'
                    : 'text-[#8A99AD] hover:text-white'
                }`}
              >
                حساب «{activeAccountName}» (
                {
                  copiedTraders.filter(
                    (ct) => (ct.accountId || 'acc_default') === activeAccountId
                  ).length
                }
                )
              </button>
              <button
                type="button"
                onClick={() => setCopiedTradersScope('ALL')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors ${
                  copiedTradersScope === 'ALL'
                    ? 'bg-[#01BC8D] text-[#0B0E11]'
                    : 'text-[#8A99AD] hover:text-white'
                }`}
              >
                جميع الحسابات ({copiedTraders.length})
              </button>
            </div>
          )}

          {copiedTraders.length > 0 && (
            <button
              type="button"
              onClick={onSyncAllCopiedTraders}
              disabled={isSyncingAll}
              className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span>مزامنة جميع المنسوخين الآن</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigateToTab('Copy Trading')}
            className="bg-[#1A222B] hover:bg-[#212C37] text-[#01BC8D] border border-[#01BC8D]/40 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
          >
            + إضافة متداول
          </button>
          <button
            type="button"
            onClick={() => onNavigateToTab('Whales')}
            className="bg-[#1A222B] hover:bg-[#212C37] text-[#01BC8D] border border-[#01BC8D]/40 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
          >
            + إضافة حوت
          </button>
        </div>
      </div>

      {/* Selectable Copied Traders Grid */}
      {displayedTraders.length === 0 ? (
        <div className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-4 text-center text-xs text-[#8A99AD]">
          لا يوجد متداولون منسوخون في «{activeAccountName}» حالياً. يمكنك أيضاً الضغط على اسم أي متداول داخل صفقاتك المفتوحة بالأعلى لعرض كافة معلوماته هنا، أو الضغط على{' '}
          <strong className="text-[#01BC8D]">+ إضافة متداول</strong> أو{' '}
          <strong className="text-[#01BC8D]">+ إضافة حوت</strong>.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {displayedTraders.map((ct) => {
            const targetAccId = ct.accountId || 'acc_default';
            const targetAccObj = accounts.find((a) => a.id === targetAccId);
            const targetAccName = targetAccObj?.name || ct.accountName || activeAccountName;
            const targetAccSettings = targetAccObj?.settings || settings;
            const isSelected =
              selectedTrader?.traderId === ct.traderId &&
              selectedTrader?.source === ct.source;

            return (
              <div
                key={`${ct.source}_${ct.traderId}_${targetAccId}`}
                data-testid={`inline_copied_trader_card_${ct.traderId}`}
                onClick={() => {
                  if (isSelected) {
                    onSelectTrader(null);
                  } else {
                    onSelectTrader({
                      traderId: ct.traderId,
                      traderName: ct.nickname,
                      source: ct.source,
                      accountId: targetAccId,
                      avatarUrl: ct.avatarUrl,
                    });
                  }
                }}
                className={`rounded-xl p-3 flex items-center justify-between gap-2 transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-[#0D2B24] border-[#01BC8D] shadow-[0_0_14px_rgba(1,188,141,0.22)] ring-1 ring-[#01BC8D]/40'
                    : 'bg-[#1A222B] border-[#232E3A] hover:border-[#01BC8D]/50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <TraderAvatar src={ct.avatarUrl} name={ct.nickname} size="md" />
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#0B0E11] border border-[#01BC8D] flex items-center justify-center text-[9px] text-[#01BC8D]">
                      {ct.source === 'SMART_MONEY' ? (
                        <WhaleIcon className="w-2.5 h-2.5" />
                      ) : (
                        <Copy className="w-2.5 h-2.5" />
                      )}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs sm:text-sm text-white truncate">
                        {ct.nickname}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0B0E11] text-[#01BC8D] font-mono">
                        {ct.source === 'SMART_MONEY' ? 'WHALE' : 'COPY'}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded bg-[#0B0E11] text-[#01BC8D] border border-[#01BC8D]/30 font-bold">
                        حساب: {targetAccName}
                      </span>
                    </div>

                    <div className="text-[10px] text-[#8A99AD] mt-0.5">
                      حجم صفقتك المخصص:{' '}
                      <strong className="text-white font-mono">
                        {targetAccSettings.tradeValueUsdt}$
                      </strong>{' '}
                      • رافعتك:{' '}
                      <strong className="text-[#01BC8D] font-mono">
                        {targetAccSettings.leverage}x
                      </strong>
                    </div>

                    <div className="text-[10px] text-[#01BC8D] font-bold flex items-center gap-1 mt-1">
                      {isSelected ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>إخفاء تفاصيل وصفقات المتداول</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          <span>اضغط لعرض الصفقات المفتوحة والمغلقة وكافة المعلومات ↓</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onOpenExternalTraderPage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenExternalTraderPage(ct.traderId, ct.source, ct.nickname);
                      }}
                      className="bg-[#0B0E11] hover:bg-[#161D26] text-[#8A99AD] hover:text-[#01BC8D] border border-[#232E3A] p-2 rounded-lg text-xs cursor-pointer"
                      title={`فتح صفحة المتداول ${ct.nickname} المستقلة`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isSelected) onSelectTrader(null);
                      onRemoveCopiedTrader(ct.traderId, ct.source, targetAccId);
                    }}
                    className="bg-[#F6465D]/15 hover:bg-[#F6465D]/25 text-[#F6465D] border border-[#F6465D]/30 p-2 rounded-lg text-xs cursor-pointer"
                    title="إلغاء نسخ هذا المتداول من هذا الحساب"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded Inline Trader Full Details Inspector (Appears right here without hiding user's open positions above!) */}
      {selectedTrader && (
        <div
          data-testid="inline_trader_full_details_panel"
          className="bg-[#0B0E11] border-2 border-[#01BC8D]/60 rounded-2xl p-4 sm:p-5 space-y-4 animate-in fade-in duration-200 shadow-xl"
        >
          {/* Top Bar of Selected Trader Details */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1E2733] pb-3.5">
            <div className="flex items-center gap-3">
              <TraderAvatar
                src={loadedInfo?.avatarUrl || selectedTrader.avatarUrl}
                name={loadedInfo?.nickname || selectedTrader.traderName}
                size="lg"
              />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm sm:text-base font-bold text-white">
                    {loadedInfo?.nickname || selectedTrader.traderName}
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40 font-mono font-bold">
                    {selectedTrader.source === 'SMART_MONEY'
                      ? 'حوت موثق (Smart Money)'
                      : 'متداول منسوخ (Copy Trading)'}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#12171D] text-[#8A99AD] border border-[#232E3A] font-mono">
                    ID: {selectedTrader.traderId.slice(0, 10)}
                  </span>
                </div>
                <p className="text-[11px] text-[#8A99AD] mt-0.5">
                  {loadedInfo?.description ||
                    'عرض شامل ومباشر لجميع الصفقات المفتوحة والمغلقة وسجل عمليات المتداول دون مغادرة صفحة التداول.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0">
              <button
                type="button"
                data-testid="inline_trader_refresh_btn"
                onClick={() => loadSelectedTraderDetails(selectedTrader, true)}
                disabled={isLoadingTraderInfo}
                className="bg-[#161D26] hover:bg-[#1E2733] text-[#01BC8D] border border-[#232E3A] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoadingTraderInfo ? 'animate-spin' : ''}`}
                />
                <span>تحديث بياناته</span>
              </button>

              <button
                type="button"
                data-testid="inline_trader_sync_now_btn"
                onClick={handleSyncSelectedTraderNow}
                disabled={isLoadingTraderInfo}
                className="bg-[#01BC8D] hover:bg-[#00D49F] text-[#0B0E11] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>مزامنة صفقاته مع حسابي</span>
              </button>

              <button
                type="button"
                data-testid="inline_trader_close_btn"
                onClick={() => onSelectTrader(null)}
                className="bg-[#2B1216] hover:bg-[#F6465D]/30 text-[#F6465D] border border-[#F6465D]/40 p-1.5 rounded-xl text-xs cursor-pointer"
                title="إغلاق تفاصيل المتداول"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {actionFeedback && (
            <div className="bg-[#0D2B24] border border-[#01BC8D]/50 rounded-xl px-3.5 py-2.5 text-xs text-[#01BC8D] font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{actionFeedback}</span>
            </div>
          )}

          {/* Key Performance Metrics Strip */}
          {loadedInfo && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs font-mono">
              <div className="bg-[#12171D] border border-[#1E2733] rounded-xl p-2.5">
                <span className="text-[10px] text-[#8A99AD] font-sans block">العائد (ROI)</span>
                <strong
                  dir="ltr"
                  className={`text-sm tabular-nums ${
                    loadedInfo.roi >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                  }`}
                >
                  {loadedInfo.roi >= 0 ? '+' : ''}
                  {loadedInfo.roi.toFixed(2)}%
                </strong>
              </div>

              <div className="bg-[#12171D] border border-[#1E2733] rounded-xl p-2.5">
                <span className="text-[10px] text-[#8A99AD] font-sans block">إجمالي الربح (PNL)</span>
                <strong
                  dir="ltr"
                  className={`text-sm tabular-nums ${
                    loadedInfo.pnl >= 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                  }`}
                >
                  {loadedInfo.pnl >= 0 ? '+$' : '-$'}
                  {Math.abs(loadedInfo.pnl).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </strong>
              </div>

              <div className="bg-[#12171D] border border-[#1E2733] rounded-xl p-2.5">
                <span className="text-[10px] text-[#8A99AD] font-sans block">نسبة النجاح (Win Rate)</span>
                <strong dir="ltr" className="text-sm text-[#01BC8D] tabular-nums">
                  {loadedInfo.winRate.toFixed(1)}%
                </strong>
              </div>

              <div className="bg-[#12171D] border border-[#1E2733] rounded-xl p-2.5">
                <span className="text-[10px] text-[#8A99AD] font-sans block">أقصى تراجع (MDD)</span>
                <strong dir="ltr" className="text-sm text-[#F59E0B] tabular-nums">
                  {loadedInfo.mdd.toFixed(2)}%
                </strong>
              </div>

              <div className="bg-[#12171D] border border-[#1E2733] rounded-xl p-2.5">
                <span className="text-[10px] text-[#8A99AD] font-sans block">رصيد الهامش / الأصول</span>
                <strong dir="ltr" className="text-sm text-white tabular-nums">
                  ${loadedInfo.aumOrMargin.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </strong>
              </div>

              <div className="bg-[#12171D] border border-[#1E2733] rounded-xl p-2.5">
                <span className="text-[10px] text-[#8A99AD] font-sans block">الصفقات المفتوحة / المغلقة</span>
                <strong dir="ltr" className="text-sm text-[#01BC8D] tabular-nums">
                  {loadedInfo.positions.length} مفتوحة / {loadedInfo.positionHistory.length} مغلقة
                </strong>
              </div>
            </div>
          )}

          {/* Section Filter Tabs (Default: ALL so everything is visible at once!) */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[#1E2733] pb-2.5">
            {(
              [
                {
                  id: 'ALL',
                  label: 'عرض شامل لكل المعلومات',
                  count:
                    (loadedInfo?.positions.length || 0) +
                    (loadedInfo?.positionHistory.length || 0) +
                    (loadedInfo?.latestRecords.length || 0),
                },
                {
                  id: 'OPEN_POSITIONS',
                  label: 'صفقات المتداول المفتوحة',
                  count: loadedInfo?.positions.length || 0,
                },
                {
                  id: 'CLOSED_HISTORY',
                  label: 'صفقات المتداول المغلقة',
                  count: loadedInfo?.positionHistory.length || 0,
                },
                {
                  id: 'LATEST_RECORDS',
                  label: 'سجل التحركات الأخيرة',
                  count: loadedInfo?.latestRecords.length || 0,
                },
                {
                  id: 'MY_COPIED',
                  label: 'صفقاتي المنسوخة منه',
                  count: myTradesFromSelectedTrader.length,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`inline_trader_tab_${tab.id}`}
                onClick={() => setInspectorSectionFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  inspectorSectionFilter === tab.id
                    ? 'bg-[#01BC8D] text-[#0B0E11]'
                    : 'bg-[#12171D] text-[#8A99AD] hover:text-white border border-[#232E3A]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  dir="ltr"
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    inspectorSectionFilter === tab.id
                      ? 'bg-[#0B0E11]/20 text-[#0B0E11]'
                      : 'bg-[#0B0E11] text-[#01BC8D]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {isLoadingTraderInfo && !loadedInfo ? (
            <div className="py-8 text-center text-xs text-[#8A99AD] flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 text-[#01BC8D] animate-spin" />
              <span>جاري جلب كافة صفقات ومعلومات المتداول الحية...</span>
            </div>
          ) : (
            loadedInfo && (
              <div className="space-y-4">
                {/* 1. Trader's Open Positions (صفقات المتداول المفتوحة حالياً) */}
                {(inspectorSectionFilter === 'ALL' ||
                  inspectorSectionFilter === 'OPEN_POSITIONS') && (
                  <div
                    data-testid="inline_trader_open_positions_section"
                    className="bg-[#12171D] border border-[#1E2733] rounded-xl p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#01BC8D]" />
                        <span>
                          صفقات المتداول المفتوحة حالياً ({loadedInfo.positions.length})
                        </span>
                      </h5>
                      <span className="text-[10px] text-[#8A99AD]">
                        تحديث حي من محفظة المتداول
                      </span>
                    </div>

                    {loadedInfo.positions.length === 0 ? (
                      <div className="bg-[#0B0E11] border border-[#232E3A] rounded-lg p-3 text-center text-xs text-[#8A99AD]">
                        لا توجد صفقات مفتوحة حالياً لدى هذا المتداول.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {loadedInfo.positions.map((pos) => {
                          const isProfit = pos.unrealizedProfit >= 0;
                          const alreadyCopiedInMyAccount = userOpenPositions.some(
                            (up) =>
                              up.symbol === pos.symbol &&
                              up.side === pos.side &&
                              (up.sourceTraderId === loadedInfo.traderId ||
                                up.sourceTraderName === loadedInfo.nickname)
                          );

                          return (
                            <div
                              key={pos.id}
                              className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <CoinIcon symbol={pos.symbol} size="sm" />
                                  <span className="font-bold text-white font-mono text-sm">
                                    {pos.symbol}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                                      pos.side === 'LONG'
                                        ? 'bg-[#0D2B24] text-[#01BC8D]'
                                        : 'bg-[#2B1216] text-[#F6465D]'
                                    }`}
                                  >
                                    {pos.side} {pos.leverage}x
                                  </span>
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#12171D] text-[#8A99AD] font-mono">
                                    الحجم الحالي: {pos.currentScalePercent || 100}%
                                  </span>
                                  {alreadyCopiedInMyAccount && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#0D2B24] text-[#01BC8D] border border-[#01BC8D]/40 font-bold">
                                      منسوخة في حسابك بالأعلى ✓
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] text-[#8A99AD] flex flex-wrap items-center gap-3 font-mono">
                                  <span>
                                    سعر الدخول:{' '}
                                    <strong className="text-white">
                                      ${pos.entryPrice.toFixed(4)}
                                    </strong>
                                  </span>
                                  <span>
                                    السعر الحالي:{' '}
                                    <strong className="text-[#01BC8D]">
                                      ${pos.markPrice.toFixed(4)}
                                    </strong>
                                  </span>
                                  <span>
                                    الكمية:{' '}
                                    <strong className="text-white">
                                      {Math.abs(pos.positionAmount).toFixed(4)}
                                    </strong>
                                  </span>
                                  <span>
                                    وقت الدخول:{' '}
                                    <strong dir="ltr" className="text-white inline-block">
                                      {formatDateTimeWestern(pos.entryTime)}
                                    </strong>
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3">
                                <div className="text-left font-mono" dir="ltr">
                                  <div
                                    className={`font-bold text-sm tabular-nums ${
                                      isProfit ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                                    }`}
                                  >
                                    {isProfit ? '+$' : '-$'}
                                    {Math.abs(pos.unrealizedProfit).toFixed(2)}
                                  </div>
                                  <div
                                    className={`text-[10px] tabular-nums ${
                                      pos.roePercent >= 0
                                        ? 'text-[#01BC8D]'
                                        : 'text-[#F6465D]'
                                    }`}
                                  >
                                    ROE {pos.roePercent >= 0 ? '+' : ''}
                                    {pos.roePercent.toFixed(2)}%
                                  </div>
                                </div>

                                {onCopySinglePosition && (
                                  <button
                                    type="button"
                                    onClick={() => handleManualCopyPositionClick(pos)}
                                    className="bg-[#0D2B24] hover:bg-[#01BC8D] text-[#01BC8D] hover:text-[#0B0E11] border border-[#01BC8D]/50 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-colors shrink-0"
                                  >
                                    {alreadyCopiedInMyAccount
                                      ? 'مزامنة التغييرات فقط'
                                      : 'نسخ هذه الصفقة'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Trader's Closed Positions History (صفقات المتداول المغلقة) */}
                {(inspectorSectionFilter === 'ALL' ||
                  inspectorSectionFilter === 'CLOSED_HISTORY') && (
                  <div
                    data-testid="inline_trader_closed_positions_section"
                    className="bg-[#12171D] border border-[#1E2733] rounded-xl p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                        <History className="w-4 h-4 text-[#01BC8D]" />
                        <span>
                          سجل صفقات المتداول المغلقة ({loadedInfo.positionHistory.length})
                        </span>
                      </h5>
                      <span className="text-[10px] text-[#8A99AD]">
                        تاريخ الدخول والخروج والأرباح المحققة
                      </span>
                    </div>

                    {loadedInfo.positionHistory.length === 0 ? (
                      <div className="bg-[#0B0E11] border border-[#232E3A] rounded-lg p-3 text-center text-xs text-[#8A99AD]">
                        لا توجد صفقات مغلقة مسجلة لهذا المتداول حالياً.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                        {loadedInfo.positionHistory.slice(0, 20).map((item) => {
                          const isProfit = item.closingPnl >= 0;
                          return (
                            <div
                              key={item.id}
                              className="bg-[#0B0E11] border border-[#232E3A] rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <CoinIcon symbol={item.symbol} size="sm" />
                                  <span className="font-bold text-white font-mono">
                                    {item.symbol}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                                      item.side === 'LONG'
                                        ? 'bg-[#0D2B24] text-[#01BC8D]'
                                        : 'bg-[#2B1216] text-[#F6465D]'
                                    }`}
                                  >
                                    {item.side}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#161D26] text-[#8A99AD]">
                                    مغلقة (Closed)
                                  </span>
                                </div>
                                <div className="text-[11px] text-[#8A99AD] font-mono flex flex-wrap items-center gap-3">
                                  <span>
                                    الدخول:{' '}
                                    <strong className="text-white">
                                      ${item.avgCost.toFixed(4)}
                                    </strong>{' '}
                                    (<span dir="ltr" className="inline-block">{formatDateTimeWestern(item.opened)}</span>)
                                  </span>
                                  <span>
                                    الخروج:{' '}
                                    <strong className="text-[#01BC8D]">
                                      ${item.avgClosePrice.toFixed(4)}
                                    </strong>{' '}
                                    (<span dir="ltr" className="inline-block">{formatDateTimeWestern(item.closed)}</span>)
                                  </span>
                                </div>
                              </div>

                              <div
                                dir="ltr"
                                className={`font-mono font-bold text-sm tabular-nums shrink-0 ${
                                  isProfit ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                                }`}
                              >
                                {isProfit ? '+$' : '-$'}
                                {Math.abs(item.closingPnl).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Trader's Latest Operations / Records (سجل التحركات الأخيرة للمتداول) */}
                {(inspectorSectionFilter === 'ALL' ||
                  inspectorSectionFilter === 'LATEST_RECORDS') && (
                  <div
                    data-testid="inline_trader_latest_records_section"
                    className="bg-[#12171D] border border-[#1E2733] rounded-xl p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[#01BC8D]" />
                        <span>
                          سجل تحركات وعمليات المتداول الأخيرة ({loadedInfo.latestRecords.length})
                        </span>
                      </h5>
                      <span className="text-[10px] text-[#8A99AD]">
                        دخول • تدعيم • سحب جزئي • إغلاق
                      </span>
                    </div>

                    {loadedInfo.latestRecords.length === 0 ? (
                      <div className="bg-[#0B0E11] border border-[#232E3A] rounded-lg p-3 text-center text-xs text-[#8A99AD]">
                        لا توجد حركات مسجلة مؤخراً لهذا المتداول.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                        {loadedInfo.latestRecords.slice(0, 15).map((rec) => (
                          <div
                            key={rec.id}
                            className="bg-[#0B0E11] border border-[#232E3A] rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-white">
                                {rec.symbol}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                  rec.actionType === 'ENTRY' || rec.actionType === 'SCALE_IN'
                                    ? 'bg-[#0D2B24] text-[#01BC8D]'
                                    : 'bg-[#2B1216] text-[#F6465D]'
                                }`}
                              >
                                {rec.actionLabelAr}
                              </span>
                              <span className="font-mono text-[#8A99AD]">
                                السعر: <strong className="text-white">${rec.avgPrice.toFixed(4)}</strong>
                              </span>
                              <span className="font-mono text-[#8A99AD]">
                                الكمية: <strong className="text-white">{rec.executedQty.toFixed(4)}</strong>
                              </span>
                            </div>

                            <div className="flex items-center gap-2 font-mono">
                              {rec.totalPnl !== 0 && (
                                <span
                                  dir="ltr"
                                  className={`font-bold tabular-nums ${
                                    rec.totalPnl > 0 ? 'text-[#01BC8D]' : 'text-[#F6465D]'
                                  }`}
                                >
                                  {rec.totalPnl > 0 ? '+$' : '-$'}
                                  {Math.abs(rec.totalPnl).toFixed(2)}
                                </span>
                              )}
                              <span dir="ltr" className="text-[#8A99AD] tabular-nums">
                                {formatDateTimeWestern(rec.orderTime)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. My Copied Trades from this Trader (صفقاتي المنسوخة منه في حسابي) */}
                {(inspectorSectionFilter === 'ALL' ||
                  inspectorSectionFilter === 'MY_COPIED') && (
                  <div
                    data-testid="inline_trader_my_copied_section"
                    className="bg-[#12171D] border border-[#1E2733] rounded-xl p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                        <Copy className="w-4 h-4 text-[#01BC8D]" />
                        <span>
                          صفقاتي المنسوخة من «{loadedInfo.nickname}» في هذا الحساب ({myTradesFromSelectedTrader.length})
                        </span>
                      </h5>
                      <span className="text-[10px] text-[#01BC8D]">
                        صفقاتك المفتوحة ظاهرة بالكامل في نافذة المراكز بالأعلى ↑
                      </span>
                    </div>

                    {myTradesFromSelectedTrader.length === 0 ? (
                      <div className="bg-[#0B0E11] border border-[#232E3A] rounded-lg p-3 text-center text-xs text-[#8A99AD]">
                        لا توجد صفقات منسوخة من هذا المتداول في الحساب الحالي بعد. يمكنك الضغط على «مزامنة صفقاته مع حسابي» أو «نسخ هذه الصفقة» أعلاه.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {myTradesFromSelectedTrader.map((mp) => (
                          <div
                            key={mp.id}
                            className="bg-[#0B0E11] border border-[#232E3A] rounded-lg p-2.5 flex items-center justify-between gap-2 text-xs font-mono"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  mp.side === 'LONG'
                                    ? 'bg-[#0D2B24] text-[#01BC8D]'
                                    : 'bg-[#2B1216] text-[#F6465D]'
                                }`}
                              >
                                {mp.side} {mp.leverage}x
                              </span>
                              <span className="text-white font-bold">{mp.symbol}</span>
                              <span
                                className={`text-[10px] font-sans px-1.5 py-0.5 rounded ${
                                  mp.status === 'OPEN'
                                    ? 'bg-[#0D2B24] text-[#01BC8D]'
                                    : 'bg-[#161D26] text-[#8A99AD]'
                                }`}
                              >
                                {mp.status === 'OPEN' ? 'نشطة بالأعلى' : 'مغلقة'}
                              </span>
                            </div>
                            <span className="text-[#8A99AD]">
                              دخول: <strong className="text-white">${mp.entryPrice.toFixed(4)}</strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
