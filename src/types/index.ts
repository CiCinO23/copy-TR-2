export type BinanceEnvironment = 'MAINNET' | 'TESTNET' | 'BACKEND_PROXY';

export interface BinanceEnvOption {
  key: BinanceEnvironment;
  titleAr: string;
  defaultUrl: string;
  descriptionAr: string;
}

export interface BinanceConfig {
  environment: BinanceEnvironment;
  customBaseUrl: string;
  apiKey: string;
  apiSecret: string;
  recvWindow: number;
  readOnlyMode: boolean;
}

export interface MarketTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
}

export interface PositionInfo {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  leverage: string;
  marginType: string;
}

export interface AssetBalance {
  asset: string;
  walletBalance: string;
  availableBalance: string;
  unrealizedProfit: string;
}

export interface WhaleMarketInsight {
  symbol: string;
  openInterest: string;
  openInterestUsdt: string;
  recentLargeTradeUsdt: string;
  signalAr: string;
}

export interface BinanceConnectionState {
  isTesting: boolean;
  isConnected: boolean;
  isAuthenticated: boolean;
  latencyMs: number | null;
  serverTimeFormatted: string | null;
  accountUsdtBalance: string | null;
  accountAvailableBalance: string | null;
  totalWalletBalance: string | null;
  totalUnrealizedProfit: string | null;
  assets: AssetBalance[];
  positions: PositionInfo[];
  statusMessageAr: string;
  errorMessageAr: string | null;
  tickers: MarketTicker[];
  whaleInsights: WhaleMarketInsight[];
  allPrices?: Record<string, number>;
}

export type TradingExecutionMode = 'VIRTUAL' | 'REAL';

export interface TradeExecutionSettings {
  mode: TradingExecutionMode; // 'VIRTUAL' = التداول الافتراضي | 'REAL' = التداول الحقيقي (KuCoin)
  virtualInitialBalance: number; // الرصيد الافتراضي القابل للتعديل
  tradeValueUsdt: number; // قيمة الصفقة (USDT) التي يعينها المستخدم لكل صفقة منسوخة
  leverage: number; // الرافعة المالية التي يعينها المستخدم
  commissionPercent: number; // نسبة عمولة التداول (%) لكل صفقة (فتح/إغلاق)
  maxConcurrentTrades: number; // الحد الأقصى لعدد الصفقات المفتوحة بنفس الوقت
  takeProfitPercent: number; // جني الأرباح (%)
  stopLossPercent: number; // وقف الخسارة (%)
  enforceUserSizeOnCopy: boolean; // فتح الصفقات بالحجم والرافعة التي يعينها المستخدم دائماً وليس حجم المتداول المنسوخ
  scaleInFixedValueUsdt?: number; // القيمة المحددة بالدولار (USDT) التي يختارها المستخدم لإضافتها عند تدعيم المتداول لصفقته
  scaleInSamePercentAsTrader?: boolean; // خيار قابل للتفعيل أو الإلغاء: التدعيم آلياً بنفس النسبة المئوية للمتداول من قيمة الصفقة الأصلية
  partialExitSamePercentAsTrader?: boolean; // سحب نفس النسبة المئوية تلقائياً عندما يسحب المتداول جزءاً من الصفقة
  promptOnUnfavorableLateEntry?: boolean; // خيار اختياري: عند التفعيل يطلب قرار الدخول أو الرفض إذا كان السعر أسوأ؛ وعند شطبه يصبح الدخول آلياً بسعر السوق حتى مع التأخر
}

export type ScaleActionType = 'INITIAL_ENTRY' | 'SCALE_IN' | 'PARTIAL_EXIT' | 'FULL_EXIT';

