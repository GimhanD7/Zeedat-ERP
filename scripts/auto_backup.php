<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    echo "CLI only\n";
    exit(1);
}

require_once __DIR__ . '/../api/src/Autoloader.php';
\Zeedat\Autoloader::register();

use Zeedat\Repositories\BaseRepository;
use Zeedat\Services\BackupService;

$force = in_array('--force', $argv, true);
$quiet = in_array('--quiet', $argv, true);

function logMsg(string $msg, bool $quiet = false): void {
    if (!$quiet) {
        $time = date('Y-m-d H:i:s');
        echo "[{$time}] {$msg}\n";
    }
}

try {
    logMsg("Checking Zeedat ERP auto-backup service...", $quiet);
    
    $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
    $autoSync = (bool) ($settings['auto_sync_enabled'] ?? 1);
    $interval = (int) ($settings['sync_interval_minutes'] ?? 15);
    $lastSync = $settings['last_synced_at'] ?? null;

    if (!$autoSync && !$force) {
        logMsg("Auto-sync is currently disabled in shop settings. Skipping.", $quiet);
        exit(0);
    }

    if (!$force && $lastSync) {
        $minutesSinceLast = (time() - strtotime($lastSync)) / 60;
        if ($minutesSinceLast < $interval) {
            logMsg("Last sync was {$minutesSinceLast} minutes ago. Next scheduled in " . round($interval - $minutesSinceLast) . " minutes. Skipping.", $quiet);
            exit(0);
        }
    }

    // Determine default branch for this local installation
    $branch = BaseRepository::one('SELECT id, name FROM branches ORDER BY id ASC LIMIT 1');
    $branchId = $branch ? (int) $branch['id'] : null;

    logMsg("Running backup for: " . ($branch['name'] ?? 'Local HQ') . "...", $quiet);
    $result = BackupService::createBackup($branchId, 'auto_sync');

    logMsg("Result: Status=" . $result['status'] . ", File=" . $result['filename'] . " (" . round($result['file_size'] / 1024, 1) . " KB)", $quiet);
    logMsg("Message: " . $result['message'], $quiet);

    if ($result['error']) {
        logMsg("Notice: " . $result['error'], $quiet);
    }

    exit(0);
} catch (Throwable $e) {
    logMsg("ERROR during auto backup: " . $e->getMessage(), $quiet);
    exit(1);
}
