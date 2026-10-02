import { useState, useCallback, useEffect } from 'react';
import { Keypair, Transaction } from '@solana/web3.js';
import { loadVaultFromStorage, loadWalletMeta, clearVaultFromStorage } from '../services/walletVault';

// ── useInternalWallet ───────────────────────────────────────
//
// Manages the in-memory state of the self-custodial (internal) wallet.
// Exposes an interface that mirrors @solana/wallet-adapter-react's
// useWallet() hook so the rest of the app can be agnostic.
//
// The secret key is ONLY held in memory. It is never written to
// localStorage or any persistent store in plaintext.
// It is cleared from memory when the user locks or closes the app.

export function useInternalWallet() {
  const [internalKeypair, setInternalKeypair] = useState(null); // Keypair | null
  const [internalPublicKey, setInternalPublicKey] = useState(null); // string | null
  const [walletMeta, setWalletMeta] = useState(null); // { publicKey, source }
  const [hasVault, setHasVault] = useState(false);   // vault exists in storage?

  // On mount: check if a vault and wallet meta exist in localStorage
  useEffect(() => {
    const vault = loadVaultFromStorage();
    const meta = loadWalletMeta();
    setHasVault(!!vault);
    setWalletMeta(meta || null);
  }, []);

  // Called after onboarding or unlock — loads keypair into memory
  const activate = useCallback(({ publicKey, secretKey, mnemonic, source }) => {
    try {
      const keypair = Keypair.fromSecretKey(secretKey);
      setInternalKeypair(keypair);
      setInternalPublicKey(keypair.publicKey.toBase58());
      setWalletMeta({ publicKey: keypair.publicKey.toBase58(), source });
      setHasVault(!!loadVaultFromStorage());
    } catch (e) {
      console.error('useInternalWallet: Failed to activate keypair', e);
    }
  }, []);

  // Lock wallet — wipes keypair from memory, keeps vault in storage
  const lock = useCallback(() => {
    setInternalKeypair(null);
    setInternalPublicKey(null);
    // Reload meta so the unlock screen shows the correct address
    const meta = loadWalletMeta();
    setWalletMeta(meta || null);
  }, []);

  // Full reset — wipes vault from storage AND memory
  const reset = useCallback(() => {
    setInternalKeypair(null);
    setInternalPublicKey(null);
    setWalletMeta(null);
    setHasVault(false);
    clearVaultFromStorage();
  }, []);

  // Signs a Solana Transaction using the in-memory secret key.
  // Mirrors the signTransaction function from useWallet().
  const signTransaction = useCallback(async (transaction) => {
    if (!internalKeypair) throw new Error('Wallet is locked. Please unlock first.');
    transaction.partialSign(internalKeypair);
    return transaction;
  }, [internalKeypair]);

  // Signs all transactions in a batch.
  const signAllTransactions = useCallback(async (transactions) => {
    if (!internalKeypair) throw new Error('Wallet is locked. Please unlock first.');
    return transactions.map(tx => {
      tx.partialSign(internalKeypair);
      return tx;
    });
  }, [internalKeypair]);

  return {
    // State
    isActive: !!internalKeypair,         // true when unlocked and keypair in memory
    hasVault,                             // true when vault exists (returning user)
    walletMeta,                           // { publicKey, source } — safe to display
    publicKey: internalPublicKey,         // string | null

    // Actions
    activate,                             // call after onboard or unlock
    lock,                                 // wipe keypair from memory
    reset,                                // wipe everything (full logout)

    // Signing — mirrors wallet-adapter interface
    signTransaction,
    signAllTransactions,

    // The raw keypair (use sparingly — only when you MUST access secret bytes directly)
    _keypair: internalKeypair,
  };
}
