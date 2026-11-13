/**
 * Shared formatting helpers ensuring all numbers, dates, times, currencies,
 * and percentages strictly use Western Arabic numerals (0123456789)
 * and clean LTR numeric sign placement inside RTL Arabic UI.
 */

const HINDI_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeToWesternDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[٠-٩]/g, (d) => String(HINDI_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
}

export function formatDateTimeWestern(
  ts: number | string | Date,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }
): string {
  const date = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(date.getTime())) return '--';
  return normalizeToWesternDigits(date.toLocaleString('ar-EG-u-nu-latn', options));
}

export function formatDateWestern(
  ts: number | string | Date,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const date = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(date.getTime())) return '--';
  return normalizeToWesternDigits(date.toLocaleDateString('ar-EG-u-nu-latn', options));
}

export function formatTimeWestern(
  ts: number | string | Date,
  options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }
): string {
  const date = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(date.getTime())) return '--';
  return normalizeToWesternDigits(date.toLocaleTimeString('ar-EG-u-nu-latn', options));
}

export function formatWeekdayWestern(ts: number | string | Date): string {
  const date = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(date.getTime())) return '--';
  return normalizeToWesternDigits(date.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long' }));
}

export function formatNumberWestern(
  val: number,
  options: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }
): string {
  if (!Number.isFinite(val)) return '0.00';
  return normalizeToWesternDigits(val.toLocaleString('en-US', options));
}

export function formatSignedCurrency(
  val: number,
  options?: {
    currency?: '$' | 'USDT';
    compact?: boolean;
    decimals?: number;
    alwaysShowSign?: boolean;
  }
): string {
  const currency = options?.currency ?? '$';
  const compact = options?.compact ?? false;
  const decimals = options?.decimals ?? 2;
  const alwaysShowSign = options?.alwaysShowSign ?? true;

  if (!Number.isFinite(val)) {
    return currency === '$' ? '$0.00' : '0.00 USDT';
  }

  const sign = val > 0 ? (alwaysShowSign ? '+' : '') : val < 0 ? '-' : '';
  const abs = Math.abs(val);

  let formattedNum: string;
  if (compact) {
    if (abs >= 1_000_000) {
      formattedNum = `${(abs / 1_000_000).toFixed(2)}M`;
    } else if (abs >= 1_000) {
      formattedNum = `${(abs / 1_000).toFixed(1)}K`;
    } else {
      formattedNum = abs.toFixed(decimals);
    }
  } else {
    formattedNum = abs.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  const out = currency === '$' ? `${sign}$${formattedNum}` : `${sign}${formattedNum} USDT`;
  return normalizeToWesternDigits(out);
}

export function formatSignedPercent(
  val: number,
  decimals = 2,
  alwaysShowSign = true
): string {
  if (!Number.isFinite(val)) return '0.00%';
  const sign = val > 0 ? (alwaysShowSign ? '+' : '') : val < 0 ? '-' : '';
  const abs = Math.abs(val).toFixed(decimals);
  return normalizeToWesternDigits(`${sign}${abs}%`);
}
