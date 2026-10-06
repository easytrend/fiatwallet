/**
 * FiatWallet In-Page Provider
 * Injected into every webpage to expose window.solana, window.fiatwallet,
 * and register with the Solana Wallet Standard.
 */
(() => {
  if (window.fiatwallet) return;

  // Simple Event Emitter for wallet events (connect, disconnect, accountChanged)
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
        try { fn(...args); } catch (e) { console.error('FiatWallet event error:', e); }
      });
      return true;
    }
  }

  // Communication helper between InPage and Content Script
  let reqIdCounter = 1;
  const pendingRequests = new Map();

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.target !== 'fiatwallet-inpage') return;
    const { id, error, result } = event.data;
    if (pendingRequests.has(id)) {
      const { resolve, reject } = pendingRequests.get(id);
      pendingRequests.delete(id);
      if (error) {
        reject(new Error(error));
      } else {
        resolve(result);
      }
    }
  });

  function sendToExtension(action, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = reqIdCounter++;
      pendingRequests.set(id, { resolve, reject });
      window.postMessage({
        target: 'fiatwallet-contentscript',
        id,
        action,
        payload,
      }, '*');

      // 60s timeout for user prompt
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('FiatWallet: Request timed out.'));
        }
      }, 60000);
    });
  }

  // Dummy PublicKey wrapper so dApps can do .toBase58() and .toString()
  class WalletPublicKey {
    constructor(base58String) {
      this._str = base58String;
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
      return (typeof other === 'string' ? other : other.toBase58()) === this._str;
    }
  }

  class FiatWalletProvider extends EventEmitter {
    constructor() {
      super();
      this.isFiatWallet = true;
      this.isPhantom = false;
      this.isConnected = false;
      this.publicKey = null;
      this.autoApprove = false;
    }

    async connect(options = {}) {
      try {
        const res = await sendToExtension('CONNECT', {
          onlyIfTrusted: !!options.onlyIfTrusted,
          origin: window.location.origin,
          title: document.title,
        });

        if (res && res.publicKey) {
          this.publicKey = new WalletPublicKey(res.publicKey);
          this.isConnected = true;
          this.emit('connect', this.publicKey);
          return { publicKey: this.publicKey };
        }
        throw new Error('User rejected connection.');
      } catch (err) {
        throw err;
      }
    }

    async disconnect() {
      await sendToExtension('DISCONNECT');
      this.isConnected = false;
      this.publicKey = null;
      this.emit('disconnect');
    }

    async signTransaction(transaction) {
      if (!this.isConnected || !this.publicKey) {
        throw new Error('Wallet not connected. Call connect() first.');
      }

      // Serialize transaction to base64
      let serialized = null;
      if (typeof transaction.serialize === 'function') {
        const bytes = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
        serialized = Array.from(bytes);
      } else {
        throw new Error('Unsupported transaction format.');
      }

      const res = await sendToExtension('SIGN_TRANSACTION', {
        serializedTx: serialized,
        origin: window.location.origin,
      });

      if (!res || !res.signedTx) {
        throw new Error('Transaction rejected by user.');
      }

      // Reconstruct signatures
      const signedBytes = new Uint8Array(res.signedTx);
      if (typeof transaction.constructor.from === 'function') {
        return transaction.constructor.from(signedBytes);
      }
      return transaction;
    }

    async signAllTransactions(transactions) {
      if (!Array.isArray(transactions)) throw new Error('Expected array of transactions.');
      const signed = [];
      for (const tx of transactions) {
        signed.push(await this.signTransaction(tx));
      }
      return signed;
    }

    async signAndSendTransaction(transaction, options = {}) {
      const signed = await this.signTransaction(transaction);
      let rawBytes;
      if (typeof signed.serialize === 'function') {
        rawBytes = Array.from(signed.serialize());
      } else {
        throw new Error('Could not serialize signed transaction.');
      }

      const res = await sendToExtension('SEND_RAW_TRANSACTION', {
        rawBytes,
        options,
      });

      return { signature: res.signature };
    }

    async signMessage(message, display = 'hex') {
      if (!this.isConnected || !this.publicKey) {
        throw new Error('Wallet not connected.');
      }

      let messageBytes;
      if (typeof message === 'string') {
        messageBytes = Array.from(new TextEncoder().encode(message));
      } else if (message instanceof Uint8Array) {
        messageBytes = Array.from(message);
      } else {
        throw new Error('Unsupported message format.');
      }

      const res = await sendToExtension('SIGN_MESSAGE', {
        messageBytes,
        display,
        origin: window.location.origin,
      });

      return {
        signature: new Uint8Array(res.signature),
        publicKey: this.publicKey,
      };
    }
  }

  const provider = new FiatWalletProvider();

  // Expose as window.fiatwallet
  window.fiatwallet = provider;

  // Expose as window.solana if empty or allow multiple
  if (!window.solana) {
    window.solana = provider;
  } else {
    // If another wallet already exists, register in solana provider map
    if (!window.solana.isFiatWallet) {
      window.fiatwallet_solana = provider;
    }
  }

  // Register with Solana Wallet Standard
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
            connect: async (input) => provider.connect(input),
          },
          'standard:disconnect': {
            version: '1.0.0',
            disconnect: async () => provider.disconnect(),
          },
          'standard:events': {
            version: '1.0.0',
            on: (event, listener) => provider.on(event, listener),
          },
          'solana:signTransaction': {
            version: '1.0.0',
            signTransaction: async (input) => {
              const signed = await provider.signTransaction(input.transaction);
              return [{ signedTransaction: signed }];
            },
          },
          'solana:signAndSendTransaction': {
            version: '1.0.0',
            signAndSendTransaction: async (input) => {
              const res = await provider.signAndSendTransaction(input.transaction, input.options);
              return [{ signature: res.signature }];
            },
          },
          'solana:signMessage': {
            version: '1.0.0',
            signMessage: async (input) => {
              const res = await provider.signMessage(input.message);
              return [{ signedMessage: input.message, signature: res.signature }];
            },
          },
        },
        accounts: provider.publicKey ? [{ address: provider.publicKey.toBase58(), publicKey: provider.publicKey }] : [],
      });
    };

    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
      detail: { register: registerWallet }
    }));
  } catch (e) {
    console.warn('Solana Wallet Standard registration skipped:', e);
  }
})();
