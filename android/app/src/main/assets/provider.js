/* FiatWallet Injected Provider for Android WebView (Solana Web3 Provider) */
(function() {
  if (window._fiatWalletInjected) return;
  window._fiatWalletInjected = true;

  var pendingRequests = {};
  var listeners = {};
  window._fiatReqs = pendingRequests;

  function base58Decode(str) {
    var ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    var bytes = [0];
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      var val = ALPHABET.indexOf(c);
      if (val === -1) throw new Error('Illegal char ' + c);
      for (var j = 0; j < bytes.length; j++) {
        val += bytes[j] * 58;
        bytes[j] = val & 0xff;
        val >>= 8;
      }
      while (val > 0) {
        bytes.push(val & 0xff);
        val >>= 8;
      }
    }
    for (var k = 0; k < str.length && str[k] === '1'; k++) bytes.push(0);
    return new Uint8Array(bytes.reverse());
  }

  function PublicKey(val) {
    if (typeof val === 'string') {
      this._bn = val;
      this._bytes = base58Decode(val);
    } else if (val && val.toBase58) {
      this._bn = val.toBase58();
      this._bytes = val.toBytes ? val.toBytes() : (val.toByteArray ? val.toByteArray() : new Uint8Array(val));
    } else if (val && (val instanceof Uint8Array || Array.isArray(val))) {
      this._bytes = new Uint8Array(val);
      this._bn = '';
    } else {
      this._bn = String(val || '');
      this._bytes = new Uint8Array(32);
    }
  }
  PublicKey.prototype.toBase58 = function() { return this._bn; };
  PublicKey.prototype.toString = function() { return this._bn; };
  PublicKey.prototype.toJSON = function() { return this._bn; };
  PublicKey.prototype.toBytes = function() { return this._bytes; };
  PublicKey.prototype.toByteArray = function() { return Array.from(this._bytes); };
  PublicKey.prototype.equals = function(o) {
    return o && (o.toBase58 ? o.toBase58() === this._bn : String(o) === this._bn);
  };

  window.PublicKey = window.PublicKey || PublicKey;

  var provider = {
    isFiatWallet: true,
    isPhantom: true,
    isSolflare: true,
    isConnected: false,
    publicKey: null,
    autoApprove: false,

    on: function(event, listener) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(listener);
      return provider;
    },
    addListener: function(event, listener) {
      return provider.on(event, listener);
    },
    removeListener: function(event, listener) {
      if (!listeners[event]) return provider;
      listeners[event] = listeners[event].filter(function(l) { return l !== listener; });
      return provider;
    },
    off: function(event, listener) {
      return provider.removeListener(event, listener);
    },
    removeAllListeners: function(event) {
      if (event) { delete listeners[event]; }
      else { listeners = {}; }
      return provider;
    },
    emit: function(event) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (listeners[event]) {
        var list = listeners[event].slice();
        for (var i = 0; i < list.length; i++) {
          try { list[i].apply(provider, args); } catch (e) { console.error('FiatWallet listener error:', e); }
        }
      }
      return true;
    },

    connect: function(opts) {
      return new Promise(function(resolve, reject) {
        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        pendingRequests[reqId] = {
          resolve: function(res) {
            var pubStr = (res && res.publicKey) ? (typeof res.publicKey === 'string' ? res.publicKey : res.publicKey.toString()) : '';
            var pub = pubStr ? new PublicKey(pubStr) : null;
            provider.publicKey = pub;
            provider.isConnected = true;
            provider.emit('connect', pub);
            resolve({ publicKey: pub });
          },
          reject: function(err) {
            reject(err || new Error('Connection rejected'));
          }
        };
        if (window.FiatWalletBridge && window.FiatWalletBridge.requestConnect) {
          window.FiatWalletBridge.requestConnect(reqId, window.location.origin, document.title || 'dApp');
        } else {
          reject(new Error('FiatWallet native bridge unavailable'));
        }
      });
    },

    disconnect: function() {
      provider.isConnected = false;
      provider.publicKey = null;
      provider.emit('disconnect');
      return Promise.resolve();
    },

    signTransaction: function(tx) {
      return new Promise(function(resolve, reject) {
        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        pendingRequests[reqId] = { resolve: resolve, reject: reject };
        var serialized;
        try {
          if (typeof tx.serialize === 'function') {
            serialized = Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
          } else if (tx && tx.signatures) {
            serialized = tx;
          } else {
            serialized = tx;
          }
        } catch(e) {
          serialized = tx;
        }
        if (window.FiatWalletBridge && window.FiatWalletBridge.requestSignTransaction) {
          window.FiatWalletBridge.requestSignTransaction(reqId, JSON.stringify(serialized));
        } else {
          reject(new Error('FiatWallet native bridge unavailable'));
        }
      });
    },

    signAllTransactions: function(txs) {
      return Promise.all(txs.map(function(t) { return provider.signTransaction(t); }));
    },

    signAndSendTransaction: function(tx, opts) {
      return provider.signTransaction(tx).then(function(res) {
        return { signature: (res && res.signature) ? res.signature : 'sig_ok' };
      });
    },

    signMessage: function(msg) {
      return new Promise(function(resolve, reject) {
        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        pendingRequests[reqId] = { resolve: resolve, reject: reject };
        var msgStr = typeof msg === 'string' ? msg : Array.from(msg).join(',');
        if (window.FiatWalletBridge && window.FiatWalletBridge.requestSignMessage) {
          window.FiatWalletBridge.requestSignMessage(reqId, msgStr);
        } else {
          reject(new Error('FiatWallet native bridge unavailable'));
        }
      });
    },

    request: function(args) {
      if (!args || !args.method) return Promise.reject(new Error('Invalid request method'));
      if (args.method === 'connect') return provider.connect(args.params);
      if (args.method === 'disconnect') return provider.disconnect();
      if (args.method === 'signTransaction') return provider.signTransaction(args.params && args.params.transaction);
      if (args.method === 'signAllTransactions') return provider.signAllTransactions(args.params && args.params.transactions);
      if (args.method === 'signAndSendTransaction') return provider.signAndSendTransaction(args.params && args.params.transaction, args.params && args.params.options);
      if (args.method === 'signMessage') return provider.signMessage(args.params && args.params.message);
      return Promise.reject(new Error('Method ' + args.method + ' not supported'));
    },

    _onConnectApproved: function(reqId, pubKey) {
      if (pendingRequests[reqId]) {
        pendingRequests[reqId].resolve({ publicKey: pubKey });
        delete pendingRequests[reqId];
      }
    },
    _onConnectRejected: function(reqId) {
      if (pendingRequests[reqId]) {
        pendingRequests[reqId].reject(new Error('User rejected connection'));
        delete pendingRequests[reqId];
      }
    },
    _onSignApproved: function(reqId, result) {
      if (pendingRequests[reqId]) {
        pendingRequests[reqId].resolve(result);
        delete pendingRequests[reqId];
      }
    },
    _onSignRejected: function(reqId) {
      if (pendingRequests[reqId]) {
        pendingRequests[reqId].reject(new Error('User rejected signature'));
        delete pendingRequests[reqId];
      }
    }
  };

  /* Expose globals on window */
  window.solana = provider;
  window.fiatwallet = provider;
  window.phantom = { solana: provider };
  window.solflare = provider;

  /* Register with official Solana Wallet Standard */
  try {
    var registerWallet = function(register) {
      register({
        name: 'FiatWallet',
        icon: 'https://fiatwallet.pages.dev/logo.jpg',
        version: '1.0.0',
        chains: ['solana:mainnet', 'solana:devnet'],
        features: {
          'standard:connect': { version: '1.0.0', connect: provider.connect },
          'standard:disconnect': { version: '1.0.0', disconnect: provider.disconnect },
          'standard:events': { version: '1.0.0', on: provider.on },
          'solana:signTransaction': { version: '1.0.0', signTransaction: provider.signTransaction },
          'solana:signAndSendTransaction': { version: '1.0.0', signAndSendTransaction: provider.signAndSendTransaction },
          'solana:signMessage': { version: '1.0.0', signMessage: provider.signMessage }
        }
      });
      register({
        name: 'Solflare',
        icon: 'https://solflare.com/favicon.ico',
        version: '1.0.0',
        chains: ['solana:mainnet', 'solana:devnet'],
        features: {
          'standard:connect': { version: '1.0.0', connect: provider.connect },
          'standard:disconnect': { version: '1.0.0', disconnect: provider.disconnect },
          'standard:events': { version: '1.0.0', on: provider.on },
          'solana:signTransaction': { version: '1.0.0', signTransaction: provider.signTransaction },
          'solana:signAndSendTransaction': { version: '1.0.0', signAndSendTransaction: provider.signAndSendTransaction },
          'solana:signMessage': { version: '1.0.0', signMessage: provider.signMessage }
        }
      });
    };
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: { register: registerWallet } }));
  } catch(e) {}

  /* Relay adapter events */
  window.addEventListener('fiatwallet:adapter-needs-unlock', function() {
    if (window.FiatWalletBridge && window.FiatWalletBridge.requestConnect) {
      window.FiatWalletBridge.requestConnect('unlock_' + Date.now(), window.location.origin, document.title || 'dApp');
    }
  });

  window.addEventListener('fiatwallet:adapter-needs-onboard', function() {
    if (window.FiatWalletBridge && window.FiatWalletBridge.requestConnect) {
      window.FiatWalletBridge.requestConnect('onboard_' + Date.now(), window.location.origin, document.title || 'dApp');
    }
  });

  window.addEventListener('fiatwallet:approval-request', function(e) {
    if (!e.detail || e.detail.type !== 'connect') return;
    if (window.FiatWalletBridge && window.FiatWalletBridge.requestConnect) {
      var reqId = e.detail.reqId || ('apr_' + Date.now());
      pendingRequests[reqId] = {
        resolve: function(res) {
          var pub = res && res.publicKey ? (typeof res.publicKey === 'string' ? res.publicKey : res.publicKey.toString()) : '';
          if (pub && e.detail.resolve) { e.detail.resolve({ publicKey: new PublicKey(pub) }); }
        },
        reject: function(err) { if (e.detail.reject) { e.detail.reject(err); } }
      };
      window.FiatWalletBridge.requestConnect(reqId, e.detail.data && e.detail.data.origin ? e.detail.data.origin : window.location.origin, document.title || 'dApp');
    }
  });

  /* Intercept solana-wallet: protocol navigation and redirect to injected provider.connect() */
  try {
    var _origOpen = window.open;
    window.open = function(url, t, f) {
      if (typeof url === 'string' && url.indexOf('solana-wallet:') === 0) {
        setTimeout(function() { if (window.solana && window.solana.connect) window.solana.connect().catch(function(){}); }, 100);
        return null;
      }
      return _origOpen ? _origOpen.call(window, url, t, f) : null;
    };
    var _lDesc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
    if (_lDesc && _lDesc.set) {
      var _origSet = _lDesc.set;
      Object.defineProperty(Location.prototype, 'href', {
        set: function(url) {
          if (typeof url === 'string' && url.indexOf('solana-wallet:') === 0) {
            setTimeout(function() { if (window.solana && window.solana.connect) window.solana.connect().catch(function(){}); }, 100);
            return;
          }
          _origSet.call(this, url);
        },
        get: _lDesc.get,
        configurable: true
      });
    }
  } catch(e) {}

  /* Auto-dismiss any MWA error dialogs if they appear */
  function _dismissMwaDialog() {
    var dialogs = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="overlay"]');
    for (var i = 0; i < dialogs.length; i++) {
      var txt = dialogs[i].textContent || '';
      if (txt.indexOf("can't find a wallet") > -1 || txt.indexOf("cannot find a wallet") > -1) {
        var btn = dialogs[i].querySelector('button');
        if (btn) btn.click();
      }
    }
  }

  function _hideMwaListItems(root) {
    var imgs = (root || document).querySelectorAll('[alt="Mobile Wallet Adapter"]');
    for (var i = 0; i < imgs.length; i++) {
      var li = imgs[i].closest('li, [role="listitem"], [role="option"]');
      if (li) li.style.display = 'none';
    }
    var btns = (root || document).querySelectorAll('button, li');
    for (var j = 0; j < btns.length; j++) {
      if ((btns[j].textContent || '').trim() === 'Mobile Wallet Adapter') btns[j].style.display = 'none';
    }
  }

  try {
    var observer = new MutationObserver(function(muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          if (added[j].nodeType === 1) {
            var text = added[j].textContent || '';
            if (text.indexOf("can't find a wallet") > -1 || text.indexOf("cannot find a wallet") > -1) {
              setTimeout(_dismissMwaDialog, 40);
            }
            _hideMwaListItems(added[j]);
          }
        }
      }
    });

    function _initObserver() {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
        _hideMwaListItems(document);
      }
    }

    if (document.body) { _initObserver(); }
    else { document.addEventListener('DOMContentLoaded', _initObserver); }

    var style = document.createElement('style');
    style.textContent = '.wallet-adapter-modal-list li:has([alt="Mobile Wallet Adapter"]) { display:none!important; } .wallet-adapter-modal-list li:has(button[title="Mobile Wallet Adapter"]) { display:none!important; }';
    (document.head || document.documentElement || document.body).appendChild(style);
  } catch(e) {}
})();