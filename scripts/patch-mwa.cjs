const fs = require('fs');
const path = require('path');

// 1. Patch @solana-mobile/wallet-standard-mobile
const targetDir = path.join(__dirname, '..', 'node_modules', '@solana-mobile', 'wallet-standard-mobile', 'lib');
if (fs.existsSync(targetDir)) {
  const files = [];
  function getFiles(dir) {
    fs.readdirSync(dir).forEach(file => {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) getFiles(full);
      else if (full.endsWith('.js')) files.push(full);
    });
  }
  getFiles(targetDir);

  let patchedCount = 0;
  files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    let changed = false;
    if (content.includes('currentConnectionGeneration) await new Promise')) {
      content = content.replace(/if\s*\(this\.#connectionGeneration\s*!==\s*currentConnectionGeneration\)\s*await\s+new\s+Promise\(\(\)\s*=>\s*\{\}\);/g, 'if (this.#connectionGeneration !== currentConnectionGeneration) return;');
      changed = true;
    }
    if (content.includes('window.addEventListener("load", this.close);') && !content.includes('focus-fast-cancel')) {
      content = content.replace('window.addEventListener("load", this.close);', 'window.addEventListener("load", this.close); /* focus-fast-cancel */ if (typeof window !== "undefined") window.addEventListener("focus", () => { setTimeout(() => { if (document.visibilityState === "visible") this.close(new Event("close")); }, 600); });');
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(f, content, 'utf8');
      patchedCount++;
    }
  });
  if (patchedCount > 0) {
    console.log('[patch-mwa] Patched', patchedCount, 'files in @solana-mobile/wallet-standard-mobile');
  }
}

// 2. Patch @solana-mobile/mobile-wallet-adapter-protocol (shorten 3s detection timeout to 800ms)
const protocolDir = path.join(__dirname, '..', 'node_modules', '@solana-mobile', 'mobile-wallet-adapter-protocol', 'lib');
if (fs.existsSync(protocolDir)) {
  const protoFiles = [];
  function getProtoFiles(dir) {
    fs.readdirSync(dir).forEach(file => {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) getProtoFiles(full);
      else if (full.endsWith('.js')) protoFiles.push(full);
    });
  }
  getProtoFiles(protocolDir);

  let protoPatched = 0;
  protoFiles.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    if (content.includes('reject(); }, 3e3);')) {
      content = content.replace(/reject\(\);\s*\}\s*,\s*3e3\);/g, 'reject(); }, 800);');
      fs.writeFileSync(f, content, 'utf8');
      protoPatched++;
    }
  });
  if (protoPatched > 0) {
    console.log('[patch-mwa] Patched', protoPatched, 'files in mobile-wallet-adapter-protocol');
  }
}
