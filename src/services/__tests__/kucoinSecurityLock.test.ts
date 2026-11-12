import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePinDigits,
  isValidPinFormat,
  verifyPinCode,
  validatePinChange,
  shouldRequireUnlock,
  DEFAULT_KUCOIN_SECURITY_CONFIG,
} from '../kucoinSecurityLock';

describe('KuCoin Security Lock Pure Logic (PIN & Biometrics)', () => {
  it('normalizes Western and Arabic-Indic digits and strips non-digits', () => {
    assert.equal(normalizePinDigits('1234'), '1234');
    assert.equal(normalizePinDigits('١٢٣٤'), '1234');
    assert.equal(normalizePinDigits('۹۸۷۶'), '9876');
    assert.equal(normalizePinDigits('12-34 a!'), '1234');
  });

  it('validates 4-to-6 digit PIN formats', () => {
    assert.equal(isValidPinFormat('123'), false);
    assert.equal(isValidPinFormat('1234'), true);
    assert.equal(isValidPinFormat('123456'), true);
    assert.equal(isValidPinFormat('1234567'), false);
    assert.equal(isValidPinFormat('١٢٣٤'), true);
  });

  it('verifies entered PIN against stored PIN', () => {
    assert.equal(verifyPinCode('1234', '1234'), true);
    assert.equal(verifyPinCode('١٢٣٤', '1234'), true);
    assert.equal(verifyPinCode('9999', '1234'), false);
  });

  it('validates PIN change flow', () => {
    const wrongCurrent = validatePinChange('0000', '1234', '5678', '5678');
    assert.equal(wrongCurrent.valid, false);

    const mismatch = validatePinChange('1234', '1234', '5678', '5679');
    assert.equal(mismatch.valid, false);

    const tooShort = validatePinChange('1234', '1234', '56', '56');
    assert.equal(tooShort.valid, false);

    const validChange = validatePinChange('١٢٣٤', '1234', '٥٦٧٨', '5678');
    assert.equal(validChange.valid, true);
    assert.equal(validChange.normalizedNewPin, '5678');
  });

  it('calculates shouldRequireUnlock accurately across lock scopes', () => {
    const now = 1_000_000;
    // Disabled lock never requires unlock
    assert.equal(
      shouldRequireUnlock(
        { ...DEFAULT_KUCOIN_SECURITY_CONFIG, enabled: false },
        { isUnlocked: false, lastUnlockedAt: null, now }
      ),
      false
    );

    // Enabled lock when locked requires unlock
    assert.equal(
      shouldRequireUnlock(
        { ...DEFAULT_KUCOIN_SECURITY_CONFIG, enabled: true },
        { isUnlocked: false, lastUnlockedAt: null, now }
      ),
      true
    );

    // Session timeout check
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
