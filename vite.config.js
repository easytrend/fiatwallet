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

// Patches the upstream @solana-mobile hang bug where connection cancellation awaits an unresolved promise.
function patchMwaPlugin() {
  return {
    name: 'patch-mwa-plugin',
    transform(code, id) {
      if (id.includes('wallet-standard-mobile') && code.includes('currentConnectionGeneration) await new Promise')) {
        return {
          code: code.replace(/if\s*\(this\.#connectionGeneration\s*!==\s*currentConnectionGeneration\)\s*await\s+new\s+Promise\(\(\)\s*=>\s*\{\}\);/g, 'if (this.#connectionGeneration !== currentConnectionGeneration) return;'),
          map: null,
        };
      }
      return null;
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
});
