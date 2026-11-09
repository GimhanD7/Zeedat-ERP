<?php
declare(strict_types=1);

namespace Zeedat\Services;

use PDO;
use Throwable;
use Zeedat\Config\Database;
use Zeedat\Repositories\BaseRepository;

class BackupService {
    public static function getBackupDir(): string {
        $dir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'backups';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        return $dir;
    }

    /**
     * Checks if internet connectivity is currently accessible.
     */
    public static function isInternetAvailable(): bool {
        // Test lightweight DNS or HTTP socket with a short 2-second timeout
        $connected = @fsockopen('8.8.8.8', 53, $errno, $errstr, 2);
        if (is_resource($connected)) {
            fclose($connected);
            return true;
        }

        $connected = @fsockopen('1.1.1.1', 53, $errno, $errstr, 2);
        if (is_resource($connected)) {
            fclose($connected);
            return true;
        }

        return false;
    }

    /**
     * Generates a complete SQL dump of the zeedat_pos database.
     */
    public static function generateSqlDump(): string {
        $db = Database::getConnection();
        $dbName = $db->query('SELECT DATABASE()')->fetchColumn() ?: 'zeedat_pos';
        $timestamp = date('Y-m-d H:i:s');

        $out = "-- ============================================================\n";
        echo ""; // dummy to avoid unused
        $out .= "-- ZEEDAT ERP AUTOMATED DATABASE BACKUP\n";
        $out .= "-- Database: {$dbName}\n";
        $out .= "-- Generated at: {$timestamp} (Asia/Colombo)\n";
        $out .= "-- Host: 127.0.0.1\n";
        $out .= "-- ============================================================\n\n";
        $out .= "SET FOREIGN_KEY_CHECKS=0;\n";
        $out .= "SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";\n";
        $out .= "SET NAMES utf8mb4;\n\n";

        // Fetch all tables
        $tables = $db->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_COLUMN);

        foreach ($tables as $table) {
            // Get CREATE TABLE
            $createRow = $db->query("SHOW CREATE TABLE `{$table}`")->fetch(PDO::FETCH_NUM);
            $createSql = $createRow[1] ?? '';

            $out .= "-- ------------------------------------------------------------\n";
            $out .= "-- Table structure for `{$table}`\n";
            $out .= "-- ------------------------------------------------------------\n";
            $out .= "DROP TABLE IF EXISTS `{$table}`;\n";
            $out .= $createSql . ";\n\n";

            // Get row data
            $stmt = $db->query("SELECT * FROM `{$table}`");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if (empty($rows)) {
                $out .= "\n";
                continue;
            }

            $out .= "-- Dumping data for `{$table}` (" . count($rows) . " rows)\n";
            
            // Chunk rows for efficient inserts
            $chunks = array_chunk($rows, 100);
            foreach ($chunks as $chunk) {
                $columns = array_keys($chunk[0]);
                $colNames = implode('`, `', $columns);
                $out .= "INSERT INTO `{$table}` (`{$colNames}`) VALUES\n";

                $valStrings = [];
                foreach ($chunk as $row) {
                    $vals = [];
                    foreach ($row as $val) {
                        if ($val === null) {
                            $vals[] = 'NULL';
                        } elseif (is_numeric($val) && !is_string($val)) {
                            $vals[] = (string) $val;
                        } else {
                            $vals[] = $db->quote((string) $val);
                        }
                    }
                    $valStrings[] = '(' . implode(', ', $vals) . ')';
                }
                $out .= implode(",\n", $valStrings) . ";\n";
            }
            $out .= "\n";
        }

        $out .= "SET FOREIGN_KEY_CHECKS=1;\n";
        $out .= "-- Backup completed at: " . date('Y-m-d H:i:s') . "\n";

