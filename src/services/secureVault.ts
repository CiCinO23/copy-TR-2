/**
 * Cryptographic Security Vault (Web Crypto PBKDF2-SHA256 + AES-256-GCM)
 * - Derives 256-bit keys with 100,000 PBKDF2-SHA256 iterations and unique 128-bit random salts.
 * - Encrypts KuCoin/Binance API secrets at rest with AES-256-GCM + random 96-bit IVs so
 *   plaintext secrets are never persisted to localStorage and cannot be decrypted by tampering
 *   with localStorage flags without knowing the user's real PIN.
 */

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_PREFIX = 'pbkdf2_v2:';
const ENC_PREFIX = 'enc_v1:';

// In-memory unlocked session PIN (never written to localStorage/sessionStorage)
let activeMemorySessionPin: string | null = null;

export function setActiveSessionPin(pin: string | null): void {
  activeMemorySessionPin = pin && pin.trim().length > 0 ? pin.trim() : null;
}

export function getActiveSessionPin(): string | null {
  return activeMemorySessionPin;
}

export function clearActiveSessionPin(): void {
  activeMemorySessionPin = null;
}

function getCryptoApi(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API is unavailable in this environment.');
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function isPbkdf2Hash(value?: string | null): boolean {
  if (typeof value !== 'string' || !value.startsWith(PBKDF2_PREFIX)) return false;
  const parts = value.slice(PBKDF2_PREFIX.length).split(':');
  return parts.length === 2 && parts[0].length >= 16 && parts[1].length >= 32;
}

export function isEncryptedVaultPayload(value?: string | null): boolean {
  if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) return false;
  const parts = value.slice(ENC_PREFIX.length).split(':');
  return parts.length === 3 && parts[0].length >= 16 && parts[1].length >= 12 && parts[2].length >= 16;
}

/**
 * Derives a 256-bit PBKDF2-SHA256 hash using a cryptographically random 128-bit salt.
 */
export async function hashPinPbkdf2(
  pin: string,
  customSaltBytes?: Uint8Array
): Promise<string> {
  const cryptoApi = getCryptoApi();
  const salt = customSaltBytes ? new Uint8Array(customSaltBytes) : new Uint8Array(16);
  if (!customSaltBytes) {
    cryptoApi.getRandomValues(salt);
  }

  const enc = new TextEncoder();
  const baseKey = await cryptoApi.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await cryptoApi.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  const hashBytes = new Uint8Array(derivedBits);
  return `${PBKDF2_PREFIX}${bytesToBase64(salt)}:${bytesToBase64(hashBytes)}`;
}

/**
 * Constant-time verification of a PIN against a stored PBKDF2-SHA256 hash.
 */
export async function verifyPinPbkdf2(pin: string, storedHash: string): Promise<boolean> {
  if (!pin || !isPbkdf2Hash(storedHash)) return false;
  try {
    const cryptoApi = getCryptoApi();
    const [saltB64, expectedHashB64] = storedHash.slice(PBKDF2_PREFIX.length).split(':');
    const salt = base64ToBytes(saltB64);
    const expectedHash = base64ToBytes(expectedHashB64);

    const enc = new TextEncoder();
    const baseKey = await cryptoApi.subtle.importKey(
      'raw',
      enc.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await cryptoApi.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: toArrayBuffer(salt),
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      expectedHash.length * 8
    );

    return timingSafeEqualBytes(new Uint8Array(derivedBits), expectedHash);
  } catch {
    return false;
  }
}

async function deriveAesGcmKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const cryptoApi = getCryptoApi();
  const enc = new TextEncoder();
  const baseKey = await cryptoApi.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return cryptoApi.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext credential (API Secret / Passphrase) with AES-256-GCM using a key derived from the user's PIN.
 */
export async function encryptSecretWithPin(plaintext: string, pin: string): Promise<string> {
  const clean = (plaintext || '').trim();
  if (!clean) return '';
  const cryptoApi = getCryptoApi();
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  cryptoApi.getRandomValues(salt);
  cryptoApi.getRandomValues(iv);

  const key = await deriveAesGcmKeyFromPin(pin, salt);
  const enc = new TextEncoder();
  const cipherBuffer = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    enc.encode(clean)
  );

  return `${ENC_PREFIX}${bytesToBase64(salt)}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipherBuffer))}`;
}

/**
 * Authenticates and decrypts an AES-256-GCM vault payload using the user's PIN.
 * Returns null if the PIN is wrong or the stored ciphertext was modified.
 */
export async function decryptSecretWithPin(payload: string, pin: string): Promise<string | null> {
  if (!payload) return '';
  if (!isEncryptedVaultPayload(payload)) return null;
  if (!pin) return null;

  try {
    const cryptoApi = getCryptoApi();
    const [saltB64, ivB64, cipherB64] = payload.slice(ENC_PREFIX.length).split(':');
    const salt = base64ToBytes(saltB64);
    const iv = base64ToBytes(ivB64);
    const cipherBytes = base64ToBytes(cipherB64);

    const key = await deriveAesGcmKeyFromPin(pin, salt);
    const plainBuffer = await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(cipherBytes)
    );

    return new TextDecoder().decode(plainBuffer);
  } catch {
    return null;
  }
}
