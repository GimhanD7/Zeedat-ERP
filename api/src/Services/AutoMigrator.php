<?php
declare(strict_types=1);

namespace Zeedat\Services;

use PDO;
use Throwable;
use Zeedat\Repositories\PermissionRepository;

class AutoMigrator
{
    private static bool $migrated = false;

    /**
     * Automatically verifies and migrates the database schema and default seeds.
     * Runs seamlessly for both SQLite and MySQL.
     */
    public static function run(PDO $db, string $driver): void
    {
        if (self::$migrated) {
            return;
        }

        self::$migrated = true;

        try {
            $hasUsers = false;

            if ($driver === 'sqlite') {
                $check = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")->fetch();
                $hasUsers = !empty($check);
            } else {
                $check = $db->query("SHOW TABLES LIKE 'users'")->fetch();
                $hasUsers = !empty($check);
            }

            if (!$hasUsers) {
                self::runFullSchemaAndSeed($db, $driver);
            } else {
                self::runIncrementalMigrations($db, $driver);
            }
        } catch (Throwable $e) {
            error_log("[AutoMigrator] Error: " . $e->getMessage());
        }
    }

    /**
     * Executes the entire schema and seeds initial data when database is completely empty.
     */
    private static function runFullSchemaAndSeed(PDO $db, string $driver): void
    {
        $projectRoot = dirname(__DIR__, 3);

        if ($driver === 'sqlite') {
            $schemaFile = $projectRoot . DIRECTORY_SEPARATOR . 'database' . DIRECTORY_SEPARATOR . 'sqlite_schema.sql';
        } else {
            $schemaFile = $projectRoot . DIRECTORY_SEPARATOR . 'database' . DIRECTORY_SEPARATOR . 'schema.sql';
        }

        if (file_exists($schemaFile)) {
            $sql = file_get_contents($schemaFile);

            // Execute schema
            if ($driver === 'sqlite') {
                $db->exec('PRAGMA foreign_keys = OFF;');
                $db->exec($sql);
                $db->exec('PRAGMA foreign_keys = ON;');
            } else {
                $db->exec('SET FOREIGN_KEY_CHECKS=0;');
                $db->exec($sql);
                $db->exec('SET FOREIGN_KEY_CHECKS=1;');
            }
        }

        // Seed 3 Branches
        $branchStmt = $db->prepare(
            $driver === 'sqlite'
            ? "INSERT OR IGNORE INTO branches (id, name) VALUES (?, ?)"
            : "INSERT IGNORE INTO branches (id, name) VALUES (?, ?)"
        );
        $branchStmt->execute([1, 'Battaramulla Mobile']);
        $branchStmt->execute([2, 'Battaramulla PC']);
        $branchStmt->execute([3, 'Malabe']);

        // Seed Default Owner (password: Password1234!)
        $hash = password_hash('Password1234!', PASSWORD_DEFAULT);
        $userStmt = $db->prepare(
            $driver === 'sqlite'
            ? "INSERT OR IGNORE INTO users (id, name, email, password_hash, role, active) VALUES (1, 'Owner', 'owner@zeedat.local', ?, 'owner', 1)"
            : "INSERT IGNORE INTO users (id, name, email, password_hash, role, active) VALUES (1, 'Owner', 'owner@zeedat.local', ?, 'owner', 1)"
        );
        $userStmt->execute([$hash]);

        // Seed Role Permissions
        PermissionRepository::seedDefaults();

        // Seed Products and Customers from backup file if available
        self::seedProductsAndCustomers($db, $driver);
    }

