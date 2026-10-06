/**
 * FiatWallet Content Script
 * Injects inpage.js into the webpage and bridges messages to the background worker.
 */

// Inject inpage.js script into the webpage DOM
function injectInpageScript() {
  try {
    const container = document.head || document.documentElement;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inpage.js');
    script.onload = () => script.remove();
    container.insertBefore(script, container.firstChild);
  } catch (err) {
    console.error('FiatWallet: Failed to inject inpage provider:', err);
  }
}

injectInpageScript();

// Bridge window.postMessage from inpage.js to background service worker
window.addEventListener('message', async (event) => {
  if (event.source !== window || !event.data || event.data.target !== 'fiatwallet-contentscript') {
    return;
  }

  const { id, action, payload } = event.data;

  try {
    const response = await chrome.runtime.sendMessage({
      target: 'fiatwallet-background',
      id,
      action,
      payload,
    });

    window.postMessage({
      target: 'fiatwallet-inpage',
      id,
      result: response?.result,
      error: response?.error,
    }, '*');
  } catch (err) {
    window.postMessage({
      target: 'fiatwallet-inpage',
      id,
      error: err.message || 'Extension communication error',
    }, '*');
  }
});