export interface PositionScaleAdjustment {
  id: string;
  actionType: ScaleActionType; // دخول أولي | تدعيم الصفقة | انسحاب جزئي | خروج كامل
  actionLabelAr: string;
  timestamp: number; // وقت الحركة (دخول / تدعيم / انسحاب / خروج)
  volumePercent: number; // النسبة المئوية للحجم (مثلاً 100 أو +35 أو -40 أو -100)
  remainingPercentAfter: number; // النسبة المتبقية من الصفقة بعد الحركة
  executedQty: number;
  price: number;
  traderEntryPrice?: number; // سعر دخول المتداول الأصلي عند الدخول المتأخر
  traderEntryTime?: number; // وقت دخول المتداول الأصلي عند الدخول المتأخر
  realizedPnlDelta?: number;
  marginDeltaUsdt?: number; // قيمة الهامش المضاف أو المسحوب بالدولار (USDT)
  sourceEventId?: string; // معرف فريد ثابت للعملية المصدر لمنع التكرار
}

export interface PaperPosition {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  marginUsdt: number;
  initialMarginUsdt?: number;
  entryPrice: number;
  traderEntryPrice?: number;
  stopLossPrice?: number;
  isSecuredNearCurrent?: boolean;
  securedBufferPercent?: number;
  leverage: number;
  commissionUsdt: number;
  status: 'OPEN' | 'CLOSED';
  openTime: number;
  closeTime?: number;
  traderEntryTime?: number;
  traderExitTime?: number;
  currentScalePercent?: number;
  scaleAdjustments?: PositionScaleAdjustment[];
  exitPrice?: number;
  realizedPnl?: number;
  sourceTraderId?: string;
  sourceTraderName?: string;
  sourceType?: 'COPY_TRADING' | 'SMART_MONEY' | 'MANUAL';
  executionMode?: TradingExecutionMode;
  accountId?: string;
  accountName?: string;
  appliedSyncEventIds?: string[];
  lastSyncedTraderQty?: number;
  lastSyncedTraderUpdateTime?: number;
}

export interface PendingReconnectTradeChoice {
  id: string;
  createdAt: number;
  traderId: string;
  traderName: string;
  source: 'COPY_TRADING' | 'SMART_MONEY';
  accountId: string;
  accountName: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  traderEntryPrice: number;
  currentMarketPrice: number;
  priceDiffPercent: number;
  leverage: number;
  marginUsdt: number;
  traderEntryTime?: number;
  traderScaleAdjustments?: PositionScaleAdjustment[];
  currentScalePercent?: number;
}

export interface PaperVirtualAccountSummary {
  id: string;
  name: string;
  createdAt: number;
  initialBalance: number;
  availableBalance: number;
  totalEquity: number;
  unrealizedPnl: number;
  totalCommissionsPaid: number;
  openPositionsCount: number;
  closedPositionsCount: number;
  drawdownPercent?: number;
  settings: TradeExecutionSettings;
}

export interface PaperAccountSnapshot {
  activeAccountId: string;
  activeAccountName: string;
  accounts: PaperVirtualAccountSummary[];
  initialBalance: number;
  availableBalance: number;
  totalEquity: number;
  unrealizedPnl: number;
  totalCommissionsPaid: number;
  positions: PaperPosition[];
  settings: TradeExecutionSettings;
  pendingReconnectChoices?: PendingReconnectTradeChoice[];
}

export interface TraderSymbolSyncAction {
  actionId: string;
  actionType: 'ENTRY' | 'SCALE_IN' | 'PARTIAL_EXIT' | 'FULL_EXIT';
  timestamp: number;
}

export interface TraderSyncCheckpoint {
  key: string; // `${accountId}::${source}::${traderId}`
  accountId: string;
  source: 'COPY_TRADING' | 'SMART_MONEY';
  traderId: string;
  traderName: string;
  version: number;
  lastProcessedActionId: string | null;
  lastProcessedTimestamp: number;
  processedActionIds: string[];
  lastActionsBySymbol?: Record<string, TraderSymbolSyncAction>;
  updatedAt: number;
}

// ==========================================
// 1. Copy Trading (binance.com/en/copy-trading)
// ==========================================
export type CopyTradingSortType = 'PNL' | 'ROI' | 'MDD' | 'WIN_RATE' | 'AUM' | 'COPY_COUNT';
export type CopyTradingTimeRange = '7D' | '30D' | '90D' | '365D';