    /**
     * Seeds product catalog and customer backup data.
     */
    private static function seedProductsAndCustomers(PDO $db, string $driver): void
    {
        $rawFile = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'database' . DIRECTORY_SEPARATOR . 'battaramulla_mobile_raw_prompt.txt';
        if (!file_exists($rawFile)) {
            return;
        }

        $content = file_get_contents($rawFile);

        // 1. Parse and seed customers
        preg_match_all("/\((\d+),'([^']*)','([^']*)',/i", $content, $matches, PREG_SET_ORDER);
        if (!empty($matches)) {
            $cusSql = $driver === 'sqlite'
                ? "INSERT OR IGNORE INTO customers (uuid, branch_id, name, phone, email, notes, synced) VALUES (?, 1, ?, ?, '', '', 1)"
                : "INSERT IGNORE INTO customers (branch_id, name, phone, email, notes) VALUES (1, ?, ?, '', '')";
            $cusStmt = $db->prepare($cusSql);
            $seen = [];

            foreach ($matches as $m) {
                $phone = trim($m[2]);
                $name = trim($m[3]);
                if (!$name)
                    continue;
                $key = $phone . '|' . strtolower($name);
                if (isset($seen[$key]))
                    continue;
                $seen[$key] = true;

                if ($driver === 'sqlite') {
                    $uuid = 'CUS-BM-' . substr(md5($key), 0, 8);
                    $cusStmt->execute([$uuid, $name, $phone]);
                } else {
                    $cusStmt->execute([$name, $phone]);
                }
            }
        }

        // 2. Parse and seed products
        preg_match_all("/\((\d+),'([^']*)','([^']*)','([^']*)','([^']*)',([0-9\.]+)\)/i", $content, $prodMatches, PREG_SET_ORDER);
        if (!empty($prodMatches)) {
            $prodSql = $driver === 'sqlite'
                ? "INSERT OR IGNORE INTO products (sku, barcode, name, brand, category, cost, price, reorder_level, serialized, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 3, 0, 1)"
                : "INSERT IGNORE INTO products (sku, barcode, name, brand, category, cost, price, reorder_level, serialized) VALUES (?, ?, ?, ?, ?, ?, ?, 3, 0)";
            $prodStmt = $db->prepare($prodSql);
            $seenProds = [];
            $barcodeIndex = 1000;

            foreach ($prodMatches as $pm) {
                $code = trim($pm[4]);
                $name = trim($pm[5]);
                if (!$code && !$name)
                    continue;
                $sku = $code ?: ('SKU-' . substr(md5($name), 0, 8));
                if (isset($seenProds[$sku]))
                    continue;
                $seenProds[$sku] = true;

                $barcodeIndex++;
                $barcode = '480' . sprintf('%09d', $barcodeIndex);

                // Estimate category and price
                $category = 'Accessories';
                $cost = 150000;
                $price = 250000;

                $lower = strtolower($name);
                if (str_contains($lower, 'phone')) {
                    $category = 'Phones';
                    $price = 8500000;
                    $cost = 6500000;
                }

                $prodStmt->execute([$sku, $barcode, $name, 'Generic', $category, $cost, $price]);
            }
        }
    }

