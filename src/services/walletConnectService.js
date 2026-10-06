/**
 * walletConnectService.js
 *
 * WalletConnect v2 Wallet-side integration for FiatWallet.
 * Acts as the WALLET (not the dApp). Receives session proposals from
 * dApps (Raydium, Meteora, Jupiter, etc.) via the WalletConnect relay.
 *
 * Flow:
 *   1. User opens a dApp in the explorer.
 *   2. dApp shows "Connect Wallet" -> user picks "WalletConnect".
 *   3. dApp shows a WC URI (wc:...) or QR code.
 *   4. User taps "WC Connect" in FiatWallet's dApp browser bar.
 *   5. FiatWallet pastes/receives the URI and calls pair(uri).
 *   6. WC relay sends a session_proposal event here.
 *   7. FiatWallet shows an approval UI -> user approves -> session established.
 *   8. dApp now sees FiatWallet as connected wallet.
 *   9. dApp sends sign requests -> FiatWallet signs with internal vault.
 *
 * WalletConnect Project ID: Get one free at https://cloud.walletconnect.com
 * We use a fallback public key if not set in env.
 */

const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID || 'f57a7b44b31948c28e8aeaa0d24e93e1';

const WC_METADATA = {
  name: 'FiatWallet',
  description: 'Self-custodial Solana wallet — buy and sell stablecoins with ease.',
  url: 'https://fiatwallet.app',
  icons: ['https://fiatwallet.app/icon512.png'],
};

let _web3wallet = null;
let _initPromise = null;
let _eventHandlers = {};

/**
 * Lazily initialize the WalletConnect Web3Wallet (wallet-side SDK).
 * Only loads the heavy SDK once, on demand.
 */
export async function getWeb3Wallet() {
  if (_web3wallet) return _web3wallet;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      // Dynamically import to keep initial bundle small
      const { Web3Wallet } = await import('@walletconnect/web3wallet');
      const { Core } = await import('@walletconnect/core');

      const core = new Core({ projectId: WC_PROJECT_ID });

      _web3wallet = await Web3Wallet.init({
        core,
        metadata: WC_METADATA,
      });

      // Wire up default handlers that dispatch custom DOM events
      _web3wallet.on('session_proposal', (proposal) => {
        window.dispatchEvent(new CustomEvent('fiatwallet:wc-session-proposal', { detail: proposal }));
      });

      _web3wallet.on('session_request', (request) => {
        window.dispatchEvent(new CustomEvent('fiatwallet:wc-session-request', { detail: request }));
      });

      _web3wallet.on('session_delete', (session) => {
        window.dispatchEvent(new CustomEvent('fiatwallet:wc-session-delete', { detail: session }));
      });

      console.log('[FiatWallet WC] Web3Wallet initialized');
      return _web3wallet;
    } catch (err) {
      console.error('[FiatWallet WC] Init failed:', err);
      _initPromise = null;
      throw err;
    }
  })();

  return _initPromise;
}

/**
 * Pair with a dApp using the WalletConnect URI (wc:...).
 * Call this when the user pastes or scans a WC URI from a dApp.
 */
export async function pairWithUri(uri) {
  const wallet = await getWeb3Wallet();
  return wallet.core.pairing.pair({ uri });
}

/**
 * Approve a session proposal from a dApp.
 * @param {object} proposal - The session_proposal event detail
 * @param {string} address - The wallet's public key (base58)
 * @param {string[]} chains - e.g. ['solana:mainnet']
 */