export interface CopyTraderItem {
  leadPortfolioId: string;
  nickname: string;
  avatarUrl: string;
  currentCopyCount: number;
  maxCopyCount: number;
  roi: number;
  pnl: number;
  aum: number;
  mdd: number;
  winRate: number;
  copierPnl: number;
  sharpRatio: number | null;
  chartItems: { value: number; dataType: string; dateTime: number }[];
  badgeName?: string | null;
  leadingDays?: number;
}

export interface CopyTraderDetail {
  leadPortfolioId: string;
  nickname: string;
  avatarUrl: string;
  description: string;
  currentCopyCount: number;
  maxCopyCount: number;
  totalCopyCount: number;
  roi: number;
  pnl: number;
  copierPnl: number;
  aum: number;
  marginBalance: number;
  mdd: number;
  winRate: number;
  sharpRatio: number | null;
  profitSharingRate: number;
  winOrders: number;
  totalOrders: number;
  tag: string[];
  positionShow: boolean;
  leadingDays?: number;
}

export interface TraderOpenPosition {
  id: string;
  symbol: string;
  collateral: string;
  positionAmount: number;
  initialPositionAmount?: number;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  markPrice: number;
  breakEvenPrice: number;
  unrealizedProfit: number;
  cumRealized: number;
  notionalValue: number;
  leverage: number;
  isolated: boolean;
  roePercent: number;
  entryTime: number; // وقت دخول المتداول في الصفقة
  lastUpdateTime: number; // وقت آخر حركة تدعيم أو انسحاب جزئي
  currentScalePercent: number; // الحجم الحالي بالنسبة المئوية مقارنة بالدخول الأولي (مثلاً 135% أو 70%)
  scaleAdjustments: PositionScaleAdjustment[]; // أوقات وأحجام التدعيم والانسحاب الجزئي بالنسب المئوية
}

export type RecordActionCategory = 'ENTRY' | 'SCALE_IN' | 'PARTIAL_EXIT' | 'EXIT';

export interface TraderLatestRecord {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: 'BUY' | 'SELL';
  type: string;
  positionSide: 'LONG' | 'SHORT' | 'BOTH';
  actionType: RecordActionCategory;
  actionLabelAr: string;
  volumePercent: number; // نسبة الدخول (100%) أو التدعيم (+30%) أو الانسحاب الجزئي (-40%) أو الخروج الكامل (-100%)
  remainingPercentAfter: number;
  executedQty: number;
  avgPrice: number;
  totalPnl: number;
  orderTime: number; // وقت العملية
  entryTime?: number; // وقت الدخول الأصلي للصفقة المرتبطة
  exitTime?: number; // وقت الخروج في حال الإغلاق الجزئي أو الكلي
}

export interface TraderPositionHistoryItem {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  opened: number; // وقت الدخول
  closed: number; // وقت الخروج
  avgCost: number;
  avgClosePrice: number;
  closingPnl: number;
  maxOpenInterest: number;
  closedVolume: number;
  isolated: boolean;
  scaleAdjustments: PositionScaleAdjustment[]; // تفاصيل أوقات ونسب التدعيم والانسحاب قبل الإغلاق
}

// ==========================================
// 2. Smart Money / Whales (binance.com/en/smart-money)
// ==========================================
export type SmartMoneySortType = 'PNL' | 'ROI' | 'SUBSCRIBERS';
export type SmartMoneyTimeRange = '7D' | '30D' | '90D' | '365D' | 'ALL';

export interface SmartMoneyTraderItem {
  topTraderId: string;
  traderName: string;
  accountName: string;
  avatarUrl: string;
  subscribers: number;
  roi: number; // e.g. 0.5011 -> 50.11%
  pnl: number;
  assets: number;
  mdd: number | null;
  positionStatus: 'IN_POSITION' | 'NO_POSITION' | 'PRIVATE_POSITION' | string;
  chartItems: [number, number][];
  daysActive?: number;
}

