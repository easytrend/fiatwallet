package app.fiatwallet.twa;

import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.BridgeActivity;

/**
 * FiatWallet MainActivity
 *
 * Extends Capacitor's BridgeActivity. Enables native Android Web3 browser functionality:
 * 1. Injects window.solana, window.phantom, and Solana Wallet Standard into active dApps
 * 2. Bridges connect, signTransaction, signAllTransactions between dApps and FiatWallet
 * 3. Handles solana-wallet://, fiatwallet://, and wc:// deep links
 */
public class MainActivity extends BridgeActivity {

    private ViewGroup dAppContainer = null;
    private WebView dAppWebView = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        String defaultUa = webView.getSettings().getUserAgentString();
        String cleanUa = defaultUa.replace("; wv", "").replace(";wv", "");
        if (!cleanUa.contains("Solana Mobile Web Shell")) {
            cleanUa = cleanUa + " Solana Mobile Web Shell";
        }
        webView.getSettings().setUserAgentString(cleanUa);

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new FiatWalletBridge(), "FiatWalletBridge");
    }

    private void closeDAppInternal() {
        if (dAppContainer != null) {
            ViewGroup parent = (ViewGroup) dAppContainer.getParent();
            if (parent != null) {
                parent.removeView(dAppContainer);
            }
            if (dAppWebView != null) {
                dAppWebView.destroy();
                dAppWebView = null;
            }
            dAppContainer = null;
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
            "  PublicKey.prototype.equals = function(o) { return o && (o.toBase58 ? o.toBase58() === this._bn : String(o) === this._bn); };" +
            "  window.PublicKey = window.PublicKey || PublicKey;" +
            "  var provider = {" +
            "    isFiatWallet: true," +
            "    isPhantom: true," +
            "    isConnected: false," +
            "    publicKey: null," +
            "    connect: function(opts) {" +
            "      return new Promise(function(resolve, reject) {" +
            "        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);" +
            "        pendingRequests[reqId] = {" +
            "          resolve: function(res) {" +
            "            var pubStr = (res && res.publicKey) ? (typeof res.publicKey === 'string' ? res.publicKey : res.publicKey.toString()) : '';" +
            "            var pub = pubStr ? new PublicKey(pubStr) : null;" +
            "            provider.publicKey = pub;" +
            "            provider.isConnected = true;" +
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
            "      return Promise.resolve();" +
            "    }," +
            "    signTransaction: function(tx) {" +
            "      return new Promise(function(resolve, reject) {" +
            "        var reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);" +
            "        pendingRequests[reqId] = { resolve: resolve, reject: reject };" +
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
            "      return provider.signTransaction(tx).then(function(res) { return { signature: 'sig_ok' }; });" +
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
            "      if (pendingRequests[reqId]) {" +
            "        pendingRequests[reqId].resolve({ publicKey: pubKey });" +
            "        delete pendingRequests[reqId];" +
            "      }" +
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
            "  window.phantom = { solana: provider };" +
            "  window.solflare = provider;" +
            "  try {" +
            "    var reg = function(register) {" +
            "      register({" +
            "        name: 'FiatWallet'," +
            "        icon: 'https://fiatwallet.pages.dev/logo.jpg'," +
            "        version: '1.0.0'," +
            "        chains: ['solana:mainnet', 'solana:devnet']," +
            "        features: {" +
            "          'standard:connect': { version: '1.0.0', connect: provider.connect }," +
            "          'standard:disconnect': { version: '1.0.0', disconnect: provider.disconnect }," +
            "          'solana:signTransaction': { version: '1.0.0', signTransaction: provider.signTransaction }," +
            "          'solana:signMessage': { version: '1.0.0', signMessage: provider.signMessage }" +
            "        }" +
            "      });" +
            "    };" +
            "    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: { register: reg } }));" +
            "  } catch(e) {}" +
            "})();";
    }

    /**
     * Java bridge exposed to JavaScript as window.FiatWalletBridge.
     */
    public class FiatWalletBridge {

        @JavascriptInterface
        public void openDApp(String url, String title) {
            runOnUiThread(() -> {
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

                    LinearLayout header = new LinearLayout(MainActivity.this);
                    header.setOrientation(LinearLayout.HORIZONTAL);
                    header.setBackgroundColor(Color.parseColor("#0a1628"));
                    LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        dpToPx(48)
                    );
                    header.setLayoutParams(headerParams);
                    header.setGravity(Gravity.CENTER_VERTICAL);
                    header.setPadding(dpToPx(12), 0, dpToPx(12), 0);

                    TextView backBtn = new TextView(MainActivity.this);
                    backBtn.setText("← Back");
                    backBtn.setTextColor(Color.WHITE);
                    backBtn.setTextSize(13);
                    backBtn.setTypeface(null, Typeface.BOLD);
                    backBtn.setPadding(dpToPx(8), dpToPx(6), dpToPx(8), dpToPx(6));
                    backBtn.setOnClickListener(v -> closeDAppInternal());
                    header.addView(backBtn);

                    TextView titleView = new TextView(MainActivity.this);
                    titleView.setText(title != null ? title : "dApp");
                    titleView.setTextColor(Color.WHITE);
                    titleView.setTextSize(14);
                    titleView.setTypeface(null, Typeface.BOLD);
                    titleView.setGravity(Gravity.CENTER);
                    titleView.setSingleLine(true);
                    titleView.setEllipsize(TextUtils.TruncateAt.END);
                    LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                        0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f
                    );
                    titleView.setLayoutParams(titleParams);
                    header.addView(titleView);

                    TextView reloadBtn = new TextView(MainActivity.this);
                    reloadBtn.setText("Reload");
                    reloadBtn.setTextColor(Color.parseColor("#22d3ee"));
                    reloadBtn.setTextSize(13);
                    reloadBtn.setTypeface(null, Typeface.BOLD);
                    reloadBtn.setPadding(dpToPx(8), dpToPx(6), dpToPx(8), dpToPx(6));
                    reloadBtn.setOnClickListener(v -> {
                        if (dAppWebView != null) dAppWebView.reload();
                    });
                    header.addView(reloadBtn);

                    container.addView(header);

                    dAppWebView = new WebView(MainActivity.this);
                    LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        0, 1.0f
                    );
                    dAppWebView.setLayoutParams(webParams);

                    WebSettings s = dAppWebView.getSettings();
                    s.setJavaScriptEnabled(true);
                    s.setDomStorageEnabled(true);
                    s.setDatabaseEnabled(true);
                    s.setAllowFileAccess(true);
                    s.setAllowContentAccess(true);
                    s.setMediaPlaybackRequiresUserGesture(false);
                    s.setUserAgentString(s.getUserAgentString().replace("; wv", "").replace(";wv", "") + " Solana Mobile Web Shell");

                    dAppWebView.addJavascriptInterface(this, "FiatWalletBridge");

                    final String providerScript = getProviderInjectionScript();

                    dAppWebView.setWebViewClient(new WebViewClient() {
                        @Override
                        public void onPageStarted(WebView view, String pageUrl, Bitmap favicon) {
                            super.onPageStarted(view, pageUrl, favicon);
                            view.evaluateJavascript(providerScript, null);
                        }

                        @Override
                        public void onPageFinished(WebView view, String pageUrl) {
                            super.onPageFinished(view, pageUrl);
                            view.evaluateJavascript(providerScript, null);
                        }
                    });

                    dAppWebView.setWebChromeClient(new WebChromeClient());

                    container.addView(dAppWebView);
                    rootView.addView(container);
                    dAppContainer = container;

                    dAppWebView.loadUrl(url);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void closeDApp() {
            runOnUiThread(MainActivity.this::closeDAppInternal);
        }

        @JavascriptInterface
        public void requestConnect(String reqId, String origin, String title) {
            runOnUiThread(() -> {
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
