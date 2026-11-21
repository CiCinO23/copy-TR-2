import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePinDigits,
  isValidPinFormat,
  isWeakTrivialPin,
  needsInitialPinSetup,
  setupInitialPinAsync,
  verifyPinCodeAsync,
  validatePinChangeAsync,
  attemptPinUnlockAsync,
  shouldRequireUnlock,
  getPinLockoutRemainingMs,
  DEFAULT_KUCOIN_SECURITY_CONFIG,
} from '../kucoinSecurityLock';
import type { KuCoinSecurityLockConfig } from '../../types';

describe('KuCoin Security Lock Hardening (PBKDF2-SHA256, Strong PINs & Brute-Force Lockout)', () => {
  it('normalizes Western and Arabic-Indic digits and strips non-digits', () => {
    assert.equal(normalizePinDigits('849271'), '849271');
    assert.equal(normalizePinDigits('٨٤٩٢٧١'), '849271');
    assert.equal(normalizePinDigits('۹۸۷۶۵۴'), '987654');
    assert.equal(normalizePinDigits('84-92 71a!'), '849271');
  });

  it('validates PIN format (4-8 digits for legacy compat, blocks <4 or >8 and blocks trivial weak PINs)', () => {
    assert.equal(isValidPinFormat('123'), false);
    assert.equal(isValidPinFormat('849271'), true);
    assert.equal(isValidPinFormat('84927103'), true);
    assert.equal(isValidPinFormat('849271039'), false);
    assert.equal(isValidPinFormat('٨٤٩٢٧١'), true);

    assert.equal(isWeakTrivialPin('1234'), true);
    assert.equal(isWeakTrivialPin('123456'), true);
    assert.equal(isWeakTrivialPin('654321'), true);
    assert.equal(isWeakTrivialPin('000000'), true);
    assert.equal(isWeakTrivialPin('111111'), true);
    assert.equal(isWeakTrivialPin('849271'), false);
  });

  it('requires initial PIN setup (6-8 non-trivial digits) with no hardcoded default 1234', async () => {
    assert.equal(needsInitialPinSetup(DEFAULT_KUCOIN_SECURITY_CONFIG), true);
    assert.equal(DEFAULT_KUCOIN_SECURITY_CONFIG.pinHash, '');
    assert.equal((await verifyPinCodeAsync('1234', DEFAULT_KUCOIN_SECURITY_CONFIG.pinHash)).valid, false);
    assert.equal((await verifyPinCodeAsync('123456', DEFAULT_KUCOIN_SECURITY_CONFIG.pinHash)).valid, false);

    const shortSetup = await setupInitialPinAsync('8492', '8492');
    assert.equal(shortSetup.valid, false);

    const weakSetup = await setupInitialPinAsync('123456', '123456');
    assert.equal(weakSetup.valid, false);

    const mismatchSetup = await setupInitialPinAsync('849271', '849272');
    assert.equal(mismatchSetup.valid, false);

    const validSetup = await setupInitialPinAsync('٨٤٩٢٧١', '849271');
    assert.equal(validSetup.valid, true);
    assert.ok(validSetup.newPinHash?.startsWith('pbkdf2_v2:'));
    assert.equal(validSetup.normalizedNewPin, '849271');
  });

  it('verifies PBKDF2-SHA256 hashes and enforces progressive brute-force lockout', async () => {
    const setup = await setupInitialPinAsync('849271', '849271');
    assert.equal(setup.valid, true);
    let cfg: KuCoinSecurityLockConfig = {
      ...DEFAULT_KUCOIN_SECURITY_CONFIG,
      enabled: true,
      isPinConfigured: true,
      pinHash: setup.newPinHash!,
    };

    const nowBase = 1_700_000_000_000;
    // 4 wrong attempts -> not locked yet
    for (let i = 1; i <= 4; i++) {
      const res = await attemptPinUnlockAsync('999999', cfg, nowBase + i * 100);
      assert.equal(res.success, false);
      assert.equal(res.lockedRemainingMs, 0);
      assert.equal(res.updatedConfig.failedAttempts, i);
      cfg = res.updatedConfig;
    }

    // 5th wrong attempt -> triggers 60-second lockout
    const fifth = await attemptPinUnlockAsync('999999', cfg, nowBase + 500);
    assert.equal(fifth.success, false);
    assert.equal(fifth.lockedRemainingMs, 60_000);
    cfg = fifth.updatedConfig;
    assert.equal(getPinLockoutRemainingMs(cfg, nowBase + 500), 60_000);

    // Even the CORRECT PIN is blocked while lockout window is active
    const duringLockout = await attemptPinUnlockAsync('849271', cfg, nowBase + 10_000);
    assert.equal(duringLockout.success, false);
    assert.ok(duringLockout.lockedRemainingMs > 0);

    // After lockout expires, correct PIN succeeds and resets failedAttempts
    const afterExpiry = await attemptPinUnlockAsync('٨٤٩٢٧١', cfg, nowBase + 61_000);
    assert.equal(afterExpiry.success, true);
    assert.equal(afterExpiry.updatedConfig.failedAttempts, 0);
    assert.equal(afterExpiry.updatedConfig.lockedUntilMs, 0);
  });

  it('validates async PIN change flow and blocks weak new PINs', async () => {
    const setup = await setupInitialPinAsync('849271', '849271');
    const storedHash = setup.newPinHash!;

    const wrongCurrent = await validatePinChangeAsync('000000', storedHash, '739152', '739152');
    assert.equal(wrongCurrent.valid, false);

    const mismatch = await validatePinChangeAsync('849271', storedHash, '739152', '739153');
    assert.equal(mismatch.valid, false);

    const weakNew = await validatePinChangeAsync('849271', storedHash, '123456', '123456');
    assert.equal(weakNew.valid, false);

    const validChange = await validatePinChangeAsync('٨٤٩٢٧١', storedHash, '٧٣٩١٥٢', '739152');
    assert.equal(validChange.valid, true);
    assert.equal(validChange.normalizedNewPin, '739152');
    assert.ok(validChange.newPinHash?.startsWith('pbkdf2_v2:'));
    assert.equal((await verifyPinCodeAsync('739152', validChange.newPinHash!)).valid, true);
  });

  it('calculates shouldRequireUnlock accurately across lock scopes', () => {
    const now = 1_000_000;
    assert.equal(
      shouldRequireUnlock(
        { ...DEFAULT_KUCOIN_SECURITY_CONFIG, enabled: false },
        { isUnlocked: false, lastUnlockedAt: null, now }
      ),
      false
    );

    assert.equal(
      shouldRequireUnlock(
        { ...DEFAULT_KUCOIN_SECURITY_CONFIG, enabled: true },
        { isUnlocked: false, lastUnlockedAt: null, now }
      ),
      true
    );

    const sessionCfg = {
      ...DEFAULT_KUCOIN_SECURITY_CONFIG,
      enabled: true,
      lockScope: 'SESSION_TIMEOUT' as const,
      sessionTimeoutMinutes: 5,
    };
    assert.equal(
      shouldRequireUnlock(sessionCfg, {
        isUnlocked: true,
        lastUnlockedAt: now - 2 * 60 * 1000,
        now,
      }),
      false
    );
    assert.equal(
      shouldRequireUnlock(sessionCfg, {
        isUnlocked: true,
        lastUnlockedAt: now - 6 * 60 * 1000,
        now,
      }),
      true
    );
  });
});
