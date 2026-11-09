<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\UserRepository;
use Zeedat\Services\BackupService;
use Zeedat\Support\ApiError;
use Zeedat\Support\Response;
use Zeedat\Support\Validator;

class BackupController {
    public static function getSummary(): array {
        return BackupService::getSyncSummary();
    }

    public static function getHistory(): array {
        return BackupService::getBackupHistory(50);
    }

    public static function createBackup(array $user, int $branch, array $body): array {
        $branchId = $branch ?: ($user['branch_id'] ? (int) $user['branch_id'] : null);
        $result = BackupService::createBackup($branchId, 'manual');
        
        UserRepository::logAudit(
            (int) $user['id'],
            $branchId,
            'backup.create',
            ['filename' => $result['filename'], 'status' => $result['status'], 'size' => $result['file_size']]
        );

        return $result;
    }

    public static function saveSettings(array $user, array $body): array {
        $cloudUrl = trim($body['cloud_backup_url'] ?? '');
        $apiKey = trim($body['cloud_api_key'] ?? '');
        $autoSync = !empty($body['auto_sync_enabled']) ? 1 : 0;
        $interval = max(5, min(1440, (int) ($body['sync_interval_minutes'] ?? 15)));

        BaseRepository::run(
            'UPDATE settings SET cloud_backup_url=?, cloud_api_key=?, auto_sync_enabled=?, sync_interval_minutes=? WHERE id=1',
            [$cloudUrl, $apiKey, $autoSync, $interval]
        );

        UserRepository::logAudit(
            (int) $user['id'],
            $user['branch_id'] ? (int) $user['branch_id'] : null,
            'settings.backup_sync',
            ['cloud_backup_url' => $cloudUrl, 'auto_sync' => $autoSync, 'interval' => $interval]
        );

        return BackupService::getSyncSummary();
    }

    public static function download(array $user, array $query): void {
        $filename = basename($query['file'] ?? '');
        if (!$filename || !str_ends_with($filename, '.sql')) {
            throw new ApiError('Invalid backup file name.', 400);
        }

        $dir = BackupService::getBackupDir();
        $filePath = $dir . DIRECTORY_SEPARATOR . $filename;
        if (!is_file($filePath)) {
            throw new ApiError('Backup file not found.', 404);
        }

        header('Content-Description: File Transfer');
        header('Content-Type: application/sql');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . filesize($filePath));
        header('Cache-Control: must-revalidate');
        header('Pragma: public');
        readfile($filePath);
        exit;
    }

    public static function receive(): void {
        $headers = getallheaders() ?: [];
        $result = BackupService::handleIncomingBackup($headers, $_POST, $_FILES);
        
        if (!$result['success']) {
            Response::json(['error' => $result['error']], $result['code'] ?? 400);
        }

        Response::json($result);
    }
}
