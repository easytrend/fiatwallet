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

    @Override
    public void onStart() {
        super.onStart();
        setupWebView();
        handleDeepLinkIntent(getIntent());
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

        @JavascriptInterface
        public void approveConnect(String reqId, String pubKey) {
            runOnUiThread(() -> {
                String js = "if (window.fiatwallet && window.fiatwallet._onConnectApproved) { " +
                            "window.fiatwallet._onConnectApproved('" + reqId + "', '" + escapeJs(pubKey) + "'); }";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }

        @JavascriptInterface
        public void rejectConnect(String reqId) {
            runOnUiThread(() -> {
                String js = "if (window.fiatwallet && window.fiatwallet._onConnectRejected) { " +
                            "window.fiatwallet._onConnectRejected('" + reqId + "'); }";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }

        @JavascriptInterface
        public void approveSign(String reqId, String resultData) {
            runOnUiThread(() -> {
                String js = "if (window.fiatwallet && window.fiatwallet._onSignApproved) { " +
                            "window.fiatwallet._onSignApproved('" + reqId + "', " + resultData + "); }";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }

        @JavascriptInterface
        public void rejectSign(String reqId) {
            runOnUiThread(() -> {
                String js = "if (window.fiatwallet && window.fiatwallet._onSignRejected) { " +
                            "window.fiatwallet._onSignRejected('" + reqId + "'); }";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }

        private String escapeJs(String s) {
            if (s == null) return "";
            return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r");
        }
    }
}
