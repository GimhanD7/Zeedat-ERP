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

        // Fetch unsynced sales and ensure each has a stable sync_uuid
        $sales = BaseRepository::rows('SELECT * FROM sales WHERE synced = 0 ORDER BY id ASC LIMIT 100');
        $salePayloads = [];

        foreach ($sales as &$s) {
            if (empty($s['sync_uuid'])) {
                $s['sync_uuid'] = 'SL-' . $s['id'] . '-' . substr(md5(($s['created_at'] ?? '') . '|' . $s['total'] . '|' . ($s['branch_id'] ?? 1)), 0, 10);
                BaseRepository::run('UPDATE sales SET sync_uuid=? WHERE id=?', [$s['sync_uuid'], $s['id']]);
            }
            $items = BaseRepository::rows('SELECT * FROM sale_items WHERE sale_id = ?', [$s['id']]);
            $payments = BaseRepository::rows('SELECT * FROM payments WHERE sale_id = ?', [$s['id']]);
            $salePayloads[] = [
                'sale' => $s,
                'items' => $items,
                'payments' => $payments,
            ];
        }
        unset($s);

        // Fetch unsynced customers
        $customers = BaseRepository::rows('SELECT * FROM customers WHERE synced = 0 ORDER BY id ASC LIMIT 100');
        foreach ($customers as &$c) {
            if (empty($c['sync_uuid'])) {
                $c['sync_uuid'] = 'CUS-' . $c['id'] . '-' . substr(md5(($c['phone'] ?? '') . '|' . ($c['name'] ?? '')), 0, 10);
                BaseRepository::run('UPDATE customers SET sync_uuid=? WHERE id=?', [$c['sync_uuid'], $c['id']]);
            }
        }
        unset($c);

        // Fetch unsynced repairs
        $repairs = BaseRepository::rows('SELECT * FROM repairs WHERE synced = 0 ORDER BY id ASC LIMIT 50');
        foreach ($repairs as &$r) {
            if (empty($r['sync_uuid'])) {
                $r['sync_uuid'] = 'REP-' . $r['id'] . '-' . substr(md5(($r['device'] ?? '') . '|' . ($r['created_at'] ?? '')), 0, 10);
                BaseRepository::run('UPDATE repairs SET sync_uuid=? WHERE id=?', [$r['sync_uuid'], $r['id']]);
            }
        }
        unset($r);

        if (empty($salePayloads) && empty($customers) && empty($repairs)) {
            return [
                'success' => true,
                'synced_sales' => 0,
                'synced_customers' => 0,
                'synced_repairs' => 0,
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

        $endpoint = BackupService::resolveCloudEndpoint($cloudUrl, 'sync.receive');
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

        $endpoint = BackupService::resolveCloudEndpoint($cloudUrl, 'sync.catalog');
        $res = self::getJson($endpoint, $apiKey);

        if (!$res['success']) {
            return ['success' => false, 'error' => $res['error'] ?? 'Catalog pull failed.'];
        }

        $data = $res['data'] ?? [];
        $products = $data['products'] ?? [];
        $updated = 0;

        if (is_array($products) && !empty($products)) {
            $isSqlite = Database::isSqlite();
            BaseRepository::transaction(function () use ($products, &$updated, $isSqlite) {
                foreach ($products as $p) {
                    if (empty($p['sku']) || empty($p['name'])) continue;
                    $sql = $isSqlite
                        ? 'INSERT INTO products (id, sku, barcode, name, brand, category, cost, price, reorder_level, serialized, commission_type, commission_value, active, synced)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                           ON CONFLICT(id) DO UPDATE SET sku=excluded.sku, barcode=excluded.barcode, name=excluded.name, brand=excluded.brand, category=excluded.category, cost=excluded.cost, price=excluded.price, reorder_level=excluded.reorder_level, serialized=excluded.serialized, commission_type=excluded.commission_type, commission_value=excluded.commission_value, active=excluded.active, synced=1'
                        : 'INSERT INTO products (id, sku, barcode, name, brand, category, cost, price, reorder_level, serialized, commission_type, commission_value, active, synced)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                           ON DUPLICATE KEY UPDATE sku=VALUES(sku), barcode=VALUES(barcode), name=VALUES(name), brand=VALUES(brand), category=VALUES(category), cost=VALUES(cost), price=VALUES(price), reorder_level=VALUES(reorder_level), serialized=VALUES(serialized), commission_type=VALUES(commission_type), commission_value=VALUES(commission_value), active=VALUES(active), synced=1';
                    BaseRepository::run(
                        $sql,
                        [
                            (int) $p['id'],
                            $p['sku'],
                            $p['barcode'] ?: null,
                            $p['name'],
                            $p['brand'] ?? '',
                            $p['category'],
                            (int) $p['cost'],
                            (int) $p['price'],
                            (int) ($p['reorder_level'] ?? 0),
                            (int) ($p['serialized'] ?? 0),
                            $p['commission_type'] ?? 'fixed',
                            (int) ($p['commission_value'] ?? 0),
                            (int) ($p['active'] ?? 1),
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

        $isSqlite = Database::isSqlite();
        BaseRepository::transaction(function () use (
            $branchId, $sales, $customers, $repairs, $isSqlite,
            &$syncedSales, &$syncedCustomers, &$syncedRepairs
        ) {
            // Process customers (match by sync_uuid or branch+phone)
            foreach ($customers as $c) {
                if (empty($c['name']) || empty($c['phone'])) continue;
                $cBranch = (int) ($c['branch_id'] ?? $branchId);
                $syncUuid = (string) ($c['sync_uuid'] ?? $c['uuid'] ?? ('CUS-' . ($c['id'] ?? 0)));
                $existingCus = BaseRepository::one(
                    'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=?) LIMIT 1',
                    [$syncUuid, $cBranch, $c['phone']]
                );
                if ($existingCus) {
                    BaseRepository::run(
                        'UPDATE customers SET name=?, email=?, notes=?, sync_uuid=?, synced=1 WHERE id=?',
                        [$c['name'], $c['email'] ?? '', $c['notes'] ?? '', $syncUuid, $existingCus['id']]
                    );
                } elseif ($isSqlite) {
                    BaseRepository::run(
                        'INSERT INTO customers (uuid, branch_id, name, phone, email, notes, sync_uuid, synced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
                        [$syncUuid, $cBranch, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', $syncUuid, $c['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO customers (branch_id, name, phone, email, notes, sync_uuid, synced, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
                        [$cBranch, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', $syncUuid, $c['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                }
                $syncedCustomers[] = $c['id'];
            }

            // Process sales (idempotent by sync_uuid)
            foreach ($sales as $saleEntry) {
                $s = $saleEntry['sale'] ?? [];
                $items = $saleEntry['items'] ?? [];
                $payments = $saleEntry['payments'] ?? [];
                if (empty($s)) continue;

                $sBranch = (int) ($s['branch_id'] ?? $branchId);
                $syncUuid = (string) ($s['sync_uuid'] ?? $s['uuid'] ?? ('SL-' . ($s['id'] ?? 0)));
                $existing = BaseRepository::scalar('SELECT id FROM sales WHERE sync_uuid = ? LIMIT 1', [$syncUuid]);
                if (!$existing) {
                    $saleSql = $isSqlite
                        ? 'INSERT INTO sales (uuid, branch_id, user_id, drawer_id, customer_id, subtotal, discount, tax, total, credit, due_date, sync_uuid, synced, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
                        : 'INSERT INTO sales (branch_id, user_id, drawer_id, customer_id, subtotal, discount, tax, total, credit, due_date, sync_uuid, synced, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)';
                    $saleParams = $isSqlite
                        ? [
                            $syncUuid,
                            $sBranch,
                            (int) ($s['user_id'] ?? 1),
                            (int) ($s['drawer_id'] ?? 1),
                            $s['customer_id'] ?? null,
                            (int) ($s['subtotal'] ?? 0),
                            (int) ($s['discount'] ?? 0),
                            (int) ($s['tax'] ?? 0),
                            (int) ($s['total'] ?? 0),
                            (int) ($s['credit'] ?? 0),
                            $s['due_date'] ?? null,
                            $syncUuid,
                            $s['created_at'] ?? date('Y-m-d H:i:s'),
                        ]
                        : [
                            $sBranch,
                            (int) ($s['user_id'] ?? 1),
                            (int) ($s['drawer_id'] ?? 1),
                            $s['customer_id'] ?? null,
                            (int) ($s['subtotal'] ?? 0),
                            (int) ($s['discount'] ?? 0),
                            (int) ($s['tax'] ?? 0),
                            (int) ($s['total'] ?? 0),
                            (int) ($s['credit'] ?? 0),
                            $s['due_date'] ?? null,
                            $syncUuid,
                            $s['created_at'] ?? date('Y-m-d H:i:s'),
                        ];
                    $newSaleId = BaseRepository::insert($saleSql, $saleParams);

                    foreach ($items as $it) {
                        BaseRepository::run(
                            'INSERT INTO sale_items (sale_id, product_id, unit_id, name, qty, price, total, refunded_qty, commission_amount)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                            [
                                $newSaleId,
                                (int) $it['product_id'],
                                $it['unit_id'] ?? null,
                                $it['name'],
                                (int) $it['qty'],
                                (int) $it['price'],
                                (int) $it['total'],
                                (int) ($it['refunded_qty'] ?? 0),
                                (int) ($it['commission_amount'] ?? 0),
                            ]
                        );

                        $stockSql = $isSqlite
                            ? 'UPDATE stock SET qty = MAX(0, qty - ?) WHERE branch_id = ? AND product_id = ?'
                            : 'UPDATE stock SET qty = GREATEST(0, qty - ?) WHERE branch_id = ? AND product_id = ?';
                        BaseRepository::run($stockSql, [(int) $it['qty'], $sBranch, (int) $it['product_id']]);
                    }

                    foreach ($payments as $p) {
                        BaseRepository::run(
                            'INSERT INTO payments (sale_id, drawer_id, user_id, kind, method, amount, reference, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            [
                                $newSaleId,
                                (int) ($p['drawer_id'] ?? 1),
                                (int) ($p['user_id'] ?? 1),
                                $p['kind'] ?? 'Sale',
                                $p['method'] ?? 'Cash',
                                (int) ($p['amount'] ?? 0),
                                !empty($p['reference']) ? $p['reference'] : null,
                                $p['created_at'] ?? date('Y-m-d H:i:s'),
                            ]
                        );
                    }
                }

                $syncedSales[] = $s['id'];
            }

            // Process repairs (idempotent by sync_uuid)
            foreach ($repairs as $r) {
                if (empty($r['device'])) continue;
                $rBranch = (int) ($r['branch_id'] ?? $branchId);
                $syncUuid = (string) ($r['sync_uuid'] ?? $r['uuid'] ?? ('REP-' . ($r['id'] ?? 0)));
                $existingRep = BaseRepository::scalar('SELECT id FROM repairs WHERE sync_uuid=? LIMIT 1', [$syncUuid]);
                if ($existingRep) {
                    BaseRepository::run('UPDATE repairs SET status=?, notes=?, synced=1 WHERE id=?', [
                        $r['status'] ?? 'Received',
                        $r['notes'] ?? '',
                        $existingRep,
                    ]);
                } elseif ($isSqlite) {
                    BaseRepository::run(
                        'INSERT INTO repairs (uuid, branch_id, customer_id, technician_id, device, serial, issue, accessories, notes, estimate, due_date, status, sync_uuid, synced, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                        [
                            $syncUuid,
                            $rBranch,
                            (int) ($r['customer_id'] ?? 1),
                            $r['technician_id'] ?? null,
                            $r['device'],
                            $r['serial'] ?? '',
                            $r['issue'] ?? '',
                            $r['accessories'] ?? '',
                            $r['notes'] ?? '',
                            (int) ($r['estimate'] ?? 0),
                            $r['due_date'] ?? date('Y-m-d'),
                            $r['status'] ?? 'Received',
                            $syncUuid,
                            $r['created_at'] ?? date('Y-m-d H:i:s'),
                        ]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO repairs (branch_id, customer_id, technician_id, device, serial, issue, accessories, notes, estimate, due_date, status, sync_uuid, synced, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                        [
                            $rBranch,
                            (int) ($r['customer_id'] ?? 1),
                            $r['technician_id'] ?? null,
                            $r['device'],
                            $r['serial'] ?? '',
                            $r['issue'] ?? '',
                            $r['accessories'] ?? '',
                            $r['notes'] ?? '',
                            (int) ($r['estimate'] ?? 0),
                            $r['due_date'] ?? date('Y-m-d'),
                            $r['status'] ?? 'Received',
                            $syncUuid,
                            $r['created_at'] ?? date('Y-m-d H:i:s'),
                        ]
                    );
                }
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
     * Server Catalog: Serves active products (including commissions) to offline branch PCs.
     */
    public static function handleServerCatalog(int $branchId): array {
        $products = BaseRepository::rows(
            "SELECT id, sku, barcode, name, brand, category, cost, price, reorder_level, serialized,
                    COALESCE(commission_type, 'fixed') AS commission_type, COALESCE(commission_value, 0) AS commission_value,
                    COALESCE(active, 1) AS active
             FROM products
             WHERE COALESCE(active, 1)=1
             ORDER BY id ASC"
        );
        return [
            'success' => true,
            'count' => count($products),
            'products' => $products,
        ];
    }

    /**
     * Automatic background sync + backup triggered on internet reconnection or interval.
     */
    public static function runAutoSyncAndBackup(?int $branchId = null): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $cloudUrl = trim((string) ($settings['cloud_backup_url'] ?? ''));
        $autoSync = !empty($settings['auto_sync_enabled']);
        $interval = max(5, (int) ($settings['sync_interval_minutes'] ?? 15));
        $lastSync = $settings['last_synced_at'] ?? null;

        if ($cloudUrl === '') {
            return ['ran' => false, 'reason' => 'not_configured'];
        }
        if (!$autoSync) {
            return ['ran' => false, 'reason' => 'disabled'];
        }
        if (!self::isInternetAvailable()) {
            return ['ran' => false, 'is_online' => false, 'reason' => 'offline'];
        }

        $pushRes = self::pushToCloud();
        $pullRes = self::pullFromCloud();
        $pendingUpload = BackupService::uploadPendingBackups();

        $dueForBackup = !$lastSync || ((time() - strtotime((string) $lastSync)) / 60 >= $interval);
        $backupRes = null;
        if ($dueForBackup) {
            $backupRes = BackupService::createBackup($branchId, 'auto_sync');
        }

        return [
            'ran' => true,
            'is_online' => true,
            'push' => $pushRes,
            'pull' => $pullRes,
            'pending_backups' => $pendingUpload,
            'backup' => $backupRes,
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
