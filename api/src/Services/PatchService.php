<?php
declare(strict_types=1);

namespace Zeedat\Services;

use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ZipArchive;

/**
 * Serves versioned patch manifests and delta-like runtime ZIP packages so
 * installed standalone desktop apps auto-update when the online server updates.
 */
class PatchService
{
    public static function manifest(): array
    {
        $root = dirname(__DIR__, 3);
        $manifestFile = $root . '/updates/patch-manifest.json';
        $zipFile = $root . '/updates/zeedat-patch.zip';

        if (is_file($manifestFile) && is_file($zipFile)) {
            $decoded = json_decode((string) file_get_contents($manifestFile), true);
            if (is_array($decoded) && !empty($decoded['patch_id']) && !empty($decoded['zip_sha256'])) {
                return $decoded;
            }
        }

        return self::buildDynamicManifestAndZip($root)['manifest'];
    }

    public static function streamDownload(): void
    {
        $root = dirname(__DIR__, 3);
        $zipFile = $root . '/updates/zeedat-patch.zip';

        if (!is_file($zipFile)) {
            $built = self::buildDynamicManifestAndZip($root);
            $zipFile = $built['zip_path'];
        }

        if (!$zipFile || !is_file($zipFile)) {
            http_response_code(404);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Update patch archive is not available on this server.']);
            exit;
        }

        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="zeedat-patch.zip"');
        header('Content-Length: ' . filesize($zipFile));
        header('Cache-Control: no-store');
        readfile($zipFile);
        exit;
    }

    private static function collectFiles(string $root): array
    {
        $files = [];
        $addFile = static function (string $rel) use ($root, &$files): void {
            $abs = $root . '/' . $rel;
            if (is_file($abs)) {
                $files[$rel] = $abs;
            }
        };

        $addDir = static function (string $relDir) use ($root, &$files): void {
            $absDir = $root . '/' . $relDir;
            if (!is_dir($absDir)) {
                return;
            }
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($absDir, RecursiveDirectoryIterator::SKIP_DOTS)
            );
            foreach ($it as $item) {
                if (!$item->isFile()) {
                    continue;
                }
                $rel = str_replace('\\', '/', substr($item->getPathname(), strlen($root) + 1));
                $files[$rel] = $item->getPathname();
            }
        };

        $addDir('dist');
        $addFile('api/index.php');
        $addFile('api/composer.json');
        $addDir('api/public');
        $addDir('api/src');
        $addFile('database/schema.sql');
        $addFile('database/sqlite_schema.sql');
        $addFile('database/setup.php');
        $addFile('scripts/setup_portable.php');
        $addFile('scripts/auto_sync_sqlite.php');
        $addFile('router.php');

        ksort($files, SORT_STRING);
        return $files;
    }

    private static function buildDynamicManifestAndZip(string $root): array
    {
        $files = self::collectFiles($root);
        $hash = hash_init('sha256');
        foreach ($files as $rel => $abs) {
            hash_update($hash, $rel . "\0" . (string) file_get_contents($abs));
        }
        $contentHash = hash_final($hash);
        $version = '0.1.0';
        $pkgPath = $root . '/package.json';
        if (is_file($pkgPath)) {
            $pkg = json_decode((string) file_get_contents($pkgPath), true);
            if (is_array($pkg) && !empty($pkg['version'])) {
                $version = (string) $pkg['version'];
            }
        }

        $patchId = $version . '-' . substr($contentHash, 0, 12);
        $cacheDir = rtrim(sys_get_temp_dir(), '/\\') . '/zeedat_updates';
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0755, true);
        }

        $zipPath = $cacheDir . '/zeedat-patch-' . $patchId . '.zip';
        if (!is_file($zipPath) && class_exists(ZipArchive::class)) {
            $tmpZip = $zipPath . '.' . bin2hex(random_bytes(4)) . '.tmp';
            $zip = new ZipArchive();
            if ($zip->open($tmpZip, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true) {
                foreach ($files as $rel => $abs) {
                    $zip->addFile($abs, $rel);
                }
                $zip->close();
                @rename($tmpZip, $zipPath);
            }
        }

        $zipExists = is_file($zipPath);
        return [
            'zip_path' => $zipExists ? $zipPath : null,
            'manifest' => [
                'app_id' => 'com.zeedat.pos',
                'version' => $version,
                'patch_id' => $patchId,
                'content_sha256' => $contentHash,
                'zip_sha256' => $zipExists ? hash_file('sha256', $zipPath) : '',
                'size_bytes' => $zipExists ? filesize($zipPath) : 0,
                'files_count' => count($files),
                'built_at' => gmdate('c'),
                'download_route' => 'api/index.php?route=update.download',
            ],
        ];
    }
}
