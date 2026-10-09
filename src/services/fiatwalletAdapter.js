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

      // Check if vault is already unlocked (provider has active public key in memory)
      let pubKey = fiatwalletProvider.publicKey?.toBase58
        ? fiatwalletProvider.publicKey.toBase58()
        : (fiatwalletProvider.publicKey ? String(fiatwalletProvider.publicKey) : null);

      const hasVaultStored =
        typeof localStorage !== 'undefined' && !!localStorage.getItem('fw_vault_v1');

      const storedPubKey =
        typeof localStorage !== 'undefined' ? localStorage.getItem('fw_wallet_pubkey') : null;

      if (pubKey) {
        // Vault already unlocked — connect immediately
        this._publicKey = new PublicKey(pubKey);
        this.emit('connect', this._publicKey);
        return;
      }

      if (hasVaultStored && storedPubKey) {
        // Vault exists but is locked — show unlock screen and wait for user to unlock
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fiatwallet:adapter-needs-unlock', {}));
        }
        const unlockedKey = await new Promise((resolve) => {
          const onUnlock = (e) => {
            cleanup();
            resolve(e.detail?.publicKey || null);
          };
          const onCancel = () => {
            cleanup();
            resolve(null);
          };
          const cleanup = () => {
            window.removeEventListener('fiatwallet:vault-unlocked', onUnlock);
            window.removeEventListener('fiatwallet:vault-cancelled', onCancel);
          };
          window.addEventListener('fiatwallet:vault-unlocked', onUnlock);
          window.addEventListener('fiatwallet:vault-cancelled', onCancel);
        });

        if (unlockedKey) {
          this._publicKey = new PublicKey(unlockedKey);
          this.emit('connect', this._publicKey);
        } else {
          throw new WalletNotConnectedError('Unlock cancelled.');
        }
      } else {
        // No vault — show onboard screen and wait for wallet creation
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fiatwallet:adapter-needs-onboard', {}));
        }
        const createdKey = await new Promise((resolve) => {
          const onCreated = (e) => {
            cleanup();
            resolve(e.detail?.publicKey || null);
          };
          const onCancel = () => {
            cleanup();
            resolve(null);
          };
          const cleanup = () => {
            window.removeEventListener('fiatwallet:vault-created', onCreated);
            window.removeEventListener('fiatwallet:vault-cancelled', onCancel);
          };
          window.addEventListener('fiatwallet:vault-created', onCreated);
          window.addEventListener('fiatwallet:vault-cancelled', onCancel);
        });

        if (createdKey) {
          this._publicKey = new PublicKey(createdKey);
          this.emit('connect', this._publicKey);
        } else {
          throw new WalletNotConnectedError('Onboard cancelled.');
        }
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
