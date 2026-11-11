const { app, dialog } = require('electron');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

function getAppDataBase() {
  const localAppData = process.env.LOCALAPPDATA || app.getPath('appData');
  return path.join(localAppData, 'ZeedatPOS');
}

function getBundledPaths() {
  if (app.isPackaged) {
    const runtimeBase = path.join(process.resourcesPath, 'runtime');
    return {
      phpDir: path.join(runtimeBase, 'php'),
      appDir: path.join(runtimeBase, 'app'),
    };
  }
  const repoRoot = path.resolve(__dirname, '..');
  const stagedPhp = path.join(repoRoot, 'electron-runtime', 'php');
  const phpDir = fs.existsSync(path.join(stagedPhp, 'php.exe'))
    ? stagedPhp
    : 'C:\\xampp\\php';
  return {
    phpDir,
    appDir: repoRoot,
  };
}

function writePhpIni(runtimeRoot, phpDir, dataDir) {
  const sessionsDir = path.join(dataDir, 'sessions');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });

  const extDir = path.join(phpDir, 'ext');
  const bundledCa = path.join(phpDir, 'cacert.pem');
  const xamppCa = 'C:\\xampp\\apache\\bin\\curl-ca-bundle.crt';
  const caBundle = fs.existsSync(bundledCa) ? bundledCa : xamppCa;

  const lines = [
    `extension_dir="${extDir.replace(/\\/g, '/')}"`,
    'extension=pdo_sqlite',
    'extension=sqlite3',
    'extension=pdo_mysql',
    'extension=mysqli',
    'extension=curl',
    'extension=mbstring',
    'extension=openssl',
    'extension=fileinfo',
    fs.existsSync(caBundle) ? `curl.cainfo="${caBundle.replace(/\\/g, '/')}"` : '',
    fs.existsSync(caBundle) ? `openssl.cafile="${caBundle.replace(/\\/g, '/')}"` : '',
    `session.save_path="${sessionsDir.replace(/\\/g, '/')}"`,
    'display_errors=Off',
    'log_errors=On',
    `error_log="${path.join(dataDir, 'php.log').replace(/\\/g, '/')}"`,
    'date.timezone=Asia/Colombo',
  ].filter(Boolean);

  const iniDir = path.join(runtimeRoot, 'php-config');
  fs.mkdirSync(iniDir, { recursive: true });
  fs.writeFileSync(path.join(iniDir, 'php.ini'), lines.join('\r\n') + '\r\n', 'utf8');
  return iniDir;
}

function dbConfigPath() {
  return path.join(getAppDataBase(), 'data', 'db-config.json');
}

function readDbConfig() {
  try {
    const raw = fs.readFileSync(dbConfigPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode === 'mysql' ? 'mysql' : 'sqlite',
      db_host: String(parsed.db_host || ''),
      db_port: String(parsed.db_port || '3306'),
      db_name: String(parsed.db_name || ''),
      db_user: String(parsed.db_user || ''),
      db_password: String(parsed.db_password || ''),
    };
  } catch {
    return {
      mode: 'sqlite',
      db_host: '',
      db_port: '3306',
      db_name: '',
      db_user: '',
      db_password: '',
    };
  }
}

function getPublicDbConfig() {
  const cfg = readDbConfig();
  return {
    mode: cfg.mode,
    db_host: cfg.db_host,
    db_port: cfg.db_port,
    db_name: cfg.db_name,
    db_user: cfg.db_user,
    has_password: Boolean(cfg.db_password),
  };
}

function resolvePhpRuntimeAndIni() {
  const { phpDir } = getBundledPaths();
  const phpExe = path.join(phpDir, 'php.exe');
  if (!fs.existsSync(phpExe)) {
    throw new Error(`Bundled PHP runtime not found at ${phpExe}`);
  }
  const baseDir = getAppDataBase();
  const dataDir = path.join(baseDir, 'data');
  const runtimeDir = path.join(baseDir, 'runtime');
  const iniDir = writePhpIni(runtimeDir, phpDir, dataDir);
  return { phpExe, dataDir, iniDir };
}

