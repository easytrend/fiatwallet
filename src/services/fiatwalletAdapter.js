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

  _readyState = WalletReadyState.Loadable;
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

      // Check if vault is already active in memory (unlocked)
      const pubKey = fiatwalletProvider.publicKey?.toBase58
        ? fiatwalletProvider.publicKey.toBase58()
        : (fiatwalletProvider.publicKey ? String(fiatwalletProvider.publicKey) : null);

      if (pubKey) {
        // Vault is unlocked — connect the adapter immediately
        this._publicKey = new PublicKey(pubKey);
        this.emit('connect', this._publicKey);
        return;
      }

      // Vault is locked or not yet created.
      // Signal the React UI to show the appropriate screen, then return cleanly.
      // The app uses effectiveConnected = internalWallet.isActive, so the UI
      // will show the wallet dashboard after the user unlocks/creates — no adapter
      // emit needed for the internal flow.
      const hasVaultStored =
        typeof localStorage !== 'undefined' && !!localStorage.getItem('fw_vault_v1');
      const storedPubKey =
        typeof localStorage !== 'undefined' ? localStorage.getItem('fw_wallet_pubkey') : null;

      if (typeof window !== 'undefined') {
        if (hasVaultStored && storedPubKey) {
          // Returning user — vault is locked, show PIN unlock screen
          window.dispatchEvent(new CustomEvent('fiatwallet:adapter-needs-unlock'));
        } else {
          // New user — no vault yet, show onboarding
          window.dispatchEvent(new CustomEvent('fiatwallet:adapter-needs-onboard'));
        }
      }

      // Return without throwing — this keeps walletName in localStorage
      // and avoids triggering handleWalletError which would deselect FiatWallet.
      // After the user unlocks/onboards, fiatwallet:vault-unlocked / fiatwallet:vault-created
      // will fire the adapter's emit('connect') via App.jsx.
    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  // Called by App.jsx after vault is unlocked or created to complete the adapter connection.
  _completeConnect(publicKeyStr) {
    try {
      if (!this._publicKey && publicKeyStr) {
        this._publicKey = new PublicKey(publicKeyStr);
        this.emit('connect', this._publicKey);
      }
    } catch (e) {
      console.warn('FiatWalletAdapter._completeConnect error:', e);
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