        return $out;
    }

    /**
     * Executes backup process:
     * 1. Creates local .sql file on this machine.
     * 2. Checks internet connectivity.
     * 3. If internet is connected and cloud backup URL is set, transmits to the server.
     * 4. Logs event to database and audit trail.
     */
    public static function createBackup(?int $branchId = null, string $trigger = 'manual'): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $branchName = 'HQ';
        if ($branchId) {
            $branchRow = BaseRepository::one('SELECT name FROM branches WHERE id=?', [$branchId]);
            if ($branchRow) {
                $branchName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $branchRow['name']);
            }
        }

        $dateStr = date('Y-m-d_His');
        $filename = "zeedat_backup_{$branchName}_{$dateStr}.sql";
        $dir = self::getBackupDir();
        $filePath = $dir . DIRECTORY_SEPARATOR . $filename;

        // Generate and save to local machine first (works completely offline)
        $sqlDump = self::generateSqlDump();
        file_put_contents($filePath, $sqlDump);
        $fileSize = filesize($filePath) ?: strlen($sqlDump);

        $status = 'local_saved';
        $errorMsg = null;
        $remoteUrl = trim($settings['cloud_backup_url'] ?? '');
        $apiKey = trim($settings['cloud_api_key'] ?? '');
        $isOnline = self::isInternetAvailable();

        // If online and remote server URL is configured, push to server
        if ($isOnline && !empty($remoteUrl)) {
            $uploadResult = self::uploadFileToCloud($filePath, $remoteUrl, $apiKey, $branchName);
            if ($uploadResult['success']) {
                $status = 'synced';
                BaseRepository::run('UPDATE settings SET last_synced_at=NOW() WHERE id=1');
            } else {
                $errorMsg = $uploadResult['error'] ?? 'Upload failed.';
            }
        } elseif (!$isOnline) {
            $errorMsg = 'Offline (Local machine saved successfully. Will auto-sync when internet reconnects).';
        } elseif (empty($remoteUrl)) {
            $errorMsg = 'Local machine saved. (No cloud server URL configured).';
        }

        // Record in backup_logs
        $logId = BaseRepository::insert(
            'INSERT INTO backup_logs (branch_id, filename, file_size, status, remote_url, error_message) VALUES (?,?,?,?,?,?)',
            [$branchId, $filename, $fileSize, $status, $remoteUrl ?: null, $errorMsg]
        );

        return [
            'id' => $logId,
            'filename' => $filename,
            'file_size' => $fileSize,
            'status' => $status,
            'is_online' => $isOnline,
            'remote_url' => $remoteUrl,
            'message' => $status === 'synced' 
                ? 'Backup successfully saved locally and synced to cloud server!' 
                : ($isOnline ? 'Backup saved locally on this machine.' : 'Offline mode: Backup saved locally. Will sync automatically once internet reconnects.'),
            'error' => $errorMsg,
            'created_at' => date('Y-m-d H:i:s'),
        ];
    }

    /**
     * Uploads the backup file to the remote central server.
     */
    private static function uploadFileToCloud(string $filePath, string $remoteUrl, string $apiKey, string $branchName): array {
        if (!function_exists('curl_init')) {
            return ['success' => false, 'error' => 'cURL PHP extension is not enabled.'];
        }

        $ch = curl_init();
        $cfile = new \CURLFile($filePath, 'application/sql', basename($filePath));
        $postFields = [
            'backup_file' => $cfile,
            'branch' => $branchName,
            'timestamp' => date('c'),
        ];

        $headers = [
            'Authorization: Bearer ' . $apiKey,
            'User-Agent: Zeedat-POS-LocalSync/1.0',
        ];

        curl_setopt($ch, CURLOPT_URL, $remoteUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Allow self-signed or LAN setups

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['success' => false, 'error' => 'Network error: ' . $curlError];
        }

        if ($httpCode >= 200 && $httpCode < 300) {
            return ['success' => true, 'response' => $response];
        }

        return ['success' => false, 'error' => "Server responded with HTTP {$httpCode}: {$response}"];
    }

    /**
     * Receiver on the central cloud server to receive and store incoming branch backups.
     */
    public static function handleIncomingBackup(array $headers, array $post, array $files): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $expectedKey = trim($settings['cloud_api_key'] ?? '');

        // Verify Bearer token
        $authHeader = $headers['authorization'] ?? $headers['Authorization'] ?? '';
        $token = '';
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            $token = trim($matches[1]);
        }

        if (!empty($expectedKey) && ($token === '' || !hash_equals($expectedKey, $token))) {
            return ['success' => false, 'code' => 401, 'error' => 'Unauthorized: Invalid API Key.'];
        }

        if (empty($files['backup_file']) || $files['backup_file']['error'] !== UPLOAD_ERR_OK) {
            return ['success' => false, 'code' => 400, 'error' => 'No valid backup file was uploaded.'];
        }

        $branch = preg_replace('/[^a-zA-Z0-9_-]/', '_', $post['branch'] ?? 'Unknown');
        $receivedDir = self::getBackupDir() . DIRECTORY_SEPARATOR . 'cloud_received' . DIRECTORY_SEPARATOR . $branch;
        if (!is_dir($receivedDir)) {
            mkdir($receivedDir, 0755, true);
        }

        $filename = basename($files['backup_file']['name']);
        $targetPath = $receivedDir . DIRECTORY_SEPARATOR . $filename;
        if (!move_uploaded_file($files['backup_file']['tmp_name'], $targetPath)) {
            return ['success' => false, 'code' => 500, 'error' => 'Failed to write backup file on server.'];
        }

        return [
            'success' => true,
            'code' => 200,
            'filename' => $filename,
            'size' => filesize($targetPath),
            'branch' => $branch,
            'received_at' => date('Y-m-d H:i:s'),
        ];
    }

    /**
     * Lists recent local backups and their sync status.
     */
    public static function getBackupHistory(int $limit = 25): array {
        return BaseRepository::rows(
            "SELECT b.id, b.branch_id, br.name branch_name, b.filename, b.file_size, b.status, b.remote_url, b.error_message, b.created_at
             FROM backup_logs b
             LEFT JOIN branches br ON br.id=b.branch_id
             ORDER BY b.id DESC
             LIMIT {$limit}"
        );
    }

    /**
     * Returns full status summary for dashboard and settings.
     */
    public static function getSyncSummary(): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $isOnline = self::isInternetAvailable();
        $lastLog = BaseRepository::one('SELECT * FROM backup_logs ORDER BY id DESC LIMIT 1');
        $totalBackups = (int) BaseRepository::scalar('SELECT COUNT(*) FROM backup_logs');

        // Check local disk space in MB
        $dir = self::getBackupDir();
        $freeSpaceMb = round(disk_free_space($dir) / (1024 * 1024), 2);

        return [
            'is_online' => $isOnline,
            'cloud_backup_url' => $settings['cloud_backup_url'] ?? '',
            'cloud_api_key' => $settings['cloud_api_key'] ?? '',
            'auto_sync_enabled' => (bool) ($settings['auto_sync_enabled'] ?? 1),
            'sync_interval_minutes' => (int) ($settings['sync_interval_minutes'] ?? 15),
            'last_synced_at' => $settings['last_synced_at'] ?? null,
            'last_backup' => $lastLog,
            'total_backups_created' => $totalBackups,
            'free_disk_space_mb' => $freeSpaceMb,
            'local_storage_dir' => $dir,
        ];
    }
}

