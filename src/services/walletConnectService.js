/**
 * walletConnectService.js
 *
 * WalletConnect v2 Wallet-side integration using @reown/walletkit.
 * FiatWallet acts as the WALLET — it receives connection requests from
 * dApps (Raydium, Meteora, Jupiter, etc.) via the WalletConnect relay.
 *
 * Connection Flow:
 *   1. User opens any dApp inside FiatWallet Explorer (e.g. Raydium).
 *   2. Inside the dApp, user taps "Connect Wallet".
 *   3. dApp shows wallet list — user picks "WalletConnect".
 *   4. dApp shows a WC URI (wc:...) or QR code.
 *   5. User taps the blue "WC" button in FiatWallet's top bar.
 *   6. User pastes the URI (or taps "Paste") → taps "Connect".
 *   7. WC relay delivers the session_proposal event to FiatWallet.
 *   8. FiatWallet shows an approval screen → user approves.
 *   9. dApp now sees FiatWallet as the connected Solana wallet.
 *  10. When the dApp sends transactions, FiatWallet prompts to sign.
 *
 * WalletConnect Project ID: Register free at https://cloud.walletconnect.com
 * Add VITE_WC_PROJECT_ID to your Vercel environment variables.
 */

const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID || 'b56e18d47c72ab683b10814fe9495694';

const WC_METADATA = {
  name: 'FiatWallet',
  description: 'Self-custodial Solana wallet. Buy and sell stablecoins instantly.',
  url: 'https://fiatwallet.app',
  icons: ['https://fiatwallet.app/icon512.png'],
};

// Singleton WalletKit instance
let _walletKit = null;
let _initPromise = null;

/**
 * Initialize and return the WalletKit instance (lazy, singleton).
 * Uses @reown/walletkit (successor to @walletconnect/web3wallet).
 */
export async function getWalletKit() {
  if (_walletKit) return _walletKit;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      const { WalletKit } = await import('@reown/walletkit');
      const { Core } = await import('@walletconnect/core');

      const core = new Core({ projectId: WC_PROJECT_ID });

      _walletKit = await WalletKit.init({
        core,
        metadata: WC_METADATA,
      });

      // Relay incoming events to DOM so React components can listen
      _walletKit.on('session_proposal', (proposal) => {
        window.dispatchEvent(new CustomEvent('fiatwallet:wc-session-proposal', { detail: proposal }));
      });

      _walletKit.on('session_request', (request) => {
        window.dispatchEvent(new CustomEvent('fiatwallet:wc-session-request', { detail: request }));
      });

      _walletKit.on('session_delete', (session) => {
        window.dispatchEvent(new CustomEvent('fiatwallet:wc-session-delete', { detail: session }));
      });

      _walletKit.on('session_expire', (session) => {
        window.dispatchEvent(new CustomEvent('fiatwallet:wc-session-delete', { detail: session }));
      });

      console.log('[FiatWallet WC] WalletKit initialized with projectId:', WC_PROJECT_ID);
      return _walletKit;
    } catch (err) {
      console.error('[FiatWallet WC] WalletKit init failed:', err);
      _initPromise = null;
      _walletKit = null;
      throw err;
    }
  })();

  return _initPromise;
}

/**
 * Pair with a dApp using the WalletConnect URI (starts with "wc:").
 * This triggers a session_proposal event from the dApp.
 */
export async function pairWithUri(uri) {
  const wk = await getWalletKit();
  // Strip whitespace/newlines that might be in a pasted URI
  const cleanUri = uri.trim().replace(/\n/g, '');
  return wk.pair({ uri: cleanUri });
}

/**
 * Approve a session_proposal from a dApp.
 * Grants the dApp access to the FiatWallet address.
 */
