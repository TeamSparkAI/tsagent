#!/usr/bin/env node
/**
 * macOS dev: npm’s extract-zip + paths under node_modules often leave xattrs / metadata
 * that make Gatekeeper report “damaged” and block xattr fixes from IDE terminals (EPERM).
 *
 * We mirror `node_modules/electron/dist` → `apps/desktop/.electron-dist` with
 * `/usr/bin/ditto --noextattr --norsrc` (no extended attributes on the copy), then launch
 * with ELECTRON_OVERRIDE_DIST_PATH (see node_modules/electron/index.js).
 *
 * Usage:
 *   node ./scripts/run-electron-dev.mjs --sync-only     # postinstall; refresh copy if version changed
 *   node ./scripts/run-electron-dev.mjs . --flags...   # same argv you would pass to `electron`
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDist = path.join(desktopRoot, 'node_modules', 'electron', 'dist');
const dstDist = path.join(desktopRoot, '.electron-dist');
const ditto = '/usr/bin/ditto';
const electronCli = path.join(desktopRoot, 'node_modules', 'electron', 'cli.js');

function readVersion(dir) {
  try {
    return readFileSync(path.join(dir, 'version'), 'utf8').trim();
  } catch {
    return '';
  }
}

function needsDarwinCopy() {
  if (!existsSync(path.join(srcDist, 'Electron.app'))) {
    return false;
  }
  if (!existsSync(path.join(dstDist, 'Electron.app'))) {
    return true;
  }
  return readVersion(srcDist) !== readVersion(dstDist);
}

function syncDarwinElectronDist() {
  if (process.platform !== 'darwin') {
    return;
  }
  if (!existsSync(path.join(srcDist, 'Electron.app'))) {
    return;
  }
  if (!needsDarwinCopy()) {
    return;
  }
  console.warn(
    '[electron] Copying Electron dist → apps/desktop/.electron-dist (ditto --noextattr) for macOS launch…'
  );
  rmSync(dstDist, { recursive: true, force: true });
  mkdirSync(dstDist, { recursive: true });
  const r = spawn(ditto, ['--noextattr', '--norsrc', srcDist, dstDist], { stdio: 'inherit' });
  return new Promise((resolve, reject) => {
    r.on('error', reject);
    r.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ditto exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

const syncOnly = process.argv[2] === '--sync-only';

if (syncOnly) {
  if (process.platform === 'darwin') {
    try {
      await syncDarwinElectronDist();
    } catch (e) {
      console.error('[electron]', e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }
  process.exit(0);
}

// --- launch electron (pass argv after script: node run-electron-dev.mjs . --foo)
const electronArgs = process.argv.slice(2);
if (electronArgs.length === 0) {
  console.error('Usage: node ./scripts/run-electron-dev.mjs <electron-args…>\nExample: node ./scripts/run-electron-dev.mjs . --ignore-certificate-errors');
  process.exit(1);
}

if (process.platform === 'darwin') {
  try {
    await syncDarwinElectronDist();
  } catch (e) {
    console.error('[electron]', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

const env = { ...process.env };
if (process.platform === 'darwin' && existsSync(path.join(dstDist, 'Electron.app'))) {
  env.ELECTRON_OVERRIDE_DIST_PATH = dstDist;
}

const child = spawn(process.execPath, [electronCli, ...electronArgs], {
  stdio: 'inherit',
  cwd: desktopRoot,
  env,
  windowsHide: false,
});

child.on('close', (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (!child.killed) {
      child.kill(sig);
    }
  });
}
