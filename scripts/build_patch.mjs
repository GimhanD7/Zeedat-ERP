/**
 * Builds deterministic patch artifacts in updates/:
 *   - updates/zeedat-patch.zip   (compressed dist + api + database + scripts + router)
 *   - updates/patch-manifest.json (version, patch_id, zip_sha256, size_bytes, built_at)
 *
 * Uses only Node built-in modules so it runs identically on Windows and Linux CI.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const repoRoot = path.resolve(import.meta.dirname, '..');
const distDir = path.join(repoRoot, 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  throw new Error("Missing dist/index.html. Run 'npm run build' first.");
}

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

function walkFiles(absDir, relPrefix, out, filterFn) {
  if (!fs.existsSync(absDir)) return;
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    const rel = `${relPrefix}/${entry.name}`;
    if (filterFn && !filterFn(rel, entry.isDirectory())) continue;
    if (entry.isDirectory()) {
      walkFiles(abs, rel, out, filterFn);
    } else if (entry.isFile()) {
      out.push({ abs, rel });
    }
  }
}

function collectPayloadFiles() {
  const files = [];
  const addSingle = rel => {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      files.push({ abs, rel: rel.replace(/\\/g, '/') });
    }
  };

  walkFiles(distDir, 'dist', files);
  addSingle('api/index.php');
  addSingle('api/composer.json');
  walkFiles(path.join(repoRoot, 'api/public'), 'api/public', files);
  walkFiles(path.join(repoRoot, 'api/src'), 'api/src', files);
  addSingle('database/schema.sql');
  addSingle('database/sqlite_schema.sql');
  addSingle('database/setup.php');
  addSingle('scripts/setup_portable.php');
  addSingle('scripts/auto_sync_sqlite.php');
  addSingle('router.php');

  files.sort((a, b) => a.rel.localeCompare(b.rel));
  return files;
}

// Standard IEEE 802.3 CRC32 table for ZIP entries
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipBuffer(entries) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.rel, 'utf8');
    const raw = entry.data;
    const compressed = zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = compressed.length < raw.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? compressed : raw;
    const crc = crc32(raw);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed
    localHeader.writeUInt16LE(0x0800, 6);     // UTF-8 filename flag
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);         // Mod time (fixed for determinism)
    localHeader.writeUInt16LE(0x5421, 12);    // Mod date (fixed for determinism)
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDir = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDir, eocd]);
}

const fileList = collectPayloadFiles();
const hash = crypto.createHash('sha256');
const zipEntries = [];

for (const item of fileList) {
  const data = fs.readFileSync(item.abs);
  hash.update(item.rel);
  hash.update('\0');
  hash.update(data);
  zipEntries.push({ rel: item.rel, data });
}

const contentHash = hash.digest('hex');
const patchId = `${pkg.version || '0.1.0'}-${contentHash.slice(0, 12)}`;
const zipBuffer = buildZipBuffer(zipEntries);
const zipSha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex');

const updatesDir = path.join(repoRoot, 'updates');
fs.mkdirSync(updatesDir, { recursive: true });
const zipPath = path.join(updatesDir, 'zeedat-patch.zip');
const manifestPath = path.join(updatesDir, 'patch-manifest.json');

fs.writeFileSync(zipPath, zipBuffer);

const manifest = {
  app_id: pkg.build?.appId || 'com.zeedat.pos',
  version: pkg.version || '0.1.0',
  patch_id: patchId,
  content_sha256: contentHash,
  zip_sha256: zipSha256,
  size_bytes: zipBuffer.length,
  files_count: zipEntries.length,
  built_at: new Date().toISOString(),
  download_route: 'api/index.php?route=update.download',
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`[OK] Patch created: ${patchId} (${(zipBuffer.length / 1024).toFixed(1)} KB, ${zipEntries.length} files)`);
