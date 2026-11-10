<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only\n");
}

$dbPath = __DIR__ . DIRECTORY_SEPARATOR . 'zeedat_local.db';
$schemaPath = __DIR__ . DIRECTORY_SEPARATOR . 'sqlite_schema.sql';

echo "========================================================\n";
echo "       ZEEDAT ERP - SQLITE LOCAL DATABASE SETUP         \n";
echo "   Zero-Server Local Database for Offline Cashier PCs   \n";
echo "========================================================\n\n";

echo "[1/4] Initializing SQLite database at:\n      {$dbPath}\n";

$sqlite = new PDO("sqlite:{$dbPath}", null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

$sqlite->exec('PRAGMA foreign_keys = OFF;'); // Off during initial bulk load

echo "[2/4] Applying SQLite schema...\n";
$schemaSql = file_get_contents($schemaPath);
$sqlite->exec($schemaSql);
echo "      Schema applied successfully!\n";

echo "[3/4] Checking for master MySQL data to copy into SQLite...\n";
$copiedFromMysql = false;

try {
    $mysql = new PDO("mysql:host=127.0.0.1;port=3306;dbname=zeedat_pos;charset=utf8mb4", 'root', '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    echo "      Connected to MySQL! Copying live store data into SQLite...\n";

    // Copy Branches
    $branches = $mysql->query("SELECT * FROM branches")->fetchAll();
    $stmt = $sqlite->prepare("INSERT OR REPLACE INTO branches (id, name) VALUES (?, ?)");
    foreach ($branches as $b) {
        $stmt->execute([$b['id'], $b['name']]);
    }
    echo "      - Branches: " . count($branches) . "\n";

    // Copy Users
    $users = $mysql->query("SELECT * FROM users")->fetchAll();
    $stmt = $sqlite->prepare("INSERT OR REPLACE INTO users (id, branch_id, name, email, password_hash, role, active) VALUES (?, ?, ?, ?, ?, ?, ?)");
    foreach ($users as $u) {
        $stmt->execute([$u['id'], $u['branch_id'], $u['name'], $u['email'], $u['password_hash'], $u['role'], $u['active']]);
    }
    echo "      - Users: " . count($users) . "\n";

    // Copy Role Permissions
    $perms = $mysql->query("SELECT * FROM role_permissions")->fetchAll();
    $stmt = $sqlite->prepare("INSERT OR REPLACE INTO role_permissions (role, permission) VALUES (?, ?)");
    foreach ($perms as $p) {
        $stmt->execute([$p['role'], $p['permission']]);
    }
    echo "      - Role Permissions: " . count($perms) . "\n";

    // Copy Products (all 521+ products and unique barcodes)
    $products = $mysql->query("SELECT * FROM products")->fetchAll();
    $stmt = $sqlite->prepare("INSERT OR REPLACE INTO products (id, sku, barcode, name, brand, category, cost, price, reorder_level, serialized, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
    foreach ($products as $p) {
        $stmt->execute([
            $p['id'], $p['sku'], $p['barcode'], $p['name'], $p['brand'],
            $p['category'], $p['cost'], $p['price'], $p['reorder_level'], $p['serialized']
        ]);
    }
    echo "      - Products & Barcodes: " . count($products) . "\n";

    // Copy Stock
    $stock = $mysql->query("SELECT * FROM stock")->fetchAll();
    $stmt = $sqlite->prepare("INSERT OR REPLACE INTO stock (branch_id, product_id, qty) VALUES (?, ?, ?)");
    foreach ($stock as $s) {
        $stmt->execute([$s['branch_id'], $s['product_id'], $s['qty']]);
    }
    echo "      - Stock Records: " . count($stock) . "\n";

    // Copy Customers
    $customers = $mysql->query("SELECT * FROM customers")->fetchAll();
    $stmt = $sqlite->prepare("INSERT OR REPLACE INTO customers (id, uuid, branch_id, name, phone, email, notes, synced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)");
    foreach ($customers as $c) {
        $uuid = 'CUS-' . $c['id'] . '-' . substr(md5((string)$c['phone']), 0, 8);
        $stmt->execute([$c['id'], $uuid, $c['branch_id'], $c['name'], $c['phone'], $c['email'], $c['notes'], $c['created_at']]);
    }
    echo "      - Customers: " . count($customers) . "\n";

    // Copy Settings
    $settings = $mysql->query("SELECT * FROM settings WHERE id=1")->fetch();
    if ($settings) {
        $stmt = $sqlite->prepare("INSERT OR REPLACE INTO settings (id, tax_bps, shop_name, paper_width, cloud_backup_url, cloud_api_key, auto_sync_enabled, sync_interval_minutes, last_synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $settings['id'], $settings['tax_bps'], $settings['shop_name'], $settings['paper_width'],
            $settings['cloud_backup_url'] ?? '', $settings['cloud_api_key'] ?? '',
            $settings['auto_sync_enabled'] ?? 1, $settings['sync_interval_minutes'] ?? 15,
            $settings['last_synced_at'] ?? null
        ]);
    }

    $copiedFromMysql = true;
} catch (Throwable $e) {
    echo "      Notice: MySQL is not running locally ({$e->getMessage()}).\n";
    echo "      Seeding default branch and owner account in SQLite...\n";

    // Seed defaults if MySQL is not available
    $sqlite->exec("INSERT OR IGNORE INTO branches (id, name) VALUES (1, 'Battaramulla Mobile'), (2, 'Battaramulla PC'), (3, 'Malabe');");
    
    // Default Owner (password: Password1234!)
    $hash = password_hash('Password1234!', PASSWORD_DEFAULT);
    $sqlite->exec("INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES (1, 'Owner', 'owner@zeedat.local', '{$hash}', 'owner');");
}

$sqlite->exec('PRAGMA foreign_keys = ON;');

echo "\n[4/4] Verifying SQLite database health...\n";
$totalProducts = (int)$sqlite->query("SELECT COUNT(*) FROM products")->fetchColumn();
$totalCustomers = (int)$sqlite->query("SELECT COUNT(*) FROM customers")->fetchColumn();
$totalBranches = (int)$sqlite->query("SELECT COUNT(*) FROM branches")->fetchColumn();
$fileSizeKb = round(filesize($dbPath) / 1024, 1);

echo "      - Database File Size: {$fileSizeKb} KB\n";
echo "      - Branches: {$totalBranches}\n";
echo "      - Products: {$totalProducts}\n";
echo "      - Customers: {$totalCustomers}\n";

echo "\n========================================================\n";
echo "  SQLITE SETUP COMPLETE! ZEEDAT LOCAL DATABASE IS READY!\n";
echo "  No MySQL or XAMPP is needed on this cashier PC.\n";
echo "========================================================\n";
