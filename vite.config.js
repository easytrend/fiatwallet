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
      if (id.includes('wallet-standard-mobile')) {
        if (modified.includes('currentConnectionGeneration) await new Promise')) {
          modified = modified.replace(/if\s*\(this\.#connectionGeneration\s*!==\s*currentConnectionGeneration\)\s*await\s+new\s+Promise\(\(\)\s*=>\s*\{\}\);/g, 'if (this.#connectionGeneration !== currentConnectionGeneration) return;');
          changed = true;
        }
        if (modified.includes('window.addEventListener("load", this.close);') && !modified.includes('focus-fast-cancel')) {
          modified = modified.replace('window.addEventListener("load", this.close);', 'window.addEventListener("load", this.close); /* focus-fast-cancel */ if (typeof window !== "undefined") window.addEventListener("focus", () => { setTimeout(() => { if (document.visibilityState === "visible") this.close(new Event("close")); }, 600); });');
          changed = true;
        }
      }
      if (id.includes('mobile-wallet-adapter-protocol') && modified.includes('reject(); }, 3e3);')) {
        modified = modified.replace(/reject\(\);\s*\}\s*,\s*3e3\);/g, 'reject(); }, 800);');
        changed = true;
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
});
