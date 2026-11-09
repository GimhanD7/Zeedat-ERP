<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/src/Autoloader.php';
\Zeedat\Autoloader::register();

use Zeedat\Repositories\BaseRepository;

try {
    BaseRepository::run("
        CREATE TABLE IF NOT EXISTS backup_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            branch_id INT NULL,
            filename VARCHAR(255) NOT NULL,
            file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
            status ENUM('local_saved','synced','failed') NOT NULL DEFAULT 'local_saved',
            remote_url VARCHAR(255) NULL,
            error_message TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX(status, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // Also add cloud backup config columns to settings if they don't exist
    $cols = BaseRepository::rows("SHOW COLUMNS FROM settings LIKE 'cloud_backup_url'");
    if (empty($cols)) {
        BaseRepository::run("ALTER TABLE settings ADD COLUMN cloud_backup_url VARCHAR(255) NOT NULL DEFAULT ''");
        BaseRepository::run("ALTER TABLE settings ADD COLUMN cloud_api_key VARCHAR(255) NOT NULL DEFAULT ''");
        BaseRepository::run("ALTER TABLE settings ADD COLUMN auto_sync_enabled TINYINT(1) NOT NULL DEFAULT 1");
        BaseRepository::run("ALTER TABLE settings ADD COLUMN sync_interval_minutes INT NOT NULL DEFAULT 15");
        BaseRepository::run("ALTER TABLE settings ADD COLUMN last_synced_at TIMESTAMP NULL");
    }

    echo "Migration completed successfully!\n";
} catch (Throwable $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
