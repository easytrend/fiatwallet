package app.fiatwallet.twa;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ClipDrawable;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.app.AlertDialog;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * FiatWallet MainActivity
 *
 * Extends Capacitor's BridgeActivity. Enables native Android Web3 browser functionality:
 * 1. Injects window.solana, window.phantom, and Solana Wallet Standard into active dApps
 * 2. Bridges connect, signTransaction, signAllTransactions between dApps and FiatWallet
 * 3. Handles solana-wallet://, fiatwallet://, and wc:// deep links
 */
public class MainActivity extends BridgeActivity {

    @CapacitorPlugin(name = "FiatWalletBridge")
    public static class FiatWalletBridgePlugin extends Plugin {
        @PluginMethod
        public void setWalletPublicKey(PluginCall call) {
            String pubKey = call.getString("publicKey");
            MainActivity activity = (MainActivity) getActivity();
            if (activity != null) {
                if (pubKey != null && !pubKey.isEmpty()) {
                    activity.currentPublicKey = pubKey;
                }
                call.resolve();
            } else {
                call.reject("Activity unavailable");
            }
        }

        @PluginMethod
        public void openDApp(PluginCall call) {
            String url = call.getString("url");
            String title = call.getString("title");
            String pubKey = call.getString("publicKey");
            MainActivity activity = (MainActivity) getActivity();
            if (activity != null) {
                if (pubKey != null && !pubKey.isEmpty()) {
                    activity.currentPublicKey = pubKey;
                } else if (activity.currentPublicKey.isEmpty() && activity.getBridge() != null && activity.getBridge().getWebView() != null) {
                    activity.getBridge().getWebView().evaluateJavascript(
                        "(window._fiatWalletPubKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('fw_wallet_pubkey') || '') : ''))",
                        val -> {
                            String clean = val != null ? val.replace("\"", "").trim() : "";
                            if (!clean.isEmpty() && !clean.equals("null") && !clean.equals("undefined")) {
                                activity.currentPublicKey = clean;
                            }
                        }
                    );
                }
                activity.runOnUiThread(() -> activity.openDAppNative(url, title));
                call.resolve();
            } else {
                call.reject("Activity unavailable");
            }
        }

        @PluginMethod
        public void closeDApp(PluginCall call) {
            MainActivity activity = (MainActivity) getActivity();
            if (activity != null) {
                activity.runOnUiThread(activity::closeDAppInternal);
                call.resolve();
            } else {
                call.reject("Activity unavailable");
            }
        }

        @PluginMethod
        public void approveConnect(PluginCall call) {
            String reqId = call.getString("reqId");
            String pubKey = call.getString("pubKey");
            MainActivity activity = (MainActivity) getActivity();
            if (activity != null) {
                activity.bridgeInstance.approveConnect(reqId, pubKey);
                call.resolve();
            } else {
                call.reject("Activity unavailable");
            }
        }

        @PluginMethod
        public void rejectConnect(PluginCall call) {
            String reqId = call.getString("reqId");
            MainActivity activity = (MainActivity) getActivity();
            if (activity != null) {
                activity.bridgeInstance.rejectConnect(reqId);
                call.resolve();
            } else {
                call.reject("Activity unavailable");
            }
        }

        @PluginMethod
        public void approveSign(PluginCall call) {
            String reqId = call.getString("reqId");
            String resultData = call.getString("resultData");
            MainActivity activity = (MainActivity) getActivity();
            if (activity != null) {
                activity.bridgeInstance.approveSign(reqId, resultData);
                call.resolve();
            } else {
                call.reject("Activity unavailable");
            }
        }

        @PluginMethod
        public void rejectSign(PluginCall call) {
            String reqId = call.getString("reqId");
            MainActivity activity = (MainActivity) getActivity();
            if (activity != null) {
                activity.bridgeInstance.rejectSign(reqId);
                call.resolve();
            } else {
                call.reject("Activity unavailable");
            }
        }
    }

