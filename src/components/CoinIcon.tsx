import React, { useState, useEffect } from 'react';

export interface CoinMetadata {
  nameEn: string;
  color: string;
  customUrls?: string[];
}

export const REAL_COIN_DATA: Record<string, CoinMetadata> = {
  BTC: {
    nameEn: 'Bitcoin',
    color: '#F7931A',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/btc.svg',
      'https://assets.coincap.io/assets/icons/btc@2x.png',
    ],
  },
  ETH: {
    nameEn: 'Ethereum',
    color: '#627EEA',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/eth.svg',
      'https://assets.coincap.io/assets/icons/eth@2x.png',
    ],
  },
  SOL: {
    nameEn: 'Solana',
    color: '#14F195',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/sol.svg',
      'https://assets.coincap.io/assets/icons/sol@2x.png',
    ],
  },
  BNB: {
    nameEn: 'BNB',
    color: '#F3BA2F',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/bnb.svg',
      'https://assets.coincap.io/assets/icons/bnb@2x.png',
    ],
  },
  XRP: {
    nameEn: 'Ripple',
    color: '#00AAE4',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/xrp.svg',
      'https://assets.coincap.io/assets/icons/xrp@2x.png',
    ],
  },
  DOGE: {
    nameEn: 'Dogecoin',
    color: '#C2A633',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/doge.svg',
      'https://assets.coincap.io/assets/icons/doge@2x.png',
    ],
  },
  ADA: {
    nameEn: 'Cardano',
    color: '#0033AD',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/ada.svg',
      'https://assets.coincap.io/assets/icons/ada@2x.png',
    ],
  },
  AVAX: {
    nameEn: 'Avalanche',
    color: '#E84142',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/avax.svg',
      'https://assets.coincap.io/assets/icons/avax@2x.png',
    ],
  },
  LINK: {
    nameEn: 'Chainlink',
    color: '#375BD2',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/link.svg',
      'https://assets.coincap.io/assets/icons/link@2x.png',
    ],
  },
  SUI: {
    nameEn: 'Sui',
    color: '#4DA2FF',
    customUrls: [
      'https://assets.coincap.io/assets/icons/sui@2x.png',
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sui/info/logo.png',
    ],
  },
  DOT: {
    nameEn: 'Polkadot',
    color: '#E6007A',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/dot.svg',
      'https://assets.coincap.io/assets/icons/dot@2x.png',
    ],
  },
  LTC: {
    nameEn: 'Litecoin',
    color: '#345D9D',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/ltc.svg',
      'https://assets.coincap.io/assets/icons/ltc@2x.png',
    ],
  },
  TON: {
    nameEn: 'Toncoin',
    color: '#0098EA',
    customUrls: [
      'https://assets.coincap.io/assets/icons/ton@2x.png',
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png',
    ],
  },
  TRX: {
    nameEn: 'TRON',
    color: '#EF0027',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/trx.svg',
      'https://assets.coincap.io/assets/icons/trx@2x.png',
    ],
  },
  ARB: {
    nameEn: 'Arbitrum',
    color: '#28A0F0',
    customUrls: [
      'https://assets.coincap.io/assets/icons/arb@2x.png',
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
    ],
  },
  NEAR: {
    nameEn: 'NEAR',
    color: '#00EC97',
    customUrls: [
      'https://assets.coincap.io/assets/icons/near@2x.png',
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/near.svg',
    ],
  },
  APT: {
    nameEn: 'Aptos',
    color: '#01BC8D',
    customUrls: [
      'https://assets.coincap.io/assets/icons/apt@2x.png',
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/aptos/info/logo.png',
    ],
  },
  OP: {
    nameEn: 'Optimism',
    color: '#FF0420',
    customUrls: [
      'https://assets.coincap.io/assets/icons/op@2x.png',
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
    ],
  },
  PEPE: {
    nameEn: 'Pepe',
    color: '#4C9540',
    customUrls: ['https://assets.coincap.io/assets/icons/pepe@2x.png'],
  },
  SHIB: {
    nameEn: 'Shiba Inu',
    color: '#FFA409',
    customUrls: ['https://assets.coincap.io/assets/icons/shib@2x.png'],
  },
  WIF: {
    nameEn: 'dogwifhat',
    color: '#E08256',
    customUrls: ['https://assets.coincap.io/assets/icons/wif@2x.png'],
  },
  BONK: {
    nameEn: 'Bonk',
    color: '#F8A11E',
    customUrls: ['https://assets.coincap.io/assets/icons/bonk@2x.png'],
  },
  FLOKI: {
    nameEn: 'Floki',
    color: '#F0A500',
    customUrls: ['https://assets.coincap.io/assets/icons/floki@2x.png'],
  },
  INJ: {
    nameEn: 'Injective',
    color: '#00F2FE',
    customUrls: ['https://assets.coincap.io/assets/icons/inj@2x.png'],
  },
  SEI: {
    nameEn: 'Sei',
    color: '#9B1C1C',
    customUrls: ['https://assets.coincap.io/assets/icons/sei@2x.png'],
  },
  TIA: {
    nameEn: 'Celestia',
    color: '#7B2BF9',
    customUrls: ['https://assets.coincap.io/assets/icons/tia@2x.png'],
  },
  WLD: {
    nameEn: 'Worldcoin',
    color: '#14B8A6',
    customUrls: ['https://assets.coincap.io/assets/icons/wld@2x.png'],
  },
  JUP: {
    nameEn: 'Jupiter',
    color: '#19FB9B',
    customUrls: ['https://assets.coincap.io/assets/icons/jup@2x.png'],
  },
  HYPE: {
    nameEn: 'Hyperliquid',
    color: '#01BC8D',
    customUrls: ['https://assets.coincap.io/assets/icons/hype@2x.png'],
  },
  ENA: {
    nameEn: 'Ethena',
    color: '#3B82F6',
    customUrls: ['https://assets.coincap.io/assets/icons/ena@2x.png'],
  },
  ONDO: {
    nameEn: 'Ondo',
    color: '#6366F1',
    customUrls: ['https://assets.coincap.io/assets/icons/ondo@2x.png'],
  },
  PENDLE: {
    nameEn: 'Pendle',
    color: '#06B6D4',
    customUrls: ['https://assets.coincap.io/assets/icons/pendle@2x.png'],
  },
  RENDER: {
    nameEn: 'Render',
    color: '#E11D48',
    customUrls: [
      'https://assets.coincap.io/assets/icons/render@2x.png',
      'https://assets.coincap.io/assets/icons/rndr@2x.png',
    ],
  },
  RNDR: {
    nameEn: 'Render',
    color: '#E11D48',
    customUrls: [
      'https://assets.coincap.io/assets/icons/rndr@2x.png',
      'https://assets.coincap.io/assets/icons/render@2x.png',
    ],
  },
  FET: {
    nameEn: 'ASI / Fetch',
    color: '#4F46E5',
    customUrls: ['https://assets.coincap.io/assets/icons/fet@2x.png'],
  },
  TAO: {
    nameEn: 'Bittensor',
    color: '#10B981',
    customUrls: ['https://assets.coincap.io/assets/icons/tao@2x.png'],
  },
  KAS: {
    nameEn: 'Kaspa',
    color: '#49EACB',
    customUrls: ['https://assets.coincap.io/assets/icons/kas@2x.png'],
  },
  AAVE: {
    nameEn: 'Aave',
    color: '#B6509E',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/aave.svg',
      'https://assets.coincap.io/assets/icons/aave@2x.png',
    ],
  },
  UNI: {
    nameEn: 'Uniswap',
    color: '#FF007A',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/uni.svg',
      'https://assets.coincap.io/assets/icons/uni@2x.png',
    ],
  },
  ATOM: {
    nameEn: 'Cosmos',
    color: '#2E3148',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/atom.svg',
      'https://assets.coincap.io/assets/icons/atom@2x.png',
    ],
  },
  FIL: {
    nameEn: 'Filecoin',
    color: '#0090FF',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/fil.svg',
      'https://assets.coincap.io/assets/icons/fil@2x.png',
    ],
  },
  BCH: {
    nameEn: 'Bitcoin Cash',
    color: '#8DC351',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/bch.svg',
      'https://assets.coincap.io/assets/icons/bch@2x.png',
    ],
  },
  ETC: {
    nameEn: 'Ethereum Classic',
    color: '#328332',
    customUrls: [
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/etc.svg',
      'https://assets.coincap.io/assets/icons/etc@2x.png',
    ],
  },
};

