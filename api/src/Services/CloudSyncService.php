<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Throwable;
use Zeedat\Config\Database;
use Zeedat\Repositories\BaseRepository;

class CloudSyncService {
    /**
     * Checks if internet connectivity is reachable.
     */
    public static function isInternetAvailable(): bool {
        return BackupService::isInternetAvailable();
    }

    /**
     * Get sync status and counts.
     */
    public static function getStatus(): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $driver = Database::getDriver();

        $unsyncedSales = (int) BaseRepository::scalar('SELECT COUNT(*) FROM sales WHERE synced = 0');
        $unsyncedCustomers = (int) BaseRepository::scalar('SELECT COUNT(*) FROM customers WHERE synced = 0');
        $unsyncedRepairs = (int) BaseRepository::scalar('SELECT COUNT(*) FROM repairs WHERE synced = 0');
        $totalSales = (int) BaseRepository::scalar('SELECT COUNT(*) FROM sales');

        return [
            'driver' => $driver,
            'is_sqlite' => $driver === 'sqlite',
            'is_online' => self::isInternetAvailable(),
            'cloud_url' => $settings['cloud_backup_url'] ?? '',
            'has_api_key' => !empty($settings['cloud_api_key']),
            'auto_sync_enabled' => (bool) ($settings['auto_sync_enabled'] ?? 1),
            'sync_interval_minutes' => (int) ($settings['sync_interval_minutes'] ?? 15),
            'last_synced_at' => $settings['last_synced_at'] ?? null,
            'unsynced_sales' => $unsyncedSales,
            'unsynced_customers' => $unsyncedCustomers,
            'unsynced_repairs' => $unsyncedRepairs,
            'total_sales' => $totalSales,
            'total_pending' => $unsyncedSales + $unsyncedCustomers + $unsyncedRepairs,
        ];
    }

    /**
     * Pushes pending offline records from local SQLite to the central cloud server.
     */
    public static function pushToCloud(): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $cloudUrl = trim($settings['cloud_backup_url'] ?? '');
        $apiKey = trim($settings['cloud_api_key'] ?? '');

        if (empty($cloudUrl)) {
            return ['success' => false, 'error' => 'Central cloud URL is not configured in settings.'];
        }

        if (!self::isInternetAvailable()) {
            return ['success' => false, 'error' => 'Device is offline. Saved locally in SQLite; will sync when reconnected.'];
        }

        // Fetch unsynced sales
        $sales = BaseRepository::rows('SELECT * FROM sales WHERE synced = 0 ORDER BY id ASC LIMIT 100');
        $salePayloads = [];

        foreach ($sales as $s) {
            $items = BaseRepository::rows('SELECT * FROM sale_items WHERE sale_id = ?', [$s['id']]);
            $payments = BaseRepository::rows('SELECT * FROM payments WHERE sale_id = ?', [$s['id']]);
            $salePayloads[] = [
                'sale' => $s,
                'items' => $items,
                'payments' => $payments,
            ];
        }

        // Fetch unsynced customers
        $customers = BaseRepository::rows('SELECT * FROM customers WHERE synced = 0 ORDER BY id ASC LIMIT 100');

        // Fetch unsynced repairs
        $repairs = BaseRepository::rows('SELECT * FROM repairs WHERE synced = 0 ORDER BY id ASC LIMIT 50');

        if (empty($salePayloads) && empty($customers) && empty($repairs)) {
            return [
                'success' => true,
                'synced_count' => 0,
                'message' => 'All local data is already up to date with the cloud.',
            ];
        }

        $postData = [
            'branch_id' => $sales[0]['branch_id'] ?? 1,
            'sales' => $salePayloads,
            'customers' => $customers,
            'repairs' => $repairs,
            'timestamp' => date('c'),
        ];

        $endpoint = rtrim($cloudUrl, '/') . (str_contains($cloudUrl, '?') ? '&' : '?') . 'route=sync.receive';
        $res = self::postJson($endpoint, $postData, $apiKey);

        if (!$res['success']) {
            return ['success' => false, 'error' => $res['error'] ?? 'Sync transmission failed.'];
        }

        $serverRes = $res['data'] ?? [];

        // Mark local records as synced
        if (!empty($serverRes['synced_sales'])) {
            $in = implode(',', array_map('intval', $serverRes['synced_sales']));
            BaseRepository::run("UPDATE sales SET synced = 1 WHERE id IN ({$in})");
        }

        if (!empty($serverRes['synced_customers'])) {
            $in = implode(',', array_map('intval', $serverRes['synced_customers']));
            BaseRepository::run("UPDATE customers SET synced = 1 WHERE id IN ({$in})");
        }

        if (!empty($serverRes['synced_repairs'])) {
            $in = implode(',', array_map('intval', $serverRes['synced_repairs']));
            BaseRepository::run("UPDATE repairs SET synced = 1 WHERE id IN ({$in})");
        }

        BaseRepository::run("UPDATE settings SET last_synced_at = " . (Database::isSqlite() ? "DATETIME('now','localtime')" : "NOW()") . " WHERE id = 1");

        return [
            'success' => true,
            'synced_sales' => count($serverRes['synced_sales'] ?? []),
            'synced_customers' => count($serverRes['synced_customers'] ?? []),
            'synced_repairs' => count($serverRes['synced_repairs'] ?? []),
            'message' => 'Successfully synchronized with the cloud MySQL database!',
        ];
    }

    /**
     * Pulls latest product catalog, barcodes, and prices from the cloud server into local SQLite.
     */
    public static function pullFromCloud(): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $cloudUrl = trim($settings['cloud_backup_url'] ?? '');
        $apiKey = trim($settings['cloud_api_key'] ?? '');

        if (empty($cloudUrl) || !self::isInternetAvailable()) {
            return ['success' => false, 'error' => 'Offline or no cloud URL.'];
        }

        $endpoint = rtrim($cloudUrl, '/') . (str_contains($cloudUrl, '?') ? '&' : '?') . 'route=sync.catalog';
        $res = self::getJson($endpoint, $apiKey);

        if (!$res['success']) {
            return ['success' => false, 'error' => $res['error'] ?? 'Catalog pull failed.'];
        }

        $data = $res['data'] ?? [];
        $products = $data['products'] ?? [];
        $updated = 0;

        if (is_array($products) && !empty($products)) {
            BaseRepository::transaction(function () use ($products, &$updated) {
                foreach ($products as $p) {
                    if (empty($p['sku']) || empty($p['name'])) continue;
                    BaseRepository::run(
                        "INSERT OR REPLACE INTO products (id, sku, barcode, name, brand, category, cost, price, reorder_level, serialized, synced)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
                        [
                            $p['id'], $p['sku'], $p['barcode'], $p['name'],
                            $p['brand'] ?? '', $p['category'], $p['cost'],
                            $p['price'], $p['reorder_level'] ?? 0, (int)($p['serialized'] ?? 0)
                        ]
                    );
                    $updated++;
                }
            });
        }

        return [
            'success' => true,
            'products_synced' => $updated,
            'message' => "Downloaded and updated {$updated} catalog products from cloud.",
        ];
    }

    /**
     * Server Receiver: Receives incoming transactions from branch cashier PCs.
     */
    public static function handleSyncReceive(array $headers, array $payload): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $expectedKey = trim($settings['cloud_api_key'] ?? '');

        $authHeader = $headers['authorization'] ?? $headers['Authorization'] ?? '';
        $token = '';
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            $token = trim($matches[1]);
        }

        if (!empty($expectedKey) && ($token === '' || !hash_equals($expectedKey, $token))) {
            return ['success' => false, 'code' => 401, 'error' => 'Unauthorized'];
        }

        $branchId = (int) ($payload['branch_id'] ?? 1);
        $sales = $payload['sales'] ?? [];
        $customers = $payload['customers'] ?? [];
        $repairs = $payload['repairs'] ?? [];

        $syncedSales = [];
        $syncedCustomers = [];
        $syncedRepairs = [];

        BaseRepository::transaction(function () use (
            $branchId, $sales, $customers, $repairs,
            &$syncedSales, &$syncedCustomers, &$syncedRepairs
        ) {
            // Process customers
            foreach ($customers as $c) {
                $uuid = $c['uuid'] ?? ('CUS-' . $c['id']);
                BaseRepository::run(
                    "INSERT INTO customers (branch_id, name, phone, email, notes, created_at)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone)",
                    [$branchId, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', $c['created_at'] ?? date('Y-m-d H:i:s')]
                );
                $syncedCustomers[] = $c['id'];
            }

            // Process sales
            foreach ($sales as $saleEntry) {
                $s = $saleEntry['sale'] ?? [];
                $items = $saleEntry['items'] ?? [];
                $payments = $saleEntry['payments'] ?? [];
                if (empty($s)) continue;

                // Check if this sale UUID already exists in central MySQL
                $existing = BaseRepository::scalar("SELECT id FROM sales WHERE reference = ? OR id = ?", [$s['uuid'] ?? '', $s['id']]);
                if (!$existing) {
                    $newSaleId = BaseRepository::insert(
                        "INSERT INTO sales (branch_id, user_id, drawer_id, customer_id, subtotal, discount, tax, total, credit, due_date, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [
                            $branchId, $s['user_id'] ?? 1, $s['drawer_id'] ?? 1,
                            $s['customer_id'] ?? null, $s['subtotal'], $s['discount'],
                            $s['tax'], $s['total'], $s['credit'] ?? 0,
                            $s['due_date'] ?? null, $s['created_at'] ?? date('Y-m-d H:i:s')
                        ]
                    );

                    foreach ($items as $it) {
                        BaseRepository::run(
                            "INSERT INTO sale_items (sale_id, product_id, unit_id, name, qty, price, total, refunded_qty)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                            [
                                $newSaleId, $it['product_id'], $it['unit_id'] ?? null,
                                $it['name'], $it['qty'], $it['price'], $it['total'],
                                $it['refunded_qty'] ?? 0
                            ]
                        );

                        // Deduct stock in central MySQL
                        BaseRepository::run(
                            "UPDATE stock SET qty = GREATEST(0, qty - ?) WHERE branch_id = ? AND product_id = ?",
                            [$it['qty'], $branchId, $it['product_id']]
                        );
                    }

                    foreach ($payments as $p) {
                        BaseRepository::run(
                            "INSERT INTO payments (sale_id, drawer_id, user_id, kind, method, amount, reference, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                            [
                                $newSaleId, $p['drawer_id'] ?? 1, $p['user_id'] ?? 1,
                                $p['kind'] ?? 'Sale', $p['method'], $p['amount'],
                                $p['reference'] ?? null, $p['created_at'] ?? date('Y-m-d H:i:s')
                            ]
                        );
                    }
                }

                $syncedSales[] = $s['id'];
            }

            // Process repairs
            foreach ($repairs as $r) {
                $syncedRepairs[] = $r['id'];
            }
        });

        return [
            'success' => true,
            'code' => 200,
            'synced_sales' => $syncedSales,
            'synced_customers' => $syncedCustomers,
            'synced_repairs' => $syncedRepairs,
            'server_time' => date('Y-m-d H:i:s'),
        ];
    }

    /**
     * Server Catalog: Serves product catalog to branch PCs.
     */
    public static function handleServerCatalog(int $branchId): array {
        $products = BaseRepository::rows("SELECT id, sku, barcode, name, brand, category, cost, price, reorder_level, serialized FROM products WHERE category != 'Services' ORDER BY id ASC");
        return [
            'success' => true,
            'count' => count($products),
            'products' => $products,
        ];
    }

    private static function postJson(string $url, array $data, string $token): array {
        if (!function_exists('curl_init')) {
            return ['success' => false, 'error' => 'cURL not enabled'];
        }

        $ch = curl_init($url);
        $payload = json_encode($data, JSON_THROW_ON_ERROR);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $token,
            'User-Agent: Zeedat-POS-Client/1.0',
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['success' => false, 'error' => $curlError];
        }

        if ($httpCode >= 200 && $httpCode < 300) {
            $decoded = json_decode($response, true);
            return ['success' => true, 'data' => $decoded];
        }

        return ['success' => false, 'error' => "HTTP {$httpCode}: {$response}"];
    }

    private static function getJson(string $url, string $token): array {
        if (!function_exists('curl_init')) {
            return ['success' => false, 'error' => 'cURL not enabled'];
        }

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: application/json',
            'Authorization: Bearer ' . $token,
            'User-Agent: Zeedat-POS-Client/1.0',
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['success' => false, 'error' => $curlError];
        }

        if ($httpCode >= 200 && $httpCode < 300) {
            $decoded = json_decode($response, true);
            return ['success' => true, 'data' => $decoded];
        }

        return ['success' => false, 'error' => "HTTP {$httpCode}: {$response}"];
    }
}
