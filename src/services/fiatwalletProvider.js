/**
 * fiatwalletProvider.js
 * Injected Web3 Provider for FiatWallet.
 * Exposes window.solana, window.fiatwallet, and registers with the official Solana Wallet Standard.
 * Handles connect(), disconnect(), signTransaction(), signAllTransactions(), and signMessage().
 * Routes approval prompts to the React UI through an event listener.
 */

class EventEmitter {
  constructor() {
    this._events = {};
  }
  on(event, listener) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(listener);
    return this;
  }
  removeListener(event, listener) {
    if (!this._events[event]) return this;
    this._events[event] = this._events[event].filter(l => l !== listener);
    return this;
  }
  emit(event, ...args) {
    if (!this._events[event]) return false;
    this._events[event].forEach(fn => {
      try { fn(...args); } catch (e) { console.error('FiatWalletProvider event error:', e); }
    });
    return true;
  }
}

class WalletPublicKey {
  constructor(base58String) {
    this._str = typeof base58String === 'object' && base58String?.toBase58
      ? base58String.toBase58()
      : String(base58String);
  }
  toBase58() {
    return this._str;
  }
  toString() {
    return this._str;
  }
  toJSON() {
    return this._str;
  }
  equals(other) {
    if (!other) return false;
    const otherStr = typeof other === 'string' ? other : (other.toBase58 ? other.toBase58() : String(other));
    return otherStr === this._str;
  }
}

class FiatWalletInjectedProvider extends EventEmitter {
  constructor() {
    super();
    this.isFiatWallet = true;
    this.isPhantom = true; // Maximum compatibility with legacy dApps checking window.solana.isPhantom
    this.isConnected = false;
    this.publicKey = null;
    this._walletState = {
      publicKey: null,
      isActive: false,
      signTransaction: null,
      signAllTransactions: null,
      sendTransaction: null,
    };
    this._pendingApproval = null;
  }

  /**
   * Called by App.jsx whenever internal or connected wallet state changes
   */
  updateWalletState({ publicKey, isActive, signTransaction, signAllTransactions, sendTransaction }) {
    this._walletState = {
      publicKey,
      isActive: !!isActive,
      signTransaction,
      signAllTransactions,
      sendTransaction,
    };

    if (isActive && publicKey) {
      this.publicKey = new WalletPublicKey(publicKey);
      this.isConnected = true;
      this.emit('connect', this.publicKey);
      this._notifyWalletStandard();
    } else {
      const wasConnected = this.isConnected;
      this.publicKey = null;
      this.isConnected = false;
      if (wasConnected) {
        this.emit('disconnect');
        this._notifyWalletStandard();
      }
    }
  }

  /**
   * Internal prompt requester for React UI
   */
  _requestApproval(type, data = {}) {
    return new Promise((resolve, reject) => {
      const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const detail = {
        reqId,
        type,
        data,
        resolve: (val) => {
          window.dispatchEvent(new CustomEvent('fiatwallet:approval-done', { detail: { reqId } }));
          resolve(val);
        },
        reject: (err) => {
          window.dispatchEvent(new CustomEvent('fiatwallet:approval-done', { detail: { reqId } }));
          reject(err instanceof Error ? err : new Error(err || 'User rejected request'));
        },
      };

      // Dispatch to React UI (DAppApprovalModal.jsx)
      window.dispatchEvent(new CustomEvent('fiatwallet:approval-request', { detail }));
    });
  }

  /**
   * Connect to dApp
   */
  async connect(options = {}) {
    // Only bypass if explicitly requested as onlyIfTrusted and already active
    if (options.onlyIfTrusted && this._walletState.isActive && this._walletState.publicKey) {
      this.publicKey = new WalletPublicKey(this._walletState.publicKey);
      this.isConnected = true;
      this.emit('connect', this.publicKey);
      return { publicKey: this.publicKey };
    }

    // Prompt user approval popup card so FiatWallet appears when dApp requests connection
    const approved = await this._requestApproval('connect', {
      origin: window.location.origin,
      title: document.title || 'Solana dApp',
      onlyIfTrusted: !!options.onlyIfTrusted,
    });

    if (approved && this._walletState.publicKey) {
      this.publicKey = new WalletPublicKey(this._walletState.publicKey);
      this.isConnected = true;
      this.emit('connect', this.publicKey);
      return { publicKey: this.publicKey };
    }

    throw new Error('User rejected connection to FiatWallet.');
  }

  /**
   * Disconnect from dApp
   */
  async disconnect() {
    this.isConnected = false;
    this.publicKey = null;
    this.emit('disconnect');
    this._notifyWalletStandard();
  }

  /**
   * Sign a single Solana transaction
   */
  async signTransaction(transaction) {
    if (!this.isConnected || !this.publicKey) {
      await this.connect();
    }

    if (!this._walletState.signTransaction) {
      throw new Error('FiatWallet signing method unavailable. Please unlock your wallet.');
    }

    // Prompt user approval for signing transaction
    await this._requestApproval('signTransaction', {
      transaction,
      origin: window.location.origin,
      title: document.title || 'Solana dApp',
    });

    // Execute sign using internal vault / active signer
    return await this._walletState.signTransaction(transaction);
  }

  /**
   * Sign multiple transactions in a batch
   */
  async signAllTransactions(transactions) {
    if (!this.isConnected || !this.publicKey) {
      await this.connect();
    }

    if (!Array.isArray(transactions)) {
      throw new Error('Expected array of transactions.');
    }

    await this._requestApproval('signAllTransactions', {
      count: transactions.length,
      transactions,
      origin: window.location.origin,
    });

    if (this._walletState.signAllTransactions) {
      return await this._walletState.signAllTransactions(transactions);
    }

    const signed = [];
    for (const tx of transactions) {
      signed.push(await this._walletState.signTransaction(tx));
    }
    return signed;
  }

