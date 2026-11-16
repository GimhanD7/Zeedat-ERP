const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MAX_INSTALLER_BYTES = 300 * 1024 * 1024;

function updateUrl(serverUrl, filename) {
  const url = new URL(`/downloads/${filename}`, serverUrl);
  if (url.protocol !== 'https:') throw new Error('Installer updates require HTTPS.');
  return url;
}

async function getInstallerUpdate(fetch, serverUrl, installedBuild) {
  const response = await fetch(updateUrl(serverUrl, 'installer-update.json').href, {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not check for a Windows update.');
  const manifest = await response.json();
  if (!manifest || !Number.isSafeInteger(manifest.build) || manifest.build < 1
      || typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(manifest.version)
      || !Number.isSafeInteger(manifest.size_bytes) || manifest.size_bytes < 1
      || manifest.size_bytes > MAX_INSTALLER_BYTES
      || typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) {
    throw new Error('The Windows update manifest is invalid.');
  }
  return manifest.build > installedBuild ? manifest : null;
}

async function downloadInstaller(fetch, serverUrl, manifest, directory) {
  await fs.promises.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `installer-${crypto.randomUUID()}.tmp`);
  const installer = path.join(directory, 'Zeedat-POS-Update.exe');
  const url = updateUrl(serverUrl, 'Zeedat-POS-Setup.exe');
  url.searchParams.set('build', String(manifest.build));
  try {
    const response = await fetch(url.href, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(600000),
    });
    if (!response.ok || !response.body) throw new Error('Could not download Windows Setup.');
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    const verify = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > manifest.size_bytes) return callback(new Error('The Windows update is larger than expected.'));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), verify, fs.createWriteStream(temporary, { flags: 'wx' }));
    if (bytes !== manifest.size_bytes || hash.digest('hex') !== manifest.sha256) {
      throw new Error('The Windows update could not be verified. Check again before retrying.');
    }
    await fs.promises.rename(temporary, installer);
    return installer;
  } finally {
    await fs.promises.unlink(temporary).catch(() => {});
  }
}

module.exports = { getInstallerUpdate, downloadInstaller };
