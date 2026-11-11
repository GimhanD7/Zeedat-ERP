import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { defineConfig } from 'vite';

const PHP_ORIGIN = process.env.PHP_ORIGIN || 'http://127.0.0.1:8081';

function autoPhpBackendPlugin() {
  let phpProc = null;

  const isPortOpen = (host, port) =>
    new Promise(resolve => {
      const sock = net.createConnection({ host, port });
      const done = ok => {
        sock.destroy();
        resolve(ok);
      };
      sock.setTimeout(300);
      sock.once('connect', () => done(true));
      sock.once('timeout', () => done(false));
      sock.once('error', () => done(false));
    });

  return {
    name: 'zeedat-auto-php-backend',
    apply: 'serve',
    async configureServer(server) {
      if (process.env.PHP_AUTOSTART === '0') return;
      const target = new URL(PHP_ORIGIN);
      const host = target.hostname || '127.0.0.1';
      const port = Number(target.port) || 8081;

      if (await isPortOpen(host, port)) return;

      const xamppPhp = 'C:\\xampp\\php\\php.exe';
      const phpBin = fs.existsSync(xamppPhp) ? xamppPhp : 'php';
      const routerPath = path.resolve(process.cwd(), 'router.php');

      phpProc = spawn(phpBin, ['-S', `${host}:${port}`, routerPath], {
        cwd: process.cwd(),
        stdio: 'ignore',
        windowsHide: true,
      });
      phpProc.on('error', err => {
        console.warn(`[zeedat] Failed to start PHP backend (${phpBin}): ${err.message}`);
      });

      const stopPhp = () => {
        if (phpProc && !phpProc.killed) {
          try {
            phpProc.kill();
          } catch {
            // ignore cleanup errors
          }
          phpProc = null;
        }
      };

      server.httpServer?.once('close', stopPhp);
      process.once('exit', stopPhp);

      // Wait briefly until PHP begins listening so initial proxy requests succeed immediately
      for (let i = 0; i < 15; i++) {
        if (await isPortOpen(host, port)) break;
        await new Promise(r => setTimeout(r, 100));
      }
    },
  };
}

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic' },
  plugins: [autoPhpBackendPlugin()],
  server: {
    host: '127.0.0.1',
    proxy: { '/api': { target: PHP_ORIGIN } },
  },
});
