const { app, net } = require('electron');
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getAppDataBase, getBundledPaths } = require('./phpServer.cjs');

const SAFE_PATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{3,79}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_PATCH_BYTES = 50 * 1024 * 1024;

function runtimeBaseDir() {
  return path.join(getAppDataBase(), 'runtime');
}

function patchesDir() {
  return path.join(runtimeBaseDir(), 'patches');
}

function activeStatePath() {
  return path.join(runtimeBaseDir(), 'active.json');
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function readManifestFromRoot(rootDir) {
  const m = readJsonSafe(path.join(rootDir, 'updates', 'patch-manifest.json'));
  return m && m.patch_id ? m : null;
}

function isValidRuntimeRoot(rootDir) {
  return (
    rootDir &&
    fs.existsSync(path.join(rootDir, 'dist', 'index.html')) &&
    fs.existsSync(path.join(rootDir, 'api', 'public', 'index.php')) &&
    fs.existsSync(path.join(rootDir, 'router.php'))
  );
}

function parseIsoMs(iso) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? t : 0;
}

function resolveActiveRuntime() {
  const { appDir: bundledRoot } = getBundledPaths();
  const bundledManifest = readManifestFromRoot(bundledRoot) || {
    version: app.getVersion(),
    patch_id: `${app.getVersion()}-bundled`,
    built_at: '',
  };

  const state = readJsonSafe(activeStatePath(), {});
  const autoPatchEnabled = state.autoPatchEnabled !== false;

  if (app.isPackaged && state.activePatchId && SAFE_PATCH_ID.test(state.activePatchId)) {
    const candidateRoot = path.join(patchesDir(), state.activePatchId);
    const sameShell = !state.shellVersion || state.shellVersion === app.getVersion();
    const patchManifest = readManifestFromRoot(candidateRoot);
    const bundledMs = parseIsoMs(bundledManifest.built_at);
    const patchMs = parseIsoMs(patchManifest?.built_at || state.patchBuiltAt);

    if (sameShell && isValidRuntimeRoot(candidateRoot) && patchMs >= bundledMs) {
      return {
        activeRoot: candidateRoot,
        activePatchId: state.activePatchId,
        bundledPatchId: bundledManifest.patch_id,
        shellVersion: app.getVersion(),
        builtAt: patchManifest?.built_at || state.patchBuiltAt || '',
        runtimeSource: 'patch',
        autoPatchEnabled,
      };
    }
  }

  return {
    activeRoot: bundledRoot,
    activePatchId: bundledManifest.patch_id,
    bundledPatchId: bundledManifest.patch_id,
    shellVersion: app.getVersion(),
    builtAt: bundledManifest.built_at || '',
    runtimeSource: app.isPackaged ? 'bundled' : 'workspace',
    autoPatchEnabled,
  };
}

function normalizeApiEndpoint(serverUrl, routeName) {
  const raw = String(serverUrl || '').trim();
  if (!raw) throw new Error('Online server URL is not configured.');

  let base = raw.replace(/\/+$/, '');
  if (base.endsWith('/api/index.php')) {
    return `${base}?route=${encodeURIComponent(routeName)}`;
  }
  if (base.endsWith('/index.php')) {
    return `${base}?route=${encodeURIComponent(routeName)}`;
  }
  return `${base}/api/index.php?route=${encodeURIComponent(routeName)}`;
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await net.fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function checkForPatch(serverUrl, currentRuntime) {
  const manifestUrl = normalizeApiEndpoint(serverUrl, 'update.manifest');
  const remote = await fetchJsonWithTimeout(manifestUrl);
  if (!remote || remote.app_id !== 'com.zeedat.pos' || !SAFE_PATCH_ID.test(String(remote.patch_id))
      || !SHA256.test(String(remote.zip_sha256)) || !Number.isSafeInteger(remote.size_bytes)
      || remote.size_bytes <= 0 || remote.size_bytes > MAX_PATCH_BYTES || !parseIsoMs(remote.built_at)) {
    throw new Error('Server returned an invalid update manifest.');
  }

  const samePatch = remote.patch_id === currentRuntime.activePatchId;
  const pendingState = readJsonSafe(activeStatePath(), {});
  const alreadyStaged = !samePatch && pendingState.stagedPatchId === remote.patch_id
    && isValidRuntimeRoot(path.join(patchesDir(), remote.patch_id));
  const isNewer = parseIsoMs(remote.built_at) >= parseIsoMs(currentRuntime.builtAt);

  return {
    updateAvailable: isNewer && !samePatch && !alreadyStaged,
    alreadyStaged,
    currentPatchId: currentRuntime.activePatchId,
    latestPatch: remote,
  };
}

function expandArchivePowerShell(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true, timeout: 60000 },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.trim() || err.message || 'Archive extraction failed.'));
        } else {
          resolve();
        }
      }
    );
  });
}

