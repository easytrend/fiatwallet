const fs = require('fs');
const path = require('path');

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
    if (content.includes('currentConnectionGeneration) await new Promise')) {
      content = content.replace(/if\s*\(this\.#connectionGeneration\s*!==\s*currentConnectionGeneration\)\s*await\s+new\s+Promise\(\(\)\s*=>\s*\{\}\);/g, 'if (this.#connectionGeneration !== currentConnectionGeneration) return;');
      fs.writeFileSync(f, content, 'utf8');
      patchedCount++;
    }
  });
  if (patchedCount > 0) {
    console.log('[patch-mwa] Patched', patchedCount, 'files in @solana-mobile/wallet-standard-mobile');
  }
}
