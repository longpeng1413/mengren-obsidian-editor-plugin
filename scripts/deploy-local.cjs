// Build, copy the runtime files into the maintainer's own vaults, then reload
// and verify the plugin in every vault that Obsidian currently has open.
// Vault paths are personal: they live in the git-ignored .local-vaults.json:
//   { "obsidian": "PATH/TO/Obsidian.exe",
//     "vaults": [ { "name": "Vault name", "path": "PATH/TO/VAULT" } ] }
// Only manifest.json, main.js and styles.css are written; data.json and
// backups/ are never touched.
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, '.local-vaults.json');
if (!fs.existsSync(configPath)) throw new Error('Missing .local-vaults.json; see the header of scripts/deploy-local.cjs');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = ['manifest.json', 'main.js', 'styles.css'];

execFileSync(process.execPath, [path.join(root, 'scripts/build.cjs')], {stdio: 'inherit'});

// Runs an async snippet inside Obsidian through its CLI. The CLI only returns
// synchronous values, so the result is parked on window and polled. Only the
// "=> value" line is the answer; app log lines may come first, and a call can
// occasionally return nothing, which means "ask again", not failure.
function obsidian(vault, body) {
  const run = code => {
    const out = execFileSync(config.obsidian, ['vault=' + vault, 'eval', 'code=' + code], {encoding: 'utf8', timeout: 60000});
    const line = out.split(/\r?\n/).reverse().find(l => l.startsWith('=> '));
    return line ? line.slice(3).trim() : '';
  };
  run(`window.__tetDeploy='pending';Promise.resolve(${body}).then(v=>window.__tetDeploy=v,e=>window.__tetDeploy='ERROR '+(e&&e.message||e));0`);
  const deadline = Date.now() + 60000;
  for (;;) {
    const out = run('window.__tetDeploy');
    if ((out && out !== 'pending') || Date.now() > deadline) {
      for (let i = 0; i < 3 && run('delete window.__tetDeploy;typeof window.__tetDeploy') !== 'undefined'; i++);
      return out || 'no answer from Obsidian';
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
}

const reload = `(async()=>{
  const id=${JSON.stringify(manifest.id)},wait=ms=>new Promise(r=>setTimeout(r,ms));
  if(app.vault.getName()!==__VAULT__)throw new Error('wrong vault');
  await app.plugins.loadManifests();await app.plugins.disablePlugin(id);await wait(300);await app.plugins.enablePlugin(id);await wait(1500);
  const p=app.plugins.plugins[id];
  const styles=[...document.head.querySelectorAll('style')].filter(s=>s.textContent.includes('tet-resize-overlay')).length;
  return JSON.stringify({version:p?.manifest.version,loaded:!!p?._loaded,editors:p?.cmViews?.size??0,styles});
})()`;

// Only talk to vaults Obsidian reports as open: a CLI call on a closed vault
// would open a new window.
const registry = path.join(process.env.APPDATA || '', 'obsidian', 'obsidian.json');
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const isOpen = vaultPath => fs.existsSync(registry) &&
  Object.values(JSON.parse(fs.readFileSync(registry, 'utf8')).vaults || {}).some(v => v.open && same(v.path, vaultPath));

let failed = false;
for (const vault of config.vaults) {
  const dir = path.join(vault.path, '.obsidian', 'plugins', manifest.id);
  fs.mkdirSync(dir, {recursive: true});
  for (const file of files) fs.copyFileSync(path.join(root, file), path.join(dir, file));
  if (!config.obsidian || !isOpen(vault.path)) { console.log(`${vault.name}: copied ${manifest.version}; not open in Obsidian, loads on next start`); continue; }
  let status;
  try { status = obsidian(vault.name, reload.replace('__VAULT__', JSON.stringify(vault.name))); }
  catch (error) { status = 'ERROR ' + error.message; }
  let result;
  try { result = JSON.parse(status); } catch { result = null; }
  const ok = result && result.version === manifest.version && result.loaded && result.styles === 1;
  failed ||= !ok;
  console.log(`${vault.name}: ${ok ? 'OK' : 'CHECK FAILED'} ${status}`);
}
if (failed) process.exit(1);
