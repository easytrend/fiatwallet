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

            // Open in external browser button (↗)
            TextView openExtBtn = new TextView(MainActivity.this);
            openExtBtn.setText("↗");
            openExtBtn.setTextColor(Color.parseColor("#a3e635"));
            openExtBtn.setTextSize(18);
            openExtBtn.setTypeface(null, Typeface.BOLD);
            openExtBtn.setPadding(dpToPx(8), dpToPx(6), dpToPx(8), dpToPx(6));
            openExtBtn.setOnClickListener(v -> {
                try {
                    String current = (dAppWebView != null && dAppWebView.getUrl() != null) ? dAppWebView.getUrl() : initialUrl;
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(current));
                    startActivity(intent);
                } catch (Exception ignored) {}
            });
            header.addView(openExtBtn);

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

            dAppWebView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageStarted(WebView view, String pageUrl, Bitmap favicon) {
                    super.onPageStarted(view, pageUrl, favicon);
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
