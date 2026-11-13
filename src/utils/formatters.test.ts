import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeToWesternDigits,
  formatDateTimeWestern,
  formatDateWestern,
  formatTimeWestern,
  formatWeekdayWestern,
  formatNumberWestern,
  formatSignedCurrency,
  formatSignedPercent,
} from './formatters';

const HINDI_RE = /[\u0660-\u0669\u06F0-\u06F9]/;

test('normalizeToWesternDigits converts Eastern Arabic and Persian digits to 0-9', () => {
  assert.equal(normalizeToWesternDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(normalizeToWesternDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(normalizeToWesternDigits('الخميس، ١٤ مايو ٢٠٢٦ ١١:٠٥'), 'الخميس، 14 مايو 2026 11:05');
});

test('date, time, and weekday formatters never emit Hindi numerals', () => {
  const sampleTs = Date.UTC(2026, 4, 14, 15, 30, 45);
  const dt = formatDateTimeWestern(sampleTs);
  const d = formatDateWestern(sampleTs);
  const t = formatTimeWestern(sampleTs);
  const wd = formatWeekdayWestern(sampleTs);

  assert.equal(HINDI_RE.test(dt), false, `Expected no Hindi numerals in "${dt}"`);
  assert.equal(HINDI_RE.test(d), false, `Expected no Hindi numerals in "${d}"`);
  assert.equal(HINDI_RE.test(t), false, `Expected no Hindi numerals in "${t}"`);
  assert.equal(HINDI_RE.test(wd), false, `Expected no Hindi numerals in "${wd}"`);
  assert.match(dt, /2026/);
  assert.match(d, /2026/);
  assert.ok(wd.length > 0);
});

test('signed currency and percent helpers produce clean LTR sign placement', () => {
  assert.equal(formatSignedCurrency(29390.66), '+$29,390.66');
  assert.equal(formatSignedCurrency(-142.5), '-$142.50');
  assert.equal(formatSignedCurrency(622500, { compact: true }), '+$622.5K');
  assert.equal(formatSignedCurrency(1500, { currency: 'USDT' }), '+1,500.00 USDT');
  assert.equal(formatSignedPercent(5878.13), '+5878.13%');
  assert.equal(formatSignedPercent(-12.345, 2), '-12.35%');
  assert.equal(formatNumberWestern(12345.678), '12,345.68');
});
