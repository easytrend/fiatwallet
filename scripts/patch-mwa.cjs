const fs = require('fs');
const path = require('path');

function walkAndPatch(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      walkAndPatch(full);
    } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      let content = fs.readFileSync(full, 'utf8');
      let changed = false;

      // 1. Connection generation fix
      if (content.includes('currentConnectionGeneration) await new Promise')) {
        content = content.replace(/if\s*\(this\.#connectionGeneration\s*!==\s*currentConnectionGeneration\)\s*await\s+new\s+Promise\(\(\)\s*=>\s*\{\}\);/g, 'if (this.#connectionGeneration !== currentConnectionGeneration) return;');
        changed = true;
      }

      // 2. Direct intent launch via FiatWalletBridge
      if (content.includes('async function launchAssociation(associationUrl) {') && !content.includes('FiatWalletBridge.launchIntent')) {
        content = content.replace(
          'async function launchAssociation(associationUrl) {',
          'async function launchAssociation(associationUrl) {\n\tif (typeof window !== "undefined" && window.FiatWalletBridge && window.FiatWalletBridge.launchIntent) {\n\t\twindow.FiatWalletBridge.launchIntent(associationUrl.toString());\n\t\treturn;\n\t}'
        );
        changed = true;
      }

      // 3. Prevent premature timeout rejection in getDetectionPromise
      if (content.includes('cleanup();') && content.includes('reject();') && content.includes('3e3')) {
        content = content.replace(/cleanup\(\);\s*reject\(\);\s*\}\s*,\s*3e3\);/g, 'cleanup(); resolve(); }, 15000);');
        changed = true;
      }

      // 4. Use 127.0.0.1 for direct loopback WebSocket URL
      if (content.includes('ws://localhost:')) {
        content = content.replace(/ws:\/\/localhost:/g, 'ws://127.0.0.1:');
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(full, content, 'utf8');
        console.log('[patch-mwa] Patched:', path.relative(path.join(__dirname, '..'), full));
      }
    }
  });
}

const targetBase = path.join(__dirname, '..', 'node_modules', '@solana-mobile');
if (fs.existsSync(targetBase)) {
  console.log('[patch-mwa] Scanning and patching all @solana-mobile packages...');
  walkAndPatch(targetBase);
  console.log('[patch-mwa] Completed patching @solana-mobile packages.');
}
