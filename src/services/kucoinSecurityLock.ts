import { KuCoinSecurityLockConfig } from '../types';
import {
  hashPinPbkdf2,
  verifyPinPbkdf2,
  isPbkdf2Hash,
  setActiveSessionPin,
  clearActiveSessionPin,
} from './secureVault';

export const KUCOIN_SECURITY_STORAGE_KEY = 'whale_kucoin_security_lock_v1';
const LEGACY_PIN_HASH_SALT = 'CopyTR_v223_PIN_SALT_#9182';
const LEGACY_PIN_HASH_PREFIX = 'h1:';

const TRIVIAL_PINS = new Set([
  '0000',
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  '1234',
  '4321',
  '12345',
  '54321',
  '123456',
  '654321',
  '000000',
  '111111',
  '1122',
  '2580',
]);

/**
 * Normalizes Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to standard ASCII digits (0-9)
 * and strips any non-digit characters.
 */
export function normalizePinDigits(raw: string): string {
  return String(raw || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[^0-9]/g, '');
}

/**
 * Checks whether a normalized PIN string is between 4 and 8 digits (4-6+ supported).
 */
export function isValidPinFormat(pin: string): boolean {
  const clean = normalizePinDigits(pin);
  return clean.length >= 4 && clean.length <= 8 && /^\d{4,8}$/.test(clean);
}

/**
 * Detects trivial, easily guessed PINs (e.g., 1234, 0000, 1111, 123456, all-same digits).
 */
export function isWeakTrivialPin(pin: string): boolean {
  const clean = normalizePinDigits(pin);
  if (TRIVIAL_PINS.has(clean)) return true;
  if (/^(\d)\1+$/.test(clean)) return true;
  return false;
}

/**
 * Legacy synchronous hash kept ONLY to verify & auto-migrate existing users' pre-v2.25 hashes.
 * New PINs are always hashed with PBKDF2-SHA256 (100,000 iterations + random 128-bit salt).
 */
