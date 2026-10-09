import {
  BaseSignerWalletAdapter,
  WalletReadyState,
  WalletNotConnectedError,
  WalletSendTransactionError,
  WalletSignTransactionError,
} from '@solana/wallet-adapter-base';
import { PublicKey } from '@solana/web3.js';
import { fiatwalletProvider } from './fiatwalletProvider';
import { FIATWALLET_LOGO_BASE64 } from '../assets/logoBase64';

export const FiatWalletName = 'FiatWallet';

/**
 * FiatWalletAdapter
 * Custom Solana Wallet Adapter allowing FiatWallet's internal self-custodial
 * vault to be listed as a native option in standard wallet adapter selectors.
 */
export class FiatWalletAdapter extends BaseSignerWalletAdapter {
  name = FiatWalletName;
  url = 'https://fiatwallet.app';
  icon = FIATWALLET_LOGO_BASE64;
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

      // 1. Determine public key from provider or local vault storage
      let pubKey = fiatwalletProvider.publicKey?.toBase58
        ? fiatwalletProvider.publicKey.toBase58()
        : (fiatwalletProvider.publicKey ? String(fiatwalletProvider.publicKey) : null);

      if (!pubKey && typeof localStorage !== 'undefined') {
        pubKey = localStorage.getItem('fw_wallet_pubkey');
        if (!pubKey) {
          try {
            const acts = JSON.parse(localStorage.getItem('fiatwallet_accounts') || '[]');
            const active = acts.find(a => a.isActive) || acts[0];
            if (active?.publicKey) pubKey = active.publicKey;
          } catch {}
        }
      }

      // 2. Notify React UI that user selected FiatWallet in the adapter modal
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fiatwallet:adapter-selected', { detail: { publicKey: pubKey } }));
      }

      if (pubKey) {
        this._publicKey = new PublicKey(pubKey);
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
      if (fiatwalletProvider._walletState?.signTransaction) {
        return await fiatwalletProvider._walletState.signTransaction(transaction);
      }
      return await fiatwalletProvider.signTransaction(transaction);
    } catch (error) {
      this.emit('error', error);
      throw new WalletSignTransactionError(error?.message, error);
    }
  }

  async signAllTransactions(transactions) {
    if (!this.connected) throw new WalletNotConnectedError();
    try {
      if (fiatwalletProvider._walletState?.signAllTransactions) {
        return await fiatwalletProvider._walletState.signAllTransactions(transactions);
      }
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
