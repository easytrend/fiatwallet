/**
 * FiatWallet Background Service Worker (Manifest V3)
 * Handles dApp connection requests, transaction signing approvals, and RPC communication.
 */

const DEFAULT_RPC = 'https://solana-rpc.publicnode.com';

// Pending approval requests awaiting user confirmation in approval popup
const pendingPrompts = new Map();

// Helper to open popup approval window
async function openApprovalWindow(type, payload, requestId) {
  return new Promise((resolve) => {
    pendingPrompts.set(requestId, resolve);

    const encoded = encodeURIComponent(JSON.stringify(payload));
    const url = `approval.html?type=${type}&id=${requestId}&data=${encoded}`;

    chrome.windows.create({
      url,
      type: 'popup',
      width: 380,
      height: 580,
      focused: true,
    });
  });
}

// Receive message from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target === 'fiatwallet-approval-response') {
    const { id, approved, result, error } = request;
    if (pendingPrompts.has(id)) {
      const resolver = pendingPrompts.get(id);
      pendingPrompts.delete(id);
      resolver({ approved, result, error });
      sendResponse({ status: 'ok' });
    }
    return true;
  }

  if (request.target !== 'fiatwallet-background') return;

  const { id, action, payload } = request;

  (async () => {
    try {
      const storage = await chrome.storage.local.get(['activePublicKey', 'connectedOrigins', 'encryptedVault']);
      const activePublicKey = storage.activePublicKey;
      const connectedOrigins = storage.connectedOrigins || [];

      if (action === 'CONNECT') {
        if (!activePublicKey) {
          sendResponse({
            error: 'No FiatWallet found. Please open FiatWallet extension and create or import a wallet first.'
          });
          return;
        }

        const origin = payload.origin;
        // If already trusted and onlyIfTrusted requested
        if (connectedOrigins.includes(origin)) {
          sendResponse({ result: { publicKey: activePublicKey } });
          return;
        }

        if (payload.onlyIfTrusted) {
          sendResponse({ error: 'Origin not pre-approved.' });
          return;
        }

        // Open approval window
        const outcome = await openApprovalWindow('connect', {
          origin,
          publicKey: activePublicKey,
          title: payload.title,
        }, id);

        if (outcome.approved) {
          if (!connectedOrigins.includes(origin)) {
            connectedOrigins.push(origin);
            await chrome.storage.local.set({ connectedOrigins });
          }
          sendResponse({ result: { publicKey: activePublicKey } });
        } else {
          sendResponse({ error: 'Connection request rejected by user.' });
        }
      } else if (action === 'DISCONNECT') {
        const origin = payload?.origin;
        if (origin) {
          const updated = connectedOrigins.filter(o => o !== origin);
          await chrome.storage.local.set({ connectedOrigins: updated });
        }
        sendResponse({ result: { success: true } });
      } else if (action === 'SIGN_TRANSACTION') {
        if (!activePublicKey) {
          sendResponse({ error: 'Wallet not set up.' });
          return;
        }

        // Open transaction approval window
        const outcome = await openApprovalWindow('sign_tx', {
          origin: payload.origin,
          publicKey: activePublicKey,
          serializedTx: payload.serializedTx,
        }, id);

        if (outcome.approved && outcome.result?.signedTx) {
          sendResponse({ result: { signedTx: outcome.result.signedTx } });
        } else {
          sendResponse({ error: outcome.error || 'Transaction rejected by user.' });
        }
      } else if (action === 'SEND_RAW_TRANSACTION') {
        // Send raw serialized transaction to Solana RPC
        const rpcUrl = DEFAULT_RPC;
        const b64 = btoa(String.fromCharCode.apply(null, payload.rawBytes));

        const rpcRes = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sendTransaction',
            params: [b64, { encoding: 'base64', skipPreflight: false }],
          }),
        });

        const rpcData = await rpcRes.json();
        if (rpcData.error) {
          throw new Error(rpcData.error.message || 'Solana RPC send error');
        }

        sendResponse({ result: { signature: rpcData.result } });
      } else if (action === 'SIGN_MESSAGE') {
        const outcome = await openApprovalWindow('sign_msg', {
          origin: payload.origin,
          messageBytes: payload.messageBytes,
          display: payload.display,
        }, id);

        if (outcome.approved && outcome.result?.signature) {
          sendResponse({ result: { signature: outcome.result.signature } });
        } else {
          sendResponse({ error: 'Message signing rejected.' });
        }
      } else {
        sendResponse({ error: `Unknown action: ${action}` });
      }
    } catch (err) {
      sendResponse({ error: err.message || 'Background worker error' });
    }
  })();

  return true; // Keep message channel open for async response
});
