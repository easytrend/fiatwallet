import buffer from 'buffer';
const Buffer = buffer.Buffer || buffer;
globalThis.Buffer = Buffer;
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  window.global = window;
  window.process = window.process || { env: {}, browser: true, version: '' };
}
globalThis.global = globalThis;
globalThis.process = globalThis.process || { env: {}, browser: true, version: '' };

if (typeof navigator !== 'undefined') {
  try {
    const originalUa = navigator.userAgent || '';
    if (!originalUa.includes('Solana Mobile Web Shell')) {
      const cleanUa = originalUa.replace(/;\s*wv/gi, '') + ' Solana Mobile Web Shell';
      try {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => cleanUa,
          configurable: true,
        });
      } catch (e) {}
    }
  } catch (e) {}
}

import { initFiatWalletProvider } from './services/fiatwalletProvider';
initFiatWalletProvider();

import React, { useMemo, Component } from 'react';
import ReactDOM from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl, Transaction } from '@solana/web3.js';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Fiatwallet rendering error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#0a1628',
          color: '#f0f6ff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: "'Space Grotesk', sans-serif",
          textAlign: 'center'
        }}>
          <div style={{
            background: '#111e38',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: '20px',
            padding: '32px 24px',
            maxWidth: '440px',
            width: '100%',
            boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'white', marginBottom: '8px' }}>
              Unexpected Display Issue
            </h2>
            <p style={{ fontSize: '13px', color: 'rgba(240,246,255,0.6)', lineHeight: '1.5', marginBottom: '18px' }}>
              The application encountered a runtime issue while rendering.
            </p>
            <div style={{
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.25)',
              borderRadius: '12px',
              padding: '12px',
              fontSize: '12px',
              color: '#f87171',
              fontFamily: "'DM Mono', monospace",
              marginBottom: '20px',
              wordBreak: 'break-word',
              textAlign: 'left'
            }}>
              {this.state.error?.message || String(this.state.error)}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '12px',
                  color: 'white',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Reload
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.clear();
                    sessionStorage.clear();
                  } catch (e) {}
                  window.location.reload();
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#a3e635',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#0a1628',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Reset & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Polyfill/Fix for @solana-mobile/wallet-adapter-mobile:
// Solana Mobile Wallet Adapter calls transaction.serialize() with no arguments
// before sending an unsigned legacy Transaction to the mobile wallet (Phantom, Solflare, Seed Vault)
// to be signed. @solana/web3.js defaults verifySignatures: true and requireAllSignatures: true,
// which causes "Signature verification failed. Missing signature for public key [...]"
// on every unsigned transaction on Android/Seeker.
const origSerialize = Transaction.prototype.serialize;
Transaction.prototype.serialize = function (config) {
  const requireAllSignatures = config && 'requireAllSignatures' in config ? config.requireAllSignatures : false;
  const verifySignatures = config && 'verifySignatures' in config ? config.verifySignatures : false;
  return origSerialize.call(this, {
    requireAllSignatures,
    verifySignatures,
    ...config,
  });
};
import {
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
  SolanaMobileWalletAdapter,
} from '@solana-mobile/wallet-adapter-mobile';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter,
  TrustWalletAdapter,
} from '@solana/wallet-adapter-wallets';

import { FiatWalletAdapter } from './services/fiatwalletAdapter';

// Wallet adapter default UI styles (for the "Select Wallet" modal)
import '@solana/wallet-adapter-react-ui/styles.css';
import App from './App';
import './App.css';

function Root() {
  // Use an environment variable for your premium RPC (like Helius) to prevent CORS and 403 errors.
  // Fallback to the placeholder if the env variable isn't set yet.
  const endpoint = useMemo(() => import.meta.env.VITE_RPC_URL || 'https://api.mainnet-beta.solana.com', []);
  const wallets = useMemo(() => [
    new FiatWalletAdapter(),
    new SolanaMobileWalletAdapter({
      addressSelector: createDefaultAddressSelector(),
      appIdentity: {
        name: 'FiatWallet',
        uri: 'https://fiatwallet.app',
        icon: '/icon512.png',
      },
      authorizationResultCache: createDefaultAuthorizationResultCache(),
      cluster: 'mainnet-beta',
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    }),
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new CoinbaseWalletAdapter(),
    new TrustWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