    private ViewGroup dAppContainer = null;
    private WebView dAppWebView = null;
    private EditText dAppSearchBar = null;
    private ProgressBar dAppProgressBar = null;
    private final FiatWalletBridge bridgeInstance = new FiatWalletBridge();
    private String currentPublicKey = "";
    private final Set<String> connectedOrigins = new HashSet<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(FiatWalletBridgePlugin.class);
        super.onCreate(savedInstanceState);
        setupWebView();
        // Schedule delayed attempts in case Capacitor attaches the WebView asynchronously
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(this::setupWebView, 250);
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(this::setupWebView, 1000);
        handleDeepLinkIntent(getIntent());
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLinkIntent(intent);
    }

    private void handleDeepLinkIntent(android.content.Intent intent) {
        if (intent == null) return;
        Uri uri = intent.getData();
        if (uri == null) return;

        String uriString = uri.toString();
        runOnUiThread(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            WebView webView = getBridge().getWebView();
            if (uriString.startsWith("wc:")) {
                String js = "window.dispatchEvent(new CustomEvent('fiatwallet:deep-link-wc', { detail: { uri: '" + escapeJs(uriString) + "' } }));";
                webView.evaluateJavascript(js, null);
            } else if (uriString.startsWith("fiatwallet:")) {
                String js = "window.dispatchEvent(new CustomEvent('fiatwallet:deep-link-custom', { detail: { uri: '" + escapeJs(uriString) + "' } }));";
                webView.evaluateJavascript(js, null);
            }
        });
    }

    private static String escapeJs(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r");
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onStart() {
        super.onStart();
        setupWebView();
        handleDeepLinkIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        setupWebView();
    }

    @Override
    public void onBackPressed() {
        if (dAppContainer != null) {
            if (dAppWebView != null && dAppWebView.canGoBack()) {
                dAppWebView.goBack();
                return;
            }
            closeDAppInternal();
            return;
        }
        super.onBackPressed();
    }

    private void setupWebView() {
        runOnUiThread(() -> {
            try {
                if (getBridge() == null) return;
                WebView webView = getBridge().getWebView();
                if (webView == null) return;

                String defaultUa = webView.getSettings().getUserAgentString();
                if (defaultUa != null) {
                    String cleanUa = defaultUa.replace("; wv", "").replace(";wv", "").replace("Version/4.0 ", "");
                    webView.getSettings().setUserAgentString(cleanUa);
                }

                webView.getSettings().setJavaScriptEnabled(true);
                webView.getSettings().setDomStorageEnabled(true);
                webView.getSettings().setDatabaseEnabled(true);
                webView.getSettings().setAllowFileAccess(true);
                webView.getSettings().setAllowContentAccess(true);
                webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

                webView.addJavascriptInterface(bridgeInstance, "FiatWalletBridge");
                android.util.Log.i("FiatWallet", "FiatWalletBridge interface attached to main webview");
            } catch (Exception e) {
                android.util.Log.w("FiatWallet", "setupWebView warning: " + e.getMessage());
            }
        });
    }

    private void closeDAppInternal() {
        if (dAppContainer != null) {
            ViewGroup parent = (ViewGroup) dAppContainer.getParent();
            if (parent != null) {
                parent.removeView(dAppContainer);
            }
            if (dAppWebView != null) {
                dAppWebView.stopLoading();
                dAppWebView.loadUrl("about:blank");
                dAppWebView.clearHistory();
                dAppWebView.destroy();
                dAppWebView = null;
            }
            dAppSearchBar = null;
            dAppProgressBar = null;
            dAppContainer = null;
        }
    }

    private void hideKeyboard(EditText editText) {
        if (editText == null) return;
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) {
            imm.hideSoftInputFromWindow(editText.getWindowToken(), 0);
        }
    }

    private String resolveDAppUrl(String query) {
        if (query == null) return "https://pump.fun/explore";
        String trimmed = query.trim();
        String lower = trimmed.toLowerCase();

        switch (lower) {
            case "pump":
            case "pump.fun":
            case "pumpfun":
                return "https://pump.fun/explore";
            case "raydium":
                return "https://raydium.io/swap/";
            case "jupiter":
            case "jup":
            case "jup.ag":
                return "https://jup.ag";
            case "magiceden":
            case "magic eden":
                return "https://magiceden.io";
            case "kamino":
                return "https://kamino.com/earn/lend";
            case "orca":
                return "https://www.orca.so/pools";
            case "dexscreener":
                return "https://dexscreener.com/?rankBy=trendingScoreH6&order=desc&chainIds=solana&profile=0";
            case "jito":
                return "https://www.jito.network/staking/";
            case "marinade":
                return "https://app.marinade.finance/";
            case "meteora":
                return "https://app.meteora.ag";
            case "sanctum":
                return "https://app.sanctum.so";
            case "birdeye":
                return "https://birdeye.so/?chain=solana";
            case "tensor":
                return "https://www.tensor.trade";
            case "solanafm":
            case "solana.fm":
                return "https://solana.fm";
            case "marginfi":
                return "https://app.marginfi.com";
            default:
                if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                    return trimmed;
                }
                if (trimmed.contains(".")) {
                    return "https://" + trimmed;
                }
                return "https://www.google.com/search?q=" + Uri.encode(trimmed);
        }
    }

    private String getProviderInjectionScript() {
        return "(function() {" +
            "  if (window.solana && window.solana.isFiatWallet) return;" +
            "  var pendingRequests = {};" +
            "  window._fiatReqs = pendingRequests;" +
            "  function base58Decode(str) {" +
            "    var ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';" +
            "    var bytes = [0];" +
            "    for (var i = 0; i < str.length; i++) {" +
            "      var c = str[i];" +
            "      var val = ALPHABET.indexOf(c);" +
            "      if (val === -1) throw new Error('Illegal char ' + c);" +
            "      for (var j = 0; j < bytes.length; j++) {" +
            "        val += bytes[j] * 58;" +
            "        bytes[j] = val & 0xff;" +
            "        val >>= 8;" +
            "      }" +
            "      while (val > 0) {" +
            "        bytes.push(val & 0xff);" +
            "        val >>= 8;" +
            "      }" +
            "    }" +
            "    for (var k = 0; k < str.length && str[k] === '1'; k++) bytes.push(0);" +
            "    return new Uint8Array(bytes.reverse());" +
            "  }" +
            "  function PublicKey(val) {" +
            "    if (typeof val === 'string') {" +
            "      this._bn = val;" +
            "      this._bytes = base58Decode(val);" +
            "    } else if (val && val.toBase58) {" +
            "      this._bn = val.toBase58();" +
            "      this._bytes = val.toBytes ? val.toBytes() : (val.toByteArray ? val.toByteArray() : new Uint8Array(val));" +
            "    } else {" +
            "      this._bn = String(val || '');" +
            "      this._bytes = new Uint8Array(32);" +
            "    }" +
            "  }" +
            "  PublicKey.prototype.toBase58 = function() { return this._bn; };" +
            "  PublicKey.prototype.toString = function() { return this._bn; };" +
            "  PublicKey.prototype.toBytes = function() { return this._bytes; };" +
            "  PublicKey.prototype.toByteArray = function() { return Array.from(this._bytes); };" +
            "  PublicKey.prototype.toBuffer = function() { return this._bytes; };" +
            "  PublicKey.prototype.toJSON = function() { return this._bn; };" +
            "  PublicKey.prototype.equals = function(o) { return o && (o.toBase58 ? o.toBase58() === this._bn : String(o) === this._bn); };" +
            "  window.PublicKey = window.PublicKey || PublicKey;" +
            "  function makePublicKey(val) {" +
            "    try {" +
            "      if (window.solanaWeb3 && window.solanaWeb3.PublicKey) {" +
            "        return new window.solanaWeb3.PublicKey(val);" +
            "      }" +
            "    } catch(e) {}" +
            "    return new PublicKey(val);" +
            "  }" +
            "  var listeners = {};" +
            "  var registeredWallet = {" +
            "    name: 'FiatWallet'," +
            "    icon: 'https://fiatwallet.pages.dev/logo.jpg'," +
            "    version: '1.0.0'," +
            "    chains: ['solana:mainnet', 'solana:devnet']," +
            "    accounts: []," +
            "    features: {}" +
            "  };" +
            "  var provider = {" +
            "    isFiatWallet: true," +
            "    isPhantom: true," +
            "    isSolflare: true," +
            "    autoApprove: false," +
            "    isConnected: false," +
            "    publicKey: null," +
            "    on: function(event, cb) {" +
            "      if (!listeners[event]) listeners[event] = [];" +
            "      listeners[event].push(cb);" +
            "      return provider;" +
            "    }," +
            "    addListener: function(event, cb) { return provider.on(event, cb); }," +
            "    removeListener: function(event, cb) {" +
            "      if (!listeners[event]) return provider;" +
            "      listeners[event] = listeners[event].filter(function(fn) { return fn !== cb; });" +
            "      return provider;" +
            "    }," +
            "    off: function(event, cb) { return provider.removeListener(event, cb); }," +
            "    emit: function(event, arg) {" +
            "      if (!listeners[event]) return;" +
            "      listeners[event].forEach(function(fn) { try { fn(arg); } catch(e){} });" +
            "    }," +
            "    connect: function(opts) {" +
            "      if (opts && opts.onlyIfTrusted) {" +
            "        if (provider.isConnected && provider.publicKey) {" +
            "          return Promise.resolve({ publicKey: provider.publicKey, accounts: registeredWallet.accounts });" +
            "        }" +
            "        return Promise.reject(new Error('User not connected'));" +
            "      }" +
            "      if (provider.isConnected && provider.publicKey) {" +
            "        return Promise.resolve({ publicKey: provider.publicKey, accounts: registeredWallet.accounts });" +
            "      }" +
            "      return new Promise(function(resolve, reject) {" +
            "        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);" +
            "        pendingRequests[reqId] = { resolve: resolve, reject: reject };" +
            "        if (window.FiatWalletBridge && window.FiatWalletBridge.requestConnect) {" +
            "          window.FiatWalletBridge.requestConnect(reqId, window.location.origin, document.title || 'dApp');" +
            "        } else { reject(new Error('FiatWallet native bridge unavailable')); }" +
            "      });" +
            "    }," +
            "    disconnect: function() {" +
            "      provider.isConnected = false;" +
            "      provider.publicKey = null;" +
            "      registeredWallet.accounts = [];" +
            "      try { provider.emit('disconnect'); } catch(e) {}" +
            "      try { provider.emit('change', { accounts: [] }); } catch(e) {}" +
            "      return Promise.resolve();" +
            "    }," +
            "    signTransaction: function(tx) {" +
            "      return new Promise(function(resolve, reject) {" +
            "        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);" +
            "        pendingRequests[reqId] = { resolve: resolve, reject: reject, tx: tx };" +
            "        var serialized;" +
            "        try {" +
            "          if (typeof tx.serialize === 'function') {" +
            "            serialized = Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));" +
            "          } else { serialized = tx; }" +
            "        } catch(e) { serialized = tx; }" +
            "        if (window.FiatWalletBridge && window.FiatWalletBridge.requestSignTransaction) {" +
            "          window.FiatWalletBridge.requestSignTransaction(reqId, JSON.stringify(serialized));" +
            "        } else { reject(new Error('FiatWallet native bridge unavailable')); }" +
            "      });" +
            "    }," +
            "    signAllTransactions: function(txs) {" +
            "      return Promise.all(txs.map(function(t) { return provider.signTransaction(t); }));" +
            "    }," +
            "    signAndSendTransaction: function(tx, opts) {" +
            "      return new Promise(function(resolve, reject) {" +
            "        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);" +
            "        pendingRequests[reqId] = { resolve: resolve, reject: reject, tx: tx };" +
            "        var serialized;" +
            "        try {" +
            "          if (typeof tx.serialize === 'function') {" +
            "            serialized = Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));" +
            "          } else { serialized = tx; }" +
            "        } catch(e) { serialized = tx; }" +
            "        if (window.FiatWalletBridge && window.FiatWalletBridge.requestSignAndSend) {" +
            "          window.FiatWalletBridge.requestSignAndSend(reqId, JSON.stringify(serialized));" +
            "        } else { reject(new Error('FiatWallet native bridge unavailable')); }" +
            "      });" +
            "    }," +
            "    signMessage: function(msg) {" +
            "      return new Promise(function(resolve, reject) {" +
            "        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);" +
            "        pendingRequests[reqId] = { resolve: resolve, reject: reject };" +
            "        var msgStr = typeof msg === 'string' ? msg : Array.from(msg).join(',');" +
            "        if (window.FiatWalletBridge && window.FiatWalletBridge.requestSignMessage) {" +
            "          window.FiatWalletBridge.requestSignMessage(reqId, msgStr);" +
            "        } else { reject(new Error('FiatWallet native bridge unavailable')); }" +
            "      });" +
            "    }," +
            "    request: function(args) {" +
            "      if (!args || !args.method) return Promise.reject(new Error('Invalid request'));" +
            "      if (args.method === 'connect') return provider.connect(args.params);" +
            "      if (args.method === 'disconnect') return provider.disconnect();" +
            "      if (args.method === 'signTransaction') return provider.signTransaction(args.params ? (args.params.transaction || args.params) : null);" +
            "      if (args.method === 'signAllTransactions') return provider.signAllTransactions(args.params ? (args.params.transactions || args.params) : []);" +
            "      if (args.method === 'signAndSendTransaction') return provider.signAndSendTransaction(args.params ? (args.params.transaction || args.params) : null, args.params ? args.params.options : undefined);" +
            "      if (args.method === 'signMessage') return provider.signMessage(args.params ? (args.params.message || args.params) : null);" +
            "      return Promise.reject(new Error('Method ' + args.method + ' not supported'));" +
            "    }," +
            "    _onConnectApproved: function(reqId, pubKey) {" +
            "      var pub = pubKey ? makePublicKey(pubKey) : null;" +
            "      provider.publicKey = pub;" +
            "      provider.isConnected = !!pub;" +
            "      if (pubKey) {" +
            "        var bytes = base58Decode(pubKey);" +
            "        registeredWallet.accounts = [{" +
            "          address: pubKey," +
            "          publicKey: bytes," +
            "          chains: ['solana:mainnet', 'solana:devnet']," +
            "          features: ['solana:signTransaction', 'solana:signAndSendTransaction', 'solana:signMessage']" +
            "        }];" +
            "      } else {" +
            "        registeredWallet.accounts = [];" +
            "      }" +
            "      try { provider.emit('connect', pub); } catch(e) {}" +
            "      try { provider.emit('accountChanged', pub); } catch(e) {}" +
            "      try { provider.emit('change', { accounts: registeredWallet.accounts }); } catch(e) {}" +
            "      if (pendingRequests[reqId]) {" +
            "        pendingRequests[reqId].resolve({ publicKey: pub, accounts: registeredWallet.accounts });" +
            "        delete pendingRequests[reqId];" +
            "      }" +
            "    }," +
            "    _onConnectRejected: function(reqId) {" +
            "      provider.isConnected = false;" +
            "      try { provider.emit('disconnect'); } catch(e) {}" +
            "      if (pendingRequests[reqId]) {" +
            "        pendingRequests[reqId].reject(new Error('User rejected connection'));" +
            "        delete pendingRequests[reqId];" +
            "      }" +
            "    }," +
            "    _onSignApproved: function(reqId, result) {" +
            "      if (pendingRequests[reqId]) {" +
            "        var origTx = pendingRequests[reqId].tx;" +
            "        var out = result;" +
            "        if (origTx && Array.isArray(result)) {" +
            "          try {" +
            "            var u8 = new Uint8Array(result);" +
            "            if (window.solanaWeb3) {" +
            "              if (window.solanaWeb3.Transaction) { try { out = window.solanaWeb3.Transaction.from(u8); } catch(e1) {} }" +
            "              if (!out && window.solanaWeb3.VersionedTransaction) { try { out = window.solanaWeb3.VersionedTransaction.deserialize(u8); } catch(e2) {} }" +
            "            }" +
            "            if (!out && origTx.constructor && typeof origTx.constructor.from === 'function') { try { out = origTx.constructor.from(u8); } catch(e3) {} }" +
            "            if (!out && origTx.constructor && typeof origTx.constructor.deserialize === 'function') { try { out = origTx.constructor.deserialize(u8); } catch(e4) {} }" +
            "            if (!out) { out = u8; out.serialize = function() { return u8; }; }" +
            "          } catch(e) { out = result; }" +
            "        }" +
            "        pendingRequests[reqId].resolve(out);" +
            "        delete pendingRequests[reqId];" +
            "      }" +
            "    }," +
            "    _onSignRejected: function(reqId) {" +
            "      if (pendingRequests[reqId]) {" +
            "        pendingRequests[reqId].reject(new Error('User rejected signature'));" +
            "        delete pendingRequests[reqId];" +
            "      }" +
            "    }" +
            "  };" +
            "  registeredWallet.features = {" +
            "    'standard:connect': {" +
            "      version: '1.0.0'," +
            "      connect: function(input) {" +
            "        return provider.connect(input).then(function() {" +
            "          return { accounts: registeredWallet.accounts };" +
            "        });" +
            "      }" +
            "    }," +
            "    'standard:disconnect': {" +
            "      version: '1.0.0'," +
            "      disconnect: function() { return provider.disconnect(); }" +
            "    }," +
            "    'standard:events': {" +
            "      version: '1.0.0'," +
            "      on: function(event, cb) { return provider.on(event, cb); }" +
            "    }," +
            "    'solana:signTransaction': {" +
            "      version: '1.0.0'," +
            "      signTransaction: function(input) {" +
            "        return provider.signTransaction(input.transaction).then(function(signed) {" +
            "          var raw = (signed && typeof signed.serialize === 'function') ? signed.serialize() : new Uint8Array(signed);" +
            "          return [{ signedTransaction: raw }];" +
            "        });" +
            "      }" +
            "    }," +
            "    'solana:signAndSendTransaction': {" +
            "      version: '1.0.0'," +
            "      signAndSendTransaction: function(input) {" +
            "        return provider.signAndSendTransaction(input.transaction, input.options).then(function(res) {" +
            "          return [{ signature: res.signature || res }];" +
            "        });" +
            "      }" +
            "    }," +
            "    'solana:signMessage': {" +
            "      version: '1.0.0'," +
            "      signMessage: function(input) {" +
            "        return provider.signMessage(input.message).then(function(res) {" +
            "          return [{ signedMessage: input.message, signature: (res && res.signature) ? res.signature : new Uint8Array(64) }];" +
            "        });" +
            "      }" +
            "    }" +
            "  };" +
            "  window.solana = provider;" +
            "  window.fiatwallet = provider;" +
            "  window.phantom = window.phantom || {};" +
            "  window.phantom.solana = provider;" +
            "  window.solflare = provider;" +
            "  try {" +
            "    var reg = function(register) { register(registeredWallet); };" +
            "    window.addEventListener('wallet-standard:app-ready', function(e) {" +
            "      try { if (e && typeof e.detail === 'function') e.detail({ register: reg }); } catch(err) {}" +
            "    });" +
            "    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: { register: reg } }));" +
            "  } catch(e) {}" +
            "})();";
    }

    public void openDAppNative(String url, String title) {
        try {
            if (dAppContainer != null) {
                closeDAppInternal();
            }

            ViewGroup rootView = (ViewGroup) getWindow().getDecorView().findViewById(android.R.id.content);
            if (rootView == null) return;

            LinearLayout container = new LinearLayout(MainActivity.this);
            container.setOrientation(LinearLayout.VERTICAL);
            container.setBackgroundColor(Color.parseColor("#0a1628"));
            FrameLayout.LayoutParams layoutParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            );
            container.setLayoutParams(layoutParams);
            container.setElevation(dpToPx(50));
            container.setClickable(true);
            container.setFocusable(true);
            container.setFocusableInTouchMode(true);

            // Sleek in-app browser header
            LinearLayout header = new LinearLayout(MainActivity.this);
            header.setOrientation(LinearLayout.HORIZONTAL);
            header.setBackgroundColor(Color.parseColor("#0a1628"));
            LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dpToPx(50)
            );
            header.setLayoutParams(headerParams);
            header.setGravity(Gravity.CENTER_VERTICAL);
            header.setPadding(dpToPx(8), 0, dpToPx(8), 0);

            // Back button
            TextView backBtn = new TextView(MainActivity.this);
            backBtn.setText("←");
            backBtn.setTextColor(Color.WHITE);
            backBtn.setTextSize(18);
            backBtn.setTypeface(null, Typeface.BOLD);
            backBtn.setPadding(dpToPx(8), dpToPx(6), dpToPx(6), dpToPx(6));
            backBtn.setOnClickListener(v -> {
                if (dAppWebView != null && dAppWebView.canGoBack()) {
                    dAppWebView.goBack();
                } else {
                    closeDAppInternal();
                }
            });
            header.addView(backBtn);

            // Close button (returns user to FiatWallet Explorer)
            TextView closeBtn = new TextView(MainActivity.this);
            closeBtn.setText("✕");
            closeBtn.setTextColor(Color.parseColor("#94a3b8"));
            closeBtn.setTextSize(15);
            closeBtn.setTypeface(null, Typeface.BOLD);
            closeBtn.setPadding(dpToPx(6), dpToPx(6), dpToPx(6), dpToPx(6));
            closeBtn.setOnClickListener(v -> closeDAppInternal());
            header.addView(closeBtn);

            // Center: Editable search and domain bar
            EditText searchBar = new EditText(MainActivity.this);
            String initialUrl = resolveDAppUrl(url != null ? url : "https://pump.fun/explore");
            searchBar.setText(initialUrl);
            searchBar.setTextColor(Color.parseColor("#f0f6ff"));
            searchBar.setHintTextColor(Color.parseColor("#64748b"));
            searchBar.setHint("Search or enter dApp URL...");
            searchBar.setTextSize(12);
            searchBar.setSingleLine(true);
            searchBar.setImeOptions(EditorInfo.IME_ACTION_GO);
            searchBar.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
            searchBar.setPadding(dpToPx(10), dpToPx(6), dpToPx(10), dpToPx(6));

            GradientDrawable gd = new GradientDrawable();
            gd.setColor(Color.parseColor("#13233c"));
            gd.setCornerRadius(dpToPx(10));
            gd.setStroke(dpToPx(1), Color.parseColor("#334155"));
            searchBar.setBackground(gd);

            LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f
            );
            searchParams.setMargins(dpToPx(4), 0, dpToPx(4), 0);
            searchBar.setLayoutParams(searchParams);

            searchBar.setOnEditorActionListener((v, actionId, event) -> {
                if (actionId == EditorInfo.IME_ACTION_GO ||
                    (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN)) {
                    String query = searchBar.getText().toString().trim();
                    if (!query.isEmpty()) {
                        String target = resolveDAppUrl(query);
                        if (dAppWebView != null) {
                            dAppWebView.loadUrl(target);
                        }
                        hideKeyboard(searchBar);
                        searchBar.clearFocus();
                    }
                    return true;
                }
                return false;
            });
            header.addView(searchBar);
            dAppSearchBar = searchBar;

            // Reload button
            TextView reloadBtn = new TextView(MainActivity.this);
            reloadBtn.setText("↻");
            reloadBtn.setTextColor(Color.parseColor("#22d3ee"));
            reloadBtn.setTextSize(18);
            reloadBtn.setTypeface(null, Typeface.BOLD);
            reloadBtn.setPadding(dpToPx(8), dpToPx(6), dpToPx(8), dpToPx(6));
            reloadBtn.setOnClickListener(v -> {
                if (dAppWebView != null) dAppWebView.reload();
            });
            header.addView(reloadBtn);

            container.addView(header);

            // Progress Bar below header
            ProgressBar progressBar = new ProgressBar(MainActivity.this, null, android.R.attr.progressBarStyleHorizontal);
            LinearLayout.LayoutParams pbParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dpToPx(3)
            );
            progressBar.setLayoutParams(pbParams);
            progressBar.setMax(100);
            progressBar.setProgress(0);
            progressBar.setIndeterminate(false);

            GradientDrawable pbBg = new GradientDrawable();
            pbBg.setColor(Color.parseColor("#0a1628"));
            GradientDrawable pbProgress = new GradientDrawable();
            pbProgress.setColor(Color.parseColor("#a3e635"));
            ClipDrawable pbClip = new ClipDrawable(pbProgress, Gravity.START, ClipDrawable.HORIZONTAL);
            LayerDrawable pbLayer = new LayerDrawable(new android.graphics.drawable.Drawable[]{pbBg, pbClip});
            pbLayer.setId(0, android.R.id.background);
            pbLayer.setId(1, android.R.id.progress);
            progressBar.setProgressDrawable(pbLayer);
            container.addView(progressBar);
            dAppProgressBar = progressBar;

            // Full-screen native webview
            dAppWebView = new WebView(MainActivity.this);
            dAppWebView.setBackgroundColor(Color.parseColor("#0a1628"));
            LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0, 1.0f
            );
            dAppWebView.setLayoutParams(webParams);
            dAppWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

            WebSettings s = dAppWebView.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            s.setAllowFileAccess(true);
            s.setAllowContentAccess(true);
            s.setMediaPlaybackRequiresUserGesture(false);
            s.setJavaScriptCanOpenWindowsAutomatically(true);
            s.setSupportMultipleWindows(false);
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            s.setUseWideViewPort(true);
            s.setLoadWithOverviewMode(true);
            s.setCacheMode(WebSettings.LOAD_DEFAULT);
            s.setBuiltInZoomControls(false);
            s.setDisplayZoomControls(false);

            // Enable third-party cookies for Cloudflare Turnstile, Solana auth:
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setAcceptThirdPartyCookies(dAppWebView, true);

            // Clean User-Agent without WebView markers or custom bot tokens
            String defaultUa = s.getUserAgentString();
            String cleanUa = defaultUa.replace("; wv", "").replace(";wv", "").replace("Version/4.0 ", "");
            s.setUserAgentString(cleanUa);

            dAppWebView.addJavascriptInterface(bridgeInstance, "FiatWalletBridge");

            final String providerScript = getProviderInjectionScript();

            try {
                if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                    WebViewCompat.addDocumentStartJavaScript(dAppWebView, providerScript, Collections.singleton("*"));
                }
            } catch (Exception e) {
                android.util.Log.w("FiatWallet", "addDocumentStartJavaScript warning: " + e.getMessage());
            }

            dAppWebView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageStarted(WebView view, String pageUrl, Bitmap favicon) {
                    super.onPageStarted(view, pageUrl, favicon);
                    view.evaluateJavascript(providerScript, null);
                    if (dAppSearchBar != null && !dAppSearchBar.hasFocus()) {
                        dAppSearchBar.setText(pageUrl);
                    }
                    if (dAppProgressBar != null) {
                        dAppProgressBar.setVisibility(View.VISIBLE);
                        dAppProgressBar.setProgress(15);
                    }
                }

                @Override
                public void onPageFinished(WebView view, String pageUrl) {
                    super.onPageFinished(view, pageUrl);
                    view.evaluateJavascript(providerScript, null);
                    if (dAppSearchBar != null && !dAppSearchBar.hasFocus()) {
                        dAppSearchBar.setText(pageUrl);
                    }
                    if (dAppProgressBar != null) {
                        dAppProgressBar.setVisibility(View.GONE);
                    }
                }

                @Override
                public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                    android.util.Log.w("DAppBrowser", "SSL error: " + error.toString());
                    handler.proceed();
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    if (request != null && request.isForMainFrame()) {
                        android.util.Log.e("DAppBrowser", "Main frame load error: " + error.getDescription());
                    }
                }

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri reqUri = request.getUrl();
                    if (reqUri != null) {
                        String scheme = reqUri.getScheme();
                        if (scheme != null && !scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https")) {
                            try {
                                Intent intent = new Intent(Intent.ACTION_VIEW, reqUri);
                                startActivity(intent);
                                return true;
                            } catch (Exception ignored) {}
                        }
                    }
                    return false;
                }
            });

            dAppWebView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onProgressChanged(WebView view, int newProgress) {
                    super.onProgressChanged(view, newProgress);
                    if (newProgress >= 15) {
                        view.evaluateJavascript(providerScript, null);
                    }
                    if (dAppProgressBar != null) {
                        dAppProgressBar.setProgress(newProgress);
                        dAppProgressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                    }
                }

                @Override
                public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                    android.util.Log.d("DAppBrowser", consoleMessage.message() + " -- line " + consoleMessage.lineNumber());
                    return true;
                }

                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    request.grant(request.getResources());
                }
            });

            container.addView(dAppWebView);
            rootView.addView(container);
            dAppContainer = container;

            // Force overlay to sit above the Capacitor WebView in the view hierarchy
            container.bringToFront();
            rootView.requestLayout();
            rootView.invalidate();

            dAppWebView.loadUrl(initialUrl);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void showConnectDialog(String reqId, String origin, String title) {
        runOnUiThread(() -> {
            try {
                if (currentPublicKey == null || currentPublicKey.isEmpty()) {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().evaluateJavascript(
                            "(window._fiatWalletPubKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('fw_wallet_pubkey') || '') : '') || (window.solana && window.solana.publicKey ? window.solana.publicKey.toString() : ''))",
                            val -> {
                                String clean = val != null ? val.replace("\"", "").trim() : "";
                                if (!clean.isEmpty() && !clean.equals("null") && !clean.equals("undefined")) {
                                    currentPublicKey = clean;
                                    showConnectDialog(reqId, origin, title);
                                } else {
                                    promptNoWalletDialog(reqId);
                                }
                            }
                        );
                        return;
                    } else {
                        promptNoWalletDialog(reqId);
                        return;
                    }
                }

                String cleanOrigin = origin != null ? origin.replace("https://", "").replace("http://", "").replace("/", "") : "dApp";
                String shortAddr = currentPublicKey.length() > 10 ?
                    (currentPublicKey.substring(0, 4) + "..." + currentPublicKey.substring(currentPublicKey.length() - 4)) : currentPublicKey;

                AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert);
                
                LinearLayout dialogLayout = new LinearLayout(MainActivity.this);
                dialogLayout.setOrientation(LinearLayout.VERTICAL);
                dialogLayout.setPadding(dpToPx(20), dpToPx(20), dpToPx(20), dpToPx(16));
                dialogLayout.setBackgroundColor(Color.parseColor("#0a1628"));

                TextView titleView = new TextView(MainActivity.this);
                titleView.setText("Connect to " + cleanOrigin);
                titleView.setTextColor(Color.WHITE);
                titleView.setTextSize(18);
                titleView.setTypeface(null, Typeface.BOLD);
                dialogLayout.addView(titleView);

                TextView subView = new TextView(MainActivity.this);
                subView.setText((title != null && !title.isEmpty()) ? title : cleanOrigin);
                subView.setTextColor(Color.parseColor("#94a3b8"));
                subView.setTextSize(13);
                subView.setPadding(0, dpToPx(4), 0, dpToPx(16));
                dialogLayout.addView(subView);

                LinearLayout addrBox = new LinearLayout(MainActivity.this);
                addrBox.setOrientation(LinearLayout.HORIZONTAL);
                addrBox.setBackgroundColor(Color.parseColor("#13233c"));
                addrBox.setPadding(dpToPx(12), dpToPx(10), dpToPx(12), dpToPx(10));
                GradientDrawable addrGd = new GradientDrawable();
                addrGd.setColor(Color.parseColor("#13233c"));
                addrGd.setCornerRadius(dpToPx(8));
                addrGd.setStroke(dpToPx(1), Color.parseColor("#334155"));
                addrBox.setBackground(addrGd);

                TextView addrLabel = new TextView(MainActivity.this);
                addrLabel.setText("Active Wallet: ");
                addrLabel.setTextColor(Color.parseColor("#94a3b8"));
                addrLabel.setTextSize(12);
                addrBox.addView(addrLabel);

                TextView addrVal = new TextView(MainActivity.this);
                addrVal.setText(shortAddr);
                addrVal.setTextColor(Color.parseColor("#a3e635"));
                addrVal.setTextSize(12);
                addrVal.setTypeface(null, Typeface.BOLD);
                addrBox.addView(addrVal);

                dialogLayout.addView(addrBox);

                TextView permTitle = new TextView(MainActivity.this);
                permTitle.setText("Permissions requested:\n• View wallet balance and activity\n• Request transaction approval");
                permTitle.setTextColor(Color.parseColor("#64748b"));
                permTitle.setTextSize(12);
                permTitle.setLineSpacing(dpToPx(2), 1.0f);
                permTitle.setPadding(0, dpToPx(14), 0, dpToPx(18));
                dialogLayout.addView(permTitle);

                LinearLayout btnLayout = new LinearLayout(MainActivity.this);
                btnLayout.setOrientation(LinearLayout.HORIZONTAL);
                btnLayout.setGravity(Gravity.END);

                builder.setView(dialogLayout);
                AlertDialog dialog = builder.create();
                if (dialog.getWindow() != null) {
                    dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                }

                TextView cancelBtn = new TextView(MainActivity.this);
                cancelBtn.setText("Cancel");
                cancelBtn.setTextColor(Color.parseColor("#94a3b8"));
                cancelBtn.setTextSize(14);
                cancelBtn.setTypeface(null, Typeface.BOLD);
                cancelBtn.setPadding(dpToPx(14), dpToPx(10), dpToPx(14), dpToPx(10));
                cancelBtn.setOnClickListener(v -> {
                    dialog.dismiss();
                    bridgeInstance.rejectConnect(reqId);
                });
                btnLayout.addView(cancelBtn);

                TextView connectBtn = new TextView(MainActivity.this);
                connectBtn.setText("Connect");
                connectBtn.setTextColor(Color.parseColor("#0a1628"));
                connectBtn.setTextSize(14);
                connectBtn.setTypeface(null, Typeface.BOLD);
                connectBtn.setPadding(dpToPx(18), dpToPx(10), dpToPx(18), dpToPx(10));
                GradientDrawable cbg = new GradientDrawable();
                cbg.setColor(Color.parseColor("#a3e635"));
                cbg.setCornerRadius(dpToPx(8));
                connectBtn.setBackground(cbg);
                connectBtn.setOnClickListener(v -> {
                    dialog.dismiss();
                    if (origin != null) connectedOrigins.add(origin);
                    bridgeInstance.approveConnect(reqId, currentPublicKey);
                });
                btnLayout.addView(connectBtn);

                dialogLayout.addView(btnLayout);
                dialog.setCancelable(false);
                dialog.show();
            } catch (Exception e) {
                android.util.Log.e("FiatWallet", "showConnectDialog error", e);
                bridgeInstance.approveConnect(reqId, currentPublicKey);
            }
        });
    }

    private void promptNoWalletDialog(String reqId) {
        runOnUiThread(() -> {
            try {
                AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert);
                builder.setTitle("Wallet Required");
                builder.setMessage("Please unlock or create a wallet in FiatWallet before connecting to dApps.");
                builder.setPositiveButton("OK", (d, w) -> {
                    bridgeInstance.rejectConnect(reqId);
                    closeDAppInternal();
                });
                builder.setCancelable(false);
                builder.show();
            } catch (Exception ignored) {
                bridgeInstance.rejectConnect(reqId);
            }
        });
    }

    private void showSignDialog(String reqId, String txData, String type) {
        runOnUiThread(() -> {
            try {
                AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert);
                
                LinearLayout dialogLayout = new LinearLayout(MainActivity.this);
                dialogLayout.setOrientation(LinearLayout.VERTICAL);
                dialogLayout.setPadding(dpToPx(20), dpToPx(20), dpToPx(20), dpToPx(16));
                dialogLayout.setBackgroundColor(Color.parseColor("#0a1628"));

                TextView titleView = new TextView(MainActivity.this);
                titleView.setText("Authorize Transaction");
                titleView.setTextColor(Color.WHITE);
                titleView.setTextSize(18);
                titleView.setTypeface(null, Typeface.BOLD);
                dialogLayout.addView(titleView);

                TextView subView = new TextView(MainActivity.this);
                subView.setText("The connected dApp requests your authorization to execute a Solana transaction.");
                subView.setTextColor(Color.parseColor("#94a3b8"));
                subView.setTextSize(13);
                subView.setPadding(0, dpToPx(6), 0, dpToPx(16));
                dialogLayout.addView(subView);

                LinearLayout addrBox = new LinearLayout(MainActivity.this);
                addrBox.setOrientation(LinearLayout.HORIZONTAL);
                addrBox.setBackgroundColor(Color.parseColor("#13233c"));
                addrBox.setPadding(dpToPx(12), dpToPx(10), dpToPx(12), dpToPx(10));
                GradientDrawable addrGd = new GradientDrawable();
                addrGd.setColor(Color.parseColor("#13233c"));
                addrGd.setCornerRadius(dpToPx(8));
                addrGd.setStroke(dpToPx(1), Color.parseColor("#334155"));
                addrBox.setBackground(addrGd);

                TextView addrLabel = new TextView(MainActivity.this);
                addrLabel.setText("Signing Wallet: ");
                addrLabel.setTextColor(Color.parseColor("#94a3b8"));
                addrLabel.setTextSize(12);
                addrBox.addView(addrLabel);

                String shortAddr = (currentPublicKey != null && currentPublicKey.length() > 10) ?
                    (currentPublicKey.substring(0, 4) + "..." + currentPublicKey.substring(currentPublicKey.length() - 4)) : "Active Wallet";
                TextView addrVal = new TextView(MainActivity.this);
                addrVal.setText(shortAddr);
                addrVal.setTextColor(Color.parseColor("#a3e635"));
                addrVal.setTextSize(12);
                addrVal.setTypeface(null, Typeface.BOLD);
                addrBox.addView(addrVal);

                dialogLayout.addView(addrBox);

                LinearLayout btnLayout = new LinearLayout(MainActivity.this);
                btnLayout.setOrientation(LinearLayout.HORIZONTAL);
                btnLayout.setGravity(Gravity.END);
                btnLayout.setPadding(0, dpToPx(18), 0, 0);

                builder.setView(dialogLayout);
                AlertDialog dialog = builder.create();
                if (dialog.getWindow() != null) {
                    dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                }

                TextView rejectBtn = new TextView(MainActivity.this);
                rejectBtn.setText("Reject");
                rejectBtn.setTextColor(Color.parseColor("#ef4444"));
                rejectBtn.setTextSize(14);
                rejectBtn.setTypeface(null, Typeface.BOLD);
                rejectBtn.setPadding(dpToPx(14), dpToPx(10), dpToPx(14), dpToPx(10));
                rejectBtn.setOnClickListener(v -> {
                    dialog.dismiss();
                    bridgeInstance.rejectSign(reqId);
                });
                btnLayout.addView(rejectBtn);

                TextView approveBtn = new TextView(MainActivity.this);
                approveBtn.setText("Approve");
                approveBtn.setTextColor(Color.parseColor("#0a1628"));
                approveBtn.setTextSize(14);
                approveBtn.setTypeface(null, Typeface.BOLD);
                approveBtn.setPadding(dpToPx(18), dpToPx(10), dpToPx(18), dpToPx(10));
                GradientDrawable abg = new GradientDrawable();
                abg.setColor(Color.parseColor("#a3e635"));
                abg.setCornerRadius(dpToPx(8));
                approveBtn.setBackground(abg);
                approveBtn.setOnClickListener(v -> {
                    dialog.dismiss();
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-sign-execute', " +
                                    "{ detail: { reqId: '" + reqId + "', type: '" + type + "', txData: " + txData + " } }));";
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                });
                btnLayout.addView(approveBtn);

                dialogLayout.addView(btnLayout);
                dialog.setCancelable(false);
                dialog.show();
            } catch (Exception e) {
                android.util.Log.e("FiatWallet", "showSignDialog error", e);
                bridgeInstance.rejectSign(reqId);
            }
        });
    }

    private void showSignMessageDialog(String reqId, String message) {
        runOnUiThread(() -> {
            try {
                AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert);
                
                LinearLayout dialogLayout = new LinearLayout(MainActivity.this);
                dialogLayout.setOrientation(LinearLayout.VERTICAL);
                dialogLayout.setPadding(dpToPx(20), dpToPx(20), dpToPx(20), dpToPx(16));
                dialogLayout.setBackgroundColor(Color.parseColor("#0a1628"));

                TextView titleView = new TextView(MainActivity.this);
                titleView.setText("Sign Message");
                titleView.setTextColor(Color.WHITE);
                titleView.setTextSize(18);
                titleView.setTypeface(null, Typeface.BOLD);
                dialogLayout.addView(titleView);

                TextView msgView = new TextView(MainActivity.this);
                msgView.setText(message);
                msgView.setTextColor(Color.parseColor("#94a3b8"));
                msgView.setTextSize(13);
                msgView.setPadding(0, dpToPx(6), 0, dpToPx(16));
                dialogLayout.addView(msgView);

                LinearLayout btnLayout = new LinearLayout(MainActivity.this);
                btnLayout.setOrientation(LinearLayout.HORIZONTAL);
                btnLayout.setGravity(Gravity.END);
                btnLayout.setPadding(0, dpToPx(14), 0, 0);

                builder.setView(dialogLayout);
                AlertDialog dialog = builder.create();
                if (dialog.getWindow() != null) {
                    dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                }

                TextView rejectBtn = new TextView(MainActivity.this);
                rejectBtn.setText("Reject");
                rejectBtn.setTextColor(Color.parseColor("#ef4444"));
                rejectBtn.setTextSize(14);
                rejectBtn.setTypeface(null, Typeface.BOLD);
                rejectBtn.setPadding(dpToPx(14), dpToPx(10), dpToPx(14), dpToPx(10));
                rejectBtn.setOnClickListener(v -> {
                    dialog.dismiss();
                    bridgeInstance.rejectSign(reqId);
                });
                btnLayout.addView(rejectBtn);

                TextView approveBtn = new TextView(MainActivity.this);
                approveBtn.setText("Sign");
                approveBtn.setTextColor(Color.parseColor("#0a1628"));
                approveBtn.setTextSize(14);
                approveBtn.setTypeface(null, Typeface.BOLD);
                approveBtn.setPadding(dpToPx(18), dpToPx(10), dpToPx(18), dpToPx(10));
                GradientDrawable abg = new GradientDrawable();
                abg.setColor(Color.parseColor("#a3e635"));
                abg.setCornerRadius(dpToPx(8));
                approveBtn.setBackground(abg);
                approveBtn.setOnClickListener(v -> {
                    dialog.dismiss();
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-sign-execute', " +
                                    "{ detail: { reqId: '" + reqId + "', type: 'signMessage', message: '" + escapeJs(message) + "' } }));";
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                });
                btnLayout.addView(approveBtn);

                dialogLayout.addView(btnLayout);
                dialog.setCancelable(false);
                dialog.show();
            } catch (Exception e) {
                bridgeInstance.rejectSign(reqId);
            }
        });
    }

    /**
     * Java bridge exposed to JavaScript as window.FiatWalletBridge.
     */
    public class FiatWalletBridge {

        @JavascriptInterface
        public void setWalletPublicKey(String pubKey) {
            if (pubKey != null && !pubKey.isEmpty()) {
                currentPublicKey = pubKey;
            }
        }

        @JavascriptInterface
        public void openDApp(String url, String title, String pubKey) {
            if (pubKey != null && !pubKey.isEmpty()) {
                currentPublicKey = pubKey;
            } else if (currentPublicKey.isEmpty() && getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(
                    "(window._fiatWalletPubKey || (typeof localStorage !== 'undefined' ? (localStorage.getItem('fw_wallet_pubkey') || '') : ''))",
                    val -> {
                        String clean = val != null ? val.replace("\"", "").trim() : "";
                        if (!clean.isEmpty() && !clean.equals("null") && !clean.equals("undefined")) {
                            currentPublicKey = clean;
                        }
                    }
                );
            }
            runOnUiThread(() -> openDAppNative(url, title));
        }

        @JavascriptInterface
        public void openDApp(String url, String title) {
            runOnUiThread(() -> openDAppNative(url, title));
        }

        @JavascriptInterface
        public void openDApp(String url) {
            runOnUiThread(() -> openDAppNative(url, "dApp"));
        }

        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> openDAppNative(url, "dApp"));
        }

        @JavascriptInterface
        public void closeDApp() {
            runOnUiThread(MainActivity.this::closeDAppInternal);
        }

        @JavascriptInterface
        public void requestConnect(String reqId, String origin, String title) {
            runOnUiThread(() -> {
                if (origin != null && connectedOrigins.contains(origin) && currentPublicKey != null && !currentPublicKey.isEmpty()) {
                    approveConnect(reqId, currentPublicKey);
                    return;
                }
                showConnectDialog(reqId, origin, title);
            });
        }

        @JavascriptInterface
        public void requestSignTransaction(String reqId, String txData) {
            runOnUiThread(() -> showSignDialog(reqId, txData, "signTransaction"));
        }

        @JavascriptInterface
        public void requestSignAndSend(String reqId, String txData) {
            runOnUiThread(() -> showSignDialog(reqId, txData, "signAndSendTransaction"));
        }

        @JavascriptInterface
        public void requestSignMessage(String reqId, String message) {
            runOnUiThread(() -> showSignMessageDialog(reqId, message));
        }

        @JavascriptInterface
        public void approveConnect(String reqId, String pubKey) {
            runOnUiThread(() -> {
                String js = "if (window.fiatwallet && window.fiatwallet._onConnectApproved) { " +
                            "window.fiatwallet._onConnectApproved('" + reqId + "', '" + escapeJs(pubKey) + "'); }";
                getBridge().getWebView().evaluateJavascript(js, null);

                if (dAppWebView != null) {
                    String dAppJs = "if (window.solana && window.solana._onConnectApproved) { " +
                                    "window.solana._onConnectApproved('" + reqId + "', '" + escapeJs(pubKey) + "'); }";
                    dAppWebView.evaluateJavascript(dAppJs, null);
                }
            });
        }

        @JavascriptInterface
        public void rejectConnect(String reqId) {
            runOnUiThread(() -> {
                String js = "if (window.fiatwallet && window.fiatwallet._onConnectRejected) { " +
                            "window.fiatwallet._onConnectRejected('" + reqId + "'); }";
                getBridge().getWebView().evaluateJavascript(js, null);

                if (dAppWebView != null) {
                    String dAppJs = "if (window.solana && window.solana._onConnectRejected) { " +
                                    "window.solana._onConnectRejected('" + reqId + "'); }";
                    dAppWebView.evaluateJavascript(dAppJs, null);
                }
            });
        }

        @JavascriptInterface
        public void approveSign(String reqId, String resultData) {
            runOnUiThread(() -> {
                String js = "if (window.fiatwallet && window.fiatwallet._onSignApproved) { " +
                            "window.fiatwallet._onSignApproved('" + reqId + "', " + resultData + "); }";
                getBridge().getWebView().evaluateJavascript(js, null);

                if (dAppWebView != null) {
                    String dAppJs = "if (window.solana && window.solana._onSignApproved) { " +
                                    "window.solana._onSignApproved('" + reqId + "', " + resultData + "); }";
                    dAppWebView.evaluateJavascript(dAppJs, null);
                }
            });
        }

        @JavascriptInterface
        public void rejectSign(String reqId) {
            runOnUiThread(() -> {
                String js = "if (window.fiatwallet && window.fiatwallet._onSignRejected) { " +
                            "window.fiatwallet._onSignRejected('" + reqId + "'); }";
                getBridge().getWebView().evaluateJavascript(js, null);

                if (dAppWebView != null) {
                    String dAppJs = "if (window.solana && window.solana._onSignRejected) { " +
                                    "window.solana._onSignRejected('" + reqId + "'); }";
                    dAppWebView.evaluateJavascript(dAppJs, null);
                }
            });
        }
    }
}