export interface SmartMoneyTraderProfile {
  topTraderId: string;
  traderName: string;
  accountName: string;
  avatarUrl: string;
  introduction: string;
  sharingPosition: boolean;
  sharingPositionHistory: boolean;
  sharingLatestRecord: boolean;
  roi: number;
  pnl: number;
  umMarginBalance: number;
  cmMarginBalance: number;
  daysActive: number;
  mdd: number;
  winRate: number;
  netTransfer: number;
  subscribers: number;
  leadPortfolioId: string | null;
}

// ==========================================
// 3. Active Copy / Sync Session
// ==========================================
export interface CopiedSyncLog {
  id: string;
  timestamp: number;
  traderId: string;
  traderName: string;
  source: 'COPY_TRADING' | 'SMART_MONEY';
  action: 'ENTRY' | 'SCALE_IN' | 'PARTIAL_EXIT' | 'EXIT' | 'POSITION_SYNC';
  volumePercent?: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  price: number;
  traderEntryPrice?: number;
  traderEntryTime?: number;
  userEntryTime?: number;
  quantity: number;
  leverage: number;
  messageAr: string;
  accountId?: string;
  accountName?: string;
}

export interface ActiveCopiedTrader {
  traderId: string;
  nickname: string;
  avatarUrl: string;
  source: 'COPY_TRADING' | 'SMART_MONEY';
  copyBudgetUsdt: number;
  leverageOverride: number | null;
  startedAt: number;
  syncedPositionsCount: number;
  syncedRecordsCount: number;
  autoFollowRecords: boolean;
  accountId?: string;
  accountName?: string;
}

// ==========================================
// 4. KuCoin API & Real Trading Models
// ==========================================
export type KuCoinMarketType = 'FUTURES' | 'SPOT';

export interface KuCoinConfig {
  apiKey: string;
  apiSecret: string;
  passphrase: string; // KuCoin requires API Passphrase (KC-API-PASSPHRASE)
  apiType: 'REAL' | 'SANDBOX';
  marketType: KuCoinMarketType;
  enableLiveExecution: boolean; // false = simulation/dry-run, true = send real orders to KuCoin
  defaultLeverage: number;
  maxOrderUsdt: number;
  manualRealBalanceUsdt?: number | null;
  manualFuturesBalanceUsdt?: number | null;
  manualSpotBalanceUsdt?: number | null;
}

export interface KuCoinBalance {
  currency: string;
  balance: number;
  available: number;
  holds: number;
}

export interface KuCoinPosition {
  symbol: string;
  currentQty: number;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  markPrice: number;
  realisedPnl: number;
  unrealisedPnl: number;
  leverage: number;
  marginType: string;
  isOpen: boolean;
}

export interface KuCoinOrderRecord {
  id: string;
  orderId: string;
  clientOid: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  price: number;
  size: number;
  dealSize: number;
  status: 'NEW' | 'DONE' | 'CANCELLED' | 'SIMULATED';
  createdAt: number;
  sourceTraderName?: string;
  sourceSignal?: string;
  isRealKuCoin: boolean;
}

export interface KuCoinConnectionState {
  isTesting: boolean;
  isConnected: boolean;
  isAuthenticated: boolean;
  isLiveBalanceVerified?: boolean;
  isKeyAndPassphraseValidOnServer?: boolean;
  needsSecretKeyForBalance?: boolean;
  serverTimeFormatted: string | null;
  latencyMs: number | null;
  usdtBalance: number;
  availableUsdt: number;
  spotBalanceUsdt?: number;
  futuresBalanceUsdt?: number;
  mainBalanceUsdt?: number;
  marginBalanceUsdt?: number;
  inOrderUsdt?: number;
  unrealizedPnlUsdt?: number;
  positions: KuCoinPosition[];
  recentOrders: KuCoinOrderRecord[];
  statusMessageAr: string;
  errorMessageAr: string | null;
}