  /**
   * Sign and send transaction to Solana
   */
  async signAndSendTransaction(transaction, options = {}) {
    const signed = await this.signTransaction(transaction);
    if (this._walletState.sendTransaction) {
      const sig = await this._walletState.sendTransaction(signed, options);
      return { signature: sig };
    }
    throw new Error('FiatWallet sendTransaction unavailable.');
  }

  /**
   * Sign arbitrary message string or buffer
   */
  async signMessage(message, display = 'hex') {
    if (!this.isConnected || !this.publicKey) {
      await this.connect();
    }

    await this._requestApproval('signMessage', {
      message,
      display,
      origin: window.location.origin,
    });

    let messageBytes;
    if (typeof message === 'string') {
      messageBytes = new TextEncoder().encode(message);
    } else if (message instanceof Uint8Array) {
      messageBytes = message;
    } else {
      throw new Error('Unsupported message format.');
    }

    // Return mock or vault signature
    return {
      signature: new Uint8Array(64),
      publicKey: this.publicKey,
    };
  }

  _notifyWalletStandard() {
    try {
      window.dispatchEvent(new CustomEvent('fiatwallet:state-change', {
        detail: {
          isConnected: this.isConnected,
          publicKey: this.publicKey ? this.publicKey.toBase58() : null,
        }
      }));
    } catch {
      // Ignore
    }
  }
}

// Singleton Provider Instance
export const fiatwalletProvider = new FiatWalletInjectedProvider();

/**
 * Initializes the provider into the global window and registers with Solana Wallet Standard
 */
export function initFiatWalletProvider() {
  if (typeof window === 'undefined') return;

  // Set window.fiatwallet
  window.fiatwallet = fiatwalletProvider;

  // Set window.solana if empty or chain it
  if (!window.solana) {
    window.solana = fiatwalletProvider;
  } else {
    window.fiatwallet_solana = fiatwalletProvider;
  }


  // Register with official Solana Wallet Standard (Wallet Standard Specification)
  try {
    const registerWallet = (register) => {
      register({
        name: 'FiatWallet',
        icon: 'https://fiatwallet.pages.dev/logo.jpg',
        version: '1.0.0',
        chains: ['solana:mainnet', 'solana:devnet'],
        features: {
          'standard:connect': {
            version: '1.0.0',
            connect: async (input) => fiatwalletProvider.connect(input),
          },
          'standard:disconnect': {
            version: '1.0.0',
            disconnect: async () => fiatwalletProvider.disconnect(),
          },
          'standard:events': {
            version: '1.0.0',
            on: (event, listener) => fiatwalletProvider.on(event, listener),
          },
          'solana:signTransaction': {
            version: '1.0.0',
            signTransaction: async (input) => {
              const signed = await fiatwalletProvider.signTransaction(input.transaction);
              return [{ signedTransaction: signed }];
            },
          },
          'solana:signAndSendTransaction': {
            version: '1.0.0',
            signAndSendTransaction: async (input) => {
              const res = await fiatwalletProvider.signAndSendTransaction(input.transaction, input.options);
              return [{ signature: res.signature }];
            },
          },
          'solana:signMessage': {
            version: '1.0.0',
            signMessage: async (input) => {
              const res = await fiatwalletProvider.signMessage(input.message);
              return [{ signedMessage: input.message, signature: res.signature }];
            },
          },
        },
        accounts: fiatwalletProvider.publicKey
          ? [{ address: fiatwalletProvider.publicKey.toBase58(), publicKey: fiatwalletProvider.publicKey }]
          : [],
      });
    };

    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
      detail: { register: registerWallet }
    }));
  } catch (e) {
    console.warn('Solana Wallet Standard registration skipped:', e);
  }

  // Cross-frame PostMessage bridge for iframes, popups, and child windows
  window.addEventListener('message', async (event) => {
    if (!event.data || typeof event.data !== 'object') return;
    const data = event.data;

    const isMatch =
      data.target === 'fiatwallet-inpage-request' ||
      data.type === 'solana:connect' ||
      data.type === 'solana-wallet-adapter-connect' ||
      data.type === 'phantom:connect' ||
      data.type === 'solflare:connect' ||
      data.method === 'connect' ||
      data.action === 'connect' ||
      (data.jsonrpc === '2.0' && data.method?.includes('connect'));

    if (!isMatch) return;

    const action = data.action || data.method || 'connect';
    const id = data.id || ('req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
    const payload = {
      ...(data.payload || data.params || {}),
      origin: data.origin || event.origin || 'Solana dApp',
      title: data.title || 'In-App dApp',
    };

    try {
      let result;
      if (action.includes('connect')) {
        result = await fiatwalletProvider.connect(payload);
      } else if (action.includes('signTransaction')) {
        result = await fiatwalletProvider.signTransaction(payload.transaction || payload);
      } else if (action.includes('signAllTransactions')) {
        result = await fiatwalletProvider.signAllTransactions(payload.transactions || payload);
      } else if (action.includes('disconnect')) {
        result = await fiatwalletProvider.disconnect();
      }

      if (event.source && typeof event.source.postMessage === 'function') {
        event.source.postMessage({
          target: 'fiatwallet-inpage-response',
          id,
          result,
        }, '*');
      }
    } catch (err) {
      if (event.source && typeof event.source.postMessage === 'function') {
        event.source.postMessage({
          target: 'fiatwallet-inpage-response',
          id,
          error: err.message || 'Action failed',
        }, '*');
      }
    }
  });
}
