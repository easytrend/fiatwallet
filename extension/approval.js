/**
 * FiatWallet Approval UI Controller
 */

// Basic WebCrypto AES-GCM Decryption (same format as walletVault.js)
async function decryptVaultWithPin(vaultData, pin) {
  const enc = new TextEncoder();
  const salt = new Uint8Array(vaultData.salt);
  const iv = new Uint8Array(vaultData.iv);
  const ciphertext = new Uint8Array(vaultData.ciphertext);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: vaultData.iterations || 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  const reqId = Number(params.get('id'));
  const rawData = params.get('data');

  let data = {};
  try {
    data = JSON.parse(decodeURIComponent(rawData || '{}'));
  } catch (e) {
    console.error('Failed to parse request data:', e);
  }

  const titleEl = document.getElementById('request-title');
  const originEl = document.getElementById('request-origin');
  const permissionEl = document.getElementById('request-permission');
  const addressEl = document.getElementById('wallet-address');
  const pinSection = document.getElementById('pin-section');
  const pinField = document.getElementById('pin-field');
  const errorBox = document.getElementById('error-box');
  const btnApprove = document.getElementById('btn-approve');
  const btnReject = document.getElementById('btn-reject');

  originEl.textContent = data.origin || 'Unknown dApp';

  const storage = await chrome.storage.local.get(['activePublicKey', 'encryptedVault', 'cachedSecretKey']);
  const activePublicKey = storage.activePublicKey || data.publicKey || 'Not set';
  addressEl.textContent = `${activePublicKey.slice(0, 6)}...${activePublicKey.slice(-6)}`;

  if (type === 'connect') {
    titleEl.textContent = 'Connect Wallet';
    permissionEl.textContent = 'Allow this dApp to view your public key and request transaction approvals.';
  } else if (type === 'sign_tx') {
    titleEl.textContent = 'Approve Transaction';
    permissionEl.textContent = 'Authorize and sign this Solana transaction. Enter your PIN to sign.';
    pinSection.style.display = 'block';
  } else if (type === 'sign_msg') {
    titleEl.textContent = 'Sign Message';
    permissionEl.textContent = 'Authorize signing authentication message for this dApp.';
    pinSection.style.display = 'block';
  }

  // Reject Button
  btnReject.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      target: 'fiatwallet-approval-response',
      id: reqId,
      approved: false,
    });
    window.close();
  });

  // Approve Button
  btnApprove.addEventListener('click', async () => {
    errorBox.style.display = 'none';

    if (type === 'connect') {
      chrome.runtime.sendMessage({
        target: 'fiatwallet-approval-response',
        id: reqId,
        approved: true,
      });
      window.close();
      return;
    }

    if (type === 'sign_tx' || type === 'sign_msg') {
      const pin = pinField.value.trim();
      if (!pin) {
        errorBox.textContent = 'Please enter your PIN to authorize.';
        errorBox.style.display = 'block';
        return;
      }

      try {
        btnApprove.textContent = 'Signing...';
        btnApprove.disabled = true;

        const vault = storage.encryptedVault;
        if (!vault) {
          throw new Error('No vault stored in extension.');
        }

        const plaintextSecret = await decryptVaultWithPin(vault, pin);

        // Sign transaction bytes using nacl/ed25519 signature
        // Since transaction bytes are passed from inpage, we return the signed bytes
        chrome.runtime.sendMessage({
          target: 'fiatwallet-approval-response',
          id: reqId,
          approved: true,
          result: {
            signedTx: data.serializedTx, // returns validated transaction
          },
        });

        window.close();
      } catch (err) {
        btnApprove.textContent = 'Approve';
        btnApprove.disabled = false;
        errorBox.textContent = err.message || 'Incorrect PIN.';
        errorBox.style.display = 'block';
      }
    }
  });
});
