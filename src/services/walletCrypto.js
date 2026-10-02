// ============================================================
// walletCrypto.js — Pure crypto primitives for Fiatwallet
// ============================================================
//  BIP-44 derivation path for Solana: m/44'/501'/account'/0'
//  Uses: bip39, ed25519-hd-key, @solana/web3.js, bs58
//  Security: secret key bytes never leave this module unencrypted.
// ============================================================

import { Keypair } from '@solana/web3.js';
import buffer from 'buffer';
const Buffer = buffer.Buffer || buffer;
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';

/**
 * Returns the BIP-44 derivation path for Solana at a given account index.
 * e.g., index 0 -> m/44'/501'/0'/0'
 */
export function getSolanaDerivationPath(accountIndex = 0) {
  return `m/44'/501'/${accountIndex}'/0'`;
}

/**
 * Derives a Solana Keypair from a BIP-39 seed buffer using standard BIP-44 path.
 */
export function deriveKeypairFromSeed(seed, accountIndex = 0) {
  const path = getSolanaDerivationPath(accountIndex);
  const hex = Buffer.from(seed).toString('hex');
  const { key } = derivePath(path, hex);
  return Keypair.fromSeed(key);
}

/**
 * Normalises a raw mnemonic string:
 *  - trims whitespace, collapses multiple spaces, lowercases
 */
export function normaliseMnemonic(raw) {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * OPTION 1: Create a brand new wallet.
 * Generates a random 12-word BIP-39 mnemonic and derives a Solana keypair.
 * Returns { mnemonic, publicKey, secretKey (Uint8Array) }
 */
export async function createNewWallet() {
  const mnemonic = bip39.generateMnemonic(128); // 12 words
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const keypair = deriveKeypairFromSeed(seed, 0);
  return {
    mnemonic,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: keypair.secretKey,
  };
}

/**
 * OPTION 2a: Import from mnemonic (12 or 24 words).
 * Returns { mnemonic, publicKey, secretKey (Uint8Array) }
 * Throws if mnemonic is invalid.
 */
export async function importFromMnemonic(rawMnemonic, accountIndex = 0) {
  const mnemonic = normaliseMnemonic(rawMnemonic);
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid seed phrase. Please check your words and try again.');
  }
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const keypair = deriveKeypairFromSeed(seed, accountIndex);
  return {
    mnemonic,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: keypair.secretKey,
  };
}

/**
 * OPTION 2b: Import from base58 private key.
 * Returns { publicKey, secretKey (Uint8Array) }
 * Throws if key format is invalid.
 */
export function importFromPrivateKey(base58Key) {
  let decoded;
  try {
    decoded = bs58.decode(base58Key.trim());
  } catch {
    throw new Error('Invalid private key format. Expected a base58 encoded string.');
  }
  if (decoded.length !== 64 && decoded.length !== 32) {
    throw new Error(`Private key must be 32 or 64 bytes. Got ${decoded.length} bytes.`);
  }
  const secretKey = decoded.length === 64 ? decoded : (() => {
    const kp = Keypair.fromSeed(decoded);
    return kp.secretKey;
  })();
  const keypair = Keypair.fromSecretKey(secretKey);
  return {
    publicKey: keypair.publicKey.toBase58(),
    secretKey: keypair.secretKey,
  };
}