export function hashPinLegacySync(pin: string): string {
  const clean = normalizePinDigits(pin);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const input = `${LEGACY_PIN_HASH_SALT}:${clean}:${clean.length}`;

  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i) ^ (round & 0xff);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= ch + ((h1 >>> 13) & 0xff);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    h1 ^= h2 >>> 16;
    h2 ^= h1 >>> 13;
  }

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${LEGACY_PIN_HASH_PREFIX}${hex1}${hex2}`;
}

export function isLegacyPinHash(value?: string | null): boolean {
  return (
    typeof value === 'string' &&
    value.startsWith(LEGACY_PIN_HASH_PREFIX) &&
    value.length > 12
  );
}

export function isPinHashed(value?: string | null): boolean {
  return isPbkdf2Hash(value) || isLegacyPinHash(value);
}

/**
 * Computes progressive brute-force lockout duration (ms) based on consecutive failed attempts.
 */
export function computeLockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts >= 10) return 15 * 60 * 1000; // 15 minutes
  if (failedAttempts >= 8) return 5 * 60 * 1000; // 5 minutes
  if (failedAttempts >= 5) return 60 * 1000; // 60 seconds
  return 0;
}

export function getPinLockoutRemainingMs(
  config: Pick<KuCoinSecurityLockConfig, 'lockedUntilMs'>,
  nowMs: number = Date.now()
): number {
  const until = Number(config.lockedUntilMs || 0);
  return until > nowMs ? until - nowMs : 0;
}

export const DEFAULT_KUCOIN_SECURITY_CONFIG: KuCoinSecurityLockConfig = {
  enabled: true,
  pinCode: '',
  pinHash: '',
  isPinConfigured: false,
  failedAttempts: 0,
  lockedUntilMs: 0,
  biometricEnabled: false,
  biometricCredentialId: null,
  lockScope: 'ALWAYS_ON_TAB_OPEN',
  sessionTimeoutMinutes: 5,
  protectRealTradingSwitch: true,
};

/**
 * Returns true if the user has not yet configured a personal PIN (first-run setup required).
 */
export function needsInitialPinSetup(config: KuCoinSecurityLockConfig): boolean {
  if (config.isPinConfigured === false) return true;
  return !isPinHashed(config.pinHash);
}

/**
 * Cryptographic async verification supporting PBKDF2-SHA256 (`pbkdf2_v2:`) and transparent
 * migration of legacy `h1:` hashes. Rejects empty hashes and never falls back to a default PIN.
 */
export async function verifyPinCodeAsync(
  inputPin: string,
  storedHash: string
): Promise<{ valid: boolean; needsMigrationToPbkdf2: boolean }> {
  const cleanInput = normalizePinDigits(inputPin);
  if (!cleanInput || !storedHash) {
    return { valid: false, needsMigrationToPbkdf2: false };
  }

  const target = storedHash.trim();
  if (isPbkdf2Hash(target)) {
    const valid = await verifyPinPbkdf2(cleanInput, target);
    return { valid, needsMigrationToPbkdf2: false };
  }

  if (isLegacyPinHash(target)) {
    const valid = hashPinLegacySync(cleanInput) === target;
    return { valid, needsMigrationToPbkdf2: valid };
  }

  return { valid: false, needsMigrationToPbkdf2: false };
}

/**
 * Verifies a PIN with brute-force lockout tracking, auto-upgrades legacy hashes to PBKDF2-SHA256,
 * and registers the verified PIN in JS memory for AES-256-GCM secret decryption.
 */
export async function attemptPinUnlockAsync(
  inputPin: string,
  config: KuCoinSecurityLockConfig,
  nowMs: number = Date.now()
): Promise<{
  success: boolean;
  updatedConfig: KuCoinSecurityLockConfig;
  lockedRemainingMs: number;
  errorAr?: string;
}> {
  const remainingLock = getPinLockoutRemainingMs(config, nowMs);
  if (remainingLock > 0) {
    const secs = Math.ceil(remainingLock / 1000);
    return {
      success: false,
      updatedConfig: config,
      lockedRemainingMs: remainingLock,
      errorAr: `تم قفل المحاولات مؤقتاً لحماية المحفظة. يرجى الانتظار ${secs} ثانية قبل المحاولة مجدداً.`,
    };
  }

  if (needsInitialPinSetup(config)) {
    return {
      success: false,
      updatedConfig: config,
      lockedRemainingMs: 0,
      errorAr: 'لم يتم تعيين رمز PIN بعد. يرجى إنشاء رمز PIN شخصي أولاً.',
    };
  }

  const cleanInput = normalizePinDigits(inputPin);
  const check = await verifyPinCodeAsync(cleanInput, config.pinHash || '');

  if (check.valid) {
    let nextHash = config.pinHash || '';
    if (check.needsMigrationToPbkdf2) {
      nextHash = await hashPinPbkdf2(cleanInput);
    }
    setActiveSessionPin(cleanInput);
    const updatedConfig = saveKuCoinSecurityConfig({
      ...config,
      pinHash: nextHash,
      isPinConfigured: true,
      failedAttempts: 0,
      lockedUntilMs: 0,
    });
    return {
      success: true,
      updatedConfig,
      lockedRemainingMs: 0,
    };
  }

  const nextAttempts = (config.failedAttempts || 0) + 1;
  const lockoutMs = computeLockoutDurationMs(nextAttempts);
  const lockedUntilMs = lockoutMs > 0 ? nowMs + lockoutMs : 0;
  const updatedConfig = saveKuCoinSecurityConfig({
    ...config,
    failedAttempts: nextAttempts,
    lockedUntilMs,
  });

  if (lockoutMs > 0) {
    const secs = Math.ceil(lockoutMs / 1000);
    return {
      success: false,
      updatedConfig,
      lockedRemainingMs: lockoutMs,
      errorAr: `تجاوزت الحد المسموح من المحاولات (${nextAttempts}). تم قفل المحاولات لمدة ${secs} ثانية.`,
    };
  }

  const leftBeforeLock = Math.max(0, 5 - nextAttempts);
  return {
    success: false,
    updatedConfig,
    lockedRemainingMs: 0,
    errorAr: `رمز PIN غير صحيح. المحاولات المتبقية قبل القفل المؤقت: ${leftBeforeLock}.`,
  };
}

/**
 * First-run PIN setup: validates strength (6+ recommended, 4-8 digits, blocks trivial PINs like 1234),
 * hashes with PBKDF2-SHA256 + random 128-bit salt, and saves config.
 */
export async function setupInitialPinAsync(
  newPin: string,
  confirmPin: string
): Promise<{
  valid: boolean;
  errorAr?: string;
  normalizedNewPin?: string;
  newPinHash?: string;
  updatedConfig?: KuCoinSecurityLockConfig;
}> {
  const cleanNew = normalizePinDigits(newPin);
  const cleanConfirm = normalizePinDigits(confirmPin);

  if (!isValidPinFormat(cleanNew) || cleanNew.length < 6) {
    return {
      valid: false,
      errorAr: 'يجب أن يتكون رمز PIN من 6 إلى 8 أرقام لحماية قوية للمحفظة.',
    };
  }

  if (isWeakTrivialPin(cleanNew)) {
    return {
      valid: false,
      errorAr: 'رمز PIN ضعيف جداً (مثل 123456 أو أرقام مكررة). يرجى اختيار رمز أقوى.',
    };
  }

  if (cleanNew !== cleanConfirm) {
    return {
      valid: false,
      errorAr: 'رمز PIN الجديد وتأكيد الرمز غير متطابقين.',
    };
  }

  const newPinHash = await hashPinPbkdf2(cleanNew);
  setActiveSessionPin(cleanNew);
  const updatedConfig = saveKuCoinSecurityConfig({
    enabled: true,
    pinCode: '',
    pinHash: newPinHash,
    isPinConfigured: true,
    failedAttempts: 0,
    lockedUntilMs: 0,
  });

  return {
    valid: true,
    normalizedNewPin: cleanNew,
    newPinHash,
    updatedConfig,
  };
}

/**
 * Validates changing the PIN code from `currentInput` to `newPin` & `confirmPin` using PBKDF2-SHA256.
 */
export async function validatePinChangeAsync(
  currentInput: string,
  storedHash: string,
  newPin: string,
  confirmPin: string
): Promise<{
  valid: boolean;
  errorAr?: string;
  normalizedCurrentPin?: string;
  normalizedNewPin?: string;
  newPinHash?: string;
}> {
  const cleanCurrent = normalizePinDigits(currentInput);
  const check = await verifyPinCodeAsync(cleanCurrent, storedHash);
  if (!check.valid) {
    return {
      valid: false,
      errorAr: 'رمز PIN الحالي غير صحيح. يرجى إدخال الرمز الحالي بشكل صحيح.',
    };
  }

  const cleanNew = normalizePinDigits(newPin);
  const cleanConfirm = normalizePinDigits(confirmPin);

  if (!isValidPinFormat(cleanNew) || cleanNew.length < 6) {
    return {
      valid: false,
      errorAr: 'يجب أن يتكون رمز PIN الجديد من 6 إلى 8 أرقام لحماية قوية.',
    };
  }

  if (isWeakTrivialPin(cleanNew)) {
    return {
      valid: false,
      errorAr: 'رمز PIN الجديد ضعيف جداً (مثل 123456 أو أرقام مكررة). يرجى اختيار رمز غير متوقع.',
    };
  }

  if (cleanNew !== cleanConfirm) {
    return {
      valid: false,
      errorAr: 'رمز PIN الجديد وتأكيد الرمز غير متطابقين.',
    };
  }

  const newPinHash = await hashPinPbkdf2(cleanNew);
  return {
    valid: true,
    normalizedCurrentPin: cleanCurrent,
    normalizedNewPin: cleanNew,
    newPinHash,
  };
}

/**
 * Wipes the unlocked session PIN from memory immediately when locking the vault.
 */
export function lockSecurityVaultSession(): void {
  clearActiveSessionPin();
}

/**
 * Pure function that determines whether the KuCoin Live Execution tab / real wallet requires unlocking right now.
 */
export function shouldRequireUnlock(
  config: KuCoinSecurityLockConfig,
  state: {
    isUnlocked: boolean;
    lastUnlockedAt: number | null;
    now: number;
  }
): boolean {
  if (!config.enabled) {
    return false;
  }
  if (!state.isUnlocked) {
    return true;
  }
  if (config.lockScope === 'SESSION_TIMEOUT') {
    if (!state.lastUnlockedAt) return true;
    const timeoutMs = Math.max(1, config.sessionTimeoutMinutes || 5) * 60 * 1000;
    return state.now - state.lastUnlockedAt > timeoutMs;
  }
  return false;
}

export function loadKuCoinSecurityConfig(): KuCoinSecurityLockConfig {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_KUCOIN_SECURITY_CONFIG };
    }
    const raw = localStorage.getItem(KUCOIN_SECURITY_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_KUCOIN_SECURITY_CONFIG };
    }
    const parsed = JSON.parse(raw);

    let resolvedHash = isPinHashed(parsed.pinHash) ? String(parsed.pinHash) : '';
    // Reject the old insecure hardcoded default 1234 hash so users must create a real personal PIN
    const oldDefault1234Hash = hashPinLegacySync('1234');
    if (resolvedHash === oldDefault1234Hash) {
      resolvedHash = '';
    }

    const isPinConfigured = Boolean(resolvedHash);

    const loaded: KuCoinSecurityLockConfig = {
      enabled:
        typeof parsed.enabled === 'boolean'
          ? parsed.enabled
          : DEFAULT_KUCOIN_SECURITY_CONFIG.enabled,
      pinCode: '', // Never retain plaintext PIN
      pinHash: resolvedHash,
      isPinConfigured,
      failedAttempts:
        typeof parsed.failedAttempts === 'number' && parsed.failedAttempts >= 0
          ? parsed.failedAttempts
          : 0,
      lockedUntilMs:
        typeof parsed.lockedUntilMs === 'number' && parsed.lockedUntilMs > 0
          ? parsed.lockedUntilMs
          : 0,
      biometricEnabled: Boolean(parsed.biometricEnabled),
      biometricCredentialId: parsed.biometricCredentialId || null,
      lockScope:
        parsed.lockScope === 'SESSION_TIMEOUT' ? 'SESSION_TIMEOUT' : 'ALWAYS_ON_TAB_OPEN',
      sessionTimeoutMinutes:
        typeof parsed.sessionTimeoutMinutes === 'number' && parsed.sessionTimeoutMinutes >= 1
          ? parsed.sessionTimeoutMinutes
          : DEFAULT_KUCOIN_SECURITY_CONFIG.sessionTimeoutMinutes,
      protectRealTradingSwitch:
        typeof parsed.protectRealTradingSwitch === 'boolean'
          ? parsed.protectRealTradingSwitch
          : DEFAULT_KUCOIN_SECURITY_CONFIG.protectRealTradingSwitch,
    };

    if (parsed.pinCode || parsed.pinHash === oldDefault1234Hash) {
      localStorage.setItem(KUCOIN_SECURITY_STORAGE_KEY, JSON.stringify(loaded));
    }

    return loaded;
  } catch {
    return { ...DEFAULT_KUCOIN_SECURITY_CONFIG };
  }
}

export function saveKuCoinSecurityConfig(
  partial: Partial<KuCoinSecurityLockConfig>
): KuCoinSecurityLockConfig {
  const current = loadKuCoinSecurityConfig();

  let nextHash = current.pinHash || '';
  if (partial.pinHash !== undefined && (partial.pinHash === '' || isPinHashed(partial.pinHash))) {
    nextHash = partial.pinHash;
  }

  const updated: KuCoinSecurityLockConfig = {
    ...current,
    ...partial,
    pinCode: '', // Never store plaintext PIN in localStorage
    pinHash: nextHash,
    isPinConfigured: isPinHashed(nextHash),
  };

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KUCOIN_SECURITY_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {
    // ignore storage errors
  }
  return updated;
}

function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

/**
 * Checks if WebAuthn platform biometric authenticator (Fingerprint / FaceID) is supported by the browser/device.
 */
export async function isPlatformBiometricSupported(): Promise<boolean> {
  try {
    if (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Performs genuine biometric verification using native Android BiometricPrompt bridge or WebAuthn.
 * Fails closed when hardware biometrics are unavailable or cancelled.
 */
export async function performBiometricAuthentication(
  existingCredentialId?: string | null
): Promise<{
  success: boolean;
  credentialId?: string | null;
  methodUsed: 'WEBAUTHN_NATIVE' | 'BIOMETRIC_SENSOR' | 'BIOMETRIC_UNAVAILABLE';
  messageAr: string;
}> {
  try {
    const win =
      typeof window !== 'undefined'
        ? (window as unknown as {
            AndroidBiometric?: { authenticate?: () => boolean | Promise<boolean> };
          })
        : null;
    if (win?.AndroidBiometric && typeof win.AndroidBiometric.authenticate === 'function') {
      const ok = await Promise.resolve(win.AndroidBiometric.authenticate());
      if (ok) {
        return {
          success: true,
          credentialId: existingCredentialId || `bio_android_${Date.now()}`,
          methodUsed: 'BIOMETRIC_SENSOR',
          messageAr: 'تم التحقق من بصمة الإصبع بنجاح عبر مستشعر الأندرويد.',
        };
      }
      return {
        success: false,
        credentialId: existingCredentialId || null,
        methodUsed: 'BIOMETRIC_SENSOR',
        messageAr: 'لم يتم التحقق من البصمة أو تم الإلغاء — يرجى إدخال رمز PIN.',
      };
    }
  } catch {
    // fall through to WebAuthn
  }

  const isGenuineWebAuthnCred =
    typeof existingCredentialId === 'string' && existingCredentialId.startsWith('webauthn:');

  if (
    isGenuineWebAuthnCred &&
    typeof window !== 'undefined' &&
    window.self === window.top &&
    typeof navigator !== 'undefined' &&
    navigator.credentials
  ) {
    try {
      const rawCredId = existingCredentialId.slice('webauthn:'.length);
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              id: base64UrlToBuffer(rawCredId),
              type: 'public-key',
              transports: ['internal'],
            },
          ],
          userVerification: 'required',
          timeout: 15_000,
        },
      });

      if (assertion) {
        return {
          success: true,
          credentialId: existingCredentialId,
          methodUsed: 'WEBAUTHN_NATIVE',
          messageAr: 'تم التحقق من بصمة الإصبع بنجاح عبر مستشعر الجهاز البيومتري.',
        };
      }
    } catch {
      return {
        success: false,
        credentialId: existingCredentialId,
        methodUsed: 'WEBAUTHN_NATIVE',
        messageAr: 'فشل التحقق البيومتري أو تم إلغاؤه — يرجى إدخال رمز PIN.',
      };
    }
  }

  return {
    success: false,
    credentialId: existingCredentialId || null,
    methodUsed: 'BIOMETRIC_UNAVAILABLE',
    messageAr: 'التحقق البيومتري غير متوفر في هذه البيئة — يرجى إدخال رمز PIN لفتح القفل.',
  };
}