export async function approveSessionProposal(proposal, address, chains = ['solana:mainnet', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']) {
  const wallet = await getWeb3Wallet();

  const namespaces = buildSolanaNamespaces(proposal, address, chains);

  return wallet.approveSession({
    id: proposal.id,
    relayProtocol: proposal.params.relays[0]?.protocol,
    namespaces,
  });
}

/**
 * Reject a session proposal.
 */
export async function rejectSessionProposal(proposal) {
  const wallet = await getWeb3Wallet();
  return wallet.rejectSession({
    id: proposal.id,
    reason: { code: 4001, message: 'User rejected session' },
  });
}

/**
 * Respond to a session_request (sign transaction, sign message, etc.)
 */
export async function respondToRequest(requestEvent, result) {
  const wallet = await getWeb3Wallet();
  const { topic, id } = requestEvent;
  return wallet.respondSessionRequest({
    topic,
    response: { id, jsonrpc: '2.0', result },
  });
}

/**
 * Respond to a session_request with an error.
 */
export async function rejectRequest(requestEvent, message = 'User rejected') {
  const wallet = await getWeb3Wallet();
  const { topic, id } = requestEvent;
  return wallet.respondSessionRequest({
    topic,
    response: {
      id,
      jsonrpc: '2.0',
      error: { code: 4001, message },
    },
  });
}

/**
 * Get all active sessions.
 */
export async function getActiveSessions() {
  const wallet = await getWeb3Wallet();
  return wallet.getActiveSessions();
}

/**
 * Disconnect an active session.
 */
export async function disconnectSession(topic) {
  const wallet = await getWeb3Wallet();
  return wallet.disconnectSession({
    topic,
    reason: { code: 6000, message: 'User disconnected' },
  });
}

/**
 * Build Solana Wallet Standard compliant namespaces for session approval.
 * Uses the required namespaces from the dApp's session proposal.
 */
function buildSolanaNamespaces(proposal, address, supportedChains) {
  const { requiredNamespaces = {}, optionalNamespaces = {} } = proposal.params;

  // Merge required + optional for Solana
  const solanaRequired = requiredNamespaces['solana'] || {};
  const solanaOptional = optionalNamespaces['solana'] || {};

  // Chains we support
  const allSupportedChains = supportedChains;

  // Figure out which chains the dApp requested
  const requestedChains = [
    ...(solanaRequired.chains || []),
    ...(solanaOptional.chains || []),
  ].filter((c) => c.startsWith('solana:'));

  // Only include chains we support
  const approvedChains = requestedChains.length > 0
    ? requestedChains.filter((c) => allSupportedChains.includes(c))
    : allSupportedChains;

  // If dApp requested chains we don't support, still include solana:mainnet at minimum
  const finalChains = approvedChains.length > 0 ? approvedChains : ['solana:mainnet'];

  const accounts = finalChains.map((chain) => `${chain}:${address}`);

  const methods = [
    ...(solanaRequired.methods || []),
    ...(solanaOptional.methods || []),
    // Always include standard Solana WC methods
    'solana_signTransaction',
    'solana_signMessage',
    'solana_signAndSendTransaction',
    'solana_signAllTransactions',
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

  const events = [
    ...(solanaRequired.events || []),
    ...(solanaOptional.events || []),
    'accountsChanged',
    'chainChanged',
  ].filter((v, i, a) => a.indexOf(v) === i);

  return {
    solana: {
      accounts,
      chains: finalChains,
      methods,
      events,
    },
  };
}

/**
 * Handle a session_request — sign a Solana transaction.
 * Returns the base64-encoded signed transaction.
 *
 * @param {object} requestEvent - WC session_request event
 * @param {function} signTransaction - FiatWallet's sign function
 * @param {Connection} connection - Solana connection
 */
export async function handleSessionRequest(requestEvent, signTransaction, connection) {
  const { params } = requestEvent;
  const { request } = params;

  if (request.method === 'solana_signTransaction') {
    const { transaction } = request.params;

    // Decode base64 transaction
    const { Transaction, VersionedTransaction } = await import('@solana/web3.js');
    let tx;
    const txBytes = Buffer.from(transaction, 'base64');
    try {
      tx = VersionedTransaction.deserialize(txBytes);
    } catch {
      tx = Transaction.from(txBytes);
    }

    const signed = await signTransaction(tx);
    const serialized = signed.serialize();
    return Buffer.from(serialized).toString('base64');
  }

  if (request.method === 'solana_signMessage') {
    const { message, pubkey } = request.params;
    // Return mock signed message (in production, use vault keypair to sign)
    return {
      signature: Buffer.from(new Uint8Array(64)).toString('base64'),
      publicKey: pubkey,
    };
  }

  if (request.method === 'solana_signAndSendTransaction') {
    const { transaction } = request.params;
    const { Transaction, VersionedTransaction } = await import('@solana/web3.js');
    let tx;
    const txBytes = Buffer.from(transaction, 'base64');
    try {
      tx = VersionedTransaction.deserialize(txBytes);
    } catch {
      tx = Transaction.from(txBytes);
    }

    const signed = await signTransaction(tx);
    const sig = await connection.sendRawTransaction(signed.serialize());
    return { signature: sig };
  }

  throw new Error(`Unsupported method: ${request.method}`);
}