export interface FuturesKlinePoint {
  timestamp: number;
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ==========================================
// 5. Mobile Trade Notifications (فتح صفقات، التدعيم، الانسحاب الجزئي، الخروج الكامل، وتنبيهات التراجع)
// ==========================================
export type MobileNotificationActionType =
  | 'OPEN_TRADE'
  | 'SCALE_IN'
  | 'PARTIAL_EXIT'
  | 'FULL_EXIT'
  | 'DRAWDOWN_ALERT'
  | 'RECONNECT_TRADE_CHOICE'
  | 'POSITION_SECURED';

export interface MobileTradeNotification {
  id: string;
  timestamp: number;
  read: boolean;
  actionType: MobileNotificationActionType;
  actionTitleAr: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  executionMode: TradingExecutionMode;
  traderName: string;
  sourceType: 'COPY_TRADING' | 'SMART_MONEY' | 'MANUAL';
  price: number; // سعر الدخول أو سعر التنفيذ الحالي
  entryPrice: number; // سعر الدخول الأساسي/المتوسط
  exitPrice?: number; // سعر الخروج عند السحب الجزئي أو الإغلاق
  quantity: number; // الكمية بالعملة
  marginUsdt: number; // الهامش الكلي الحالي أو الابتدائي بالدولار
  marginDeltaUsdt?: number; // قيمة التدعيم المضافة (+) أو المسحوبة (-) بالدولار
  volumePercent: number; // نسبة الحركة (100% فتح، +30% تدعيم، -40% سحب، -100% إغلاق)
  remainingScalePercent: number; // النسبة المتبقية أو الحجم الحالي بعد الحركة (مثلاً 130% أو 60% أو 0%)
  commissionUsdt: number; // العمولة بالدولار
  realizedPnlUsdt?: number; // الربح/الخسارة المحققة بالدولار (عند السحب الجزئي أو الخروج)
  realizedPnlPercent?: number; // نسبة الربح/الخسارة المحققة %
  accountId?: string; // معرف الحساب الافتراضي
  accountName?: string; // اسم الحساب الافتراضي
  drawdownPercent?: number; // نسبة التراجع الحالية من رأس المال الأولي %
  drawdownThresholdPercent?: number; // حد التنبيه المحدد % (مثلاً 10%)
  initialBalanceUsdt?: number; // رأس المال الأولي للحساب
  currentEquityUsdt?: number; // الرصيد الإجمالي الحالي للحساب (Equity)
  drawdownLossUsdt?: number; // مقدار التراجع بالدولار من رأس المال الأولي
  pendingTradeChoiceId?: string; // معرف خيار تنفيذ الصفقة السابقة بعد الانقطاع
  traderOriginalEntryPrice?: number; // سعر دخول المتداول الأصلي للمقارنة مع السعر الحالي
  traderOriginalEntryTime?: number; // وقت دخول المتداول الأصلي
  userEntryTime?: number; // وقت دخول المستخدم الفعلي في الصفقة
  stopLossPrice?: number; // سعر وقف الخسارة عند تأمين الصفقة
  eventKey?: string; // مفتاح فريد لمنع تكرار نفس الإشعار أكثر من مرة
  summaryTextAr: string;
}

export type AppExitBehaviorMode = 'KEEP_ALIVE_BACKGROUND' | 'FULL_EXIT';

export interface MobileNotificationSettings {
  enabled: boolean;
  notifyOnOpen: boolean;
  notifyOnScaleIn: boolean;
  notifyOnPartialExit: boolean;
  notifyOnFullExit: boolean;
  notifyOnDrawdown: boolean;
  drawdownThresholdPercent: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  browserPushEnabled: boolean;
  inAppBannerEnabled: boolean;
  lockScreenNotificationsEnabled: boolean;
  lockScreenShowSensitiveDetails: boolean;
  appExitBehavior: AppExitBehaviorMode;
  wakeLockEnabled: boolean;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
}

export type KuCoinLockScope = 'ALWAYS_ON_TAB_OPEN' | 'SESSION_TIMEOUT';

export interface KuCoinSecurityLockConfig {
  enabled: boolean;
  pinCode: string;
  biometricEnabled: boolean;
  biometricCredentialId?: string | null;
  lockScope: KuCoinLockScope;
  sessionTimeoutMinutes: number;
  protectRealTradingSwitch: boolean;
}



