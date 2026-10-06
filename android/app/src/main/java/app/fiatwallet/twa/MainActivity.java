package app.fiatwallet.twa;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * FiatWallet MainActivity
 *
 * Extends Capacitor's BridgeActivity which gives us full control over the
 * native Android WebView. This is the critical difference from the TWA version —
 * we can now inject window.solana, window.fiatwallet, and register with the
 * Solana Wallet Standard BEFORE any dApp JavaScript runs.
 *
 * Key capabilities enabled by native WebView control:
 * 1. Inject window.solana at onPageStarted (before dApp JS)
 * 2. Register FiatWallet in Android Intent system for solana-wallet:// URIs
 * 3. Handle Mobile Wallet Adapter (MWA) session requests
 * 4. Full JavaScript bridge between Java and React JS
 */
public class MainActivity extends BridgeActivity {

    /**
     * JavaScript to inject into EVERY page the WebView loads.
     * This runs before any page JS, so dApps always see window.solana = FiatWallet.
     *
     * This mirrors exactly what Phantom and Solflare do in their native apps.
     */
    private static final String SOLANA_INJECTION_SCRIPT =
        "(function() {" +
        "  if (window.__fiatwalletInjected) return;" +
        "  window.__fiatwalletInjected = true;" +
        "" +
        "  // ── FiatWallet Provider ─────────────────────────────────────────" +
        "  var _events = {};" +
        "  function emit(evt) {" +
        "    var listeners = _events[evt] || [];" +
        "    for (var i = 0; i < listeners.length; i++) {" +
        "      try { listeners[i].apply(null, Array.prototype.slice.call(arguments, 1)); } catch(e) {}" +
        "    }" +
        "  }" +
        "" +
        "  var fiatwalletProvider = {" +
        "    isFiatWallet: true," +
        "    isPhantom: true," +      // max dApp compatibility
        "    isSolflare: true," +
        "    isConnected: false," +
        "    publicKey: null," +
        "    _pendingRequests: {}," +
        "" +
        "    on: function(evt, fn) { (_events[evt] = _events[evt] || []).push(fn); return this; }," +
        "    removeListener: function(evt, fn) {" +
        "      _events[evt] = (_events[evt] || []).filter(function(l) { return l !== fn; });" +
        "      return this;" +
        "    }," +
        "" +
        "    connect: function(opts) {" +
        "      var self = this;" +
        "      return new Promise(function(resolve, reject) {" +
        "        var reqId = 'connect_' + Date.now();" +
        "        self._pendingRequests[reqId] = { resolve: resolve, reject: reject };" +
        "        if (window.FiatWalletBridge) {" +
        "          window.FiatWalletBridge.requestConnect(reqId, window.location.origin, document.title || '');" +
        "        } else {" +
        "          reject(new Error('FiatWallet bridge not available'));" +
        "        }" +
        "      });" +
        "    }," +
        "" +
        "    disconnect: function() {" +
        "      this.isConnected = false;" +
        "      this.publicKey = null;" +
        "      emit('disconnect');" +
        "      return Promise.resolve();" +
        "    }," +
        "" +
        "    signTransaction: function(tx) {" +
        "      var self = this;" +
        "      return new Promise(function(resolve, reject) {" +
        "        if (!self.isConnected) { reject(new Error('Not connected')); return; }" +
        "        var reqId = 'signTx_' + Date.now();" +
        "        self._pendingRequests[reqId] = { resolve: resolve, reject: reject };" +
        "        if (window.FiatWalletBridge) {" +
        "          var txData = JSON.stringify(tx);" +
        "          window.FiatWalletBridge.requestSignTransaction(reqId, txData);" +
        "        } else {" +
        "          reject(new Error('FiatWallet bridge not available'));" +
        "        }" +
        "      });" +
        "    }," +
        "" +
        "    signAllTransactions: function(txs) {" +
        "      var self = this;" +
        "      return Promise.all(txs.map(function(tx) { return self.signTransaction(tx); }));" +
        "    }," +
        "" +
        "    signAndSendTransaction: function(tx, opts) {" +
        "      var self = this;" +
        "      return new Promise(function(resolve, reject) {" +
        "        if (!self.isConnected) { reject(new Error('Not connected')); return; }" +
        "        var reqId = 'signSend_' + Date.now();" +
        "        self._pendingRequests[reqId] = { resolve: resolve, reject: reject };" +
        "        if (window.FiatWalletBridge) {" +
        "          window.FiatWalletBridge.requestSignAndSend(reqId, JSON.stringify(tx));" +
        "        } else {" +
        "          reject(new Error('FiatWallet bridge not available'));" +
        "        }" +
        "      });" +
        "    }," +
        "" +
        "    signMessage: function(msg) {" +
        "      var self = this;" +
        "      return new Promise(function(resolve, reject) {" +
        "        if (!self.isConnected) { reject(new Error('Not connected')); return; }" +
        "        var reqId = 'signMsg_' + Date.now();" +
        "        self._pendingRequests[reqId] = { resolve: resolve, reject: reject };" +
        "        if (window.FiatWalletBridge) {" +
        "          var msgStr = typeof msg === 'string' ? msg : btoa(String.fromCharCode.apply(null, msg));" +
        "          window.FiatWalletBridge.requestSignMessage(reqId, msgStr);" +
        "        } else {" +
        "          reject(new Error('FiatWallet bridge not available'));" +
        "        }" +
        "      });" +
        "    }," +
        "" +
        "    // Called by Java bridge when user approves connection" +
        "    _onConnectApproved: function(reqId, publicKeyStr) {" +
        "      this.isConnected = true;" +
        "      this.publicKey = { toBase58: function() { return publicKeyStr; }, toString: function() { return publicKeyStr; } };" +
        "      emit('connect', this.publicKey);" +
        "      var req = this._pendingRequests[reqId];" +
        "      if (req) { req.resolve({ publicKey: this.publicKey }); delete this._pendingRequests[reqId]; }" +
        "    }," +
        "" +
        "    _onConnectRejected: function(reqId) {" +
        "      var req = this._pendingRequests[reqId];" +
        "      if (req) { req.reject(new Error('User rejected connection')); delete this._pendingRequests[reqId]; }" +
        "    }," +
        "" +
        "    _onSignApproved: function(reqId, resultData) {" +
        "      var req = this._pendingRequests[reqId];" +
        "      if (req) { req.resolve(resultData); delete this._pendingRequests[reqId]; }" +
        "    }," +
        "" +
        "    _onSignRejected: function(reqId) {" +
        "      var req = this._pendingRequests[reqId];" +
        "      if (req) { req.reject(new Error('User rejected request')); delete this._pendingRequests[reqId]; }" +
        "    }," +
        "  };" +
        "" +
        "  // ── Register as window.solana and friends ──────────────────────" +
        "  window.fiatwallet   = fiatwalletProvider;" +
        "  window.solana       = fiatwalletProvider;" +
        "  window.phantom      = { solana: fiatwalletProvider, isFiatWallet: true };" +
        "  window.solflare     = fiatwalletProvider;" +
        "" +
        "  // ── Register with Solana Wallet Standard ───────────────────────" +
        "  var walletStandardWallet = {" +
        "    name: 'FiatWallet'," +
        "    icon: 'https://fiatwallet.app/icon512.png'," +
        "    version: '1.0.0'," +
        "    chains: ['solana:mainnet', 'solana:devnet', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']," +
        "    features: {" +
        "      'standard:connect': { version: '1.0.0', connect: function(i) { return fiatwalletProvider.connect(i); } }," +
        "      'standard:disconnect': { version: '1.0.0', disconnect: function() { return fiatwalletProvider.disconnect(); } }," +
        "      'standard:events': { version: '1.0.0', on: function(e, fn) { return fiatwalletProvider.on(e, fn); } }," +
        "      'solana:signTransaction': { version: '1.0.0'," +
        "        signTransaction: function(i) { return fiatwalletProvider.signTransaction(i.transaction).then(function(t) { return [{ signedTransaction: t }]; }); }" +
        "      }," +
        "      'solana:signAndSendTransaction': { version: '1.0.0'," +
        "        signAndSendTransaction: function(i) { return fiatwalletProvider.signAndSendTransaction(i.transaction, i.options).then(function(r) { return [r]; }); }" +
        "      }," +
        "      'solana:signMessage': { version: '1.0.0'," +
        "        signMessage: function(i) { return fiatwalletProvider.signMessage(i.message).then(function(r) { return [r]; }); }" +
        "      }," +
        "    }," +
        "    accounts: []," +
        "  };" +
        "" +
        "  function registerWalletStandard(register) { try { register(walletStandardWallet); } catch(e) {} }" +
        "" +
        "  // Register immediately for any already-listening dApps" +
        "  window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: { register: registerWalletStandard } }));" +
        "" +
        "  // Also listen for dApps that fire the app-ready event after we inject" +
        "  window.addEventListener('wallet-standard:app-ready', function(e) {" +
        "    if (e.detail && typeof e.detail.register === 'function') {" +
        "      try { e.detail.register(walletStandardWallet); } catch(err) {}" +
        "    }" +
        "  });" +
        "" +
        "  console.log('[FiatWallet] Injected window.solana, window.fiatwallet, Wallet Standard registration complete.');" +
        "})();";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        setupWebView();
    }

    /**
     * Set up the native WebView:
     * 1. Enable JavaScript
     * 2. Add the Java↔JavaScript bridge (FiatWalletBridge)
     * 3. Add the page-load listener that injects window.solana
     */
    private void setupWebView() {
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);

        // Add the Java bridge object accessible as window.FiatWalletBridge in JS
        webView.addJavascriptInterface(new FiatWalletBridge(), "FiatWalletBridge");

        // Inject window.solana into every page BEFORE the page's own scripts run
        webView.setWebViewClient(new android.webkit.WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                // This runs in the page's own JS context — same as what Phantom does
                view.evaluateJavascript(SOLANA_INJECTION_SCRIPT, null);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Re-inject after page load to catch any late-initializing dApps
                view.evaluateJavascript(SOLANA_INJECTION_SCRIPT, null);
            }
        });
    }

    /**
     * Java bridge exposed to JavaScript as window.FiatWalletBridge.
     * Allows the injected JS provider to call back into the native Android app.
     */
    private class FiatWalletBridge {

        /**
         * Called by window.fiatwallet.connect() in JS.
         * The native app should show an approval UI, then call back:
         *   evaluateJavascript("window.fiatwallet._onConnectApproved(reqId, publicKey)")
         */
        @JavascriptInterface
        public void requestConnect(String reqId, String origin, String title) {
            runOnUiThread(() -> {
                // Forward to the Capacitor bridge / React UI via a custom event
                String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-connect-request', " +
                            "{ detail: { reqId: '" + reqId + "', origin: '" + escapeJs(origin) + "', title: '" + escapeJs(title) + "' } }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }

        @JavascriptInterface
        public void requestSignTransaction(String reqId, String txData) {
            runOnUiThread(() -> {
                String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-sign-request', " +
                            "{ detail: { reqId: '" + reqId + "', type: 'signTransaction', txData: " + txData + " } }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }

        @JavascriptInterface
        public void requestSignAndSend(String reqId, String txData) {
            runOnUiThread(() -> {
                String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-sign-request', " +
                            "{ detail: { reqId: '" + reqId + "', type: 'signAndSendTransaction', txData: " + txData + " } }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }

        @JavascriptInterface
        public void requestSignMessage(String reqId, String message) {
            runOnUiThread(() -> {
                String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-sign-request', " +
                            "{ detail: { reqId: '" + reqId + "', type: 'signMessage', message: '" + escapeJs(message) + "' } }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }

        private String escapeJs(String s) {
            if (s == null) return "";
            return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r");
        }
    }
}
