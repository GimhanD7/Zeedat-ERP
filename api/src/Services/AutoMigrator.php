<?php
declare(strict_types=1);

namespace Zeedat\Services;

use PDO;
use Throwable;
use Zeedat\Repositories\PermissionRepository;

class AutoMigrator
{
    private static ?\WeakMap $migrated = null;

    /**
     * Automatically verifies and migrates the database schema and default seeds.
     * Runs seamlessly for both SQLite and MySQL.
     */
    public static function run(PDO $db, string $driver): void
    {
        self::$migrated ??= new \WeakMap();
        if (isset(self::$migrated[$db])) {
            return;
        }

        self::$migrated[$db] = true;

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
                self::runIncrementalMigrations($db, $driver);
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

            // Execute schema (strip CREATE DATABASE / USE statements on MySQL shared hosts like Namecheap)
            if ($driver === 'sqlite') {
                $db->exec('PRAGMA foreign_keys = OFF;');
                $db->exec($sql);
                $db->exec('PRAGMA foreign_keys = ON;');
            } else {
                $sql = preg_replace('/^\s*CREATE\s+DATABASE\b[^;]*;\s*/im', '', $sql);
                $sql = preg_replace('/^\s*USE\s+[^;]+;\s*/im', '', $sql);
                $db->exec('SET FOREIGN_KEY_CHECKS=0;');
                $statements = preg_split('/;\s*(?:\r?\n|$)/', $sql) ?: [];
                foreach ($statements as $stmt) {
                    $stmt = trim($stmt);
                    if ($stmt !== '') {
                        $db->exec($stmt);
                    }
                }
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
        PermissionRepository::seedDefaults($db);

        // Seed Products and Customers from backup file if enabled & available
        if (\Zeedat\Config\Database::env('SEED_DEMO', '1') === '1') {
            self::seedProductsAndCustomers($db, $driver);
        }
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
        $id = $driver === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT AUTO_INCREMENT PRIMARY KEY';
        $reservationIndex = $driver === 'mysql' ? ', INDEX reservations_stock (branch_id, product_id, status)' : '';
        $db->exec("CREATE TABLE IF NOT EXISTS reservations (
            id {$id}, sync_uuid VARCHAR(64) NOT NULL UNIQUE, synced INT NOT NULL DEFAULT 0,
            branch_id INT NOT NULL, customer_id INT NOT NULL, product_id INT NOT NULL, unit_id INT NULL,
            qty INT NOT NULL, unit_price BIGINT NOT NULL, tax_bps INT NOT NULL,
            total BIGINT NOT NULL, paid BIGINT NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'Held',
            points_earned BIGINT NOT NULL DEFAULT 0,
            version INT NOT NULL DEFAULT 0, base_version INT NOT NULL DEFAULT 0, change_token VARCHAR(32) NOT NULL DEFAULT '',
            sale_id INT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (branch_id) REFERENCES branches(id), FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (product_id) REFERENCES products(id), FOREIGN KEY (unit_id) REFERENCES units(id),
            FOREIGN KEY (sale_id) REFERENCES sales(id){$reservationIndex}
        )");
        $hasReservationPoints = $driver === 'sqlite'
            ? in_array('points_earned', array_column($db->query('PRAGMA table_info(reservations)')->fetchAll(PDO::FETCH_ASSOC), 'name'), true)
            : (bool) $db->query("SHOW COLUMNS FROM reservations LIKE 'points_earned'")->fetch();
        if (!$hasReservationPoints) {
            $db->exec('ALTER TABLE reservations ADD COLUMN points_earned BIGINT NOT NULL DEFAULT 0');
        }
        if ($driver === 'sqlite') {
            $db->exec('CREATE INDEX IF NOT EXISTS reservations_stock ON reservations(branch_id, product_id, status)');
            $db->exec('CREATE INDEX IF NOT EXISTS reservations_unit ON reservations(unit_id, status)');
        }
        $customerHasDeletion = $driver === 'sqlite'
            ? in_array('deleted_at', array_column($db->query('PRAGMA table_info(customers)')->fetchAll(PDO::FETCH_ASSOC), 'name'), true)
            : (bool) $db->query("SHOW COLUMNS FROM customers LIKE 'deleted_at'")->fetch();
        if (!$customerHasDeletion) {
            $db->exec('ALTER TABLE customers ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL');
        }
        if ($driver === 'mysql') {
            $method = $db->query("SHOW COLUMNS FROM payments LIKE 'method'")->fetch(PDO::FETCH_ASSOC);
            if ($method && !str_contains($method['Type'], "'Wallet'")) {
                $db->exec("ALTER TABLE payments MODIFY method ENUM('Cash','Card','Bank Transfer','Koko','Wallet') NOT NULL");
            }
        }

        // Ensure role_permissions table exists
        PermissionRepository::ensureTable($db);

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
                if (!in_array('label_printer_name', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN label_printer_name TEXT NOT NULL DEFAULT ''");
                }
                if (!in_array('label_width_mm', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN label_width_mm INTEGER NOT NULL DEFAULT 50");
                }
                if (!in_array('label_height_mm', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN label_height_mm INTEGER NOT NULL DEFAULT 30");
                }
                if (!in_array('label_across', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN label_across INTEGER NOT NULL DEFAULT 2");
                }
                if (!in_array('label_roll_mm', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN label_roll_mm INTEGER NOT NULL DEFAULT 106");
                }
                if (!in_array('label_show_digits', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN label_show_digits INTEGER NOT NULL DEFAULT 1");
                }
                if (!in_array('delete_pin_hash', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN delete_pin_hash TEXT NOT NULL DEFAULT ''");
                }
                if (!in_array('receipt_printer_name', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN receipt_printer_name TEXT NOT NULL DEFAULT ''");
                }
                if (!in_array('cash_drawer_enabled', $colNames, true)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN cash_drawer_enabled INTEGER NOT NULL DEFAULT 1");
                }

                $prodCols = $db->query("PRAGMA table_info(products)")->fetchAll();
                $prodColNames = array_column($prodCols, 'name');
                if (!in_array('active', $prodColNames, true)) {
                    $db->exec("ALTER TABLE products ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
                }
                if (!in_array('commission_type', $prodColNames, true)) {
                    $db->exec("ALTER TABLE products ADD COLUMN commission_type TEXT NOT NULL DEFAULT 'fixed'");
                }
                if (!in_array('commission_value', $prodColNames, true)) {
                    $db->exec("ALTER TABLE products ADD COLUMN commission_value INTEGER NOT NULL DEFAULT 0");
                }
                if (!in_array('image_path', $prodColNames, true)) {
                    $db->exec("ALTER TABLE products ADD COLUMN image_path TEXT NOT NULL DEFAULT ''");
                }

                $siCols = $db->query("PRAGMA table_info(sale_items)")->fetchAll();
                $siColNames = array_column($siCols, 'name');
                if (!in_array('commission_amount', $siColNames, true)) {
                    $db->exec("ALTER TABLE sale_items ADD COLUMN commission_amount INTEGER NOT NULL DEFAULT 0");
                }

                foreach (['branches', 'users', 'products', 'customers', 'units', 'suppliers', 'purchases', 'transfers', 'stock_movements', 'sales', 'repairs', 'drawers', 'cash_movements', 'returns_log', 'supplier_payments', 'audit_log'] as $syncTbl) {
                    $tCols = array_column($db->query("PRAGMA table_info({$syncTbl})")->fetchAll(), 'name');
                    if (!in_array('synced', $tCols, true)) {
                        $db->exec("ALTER TABLE {$syncTbl} ADD COLUMN synced INTEGER NOT NULL DEFAULT 0");
                    }
                    if (!in_array('sync_uuid', $tCols, true)) {
                        $db->exec("ALTER TABLE {$syncTbl} ADD COLUMN sync_uuid TEXT NULL");
                    }
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
                $lpCols = $db->query("SHOW COLUMNS FROM settings LIKE 'label_printer_name'")->fetchAll();
                if (empty($lpCols)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN label_printer_name VARCHAR(150) NOT NULL DEFAULT ''");
                    $db->exec("ALTER TABLE settings ADD COLUMN label_width_mm INT NOT NULL DEFAULT 50");
                    $db->exec("ALTER TABLE settings ADD COLUMN label_height_mm INT NOT NULL DEFAULT 30");
                    $db->exec("ALTER TABLE settings ADD COLUMN label_across INT NOT NULL DEFAULT 2");
                    $db->exec("ALTER TABLE settings ADD COLUMN label_roll_mm INT NOT NULL DEFAULT 106");
                    $db->exec("ALTER TABLE settings ADD COLUMN label_show_digits TINYINT(1) NOT NULL DEFAULT 1");
                }
                $pinCols = $db->query("SHOW COLUMNS FROM settings LIKE 'delete_pin_hash'")->fetchAll();
                if (empty($pinCols)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN delete_pin_hash VARCHAR(255) NOT NULL DEFAULT ''");
                }
                $rpCols = $db->query("SHOW COLUMNS FROM settings LIKE 'receipt_printer_name'")->fetchAll();
                if (empty($rpCols)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN receipt_printer_name VARCHAR(150) NOT NULL DEFAULT ''");
                }
                $cdCols = $db->query("SHOW COLUMNS FROM settings LIKE 'cash_drawer_enabled'")->fetchAll();
                if (empty($cdCols)) {
                    $db->exec("ALTER TABLE settings ADD COLUMN cash_drawer_enabled TINYINT(1) NOT NULL DEFAULT 1");
                }
                $prodCols = $db->query("SHOW COLUMNS FROM products LIKE 'active'")->fetchAll();
                if (empty($prodCols)) {
                    $db->exec("ALTER TABLE products ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1");
                }
                $commCols = $db->query("SHOW COLUMNS FROM products LIKE 'commission_type'")->fetchAll();
                if (empty($commCols)) {
                    $db->exec("ALTER TABLE products ADD COLUMN commission_type VARCHAR(16) NOT NULL DEFAULT 'fixed'");
                    $db->exec("ALTER TABLE products ADD COLUMN commission_value INT UNSIGNED NOT NULL DEFAULT 0");
                }
                if (empty($db->query("SHOW COLUMNS FROM products LIKE 'image_path'")->fetchAll())) {
                    $db->exec("ALTER TABLE products ADD COLUMN image_path VARCHAR(120) NOT NULL DEFAULT ''");
                }
                $siCommCols = $db->query("SHOW COLUMNS FROM sale_items LIKE 'commission_amount'")->fetchAll();
                if (empty($siCommCols)) {
                    $db->exec("ALTER TABLE sale_items ADD COLUMN commission_amount BIGINT UNSIGNED NOT NULL DEFAULT 0");
                }
                foreach (['branches', 'users', 'products', 'customers', 'units', 'suppliers', 'purchases', 'transfers', 'stock_movements', 'sales', 'repairs', 'drawers', 'cash_movements', 'returns_log', 'supplier_payments', 'audit_log'] as $syncTbl) {
                    $sCol = $db->query("SHOW COLUMNS FROM `{$syncTbl}` LIKE 'synced'")->fetchAll();
                    if (empty($sCol)) {
                        $db->exec("ALTER TABLE `{$syncTbl}` ADD COLUMN synced TINYINT(1) NOT NULL DEFAULT 1");
                    }
                    $uCol = $db->query("SHOW COLUMNS FROM `{$syncTbl}` LIKE 'sync_uuid'")->fetchAll();
                    if (empty($uCol)) {
                        $db->exec("ALTER TABLE `{$syncTbl}` ADD COLUMN sync_uuid VARCHAR(64) NULL");
                    }
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
                    sync_uuid TEXT NULL,
                    synced INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )");
                $bplCols = array_column($db->query("PRAGMA table_info(barcode_print_logs)")->fetchAll(), 'name');
                if (!in_array('synced', $bplCols, true)) {
                    $db->exec("ALTER TABLE barcode_print_logs ADD COLUMN synced INTEGER NOT NULL DEFAULT 0");
                }
                if (!in_array('sync_uuid', $bplCols, true)) {
                    $db->exec("ALTER TABLE barcode_print_logs ADD COLUMN sync_uuid TEXT NULL");
                }
            } else {
                $db->exec("CREATE TABLE IF NOT EXISTS barcode_print_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    branch_id INT NOT NULL DEFAULT 0,
                    product_id INT NOT NULL,
                    user_id INT NOT NULL DEFAULT 1,
                    copies INT NOT NULL DEFAULT 1,
                    price BIGINT NOT NULL DEFAULT 0,
                    sync_uuid VARCHAR(64) NULL,
                    synced TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX(product_id, branch_id)
                ) ENGINE=InnoDB");
                if (empty($db->query("SHOW COLUMNS FROM barcode_print_logs LIKE 'synced'")->fetchAll())) {
                    $db->exec("ALTER TABLE barcode_print_logs ADD COLUMN synced TINYINT(1) NOT NULL DEFAULT 1");
                }
                if (empty($db->query("SHOW COLUMNS FROM barcode_print_logs LIKE 'sync_uuid'")->fetchAll())) {
                    $db->exec("ALTER TABLE barcode_print_logs ADD COLUMN sync_uuid VARCHAR(64) NULL");
                }
            }
        } catch (Throwable) {
        }

        // Ensure multi-branch assignment table exists and backfill existing single-branch users
        try {
            if ($driver === 'sqlite') {
                $exists = $db->query("SELECT name FROM sqlite_master WHERE type='table' AND name='user_branches'")->fetch();
                $db->exec("CREATE TABLE IF NOT EXISTS user_branches (
                    user_id INTEGER NOT NULL,
                    branch_id INTEGER NOT NULL,
                    PRIMARY KEY(user_id, branch_id),
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY(branch_id) REFERENCES branches(id) ON DELETE CASCADE
                )");
                if (!$exists) {
                    $db->exec("INSERT OR IGNORE INTO user_branches (user_id, branch_id) SELECT id, branch_id FROM users WHERE branch_id IS NOT NULL");
                }
            } else {
                $exists = $db->query("SHOW TABLES LIKE 'user_branches'")->fetch();
                $db->exec("CREATE TABLE IF NOT EXISTS user_branches (
                    user_id INT NOT NULL,
                    branch_id INT NOT NULL,
                    PRIMARY KEY(user_id, branch_id),
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY(branch_id) REFERENCES branches(id) ON DELETE CASCADE
                ) ENGINE=InnoDB");
                if (!$exists) {
                    $db->exec("INSERT IGNORE INTO user_branches (user_id, branch_id) SELECT id, branch_id FROM users WHERE branch_id IS NOT NULL");
                }
            }
        } catch (Throwable) {
        }

        // Ensure full invoice detail columns on sales + one-time cashier POS-only permission default
        try {
            $salesColsSpec = [
                'invoice_no' => $driver === 'sqlite' ? "TEXT NOT NULL DEFAULT ''" : "VARCHAR(40) NOT NULL DEFAULT ''",
                'discount_bps' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'INT NOT NULL DEFAULT 0',
                'tax_bps' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'INT NOT NULL DEFAULT 0',
                'paid_amount' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
                'cash_tendered' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
                'change_amount' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
                'payment_methods' => $driver === 'sqlite' ? "TEXT NOT NULL DEFAULT ''" : "VARCHAR(120) NOT NULL DEFAULT ''",
                'notes' => $driver === 'sqlite' ? "TEXT NOT NULL DEFAULT ''" : "VARCHAR(500) NOT NULL DEFAULT ''",
            ];
            if ($driver === 'sqlite') {
                $existingSalesCols = array_column($db->query('PRAGMA table_info(sales)')->fetchAll(), 'name');
                foreach ($salesColsSpec as $col => $def) {
                    if (!in_array($col, $existingSalesCols, true)) {
                        $db->exec("ALTER TABLE sales ADD COLUMN {$col} {$def}");
                    }
                }
                $setCols = array_column($db->query('PRAGMA table_info(settings)')->fetchAll(), 'name');
                if (!in_array('cashier_pos_only', $setCols, true)) {
                    $db->exec('ALTER TABLE settings ADD COLUMN cashier_pos_only INTEGER NOT NULL DEFAULT 0');
                }
                $flag = (int) ($db->query('SELECT cashier_pos_only FROM settings WHERE id=1')->fetchColumn() ?: 0);
                if ($flag === 0) {
                    $db->exec("DELETE FROM role_permissions WHERE role='cashier' AND permission <> 'pos'");
                    $db->exec("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES ('cashier', 'pos')");
                    $db->exec('UPDATE settings SET cashier_pos_only=1 WHERE id=1');
                }
            } else {
                foreach ($salesColsSpec as $col => $def) {
                    if (empty($db->query("SHOW COLUMNS FROM sales LIKE '{$col}'")->fetchAll())) {
                        $db->exec("ALTER TABLE sales ADD COLUMN {$col} {$def}");
                    }
                }
                if (empty($db->query("SHOW COLUMNS FROM settings LIKE 'cashier_pos_only'")->fetchAll())) {
                    $db->exec('ALTER TABLE settings ADD COLUMN cashier_pos_only TINYINT(1) NOT NULL DEFAULT 0');
                }
                $flag = (int) ($db->query('SELECT cashier_pos_only FROM settings WHERE id=1')->fetchColumn() ?: 0);
                if ($flag === 0) {
                    $db->exec("DELETE FROM role_permissions WHERE role='cashier' AND permission <> 'pos'");
                    $db->exec("INSERT IGNORE INTO role_permissions (role, permission) VALUES ('cashier', 'pos')");
                    $db->exec('UPDATE settings SET cashier_pos_only=1 WHERE id=1');
                }
            }
        } catch (Throwable) {
        }

        // Ensure repair payment/cashflow columns & SMS gateway settings + sms_logs table exist
        try {
            $repairColsSpec = [
                'advance_paid' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
                'final_charge' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
                'paid_amount' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
                'payment_method' => $driver === 'sqlite' ? "TEXT NOT NULL DEFAULT ''" : "VARCHAR(40) NOT NULL DEFAULT ''",
                'paid_at' => $driver === 'sqlite' ? 'TEXT NULL' : 'TIMESTAMP NULL',
                'sms_sent' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'TINYINT(1) NOT NULL DEFAULT 0',
            ];
            $smsSettingsSpec = [
                'sms_enabled' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'TINYINT(1) NOT NULL DEFAULT 0',
                'sms_provider_url' => $driver === 'sqlite' ? "TEXT NOT NULL DEFAULT ''" : "VARCHAR(500) NOT NULL DEFAULT ''",
                'sms_api_key' => $driver === 'sqlite' ? "TEXT NOT NULL DEFAULT ''" : "VARCHAR(255) NOT NULL DEFAULT ''",
                'sms_sender_id' => $driver === 'sqlite' ? "TEXT NOT NULL DEFAULT ''" : "VARCHAR(40) NOT NULL DEFAULT ''",
            ];
            if ($driver === 'sqlite') {
                $repCols = array_column($db->query('PRAGMA table_info(repairs)')->fetchAll(), 'name');
                foreach ($repairColsSpec as $col => $def) {
                    if (!in_array($col, $repCols, true)) {
                        $db->exec("ALTER TABLE repairs ADD COLUMN {$col} {$def}");
                    }
                }
                $setCols = array_column($db->query('PRAGMA table_info(settings)')->fetchAll(), 'name');
                foreach ($smsSettingsSpec as $col => $def) {
                    if (!in_array($col, $setCols, true)) {
                        $db->exec("ALTER TABLE settings ADD COLUMN {$col} {$def}");
                    }
                }
                $db->exec("CREATE TABLE IF NOT EXISTS sms_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    branch_id INTEGER NOT NULL DEFAULT 0,
                    repair_id INTEGER NULL,
                    phone TEXT NOT NULL,
                    message TEXT NOT NULL,
                    kind TEXT NOT NULL DEFAULT 'intake',
                    status TEXT NOT NULL DEFAULT 'queued',
                    error_message TEXT NOT NULL DEFAULT '',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )");
            } else {
                foreach ($repairColsSpec as $col => $def) {
                    if (empty($db->query("SHOW COLUMNS FROM repairs LIKE '{$col}'")->fetchAll())) {
                        $db->exec("ALTER TABLE repairs ADD COLUMN {$col} {$def}");
                    }
                }
                foreach ($smsSettingsSpec as $col => $def) {
                    if (empty($db->query("SHOW COLUMNS FROM settings LIKE '{$col}'")->fetchAll())) {
                        $db->exec("ALTER TABLE settings ADD COLUMN {$col} {$def}");
                    }
                }
                $db->exec("CREATE TABLE IF NOT EXISTS sms_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    branch_id INT NOT NULL DEFAULT 0,
                    repair_id INT NULL,
                    phone VARCHAR(40) NOT NULL,
                    message TEXT NOT NULL,
                    kind VARCHAR(30) NOT NULL DEFAULT 'intake',
                    status VARCHAR(30) NOT NULL DEFAULT 'queued',
                    error_message VARCHAR(255) NOT NULL DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX(repair_id, created_at)
                ) ENGINE=InnoDB");
            }
        } catch (Throwable) {
        }

        // Ensure customer loyalty_points & wallet_balance, sale wallet/points columns, and customer_wallet_logs table
        try {
            $custCols = [
                'loyalty_points' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
                'wallet_balance' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
            ];
            $saleLoyaltyCols = [
                'wallet_used' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'BIGINT UNSIGNED NOT NULL DEFAULT 0',
                'points_earned' => $driver === 'sqlite' ? 'INTEGER NOT NULL DEFAULT 0' : 'INT UNSIGNED NOT NULL DEFAULT 0',
                'commission_user_id' => $driver === 'sqlite' ? 'INTEGER NULL' : 'INT NULL',
                'discount_type' => $driver === 'sqlite' ? "TEXT NOT NULL DEFAULT 'percent'" : "VARCHAR(16) NOT NULL DEFAULT 'percent'",
            ];
            if ($driver === 'sqlite') {
                $existingCust = array_column($db->query('PRAGMA table_info(customers)')->fetchAll(), 'name');
                foreach ($custCols as $col => $def) {
                    if (!in_array($col, $existingCust, true)) {
                        $db->exec("ALTER TABLE customers ADD COLUMN {$col} {$def}");
                    }
                }
                $existingSales = array_column($db->query('PRAGMA table_info(sales)')->fetchAll(), 'name');
                foreach ($saleLoyaltyCols as $col => $def) {
                    if (!in_array($col, $existingSales, true)) {
                        $db->exec("ALTER TABLE sales ADD COLUMN {$col} {$def}");
                    }
                }
                $existingUsers = array_column($db->query('PRAGMA table_info(users)')->fetchAll(), 'name');
                if (!in_array('badge_code', $existingUsers, true)) {
                    $db->exec('ALTER TABLE users ADD COLUMN badge_code TEXT NULL');
                }
                $db->exec("CREATE TABLE IF NOT EXISTS customer_wallet_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    branch_id INTEGER NOT NULL DEFAULT 0,
                    customer_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL DEFAULT 1,
                    sale_id INTEGER NULL,
                    amount INTEGER NOT NULL DEFAULT 0,
                    points_delta INTEGER NOT NULL DEFAULT 0,
                    kind TEXT NOT NULL DEFAULT 'Adjustment',
                    method TEXT NOT NULL DEFAULT '',
                    reference TEXT NOT NULL DEFAULT '',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )");
            } else {
                foreach ($custCols as $col => $def) {
                    if (empty($db->query("SHOW COLUMNS FROM customers LIKE '{$col}'")->fetchAll())) {
                        $db->exec("ALTER TABLE customers ADD COLUMN {$col} {$def}");
                    }
                }
                foreach ($saleLoyaltyCols as $col => $def) {
                    if (empty($db->query("SHOW COLUMNS FROM sales LIKE '{$col}'")->fetchAll())) {
                        $db->exec("ALTER TABLE sales ADD COLUMN {$col} {$def}");
                    }
                }
                if (empty($db->query("SHOW COLUMNS FROM users LIKE 'badge_code'")->fetchAll())) {
                    $db->exec('ALTER TABLE users ADD COLUMN badge_code VARCHAR(32) NULL');
                }
                $db->exec("CREATE TABLE IF NOT EXISTS customer_wallet_logs (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    branch_id INT NOT NULL DEFAULT 0,
                    customer_id INT NOT NULL,
                    user_id INT NOT NULL DEFAULT 1,
                    sale_id INT NULL,
                    amount BIGINT NOT NULL DEFAULT 0,
                    points_delta INT NOT NULL DEFAULT 0,
                    kind VARCHAR(40) NOT NULL DEFAULT 'Adjustment',
                    method VARCHAR(40) NOT NULL DEFAULT '',
                    reference VARCHAR(120) NOT NULL DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX(customer_id, created_at)
                ) ENGINE=InnoDB");
            }

            $walletColumns = $driver === 'sqlite'
                ? array_column($db->query('PRAGMA table_info(customer_wallet_logs)')->fetchAll(), 'name')
                : array_column($db->query('SHOW COLUMNS FROM customer_wallet_logs')->fetchAll(), 'Field');
            if (!in_array('sync_uuid', $walletColumns, true)) {
                $db->exec('ALTER TABLE customer_wallet_logs ADD COLUMN sync_uuid VARCHAR(64) NULL');
            }
            if (!in_array('synced', $walletColumns, true)) {
                $db->exec('ALTER TABLE customer_wallet_logs ADD COLUMN synced INTEGER NOT NULL DEFAULT 0');
            }

            // Backfill staff badge_code (STF00001...) for any users missing one
            $missingBadges = $db->query("SELECT id FROM users WHERE COALESCE(badge_code, '') = ''")->fetchAll(PDO::FETCH_COLUMN);
            if (!empty($missingBadges)) {
                $badgeStmt = $db->prepare('UPDATE users SET badge_code=? WHERE id=?');
                foreach ($missingBadges as $uid) {
                    $badgeStmt->execute(['STF' . str_pad((string) ((int) $uid), 5, '0', STR_PAD_LEFT), (int) $uid]);
                }
            }
        } catch (Throwable) {
        }

        // Ensure cashier role has repairs permission on existing databases
        try {
            if ($driver === 'sqlite') {
                $db->exec("INSERT OR IGNORE INTO role_permissions (role, permission) VALUES ('cashier', 'repairs')");
            } else {
                $db->exec("INSERT IGNORE INTO role_permissions (role, permission) VALUES ('cashier', 'repairs')");
            }
        } catch (Throwable) {
        }
    }
}
