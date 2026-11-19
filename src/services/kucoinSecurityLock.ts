import { KuCoinSecurityLockConfig } from '../types';

export const KUCOIN_SECURITY_STORAGE_KEY = 'whale_kucoin_security_lock_v1';
const PIN_HASH_SALT = 'CopyTR_v223_PIN_SALT_#9182';
const PIN_HASH_PREFIX = 'h1:';

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
 * Checks whether a normalized PIN string is between 4 and 6 digits.
 */
export function isValidPinFormat(pin: string): boolean {
  const clean = normalizePinDigits(pin);
  return clean.length >= 4 && clean.length <= 6 && /^\d{4,6}$/.test(clean);
}

/**
 * Deterministic salted synchronous hash for PIN storage so plaintext PINs are never persisted to localStorage.
 * Uses multi-round dual-lane 32-bit FNV-1a / Murmur-style avalanche mixing.
 */
export function hashPinSync(pin: string): string {
  const clean = normalizePinDigits(pin);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const input = `${PIN_HASH_SALT}:${clean}:${clean.length}`;

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
  return `${PIN_HASH_PREFIX}${hex1}${hex2}`;
}

export function isPinHashed(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(PIN_HASH_PREFIX) && value.length > 12;
}

const DEFAULT_PIN_PLAIN = '1234';
export const DEFAULT_PIN_HASH = hashPinSync(DEFAULT_PIN_PLAIN);

export const DEFAULT_KUCOIN_SECURITY_CONFIG: KuCoinSecurityLockConfig = {
  enabled: true,
  pinCode: '',
  pinHash: DEFAULT_PIN_HASH,
  biometricEnabled: false,
  biometricCredentialId: null,
  lockScope: 'ALWAYS_ON_TAB_OPEN',
  sessionTimeoutMinutes: 5,
  protectRealTradingSwitch: true,
};

/**
 * Helper to detect if the security config is still using the default 1234 PIN.
 */
export function isDefaultPinActive(config: KuCoinSecurityLockConfig): boolean {
  if (isPinHashed(config.pinHash)) {
    return config.pinHash === DEFAULT_PIN_HASH;
  }
  return verifyPinCode(DEFAULT_PIN_PLAIN, config.pinCode || DEFAULT_PIN_HASH);
}

/**
 * Verifies if the user-entered PIN matches either a salted pinHash or a legacy stored plaintext PIN.
 */
export function verifyPinCode(inputPin: string, storedPinOrHash: string): boolean {
  const cleanInput = normalizePinDigits(inputPin);
  if (!cleanInput) return false;

  const target = (storedPinOrHash || '').trim() || DEFAULT_PIN_HASH;
  if (isPinHashed(target)) {
    return hashPinSync(cleanInput) === target;
  }

  const cleanStored = normalizePinDigits(target);
  if (!cleanStored) return false;
  return cleanInput === cleanStored;
}

/**
 * Validates changing the PIN code from `currentInput` to `newPin` & `confirmPin`.
 * Accepts either a hashed `storedPinOrHash` or plaintext `storedPinOrHash`.
 */
export function validatePinChange(
  currentInput: string,
  storedPinOrHash: string,
  newPin: string,
  confirmPin: string
): { valid: boolean; errorAr?: string; normalizedNewPin?: string; newPinHash?: string } {
  if (!verifyPinCode(currentInput, storedPinOrHash)) {
    return {
      valid: false,
      errorAr: 'رمز PIN الحالي غير صحيح. يرجى إدخال الرمز الحالي بشكل صحيح.',
    };
  }

  const cleanNew = normalizePinDigits(newPin);
  const cleanConfirm = normalizePinDigits(confirmPin);

  if (!isValidPinFormat(cleanNew)) {
    return {
      valid: false,
      errorAr: 'يجب أن يتكون رمز PIN الجديد من 4 إلى 6 أرقام فقط.',
    };
  }

  if (cleanNew !== cleanConfirm) {
    return {
      valid: false,
      errorAr: 'رمز PIN الجديد وتأكيد الرمز غير متطابقين.',
    };
  }

  return {
    valid: true,
    normalizedNewPin: cleanNew,
    newPinHash: hashPinSync(cleanNew),
  };
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

    // Transparently migrate legacy plaintext `pinCode` into salted `pinHash`
    let resolvedHash = isPinHashed(parsed.pinHash) ? parsed.pinHash : '';
    let migrated = false;
    if (!resolvedHash) {
      const legacyPlain = normalizePinDigits(parsed.pinCode || '');
      resolvedHash = isValidPinFormat(legacyPlain) ? hashPinSync(legacyPlain) : DEFAULT_PIN_HASH;
      migrated = true;
    }

    const loaded: KuCoinSecurityLockConfig = {
      enabled:
        typeof parsed.enabled === 'boolean'
          ? parsed.enabled
          : DEFAULT_KUCOIN_SECURITY_CONFIG.enabled,
      pinCode: '', // Never retain plaintext PIN in memory/storage once hashed
      pinHash: resolvedHash,
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

    if (migrated || parsed.pinCode) {
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

  let nextHash = current.pinHash || DEFAULT_PIN_HASH;
  if (partial.pinHash && isPinHashed(partial.pinHash)) {
    nextHash = partial.pinHash;
  } else if (partial.pinCode !== undefined) {
    const cleanNew = normalizePinDigits(partial.pinCode);
    if (isValidPinFormat(cleanNew)) {
      nextHash = hashPinSync(cleanNew);
    }
  }

  const updated: KuCoinSecurityLockConfig = {
    ...current,
    ...partial,
    pinCode: '', // Never store plaintext PIN in localStorage
    pinHash: nextHash,
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
 * Security hardening (v2.23): Never auto-succeeds when hardware biometrics are unavailable or cancelled —
 * returns `{ success: false }` so the user must authenticate with their real PIN.
 */
export async function performBiometricAuthentication(
  existingCredentialId?: string | null
): Promise<{
  success: boolean;
  credentialId?: string | null;
  methodUsed: 'WEBAUTHN_NATIVE' | 'BIOMETRIC_SENSOR' | 'BIOMETRIC_UNAVAILABLE';
  messageAr: string;
}> {
  // 1. Native Android WebView biometric bridge (BiometricPrompt)
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

  // 2. Genuine WebAuthn platform assertion if registered
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

  // 3. No genuine biometric authenticator available — fail closed and require real PIN
  return {
    success: false,
    credentialId: existingCredentialId || null,
    methodUsed: 'BIOMETRIC_UNAVAILABLE',
    messageAr: 'التحقق البيومتري غير متوفر في هذه البيئة — يرجى إدخال رمز PIN لفتح القفل.',
  };
}