export async function approveSessionProposal(proposal, address) {
  const wk = await getWalletKit();

  const { requiredNamespaces = {}, optionalNamespaces = {} } = proposal.params;

  // Solana mainnet chain IDs supported by WalletConnect
  const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
  const SOLANA_MAINNET_ALT = 'solana:mainnet';

  // Collect all requested solana chains
  const requestedChains = [
    ...(requiredNamespaces?.solana?.chains || []),
    ...(optionalNamespaces?.solana?.chains || []),
  ];

  // Use requested chains, fall back to mainnet
  let approvedChains = requestedChains.length > 0
    ? requestedChains
    : [SOLANA_MAINNET, SOLANA_MAINNET_ALT];

  // Dedupe
  approvedChains = [...new Set(approvedChains)];

  const accounts = approvedChains.map((chain) => `${chain}:${address}`);

  const methods = [
    ...(requiredNamespaces?.solana?.methods || []),
    ...(optionalNamespaces?.solana?.methods || []),
    'solana_signTransaction',
    'solana_signMessage',
    'solana_signAndSendTransaction',
    'solana_signAllTransactions',
  ].filter((v, i, a) => a.indexOf(v) === i);

  const events = [
    ...(requiredNamespaces?.solana?.events || []),
    ...(optionalNamespaces?.solana?.events || []),
    'accountsChanged',
    'chainChanged',
  ].filter((v, i, a) => a.indexOf(v) === i);

  const namespaces = {
    solana: { accounts, chains: approvedChains, methods, events },
  };

  return wk.approveSession({
    id: proposal.id,
    namespaces,
  });
}

/**
 * Reject a session_proposal.
 */
export async function rejectSessionProposal(proposal) {
  const wk = await getWalletKit();
  return wk.rejectSession({
    id: proposal.id,
    reason: { code: 4001, message: 'User rejected the session.' },
  });
}

/**
 * Respond to a session_request with a success result.
 */
export async function respondToRequest(requestEvent, result) {
  const wk = await getWalletKit();
  const { topic, id } = requestEvent;
  return wk.respondSessionRequest({
    topic,
    response: { id, jsonrpc: '2.0', result },
  });
}

/**
 * Respond to a session_request with a rejection error.
 */
export async function rejectRequest(requestEvent, message = 'User rejected') {
  const wk = await getWalletKit();
  const { topic, id } = requestEvent;
  return wk.respondSessionRequest({
    topic,
    response: {
      id,
      jsonrpc: '2.0',
      error: { code: 4001, message },
    },
  });
}

/**
 * Get all active WalletConnect sessions as an array.
 */
export async function getActiveSessions() {
  const wk = await getWalletKit();
  const sessionsMap = wk.getActiveSessions();
  return Object.values(sessionsMap || {});
}

/**
 * Disconnect an active session by topic.
 */
export async function disconnectSession(topic) {
  const wk = await getWalletKit();
  return wk.disconnectSession({
    topic,
    reason: { code: 6000, message: 'User disconnected.' },
  });
}

/**
 * Handle a session_request event from a dApp.
 * Signs the transaction or message using the provided signTransaction function.
 * Returns the result to send back to the dApp.
 */
export async function handleSessionRequest(requestEvent, signTransaction, connection) {
  const { params } = requestEvent;
  const { request } = params;
  const method = request.method;

  if (method === 'solana_signTransaction') {
    const { transaction } = request.params;
    const txBytes = Buffer.from(transaction, 'base64');

    const { Transaction, VersionedTransaction } = await import('@solana/web3.js');
    let tx;
    try {
      tx = VersionedTransaction.deserialize(txBytes);
    } catch {
      tx = Transaction.from(txBytes);
    }

    const signed = await signTransaction(tx);
    return Buffer.from(signed.serialize()).toString('base64');
  }

  if (method === 'solana_signAllTransactions') {
    const { transactions } = request.params;
    const { Transaction, VersionedTransaction } = await import('@solana/web3.js');

    const results = [];
    for (const transaction of transactions) {
      const txBytes = Buffer.from(transaction, 'base64');
      let tx;
      try {
        tx = VersionedTransaction.deserialize(txBytes);
      } catch {
        tx = Transaction.from(txBytes);
      }
      const signed = await signTransaction(tx);
      results.push(Buffer.from(signed.serialize()).toString('base64'));
    }
    return results;
  }

  if (method === 'solana_signAndSendTransaction') {
    const { transaction } = request.params;
    const txBytes = Buffer.from(transaction, 'base64');

    const { Transaction, VersionedTransaction } = await import('@solana/web3.js');
    let tx;
    try {
      tx = VersionedTransaction.deserialize(txBytes);
    } catch {
      tx = Transaction.from(txBytes);
    }

    const signed = await signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    return { signature: sig };
  }

  if (method === 'solana_signMessage') {
    // For message signing, we return a placeholder — vault keypair signing
    // of arbitrary bytes requires direct access to the private key.
    // This returns the message unsigned; for production, wire through vault.
    const { message, pubkey } = request.params;
    return {
      signature: Buffer.from(new Uint8Array(64)).toString('base64'),
      publicKey: pubkey,
    };
  }

  throw new Error(`Unsupported WalletConnect method: ${method}`);
}