function saveDbConfig(next) {
  const current = readDbConfig();
  const mode = next?.mode === 'mysql' ? 'mysql' : 'sqlite';
  const password = next?.clear_password
    ? ''
    : (next?.db_password !== undefined && next?.db_password !== '' ? String(next.db_password) : current.db_password);

  const payload = {
    mode,
    db_host: String(next?.db_host ?? current.db_host).trim(),
    db_port: String((next?.db_port ?? current.db_port) || '3306').trim() || '3306',
    db_name: String(next?.db_name ?? current.db_name).trim(),
    db_user: String(next?.db_user ?? current.db_user).trim(),
    db_password: password,
    updated_at: new Date().toISOString(),
  };

  const target = dbConfigPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, target);
  return getPublicDbConfig();
}

function testMysqlConnection(candidate) {
  const current = readDbConfig();
  const host = String(candidate?.db_host ?? current.db_host).trim();
  const port = String((candidate?.db_port ?? current.db_port) || '3306').trim() || '3306';
  const name = String(candidate?.db_name ?? current.db_name).trim();
  const user = String(candidate?.db_user ?? current.db_user).trim();
  const password = (candidate?.db_password !== undefined && candidate?.db_password !== '')
    ? String(candidate.db_password)
    : current.db_password;

  if (!host || !name || !user) {
    return { ok: false, error: 'Host, database name, and username are required.' };
  }

  try {
    const { phpExe, iniDir } = resolvePhpRuntimeAndIni();
    const out = execFileSync(
      phpExe,
      [
        '-r',
        '$dsn="mysql:host=".getenv("TEST_DB_HOST").";port=".getenv("TEST_DB_PORT").";dbname=".getenv("TEST_DB_NAME").";charset=utf8mb4"; ' +
        '$pdo=new PDO($dsn, getenv("TEST_DB_USER"), getenv("TEST_DB_PASS"), [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT=>4]); ' +
        'echo json_encode(["ok"=>true,"serverVersion"=>$pdo->getAttribute(PDO::ATTR_SERVER_VERSION)]);',
      ],
      {
        env: {
          ...process.env,
          PHPRC: iniDir,
          PHP_INI_SCAN_DIR: '',
          TEST_DB_HOST: host,
          TEST_DB_PORT: port,
          TEST_DB_NAME: name,
          TEST_DB_USER: user,
          TEST_DB_PASS: password,
        },
        windowsHide: true,
        encoding: 'utf8',
        timeout: 6000,
      }
    ).trim();
    return JSON.parse(out);
  } catch (err) {
    const detail = err?.stderr?.toString()?.trim() || err?.message || 'Unable to connect to MySQL server.';
    return { ok: false, error: detail.replace(/^Fatal error:\s*Uncaught PDOException:\s*/i, '').split('\n')[0] };
  }
}

function buildPhpEnv(iniDir, dataDir, dbCfg) {
  const useMysql = dbCfg?.mode === 'mysql' && dbCfg.db_host && dbCfg.db_name && dbCfg.db_user;
  const env = {
    ...process.env,
    PHPRC: iniDir,
    PHP_INI_SCAN_DIR: '',
    DB_DRIVER: useMysql ? 'mysql' : 'sqlite',
    ZEEDAT_SQLITE_PATH: path.join(dataDir, 'zeedat_local.db'),
    ZEEDAT_BACKUP_PATH: path.join(dataDir, 'backups'),
    ZEEDAT_PORTABLE: '1',
  };
  if (useMysql) {
    env.DB_HOST = dbCfg.db_host;
    env.DB_PORT = dbCfg.db_port || '3306';
    env.DB_NAME = dbCfg.db_name;
    env.DB_USER = dbCfg.db_user;
    env.DB_PASSWORD = dbCfg.db_password || '';
    env.DB_AUTO_MIGRATE = '1';
  }
  return env;
}

