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
import android.app.AlertDialog;
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
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.util.Arrays;
import java.util.HashSet;

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
        public void openDApp(PluginCall call) {
            String url = call.getString("url");
            String title = call.getString("title");
            MainActivity activity = (MainActivity) getActivity();
            if (activity != null) {
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
    }

    private ViewGroup dAppContainer = null;
    private WebView dAppWebView = null;
    private EditText dAppSearchBar = null;
    private ProgressBar dAppProgressBar = null;
    private final FiatWalletBridge bridgeInstance = new FiatWalletBridge();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(FiatWalletBridgePlugin.class);
        super.onCreate(savedInstanceState);
        setupWebView();
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
            } else if (uriString.startsWith("solana-wallet:") || uriString.startsWith("fiatwallet:")) {
                String js = "window.dispatchEvent(new CustomEvent('fiatwallet:deep-link-mwa', { detail: { uri: '" + escapeJs(uriString) + "' } }));";
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
    public void onPause() {
        super.onPause();
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('blur'));", null);
            }
            if (dAppWebView != null) {
                dAppWebView.evaluateJavascript("window.dispatchEvent(new Event('blur'));", null);
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        runOnUiThread(() -> {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('focus'));", null);
            }
            if (dAppWebView != null) {
                dAppWebView.evaluateJavascript("window.dispatchEvent(new Event('focus'));", null);
            }
        });
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
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        String defaultUa = webView.getSettings().getUserAgentString();
        String cleanUa = defaultUa.replace("; wv", "").replace(";wv", "").replace("Version/4.0 ", "");
        webView.getSettings().setUserAgentString(cleanUa);

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.addJavascriptInterface(bridgeInstance, "FiatWalletBridge");
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
            "      this._bn = String(val);" +
            "      this._bytes = new Uint8Array(32);" +
            "    }" +
            "  }" +
            "  PublicKey.prototype.toBase58 = function() { return this._bn; };" +
            "  PublicKey.prototype.toString = function() { return this._bn; };" +
            "  PublicKey.prototype.toBytes = function() { return this._bytes; };" +
            "  PublicKey.prototype.toByteArray = function() { return Array.from(this._bytes); };" +
            "  PublicKey.prototype.toBuffer = function() { return this._bytes; };" +
            "  PublicKey.prototype.equals = function(o) { return o && (o.toBase58 ? o.toBase58() === this._bn : String(o) === this._bn); };" +
            "  window.PublicKey = window.PublicKey || PublicKey;" +
            "  var _evs = {};" +
            "  var provider = {" +
            "    isFiatWallet: true," +
            "    isPhantom: true," +
            "    isSolflare: true," +
            "    isConnected: false," +
            "    publicKey: null," +
            "    autoApprove: false," +
            "    on: function(ev, fn) { if (!_evs[ev]) _evs[ev] = []; _evs[ev].push(fn); return provider; }," +
            "    addListener: function(ev, fn) { return provider.on(ev, fn); }," +
            "    removeListener: function(ev, fn) { if (_evs[ev]) { _evs[ev] = _evs[ev].filter(function(l){ return l !== fn; }); } return provider; }," +
            "    off: function(ev, fn) { return provider.removeListener(ev, fn); }," +
            "    removeAllListeners: function(ev) { if (ev) delete _evs[ev]; else _evs = {}; return provider; }," +
            "    emit: function(ev) {" +
            "      var args = Array.prototype.slice.call(arguments, 1);" +
            "      var list = (_evs[ev] || []).slice();" +
            "      for (var i = 0; i < list.length; i++) {" +
            "        try { list[i].apply(provider, args); } catch(err) { console.error('FiatWalletProvider emit error:', err); }" +
            "      }" +
            "      return true;" +
            "    }," +
            "    connect: function(opts) {" +
            "      return new Promise(function(resolve, reject) {" +
            "        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);" +
            "        pendingRequests[reqId] = {" +
            "          resolve: function(res) {" +
            "            var pubStr = (res && res.publicKey) ? (typeof res.publicKey === 'string' ? res.publicKey : res.publicKey.toString()) : '';" +
            "            var pub = pubStr ? new PublicKey(pubStr) : null;" +
            "            provider.publicKey = pub;" +
            "            provider.isConnected = !!pub;" +
            "            if (pub) provider.emit('connect', pub);" +
            "            resolve({ publicKey: pub });" +
            "          }," +
            "          reject: reject" +
            "        };" +
            "        if (window.FiatWalletBridge && window.FiatWalletBridge.requestConnect) {" +
            "          window.FiatWalletBridge.requestConnect(reqId, window.location.origin, document.title || 'dApp');" +
            "        } else { reject(new Error('FiatWallet native bridge unavailable')); }" +
            "      });" +
            "    }," +
            "    disconnect: function() {" +
            "      provider.isConnected = false;" +
            "      provider.publicKey = null;" +
            "      provider.emit('disconnect');" +
            "      return Promise.resolve();" +
            "    }," +
            "    signTransaction: function(tx) {" +
            "      return new Promise(function(resolve, reject) {" +
            "        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);" +
            "        pendingRequests[reqId] = { resolve: resolve, reject: reject };" +
            "        var serialized;" +
            "        try {" +
            "          if (typeof tx.serialize === 'function') {" +
            "            try {" +
            "              serialized = Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));" +
            "            } catch(e) {" +
            "              serialized = Array.from(tx.serialize());" +
            "            }" +
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
            "        pendingRequests[reqId] = { resolve: resolve, reject: reject };" +
            "        var serialized;" +
            "        try {" +
            "          if (typeof tx.serialize === 'function') {" +
            "            try {" +
            "              serialized = Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));" +
            "            } catch(e) {" +
            "              serialized = Array.from(tx.serialize());" +
            "            }" +
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
            "    _onConnectApproved: function(reqId, pubKey) {" +
            "      var pubStr = (pubKey && typeof pubKey === 'object' && pubKey.publicKey) ? pubKey.publicKey : String(pubKey || '');" +
            "      var pub = pubStr ? new PublicKey(pubStr) : null;" +
            "      provider.publicKey = pub;" +
            "      provider.isConnected = !!pub;" +
            "      if (pub) provider.emit('connect', pub);" +
            "      if (pendingRequests[reqId]) {" +
            "        pendingRequests[reqId].resolve({ publicKey: pub });" +
            "        delete pendingRequests[reqId];" +
            "      }" +
            "      _closeMwaDialog();" +
            "    }," +
            "    _onConnectRejected: function(reqId) {" +
            "      if (pendingRequests[reqId]) {" +
            "        pendingRequests[reqId].reject(new Error('User rejected connection'));" +
            "        delete pendingRequests[reqId];" +
            "      }" +
            "    }," +
            "    _onSignApproved: function(reqId, result) {" +
            "      if (pendingRequests[reqId]) {" +
            "        pendingRequests[reqId].resolve(result);" +
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
            "  window.solana = provider;" +
            "  window.fiatwallet = provider;" +
            "  window.phantom = window.phantom || {}; window.phantom.solana = provider;" +
            "  window.solflare = window.solflare || provider;" +
            "  try { window.dispatchEvent(new Event('solana#initialized')); } catch(e) {}" +
            "  var standardWallet = {" +
            "    version: '1.0.0'," +
            "    name: 'FiatWallet'," +
            "    icon: 'https://fiatwallet.pages.dev/logo.jpg'," +
            "    chains: ['solana:mainnet', 'solana:devnet']," +
            "    features: {" +
            "      'standard:connect': { version: '1.0.0', connect: function(input) {" +
            "        return provider.connect(input).then(function(res) {" +
            "          return { accounts: [{ address: res.publicKey.toBase58(), publicKey: res.publicKey.toBytes(), chains: ['solana:mainnet', 'solana:devnet'], features: ['solana:signTransaction', 'solana:signAndSendTransaction', 'solana:signMessage'] }] };" +
            "        });" +
            "      } }," +
            "      'standard:disconnect': { version: '1.0.0', disconnect: function() { return provider.disconnect(); } }," +
            "      'standard:events': { version: '1.0.0', on: function(ev, fn) { return provider.on(ev, fn); } }," +
            "      'solana:signTransaction': { version: '1.0.0', signTransaction: function(input) {" +
            "        return provider.signTransaction(input.transaction).then(function(signed) {" +
            "          var raw = (signed && signed.serialize) ? signed.serialize() : signed;" +
            "          return [{ signedTransaction: raw }];" +
            "        });" +
            "      } }," +
            "      'solana:signAndSendTransaction': { version: '1.0.0', signAndSendTransaction: function(input) {" +
            "        return provider.signAndSendTransaction(input.transaction, input.options).then(function(res) {" +
            "          return [{ signature: res.signature }];" +
            "        });" +
            "      } }," +
            "      'solana:signMessage': { version: '1.0.0', signMessage: function(input) {" +
            "        return provider.signMessage(input.message).then(function(res) {" +
            "          return [{ signedMessage: input.message, signature: res.signature }];" +
            "        });" +
            "      } }" +
            "    }," +
            "    get accounts() {" +
            "      if (!provider.publicKey) return [];" +
            "      return [{ address: provider.publicKey.toBase58(), publicKey: provider.publicKey.toBytes(), chains: ['solana:mainnet', 'solana:devnet'], features: ['solana:signTransaction', 'solana:signAndSendTransaction', 'solana:signMessage'] }];" +
            "    }" +
            "  };" +
            "  function _reg(register) { if (typeof register === 'function') { try { register(standardWallet); } catch(e) {} } }" +
            "  try { window.navigator.wallets = window.navigator.wallets || []; window.navigator.wallets.push({ register: _reg }); } catch(e) {}" +
            "  try { window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: { register: _reg } })); } catch(e) {}" +
            "  try { window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: _reg })); } catch(e) {}" +
            "  try { window.addEventListener('wallet-standard:app-ready', function(e) { if (e && e.detail) { if (typeof e.detail.register === 'function') e.detail.register(standardWallet); else if (typeof e.detail === 'function') e.detail(standardWallet); } }); } catch(e) {}" +
            "  window.addEventListener('fiatwallet:adapter-needs-unlock', function() {" +
            "    if (window.FiatWalletBridge && window.FiatWalletBridge.requestConnect) {" +
            "      var reqId = 'unlock_' + Date.now();" +
            "      window.FiatWalletBridge.requestConnect(reqId, window.location.origin, document.title || 'dApp');" +
            "    }" +
            "  });" +
            "  window.addEventListener('fiatwallet:adapter-needs-onboard', function() {" +
            "    if (window.FiatWalletBridge && window.FiatWalletBridge.requestConnect) {" +
            "      var reqId = 'onboard_' + Date.now();" +
            "      window.FiatWalletBridge.requestConnect(reqId, window.location.origin, document.title || 'dApp');" +
            "    }" +
            "  });" +
            "  window.addEventListener('fiatwallet:approval-request', function(e) {" +
            "    if (!e.detail || e.detail.type !== 'connect') return;" +
            "    if (window.FiatWalletBridge && window.FiatWalletBridge.requestConnect) {" +
            "      var reqId = e.detail.reqId || ('apr_' + Date.now());" +
            "      pendingRequests[reqId] = {" +
            "        resolve: function(res) {" +
            "          var pub = res && res.publicKey ? (typeof res.publicKey === 'string' ? res.publicKey : res.publicKey.toString()) : '';" +
            "          if (pub && e.detail.resolve) { e.detail.resolve({ publicKey: new PublicKey(pub) }); }" +
            "        }," +
            "        reject: function(err) { if (e.detail.reject) { e.detail.reject(err); } }" +
            "      };" +
            "      window.FiatWalletBridge.requestConnect(reqId, e.detail.data && e.detail.data.origin ? e.detail.data.origin : window.location.origin, document.title || 'dApp');" +
            "    }" +
            "  });" +
            "  function _closeMwaDialog() {" +
            "    var cb = document.querySelector('.wallet-adapter-modal-button-close, [aria-label=\"Close\"], [aria-label=\"Dismiss\"]');" +
            "    if (cb) { try { cb.click(); } catch(e) {} }" +
            "    var dialogs = document.querySelectorAll('[role=\"dialog\"], [class*=\"modal\"], [class*=\"overlay\"]');" +
            "    for (var i = 0; i < dialogs.length; i++) {" +
            "      var d = dialogs[i];" +
            "      if ((d.textContent || '').indexOf(\"can't find a wallet\") > -1 || (d.textContent || '').indexOf('cannot find a wallet') > -1) {" +
            "        var btn = d.querySelector('button'); if (btn) { try { btn.click(); } catch(e) {} }" +
            "      }" +
            "    }" +
            "  }" +
            "  function _hideMwaListItem(root) {" +
            "    var imgs = (root || document).querySelectorAll('[alt=\"Mobile Wallet Adapter\"]');" +
            "    for (var i = 0; i < imgs.length; i++) {" +
            "      var li = imgs[i].closest('li, [role=\"listitem\"], [role=\"option\"]');" +
            "      if (li) li.style.display = 'none';" +
            "    }" +
            "    var btns = (root || document).querySelectorAll('button, li');" +
            "    for (var j = 0; j < btns.length; j++) {" +
            "      if ((btns[j].textContent || '').trim() === 'Mobile Wallet Adapter') btns[j].style.display = 'none';" +
            "    }" +
            "  }" +
            "  if (!window._fwMwaObsStarted) {" +
            "    window._fwMwaObsStarted = true;" +
            "    var _obs = new MutationObserver(function(muts) {" +
            "      for (var i = 0; i < muts.length; i++) {" +
            "        var added = muts[i].addedNodes;" +
            "        for (var j = 0; j < added.length; j++) {" +
            "          var n = added[j]; if (n.nodeType !== 1) continue;" +
            "          var txt = n.textContent || '';" +
            "          if (txt.indexOf(\"can't find a wallet\") > -1 || txt.indexOf('cannot find a wallet') > -1) {" +
            "            setTimeout(_closeMwaDialog, 40);" +
            "          }" +
            "          _hideMwaListItem(n);" +
            "        }" +
            "      }" +
            "    });" +
            "    function _startObs() {" +
            "      if (document.body) {" +
            "        _obs.observe(document.body, { childList: true, subtree: true });" +
            "        _hideMwaListItem(document);" +
            "      }" +
            "    }" +
            "    if (document.body) { _startObs(); }" +
            "    else { document.addEventListener('DOMContentLoaded', _startObs); }" +
            "  }" +
            "  try {" +
            "    var _style = document.createElement('style');" +
            "    _style.textContent = '.wallet-adapter-modal-list li:has([alt=\"Mobile Wallet Adapter\"]) { display:none!important } .wallet-adapter-modal-list li:has(button[title=\"Mobile Wallet Adapter\"]) { display:none!important }';" +
            "    var _target = document.head || document.documentElement || document.body;" +
            "    if (_target) { _target.appendChild(_style); }" +
            "    else { document.addEventListener('DOMContentLoaded', function() { (document.head || document.documentElement || document.body).appendChild(_style); }); }" +
            "  } catch(e) {}" +
            "})();";
    }



    /**
     * Shows a native Android AlertDialog on top of the open dApp WebView to ask the
     * user to approve or reject a wallet connection from the dApp.
     * Required because when the native dApp WebView is overlaying the screen, any React
     * modals in the Capacitor WebView are completely invisible — they only appear AFTER
     * the user closes the dApp.
     */
    private void showNativeConnectDialog(final String reqId, final String origin, final String dAppTitle) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().evaluateJavascript(
            "(function(){ " +
            "  var pk = localStorage.getItem('fw_wallet_pubkey') || " +
            "           localStorage.getItem('paj_manual_wallet') || ''; " +
            "  if (!pk) { " +
            "    try { " +
            "      var meta = JSON.parse(localStorage.getItem('fw_wallet_meta') || '{}'); " +
            "      if (meta && meta.publicKey) pk = meta.publicKey; " +
            "    } catch(e) {} " +
            "  } " +
            "  return pk; " +
            "})()",
            pubKeyRaw -> {
                final String pubKey = pubKeyRaw != null
                    ? pubKeyRaw.replace("\"", "").replace("null", "").trim()
                    : "";
                runOnUiThread(() -> {
                    if (pubKey.isEmpty()) {
                        AlertDialog.Builder b = new AlertDialog.Builder(MainActivity.this);
                        b.setTitle("Wallet Required");
                        b.setMessage("Please create, import, or connect a Solana wallet in FiatWallet before connecting to " + (dAppTitle != null ? dAppTitle : "dApp") + ".");
                        b.setCancelable(false);
                        b.setPositiveButton("Go to Wallet", (d, w) -> {
                            d.dismiss();
                            closeDAppInternal();
                            bridgeInstance.rejectConnect(reqId);
                        });
                        b.setNegativeButton("Cancel", (d, w) -> {
                            d.dismiss();
                            bridgeInstance.rejectConnect(reqId);
                        });
                        b.create().show();
                        return;
                    }

                    String shortKey = pubKey.length() > 12
                        ? pubKey.substring(0, 6) + "..." + pubKey.substring(pubKey.length() - 6)
                        : pubKey;
                    AlertDialog.Builder b = new AlertDialog.Builder(MainActivity.this);
                    b.setTitle("Connect to FiatWallet");
                    b.setMessage(dAppTitle + " is requesting to connect to your wallet.\n\nOrigin: "
                        + origin + "\nWallet: " + shortKey + "\nNetwork: Solana Mainnet");
                    b.setCancelable(false);
                    b.setPositiveButton("Connect", (d, w) -> {
                        d.dismiss();
                        bridgeInstance.approveConnect(reqId, pubKey);
                    });
                    b.setNegativeButton("Reject", (d, w) -> {
                        d.dismiss();
                        bridgeInstance.rejectConnect(reqId);
                    });
                    b.create().show();
                });
            }
        );
    }

    private void showNativeSignDialog(final String reqId, final String type, final String txData, final String origin) {
        runOnUiThread(() -> {
            String title;
            String actionDesc;
            if ("signAndSendTransaction".equals(type)) {
                title = "Approve & Send Transaction";
                actionDesc = "Send Transaction";
            } else if ("signMessage".equals(type)) {
                title = "Approve Message Signature";
                actionDesc = "Sign Message";
            } else {
                title = "Approve Transaction";
                actionDesc = "Sign Transaction";
            }
            AlertDialog.Builder b = new AlertDialog.Builder(MainActivity.this);
            b.setTitle(title);
            b.setMessage("Request from: " + (origin != null && !origin.isEmpty() ? origin : "Solana dApp")
                + "\n\nAction: " + actionDesc
                + "\nNetwork: Solana Mainnet"
                + "\nEstimated Fee: ~0.000005 SOL\n\n"
                + "Do you authorize this request?");
            b.setCancelable(false);
            b.setPositiveButton("Approve", (d, w) -> {
                d.dismiss();
                String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-sign-execute', " +
                            "{ detail: { reqId: '" + reqId + "', type: '" + type + "', txData: " + txData + " } }));";
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            });
            b.setNegativeButton("Reject", (d, w) -> {
                d.dismiss();
                bridgeInstance.rejectSign(reqId);
            });
            b.create().show();
        });
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
            container.setClickable(false);
            container.setFocusable(false);

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
            dAppWebView.setFocusable(true);
            dAppWebView.setFocusableInTouchMode(true);
            dAppWebView.requestFocus();

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
                        if (scheme != null) {
                            // Intercept MWA and FiatWallet deeplinks natively inside the dApp container!
                            // Immediately prompt the native connect approval dialog ON TOP of the dApp.
                            if (scheme.equalsIgnoreCase("solana-wallet") || scheme.equalsIgnoreCase("fiatwallet")) {
                                runOnUiThread(() -> {
                                    String origin = view.getUrl() != null ? view.getUrl() : "Solana dApp";
                                    String title = "Solana dApp";
                                    if (view.getTitle() != null && !view.getTitle().isEmpty()) {
                                        title = view.getTitle();
                                    }
                                    showNativeConnectDialog("mwa_" + System.currentTimeMillis(), origin, title);
                                });
                                return true; // consumed — do not let Android handle it externally
                            }
                            // wc:// and other non-http schemes: forward to Capacitor WebView event bus
                            if (scheme.equalsIgnoreCase("wc")) {
                                String js = "window.dispatchEvent(new CustomEvent('fiatwallet:deep-link-wc', " +
                                            "{ detail: { uri: '" + escapeJs(reqUri.toString()) + "' } }));";
                                if (getBridge() != null && getBridge().getWebView() != null) {
                                    getBridge().getWebView().evaluateJavascript(js, null);
                                }
                                return true;
                            }
                            // All other non-http(s) schemes: let Android handle them
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

            // Register provider script to run at DOCUMENT START — before ANY page scripts.
            // This is the only reliable way to inject window.solana before Jupiter/Raydium
            // initialise their wallet adapters. onPageStarted/onPageFinished injection runs
            // AFTER page scripts and causes the MWA "We can't find a wallet" error.
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                WebViewCompat.addDocumentStartJavaScript(
                    dAppWebView,
                    providerScript,
                    new HashSet<>(Arrays.asList("*"))
                );
            }

            dAppWebView.loadUrl(initialUrl);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * Java bridge exposed to JavaScript as window.FiatWalletBridge.
     */
    public class FiatWalletBridge {

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
        public void launchIntent(String url) {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    android.util.Log.e("FiatWallet", "Failed to launch external intent: " + url, e);
                }
            });
        }

        @JavascriptInterface
        public void requestConnect(String reqId, String origin, String title) {
            runOnUiThread(() -> {
                if (dAppContainer != null) {
                    // dApp WebView is open and overlays the Capacitor WebView.
                    // Show a native Android dialog ON TOP of the dApp so the user
                    // sees the prompt immediately without having to close the dApp.
                    showNativeConnectDialog(reqId, origin, title);
                } else {
                    // No dApp overlay � use the React DAppApprovalModal in the Capacitor WebView.
                    String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-connect-request', " +
                                "{ detail: { reqId: '" + reqId + "', origin: '" + escapeJs(origin) + "', title: '" + escapeJs(title) + "' } }));";
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            });
        }

        @JavascriptInterface
        public void requestSignTransaction(String reqId, String txData) {
            runOnUiThread(() -> {
                if (dAppContainer != null) {
                    String origin = dAppWebView != null ? dAppWebView.getUrl() : "Solana dApp";
                    showNativeSignDialog(reqId, "signTransaction", txData, origin);
                } else {
                    String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-sign-request', " +
                                "{ detail: { reqId: '" + reqId + "', type: 'signTransaction', txData: " + txData + " } }));";
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            });
        }

        @JavascriptInterface
        public void requestSignAndSend(String reqId, String txData) {
            runOnUiThread(() -> {
                if (dAppContainer != null) {
                    String origin = dAppWebView != null ? dAppWebView.getUrl() : "Solana dApp";
                    showNativeSignDialog(reqId, "signAndSendTransaction", txData, origin);
                } else {
                    String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-sign-request', " +
                                "{ detail: { reqId: '" + reqId + "', type: 'signAndSendTransaction', txData: " + txData + " } }));";
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            });
        }

        @JavascriptInterface
        public void requestSignMessage(String reqId, String message) {
            runOnUiThread(() -> {
                if (dAppContainer != null) {
                    String origin = dAppWebView != null ? dAppWebView.getUrl() : "Solana dApp";
                    showNativeSignDialog(reqId, "signMessage", message, origin);
                } else {
                    String js = "window.dispatchEvent(new CustomEvent('fiatwallet:native-sign-request', " +
                                "{ detail: { reqId: '" + reqId + "', type: 'signMessage', message: '" + escapeJs(message) + "' } }));";
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
            });
        }

        @JavascriptInterface
        public void approveConnect(String reqId, String pubKey) {
            runOnUiThread(() -> {
                String js = "if (window.fiatwallet && window.fiatwallet._onConnectApproved) { " +
                            "window.fiatwallet._onConnectApproved('" + reqId + "', '" + escapeJs(pubKey) + "'); }";
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(js, null);
                }

                if (dAppWebView != null) {
                    String dAppJs = "if (window.solana && window.solana._onConnectApproved) { " +
                                    "window.solana._onConnectApproved('" + reqId + "', '" + escapeJs(pubKey) + "'); }" +
                                    "else if (window.solana) { " +
                                    "  window.solana.publicKey = new window.PublicKey('" + escapeJs(pubKey) + "'); " +
                                    "  window.solana.isConnected = true; " +
                                    "  if (typeof window.solana.emit === 'function') window.solana.emit('connect', window.solana.publicKey); " +
                                    "}";
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