function pruneOldPatches(keepIds) {
  const dir = patchesDir();
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (keepIds.has(entry.name)) continue;
    try {
      fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
    } catch {
      // Locked directory currently running will be cleaned up on next boot
    }
  }
}

async function downloadAndStagePatch(serverUrl, manifest, currentRuntime) {
  const patchId = String(manifest.patch_id || '');
  if (!SAFE_PATCH_ID.test(patchId)) {
    throw new Error('Unsafe patch identifier rejected.');
  }
  if (!manifest.zip_sha256) {
    throw new Error('Patch manifest is missing zip_sha256 checksum.');
  }

  const legacyUrl = normalizeApiEndpoint(serverUrl, 'update.download');
  const expectedRoute = `assets/zeedat-patch-${patchId}.zip`;
  const downloadUrl = manifest.download_route === expectedRoute
    ? new URL(`../${expectedRoute}`, legacyUrl).href
    : legacyUrl;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);

  let zipBuf;
  try {
    const request = { method: 'GET', signal: ctrl.signal };
    let res = await net.fetch(downloadUrl, request);
    if (res.status === 404 && downloadUrl !== legacyUrl) {
      await res.body?.cancel();
      res = await net.fetch(legacyUrl, request);
    }
    if (!res.ok) {
      throw new Error(`Patch download failed with HTTP ${res.status}`);
    }
    zipBuf = Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }

  const actualSha = crypto.createHash('sha256').update(zipBuf).digest('hex');
  if (zipBuf.length !== manifest.size_bytes || actualSha.toLowerCase() !== String(manifest.zip_sha256).toLowerCase()) {
    throw new Error('Downloaded patch checksum verification failed.');
  }

  const basePatches = patchesDir();
  fs.mkdirSync(basePatches, { recursive: true });
  const zipPath = path.join(basePatches, `${patchId}.download.zip`);
  const stagingRoot = path.join(basePatches, `${patchId}.staging`);
  const finalRoot = path.join(basePatches, patchId);

  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.writeFileSync(zipPath, zipBuf);

  try {
    await expandArchivePowerShell(zipPath, stagingRoot);
    if (!isValidRuntimeRoot(stagingRoot)) {
      throw new Error('Downloaded patch is incomplete (missing core app files).');
    }

    const updatesDest = path.join(stagingRoot, 'updates');
    fs.mkdirSync(updatesDest, { recursive: true });
    writeJsonAtomic(path.join(updatesDest, 'patch-manifest.json'), manifest);

    fs.rmSync(finalRoot, { recursive: true, force: true });
    fs.renameSync(stagingRoot, finalRoot);
  } finally {
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }

  const prev = readJsonSafe(activeStatePath(), {});
  writeJsonAtomic(activeStatePath(), {
    ...prev,
    shellVersion: app.getVersion(),
    activePatchId: patchId,
    stagedPatchId: patchId,
    patchBuiltAt: manifest.built_at || new Date().toISOString(),
    previousPatchId: currentRuntime.activePatchId,
    updatedAt: new Date().toISOString(),
  });

  pruneOldPatches(new Set([patchId, currentRuntime.activePatchId].filter(Boolean)));

  return {
    ok: true,
    patch_id: patchId,
    version: manifest.version,
    restartRequired: true,
  };
}

function setAutoPatchEnabled(enabled) {
  const prev = readJsonSafe(activeStatePath(), {});
  writeJsonAtomic(activeStatePath(), {
    ...prev,
    autoPatchEnabled: Boolean(enabled),
  });
  return Boolean(enabled);
}

module.exports = {
  resolveActiveRuntime,
  checkForPatch,
  downloadAndStagePatch,
  setAutoPatchEnabled,
};
