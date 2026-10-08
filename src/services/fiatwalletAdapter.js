import {
  BaseSignerWalletAdapter,
  WalletReadyState,
  WalletNotConnectedError,
  WalletSendTransactionError,
  WalletSignTransactionError,
} from '@solana/wallet-adapter-base';
import { PublicKey } from '@solana/web3.js';
import { fiatwalletProvider } from './fiatwalletProvider';

export const FiatWalletName = 'FiatWallet';

/**
 * FiatWalletAdapter
 * Custom Solana Wallet Adapter allowing FiatWallet's internal self-custodial
 * vault to be listed as a native option in standard wallet adapter selectors.
 */
export class FiatWalletAdapter extends BaseSignerWalletAdapter {
  name = FiatWalletName;
  url = 'https://fiatwallet.app';
  icon = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="%230a1628"/><circle cx="64" cy="64" r="42" fill="none" stroke="%23a3e635" stroke-width="8"/><path d="M48 64h32M64 48v32" stroke="%2322d3ee" stroke-width="8" stroke-linecap="round"/></svg>';
  supportedTransactionVersions = new Set(['legacy', 0]);

  _readyState = WalletReadyState.Installed;
  _connecting = false;
  _publicKey = null;

  get readyState() {
    return this._readyState;
  }

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  get connected() {
    return !!this._publicKey;
  }

  async connect() {
    try {
      if (this.connected || this.connecting) return;
      this._connecting = true;

      // Determine public key from provider or local vault storage
      let pubKey = fiatwalletProvider.publicKey;
      if (!pubKey && typeof localStorage !== 'undefined') {
        try {
          const acts = JSON.parse(localStorage.getItem('fiatwallet_accounts') || '[]');
          const active = acts.find(a => a.isActive) || acts[0];
          if (active?.publicKey) {
            pubKey = new PublicKey(active.publicKey);
          }
        } catch {}
      }

      if (pubKey) {
        this._publicKey = pubKey instanceof PublicKey ? pubKey : new PublicKey(pubKey);
        this.emit('connect', this._publicKey);
      } else {
        // Trigger onboarding modal if no local key exists
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fiatwallet:open-onboard', { detail: { mode: 'create' } }));
        }
        throw new WalletNotConnectedError('No local FiatWallet account found. Please create or import a wallet.');
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect() {
    if (this._publicKey) {
      this._publicKey = null;
      try {
        await fiatwalletProvider.disconnect();
      } catch {}
      this.emit('disconnect');
    }
  }

  async signTransaction(transaction) {
    if (!this.connected) throw new WalletNotConnectedError();
    try {
      return await fiatwalletProvider.signTransaction(transaction);
    } catch (error) {
      this.emit('error', error);
      throw new WalletSignTransactionError(error?.message, error);
    }
  }

  async signAllTransactions(transactions) {
    if (!this.connected) throw new WalletNotConnectedError();
    try {
      return await fiatwalletProvider.signAllTransactions(transactions);
    } catch (error) {
      this.emit('error', error);
      throw new WalletSignTransactionError(error?.message, error);
    }
  }

  async signMessage(message) {
    if (!this.connected) throw new WalletNotConnectedError();
    try {
      const res = await fiatwalletProvider.signMessage(message);
      return res.signature;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
}
