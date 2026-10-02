// ============================================================
// walletVault.js — AES-256-GCM Encrypted Local Vault
// ============================================================
//  Encrypts/decrypts a wallet's secretKey or mnemonic using
//  a user-defined PIN via the Web Crypto API.
//
//  Algorithm:
//    PBKDF2 (100,000 iterations, SHA-256) → AES-256-GCM
//    12-byte random IV, 16-byte random salt
//
//  Stored payload is a plain JSON object — safe for IndexedDB
//  or localStorage. The secret key is NEVER stored in plaintext.
// ============================================================

const PBKDF2_ITERATIONS = 100_000;
const VAULT_VERSION = 1;
const VAULT_STORAGE_KEY = 'fw_vault_v1';

// ── Helpers ──────────────────────────────────────────────────

function getSubtle() {
  return window.crypto.subtle;
}

function randomBytes(length) {
  return window.crypto.getRandomValues(new Uint8Array(length));
}

function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function deriveKey(pin, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await getSubtle().importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return getSubtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Public API ────────────────────────────────────────────────

/**
 * Encrypts wallet secret material (mnemonic or base58 private key) using a PIN.
 * Returns an EncryptedVaultPayload object ready to be stored.
 */
export async function encryptVault(plaintext, pin) {
  const iv = randomBytes(12);
  const salt = randomBytes(16);
  const key = await deriveKey(pin, salt);
  const enc = new TextEncoder();
  const cipherBuf = await getSubtle().encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return {
    version: VAULT_VERSION,
    cipherText: toBase64(cipherBuf),
    iv: toBase64(iv),
    salt: toBase64(salt),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Decrypts an EncryptedVaultPayload using the user's PIN.
 * Returns the plaintext string (mnemonic or private key).
 * Throws if the PIN is wrong or the payload is tampered with.
 */
export async function decryptVault(payload, pin) {
  const iv = fromBase64(payload.iv);
  const salt = fromBase64(payload.salt);
  const cipherBuf = fromBase64(payload.cipherText);
  const key = await deriveKey(pin, salt);
  try {
    const plainBuf = await getSubtle().decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBuf
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new Error('Incorrect PIN or corrupted vault data.');
  }
}

/**
 * Saves the encrypted vault payload to localStorage.
 */
export function saveVaultToStorage(payload) {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    throw new Error('Failed to save vault to storage: ' + e.message);
  }
}

/**
 * Loads the encrypted vault payload from localStorage.
 * Returns null if no vault exists.
 */
export function loadVaultFromStorage() {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Removes the vault from localStorage (wallet removal / reset).
 */
export function clearVaultFromStorage() {
  localStorage.removeItem(VAULT_STORAGE_KEY);
  localStorage.removeItem('fw_wallet_pubkey');
  localStorage.removeItem('fw_wallet_source');
}

/**
 * Saves the public key and wallet source (for display without unlocking).
 */
export function saveWalletMeta(publicKey, source) {
  localStorage.setItem('fw_wallet_pubkey', publicKey);
  localStorage.setItem('fw_wallet_source', source);
}

/**
 * Loads saved wallet metadata from storage (public info only — no secrets).
 */
export function loadWalletMeta() {
  const publicKey = localStorage.getItem('fw_wallet_pubkey');
  const source = localStorage.getItem('fw_wallet_source');
  if (!publicKey) return null;
  return { publicKey, source };
}
