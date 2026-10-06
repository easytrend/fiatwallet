/**
 * FiatWallet Extension Popup Controller
 */

const DEFAULT_RPC = 'https://solana-rpc.publicnode.com';

document.addEventListener('DOMContentLoaded', async () => {
  const walletView = document.getElementById('wallet-view');
  const setupView = document.getElementById('setup-view');
  const displayAddress = document.getElementById('display-address');
  const solBalance = document.getElementById('sol-balance');
  const btnCopy = document.getElementById('btn-copy-address');
  const copyStatus = document.getElementById('copy-status');
  const importAddressInput = document.getElementById('import-address');
  const btnSaveWallet = document.getElementById('btn-save-wallet');
  const btnReimport = document.getElementById('btn-reimport');

  async function fetchSolBalance(address) {
    try {
      const res = await fetch(DEFAULT_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [address],
        }),
      });
      const data = await res.json();
      if (data.result && typeof data.result.value === 'number') {
        const sol = (data.result.value / 1e9).toFixed(4);
        solBalance.textContent = `${sol} SOL`;
      }
    } catch (e) {
      console.warn('Balance fetch error:', e);
    }
  }

  async function refreshUI() {
    const storage = await chrome.storage.local.get(['activePublicKey']);
    const pubkey = storage.activePublicKey;

    if (pubkey) {
      setupView.style.display = 'none';
      walletView.style.display = 'block';
      displayAddress.textContent = `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
      fetchSolBalance(pubkey);
    } else {
      walletView.style.display = 'none';
      setupView.style.display = 'block';
    }
  }

  btnCopy.addEventListener('click', async () => {
    const storage = await chrome.storage.local.get(['activePublicKey']);
    if (storage.activePublicKey) {
      navigator.clipboard.writeText(storage.activePublicKey);
      copyStatus.textContent = 'Copied!';
      setTimeout(() => { copyStatus.textContent = 'Copy'; }, 1500);
    }
  });

  btnSaveWallet.addEventListener('click', async () => {
    const input = importAddressInput.value.trim();
    if (input.length >= 32 && input.length <= 44) {
      await chrome.storage.local.set({ activePublicKey: input });
      importAddressInput.value = '';
      refreshUI();
    } else {
      alert('Please enter a valid Solana public key.');
    }
  });

  btnReimport.addEventListener('click', () => {
    setupView.style.display = 'block';
    walletView.style.display = 'none';
  });

  refreshUI();
});