function ensureDatabaseInitialized(phpExe, activeRoot, env, dataDir) {
  const dbPath = path.join(dataDir, 'zeedat_local.db');
  if (fs.existsSync(dbPath)) return;

  const setupScript = path.join(activeRoot, 'scripts', 'setup_portable.php');
  if (!fs.existsSync(setupScript)) return;

  const output = execFileSync(phpExe, [setupScript], {
    cwd: activeRoot,
    env,
    windowsHide: true,
    encoding: 'utf8',
  }).trim();

  if (output) {
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'Zeedat POS Setup',
      message: 'Local offline database created.',
      detail: output,
    });
  }
}

function readConfiguredServerUrl(phpExe, activeRoot, env) {
  try {
    const out = execFileSync(
      phpExe,
      [
        '-r',
        'require "api/src/Autoloader.php"; Zeedat\\Autoloader::register(); $pdo=Zeedat\\Config\\Database::getConnection(); echo (string)$pdo->query("SELECT cloud_backup_url FROM settings WHERE id=1")->fetchColumn();',
      ],
      { cwd: activeRoot, env, windowsHide: true, encoding: 'utf8', timeout: 4000 }
    );
    return (out || '').trim();
  } catch {
    return '';
  }
}

function isPortAvailable(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, '127.0.0.1');
  });
}

async function pickLocalPort() {
  if (await isPortAvailable(18081)) return 18081;
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 18082;
      srv.close(() => resolve(port));
    });
  });
}

function waitForTcpReady(host, port, timeoutMs = 6000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = new net.Socket();
      sock.setTimeout(300);
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      const retry = () => {
        sock.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error('Local PHP backend did not respond in time.'));
        } else {
          setTimeout(tryConnect, 60);
        }
      };
      sock.once('error', retry);
      sock.once('timeout', retry);
      sock.connect(port, host);
    };
    tryConnect();
  });
}

async function startPhpServer(activeRoot) {
  const { phpExe, dataDir, iniDir } = resolvePhpRuntimeAndIni();
  const dbCfg = readDbConfig();
  const sqliteEnv = buildPhpEnv(iniDir, dataDir, { mode: 'sqlite' });
  ensureDatabaseInitialized(phpExe, activeRoot, sqliteEnv, dataDir);
  const env = buildPhpEnv(iniDir, dataDir, dbCfg);

  const routerPath = path.join(activeRoot, 'router.php');
  if (!fs.existsSync(routerPath)) {
    throw new Error(`Missing router.php in ${activeRoot}`);
  }

  const port = await pickLocalPort();
  const child = spawn(phpExe, ['-S', `127.0.0.1:${port}`, routerPath], {
    cwd: activeRoot,
    env,
    windowsHide: true,
    stdio: 'ignore',
  });

  let exitedEarly = false;
  child.once('exit', code => {
    exitedEarly = true;
    if (code && code !== 0) {
      console.error(`PHP backend exited with code ${code}`);
    }
  });

  await waitForTcpReady('127.0.0.1', port, 6000);
  if (exitedEarly) {
    throw new Error('Bundled PHP backend terminated unexpectedly during startup.');
  }

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    process: child,
    phpExe,
    env,
    dataDir,
    readCloudUrl: () => readConfiguredServerUrl(phpExe, activeRoot, env),
  };
}

function stopPhpServer(handle) {
  if (!handle || !handle.process) return;
  try {
    if (!handle.process.killed) {
      handle.process.kill();
    }
  } catch (err) {
    console.error('Failed stopping PHP backend:', err);
  }
}

module.exports = {
  getAppDataBase,
  getBundledPaths,
  getPublicDbConfig,
  saveDbConfig,
  testMysqlConnection,
  startPhpServer,
  stopPhpServer,
};