    /**
     * Checks for newly introduced columns or tables on existing databases.
     */
    private static function runIncrementalMigrations(PDO $db, string $driver): void
    {
        // Ensure role_permissions table exists
        PermissionRepository::ensureTable();

        // Ensure settings has cloud sync columns
        try {
            if ($driver === 'sqlite') {
                $cols = $db->query("PRAGMA table_info(settings)")->fetchAll();
                $colNames = array_column($cols, 'name');
                if (!in_array('cloud_backup_url', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN cloud_backup_url TEXT NOT NULL DEFAULT ''");
                }
                if (!in_array('cloud_api_key', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN cloud_api_key TEXT NOT NULL DEFAULT ''");
                }
                if (!in_array('auto_sync_enabled', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN auto_sync_enabled INTEGER NOT NULL DEFAULT 1");
                }
                if (!in_array('sync_interval_minutes', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN sync_interval_minutes INTEGER NOT NULL DEFAULT 15");
                }
                if (!in_array('last_synced_at', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN last_synced_at TEXT NULL");
                }
                if (!in_array('shop_phone', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN shop_phone TEXT NOT NULL DEFAULT ''");
                }
                if (!in_array('shop_address', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN shop_address TEXT NOT NULL DEFAULT ''");
                }
                if (!in_array('shop_email', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN shop_email TEXT NOT NULL DEFAULT ''");
                }
                if (!in_array('receipt_footer', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN receipt_footer TEXT NOT NULL DEFAULT 'Thank you for your business! Please retain this receipt for warranty.'");
                }
                if (!in_array('invoice_prefix', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN invoice_prefix TEXT NOT NULL DEFAULT 'INV-'");
                }
                if (!in_array('auto_print', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN auto_print INTEGER NOT NULL DEFAULT 1");
                }
                if (!in_array('show_tax_on_receipt', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN show_tax_on_receipt INTEGER NOT NULL DEFAULT 1");
                }

                $branchCols = $db->query("PRAGMA table_info(branches)")->fetchAll();
                $branchColNames = array_column($branchCols, 'name');
                if (!in_array('phone', $branchColNames, true)) {
                    $db->exec("ALTER TABLE branches ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
                }
                if (!in_array('address', $branchColNames, true)) {
                    $db->exec("ALTER TABLE branches ADD COLUMN address TEXT NOT NULL DEFAULT ''");
                }
            } else {
                $cols = $db->query("SHOW COLUMNS FROM settings LIKE 'cloud_backup_url'")->fetchAll();
                if (empty($cols)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN cloud_backup_url VARCHAR(255) NOT NULL DEFAULT ''");
                    $db->exec("ALTER TABLE settings ADD COLUMN cloud_api_key VARCHAR(255) NOT NULL DEFAULT ''");
                    $db->exec("ALTER TABLE settings ADD COLUMN auto_sync_enabled TINYINT(1) NOT NULL DEFAULT 1");
                    $db->exec("ALTER TABLE settings ADD COLUMN sync_interval_minutes INT NOT NULL DEFAULT 15");
                    $db->exec("ALTER TABLE settings ADD COLUMN last_synced_at TIMESTAMP NULL");
                }
                $extCols = $db->query("SHOW COLUMNS FROM settings LIKE 'shop_phone'")->fetchAll();
                if (empty($extCols)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN shop_phone VARCHAR(50) NOT NULL DEFAULT ''");
                    $db->exec("ALTER TABLE settings ADD COLUMN shop_address VARCHAR(255) NOT NULL DEFAULT ''");
                    $db->exec("ALTER TABLE settings ADD COLUMN shop_email VARCHAR(120) NOT NULL DEFAULT ''");
                    $db->exec("ALTER TABLE settings ADD COLUMN receipt_footer VARCHAR(255) NOT NULL DEFAULT 'Thank you for your business! Please retain this receipt for warranty.'");
                    $db->exec("ALTER TABLE settings ADD COLUMN invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV-'");
                    $db->exec("ALTER TABLE settings ADD COLUMN auto_print TINYINT(1) NOT NULL DEFAULT 1");
                    $db->exec("ALTER TABLE settings ADD COLUMN show_tax_on_receipt TINYINT(1) NOT NULL DEFAULT 1");
                }
                $bCols = $db->query("SHOW COLUMNS FROM branches LIKE 'phone'")->fetchAll();
                if (empty($bCols)) {
                    $db->exec("ALTER TABLE branches ADD COLUMN phone VARCHAR(50) NOT NULL DEFAULT ''");
                    $db->exec("ALTER TABLE branches ADD COLUMN address VARCHAR(255) NOT NULL DEFAULT ''");
                }
            }
        } catch (Throwable) {
        }

        // Ensure backup_logs table exists
        try {
            if ($driver === 'sqlite') {
                $db->exec("CREATE TABLE IF NOT EXISTS backup_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    branch_id INTEGER NULL,
                    filename TEXT NOT NULL,
                    file_size INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'local_saved',
                    remote_url TEXT NULL,
                    error_message TEXT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )");
            } else {
                $db->exec("CREATE TABLE IF NOT EXISTS backup_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    branch_id INT NULL,
                    filename VARCHAR(255) NOT NULL,
                    file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
                    status ENUM('local_saved','synced','failed') NOT NULL DEFAULT 'local_saved',
                    remote_url VARCHAR(255) NULL,
                    error_message TEXT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX(status, created_at)
                ) ENGINE=InnoDB");
            }
        } catch (Throwable) {
        }

        // Ensure cloud_sync_queue table exists
        try {
            if ($driver === 'sqlite') {
                $db->exec("CREATE TABLE IF NOT EXISTS cloud_sync_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entity_type TEXT NOT NULL,
                    entity_id INTEGER NOT NULL,
                    uuid TEXT NOT NULL,
                    action TEXT NOT NULL DEFAULT 'insert',
                    payload TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    error_message TEXT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    synced_at TEXT NULL
                )");
            }
        } catch (Throwable) {
        }

        // Ensure barcode_print_logs table exists
        try {
            if ($driver === 'sqlite') {
                $db->exec("CREATE TABLE IF NOT EXISTS barcode_print_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    branch_id INTEGER NOT NULL DEFAULT 0,
                    product_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL DEFAULT 1,
                    copies INTEGER NOT NULL DEFAULT 1,
                    price INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )");
            } else {
                $db->exec("CREATE TABLE IF NOT EXISTS barcode_print_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    branch_id INT NOT NULL DEFAULT 0,
                    product_id INT NOT NULL,
                    user_id INT NOT NULL DEFAULT 1,
                    copies INT NOT NULL DEFAULT 1,
                    price BIGINT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX(product_id, branch_id)
                ) ENGINE=InnoDB");
            }
        } catch (Throwable) {
        }
    }
}
