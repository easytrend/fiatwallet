import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Writes a unique timestamp to public/build-version.txt on every build.
// App.jsx polls this file every 60s to detect when a new deployment is live.
function buildVersionPlugin() {
  return {
    name: 'build-version-plugin',
    buildStart() {
      try {
        const timestamp = Date.now().toString();
        const publicDir = path.resolve(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(path.join(publicDir, 'build-version.txt'), timestamp);
      } catch (e) {
        console.warn('Could not write build version:', e);
      }
    }
  };
}

function patchMwaPlugin() {
  return {
    name: 'patch-mwa-plugin',
    transform(code, id) {
      let modified = code;
      let changed = false;

      // 1. Patch @solana-mobile/wallet-standard-mobile
      if (id.includes('wallet-standard-mobile')) {
        if (modified.includes('currentConnectionGeneration) await new Promise')) {
          modified = modified.replace(/if\s*\(this\.#connectionGeneration\s*!==\s*currentConnectionGeneration\)\s*await\s+new\s+Promise\(\(\)\s*=>\s*\{\}\);/g, 'if (this.#connectionGeneration !== currentConnectionGeneration) return;');
          changed = true;
        }
      }

      // 2. Patch @solana-mobile/mobile-wallet-adapter-protocol
      if (id.includes('mobile-wallet-adapter-protocol')) {
        // Direct intent launch via native FiatWalletBridge
        if (modified.includes('async function launchAssociation(associationUrl) {') && !modified.includes('FiatWalletBridge.launchIntent')) {
          modified = modified.replace(
            'async function launchAssociation(associationUrl) {',
            'async function launchAssociation(associationUrl) {\n\tif (typeof window !== "undefined" && window.FiatWalletBridge && window.FiatWalletBridge.launchIntent) {\n\t\twindow.FiatWalletBridge.launchIntent(associationUrl.toString());\n\t\treturn;\n\t}'
          );
          changed = true;
        }

        // Prevent premature timeout rejection on Android WebView where blur is not fired on Activity transition
        if (modified.includes('cleanup();') && (modified.includes('reject();') || modified.includes('3e3') || modified.includes('800'))) {
          modified = modified.replace(/cleanup\(\);\s*reject\(\);\s*\}\s*,\s*(3e3|800)\);/g, 'cleanup(); resolve(); }, 15000);');
          changed = true;
        }

        // Use 127.0.0.1 loopback
        if (modified.includes('ws://localhost:')) {
          modified = modified.replace(/ws:\/\/localhost:/g, 'ws://127.0.0.1:');
          changed = true;
        }
      }

      return changed ? { code: modified, map: null } : null;
    }
  };
}

export default defineConfig({
  plugins: [react(), buildVersionPlugin(), patchMwaPlugin()],
  optimizeDeps: {
    include: ['buffer'],
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const nid = id.replace(/\\/g, '/');
          if (nid.includes('node_modules/tesseract.js')) {
            return 'vendor-ocr';
          }
          if (nid.includes('node_modules/@solana/web3.js') || nid.includes('node_modules/@solana/spl-token')) {
            return 'vendor-solana';
          }
          if (nid.includes('node_modules/@walletconnect') || nid.includes('node_modules/@reown')) {
            return 'vendor-walletconnect';
          }
          if (nid.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
        },
      },
    },
  },
});