const FALLBACK_COLORS = [
  '#01BC8D',
  '#F7931A',
  '#627EEA',
  '#00C8FF',
  '#F3BA2F',
  '#E84142',
  '#4DA2FF',
  '#E6007A',
  '#14F195',
  '#9945FF',
];

/**
 * استخراج رمز العملة الأساسي من رمز عقد الفيوتشر (مثلاً 1000PEPEUSDT -> PEPE، XBTUSDTM -> BTC)
 */
export function extractBaseCoin(symbol: string): string {
  if (!symbol) return 'BTC';
  let clean = symbol
    .toUpperCase()
    .trim()
    .replace(/[-_/]/g, '')
    .replace(/(USDTM|USDT|USDC|BUSD|FDUSD|PERP|USD)$/i, '');

  if (clean === 'XBT') clean = 'BTC';

  const withoutMultiplier = clean.replace(/^(1000000|100000|10000|1000|1M)/, '');
  if (withoutMultiplier.length >= 2) {
    clean = withoutMultiplier;
  }

  return clean || 'BTC';
}

/**
 * بناء قائمة روابط الأيقونات المتعددة بالترتيب لضمان عمل الأيقونة من أكثر من مصدر رسمي
 */
export function getCoinIconCandidates(symbol: string): string[] {
  const base = extractBaseCoin(symbol);
  const lower = base.toLowerCase();
  const meta = REAL_COIN_DATA[base];

  const list: string[] = [
    ...(meta?.customUrls || []),
    `https://assets.coincap.io/assets/icons/${lower}@2x.png`,
    `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${lower}.svg`,
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${lower}.svg`,
    `https://cdn.jsdelivr.net/gh/vadimmalykhin/binance-icons/crypto/${lower}.svg`,
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${lower}.png`,
  ];

  return Array.from(new Set(list));
}

export interface CoinIconProps {
  symbol: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * مكون أيقونة العملة الحقيقية مع تبديل تلقائي متعدد المصادر (Multi-CDN Auto-Fallback)
 */
export const CoinIcon: React.FC<CoinIconProps> = ({
  symbol,
  size = 'md',
  className = '',
}) => {
  const base = extractBaseCoin(symbol);
  const candidates = React.useMemo(() => getCoinIconCandidates(symbol), [symbol]);
  const [candidateIdx, setCandidateIdx] = useState<number>(0);

  useEffect(() => {
    setCandidateIdx(0);
  }, [symbol]);

  const dimClass =
    size === 'xs'
      ? 'w-4 h-4 min-w-[16px] text-[8px]'
      : size === 'sm'
      ? 'w-5 h-5 min-w-[20px] text-[9px]'
      : size === 'lg'
      ? 'w-10 h-10 min-w-[40px] text-xs'
      : 'w-8 h-8 min-w-[32px] text-[10px]';

  const meta = REAL_COIN_DATA[base];
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = base.charCodeAt(i) + ((hash << 5) - hash);
  }
  const brandColor =
    meta?.color || FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];

  const currentUrl = candidates[candidateIdx];

  if (!currentUrl) {
    return (
      <div
        className={`${dimClass} ${className} rounded-full flex items-center justify-center font-bold shrink-0 font-mono shadow-sm select-none`}
        style={{
          background: `radial-gradient(circle at 30% 30%, ${brandColor}33, #12171D 80%)`,
          border: `1.5px solid ${brandColor}88`,
          color: brandColor,
        }}
        title={base}
      >
        {base.slice(0, 4)}
      </div>
    );
  }

  return (
    <div
      className={`${dimClass} ${className} rounded-full bg-[#12171D] p-0.5 border border-[#232E3A] flex items-center justify-center shrink-0 shadow-sm overflow-hidden`}
      title={meta?.nameEn ? `${meta.nameEn} (${base})` : base}
    >
      <img
        src={currentUrl}
        alt={base}
        referrerPolicy="no-referrer"
        onError={() => setCandidateIdx((prev) => prev + 1)}
        className="w-full h-full object-contain rounded-full"
      />
    </div>
  );
};
