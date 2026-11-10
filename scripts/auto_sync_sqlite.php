<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("CLI only\n");
}

putenv('DB_DRIVER=sqlite');
require_once __DIR__ . '/../api/src/Autoloader.php';
\Zeedat\Autoloader::register();

use Zeedat\Services\CloudSyncService;

$quiet = in_array('--quiet', $argv, true);

function logLine(string $msg, bool $quiet = false): void {
    if (!$quiet) {
        $time = date('Y-m-d H:i:s');
        echo "[{$time}] {$msg}\n";
    }
}

try {
    logLine("Checking SQLite ➔ Cloud MySQL synchronization...", $quiet);

    $status = CloudSyncService::getStatus();

    if (empty($status['cloud_url'])) {
        logLine("Central Cloud URL not yet configured. Local SQLite storage active.", $quiet);
        exit(0);
    }

    if (!$status['is_online']) {
        logLine("Device is offline. All data safely saved in local SQLite file.", $quiet);
        exit(0);
    }

    logLine("Internet is online! Starting sync with: " . $status['cloud_url'], $quiet);

    // 1. Push pending local sales
    $pushRes = CloudSyncService::pushToCloud();
    if ($pushRes['success']) {
        logLine("PUSH: " . ($pushRes['message'] ?? 'OK'), $quiet);
    } else {
        logLine("PUSH Notice: " . ($pushRes['error'] ?? 'None'), $quiet);
    }

    // 2. Pull updated catalog from cloud
    $pullRes = CloudSyncService::pullFromCloud();
    if ($pullRes['success']) {
        logLine("PULL: " . ($pullRes['message'] ?? 'OK'), $quiet);
    } else {
        logLine("PULL Notice: " . ($pullRes['error'] ?? 'None'), $quiet);
    }

    exit(0);
} catch (Throwable $e) {
    logLine("Sync error: " . $e->getMessage(), $quiet);
    exit(1);
}
