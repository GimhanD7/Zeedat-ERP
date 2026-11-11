<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Throwable;
use Zeedat\Config\Database;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Support\Response;

class CloudSyncService {
    public static function isInternetAvailable(): bool {
        return BackupService::isInternetAvailable();
    }

    public static function getStatus(): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $driver = Database::getDriver();
        $configuredDriver = strtolower(Database::env('DB_DRIVER', $driver));
        $fallbackActive = Database::isFallbackActive();

        $tables = ['branches', 'products', 'customers', 'units', 'suppliers', 'purchases', 'transfers', 'stock_movements', 'sales', 'repairs'];
        $counts = [];
        $totalPending = 0;
        if ($driver === 'sqlite') {
            foreach ($tables as $tbl) {
                try {
                    $cnt = (int) BaseRepository::scalar("SELECT COUNT(*) FROM {$tbl} WHERE synced = 0 OR sync_uuid IS NULL OR sync_uuid = ''");
                } catch (Throwable) {
                    $cnt = 0;
                }
                $counts[$tbl] = $cnt;
                $totalPending += $cnt;
            }
        } else {
            foreach ($tables as $tbl) {
                $counts[$tbl] = 0;
            }
        }

        return [
            'driver' => $driver,
            'configured_driver' => $configuredDriver,
            'fallback_active' => $fallbackActive,
            'is_sqlite' => $driver === 'sqlite',
            'is_online' => self::isInternetAvailable(),
            'cloud_url' => $settings['cloud_backup_url'] ?? '',
            'has_api_key' => !empty($settings['cloud_api_key']),
            'auto_sync_enabled' => (bool) ($settings['auto_sync_enabled'] ?? 1),
            'sync_interval_minutes' => (int) ($settings['sync_interval_minutes'] ?? 15),
            'last_synced_at' => $settings['last_synced_at'] ?? null,
            'unsynced_sales' => $counts['sales'],
            'unsynced_customers' => $counts['customers'],
            'unsynced_repairs' => $counts['repairs'],
            'unsynced_products' => $counts['products'],
            'unsynced_units' => $counts['units'],
            'unsynced_transfers' => $counts['transfers'],
            'unsynced_purchases' => $counts['purchases'],
            'total_sales' => (int) BaseRepository::scalar('SELECT COUNT(*) FROM sales'),
            'total_pending' => $totalPending,
        ];
    }

    private static function ensureSyncUuids(string $table, string $prefix, array $rows, callable $seedBuilder): array {
        foreach ($rows as &$row) {
            if (empty($row['sync_uuid'])) {
                $seed = $seedBuilder($row);
                $uuid = $row['uuid'] ?? ($prefix . '-' . ($row['id'] ?? 0) . '-' . substr(md5($seed), 0, 10));
                $row['sync_uuid'] = $uuid;
                try {
                    BaseRepository::run("UPDATE {$table} SET sync_uuid=?, synced=0 WHERE id=?", [$uuid, $row['id']]);
                } catch (Throwable) {
                }
            }
        }
        unset($row);
        return $rows;
    }

    private static function safeRows(string $sql, array $params = []): array {
        try {
            return BaseRepository::rows($sql, $params);
        } catch (Throwable) {
            return [];
        }
    }

    private static function markSyncedIds(string $table, array $ids): int {
        $clean = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($v) => $v > 0)));
        if (empty($clean)) {
            return 0;
        }
        $in = implode(',', $clean);
        BaseRepository::run("UPDATE {$table} SET synced = 1 WHERE id IN ({$in})");
        return count($clean);
    }

    /**
     * Collects all pending offline records into a normalized push payload.
     */
    private static function collectPendingPushPayload(): array {
        $pendingWhere = static fn(string $alias = ''): string => $alias !== ''
            ? "({$alias}.synced = 0 OR {$alias}.sync_uuid IS NULL OR {$alias}.sync_uuid = '')"
            : "(synced = 0 OR sync_uuid IS NULL OR sync_uuid = '')";

        $branches = self::ensureSyncUuids(
            'branches',
            'BR',
            self::safeRows('SELECT * FROM branches WHERE ' . $pendingWhere() . ' ORDER BY id ASC LIMIT 50'),
            static fn($r) => (string) ($r['name'] ?? '')
        );

        $products = self::ensureSyncUuids(
            'products',
            'PRD',
            self::safeRows('SELECT * FROM products WHERE ' . $pendingWhere() . ' ORDER BY id ASC LIMIT 200'),
            static fn($r) => (string) ($r['sku'] ?? $r['name'] ?? '')
        );

        $customers = self::ensureSyncUuids(
            'customers',
            'CUS',
            self::safeRows(
                'SELECT c.*, COALESCE(b.name, "") AS branch_name
                 FROM customers c LEFT JOIN branches b ON b.id=c.branch_id
                 WHERE ' . $pendingWhere('c') . ' ORDER BY c.id ASC LIMIT 150'
            ),
            static fn($r) => ($r['phone'] ?? '') . '|' . ($r['name'] ?? '')
        );

        $units = self::ensureSyncUuids(
            'units',
            'UNT',
            self::safeRows(
                'SELECT u.*, p.sku AS product_sku, COALESCE(b.name, "") AS branch_name
                 FROM units u
                 JOIN products p ON p.id=u.product_id
                 LEFT JOIN branches b ON b.id=u.branch_id
                 WHERE ' . $pendingWhere('u') . ' ORDER BY u.id ASC LIMIT 200'
            ),
            static fn($r) => (string) ($r['code'] ?? '')
        );

        $suppliers = self::ensureSyncUuids(
            'suppliers',
            'SUP',
            self::safeRows('SELECT * FROM suppliers WHERE ' . $pendingWhere() . ' ORDER BY id ASC LIMIT 100'),
            static fn($r) => (string) ($r['name'] ?? '')
        );

        $purchases = self::ensureSyncUuids(
            'purchases',
            'PO',
            self::safeRows(
                'SELECT pu.*, COALESCE(b.name, "") AS branch_name, s.name AS supplier_name, p.sku AS product_sku
                 FROM purchases pu
                 LEFT JOIN branches b ON b.id=pu.branch_id
                 JOIN suppliers s ON s.id=pu.supplier_id
                 JOIN products p ON p.id=pu.product_id
                 WHERE ' . $pendingWhere('pu') . ' ORDER BY pu.id ASC LIMIT 150'
            ),
            static fn($r) => ($r['branch_id'] ?? 1) . '|' . ($r['supplier_name'] ?? '') . '|' . ($r['invoice'] ?? '') . '|' . ($r['product_sku'] ?? '')
        );

        $transfers = self::ensureSyncUuids(
            'transfers',
            'TR',
            self::safeRows(
                'SELECT t.*, COALESCE(fb.name, "") AS from_branch_name, COALESCE(tb.name, "") AS to_branch_name,
                        p.sku AS product_sku, COALESCE(u.code, "") AS unit_code
                 FROM transfers t
                 LEFT JOIN branches fb ON fb.id=t.from_branch
                 LEFT JOIN branches tb ON tb.id=t.to_branch
                 JOIN products p ON p.id=t.product_id
                 LEFT JOIN units u ON u.id=t.unit_id
                 WHERE ' . $pendingWhere('t') . ' ORDER BY t.id ASC LIMIT 150'
            ),
            static fn($r) => ($r['from_branch'] ?? '') . '|' . ($r['to_branch'] ?? '') . '|' . ($r['product_sku'] ?? '') . '|' . ($r['created_at'] ?? '')
        );

        $repairs = self::ensureSyncUuids(
            'repairs',
            'REP',
            self::safeRows(
                'SELECT r.*, COALESCE(b.name, "") AS branch_name,
                        COALESCE(c.sync_uuid, c.uuid, "") AS customer_sync_uuid,
                        COALESCE(c.phone, "") AS customer_phone, COALESCE(c.name, "") AS customer_name,
                        COALESCE(t.email, "") AS technician_email
                 FROM repairs r
                 LEFT JOIN branches b ON b.id=r.branch_id
                 LEFT JOIN customers c ON c.id=r.customer_id
                 LEFT JOIN users t ON t.id=r.technician_id
                 WHERE ' . $pendingWhere('r') . ' ORDER BY r.id ASC LIMIT 100'
            ),
            static fn($r) => ($r['device'] ?? '') . '|' . ($r['created_at'] ?? '')
        );

        $sales = self::ensureSyncUuids(
            'sales',
            'SL',
            self::safeRows(
                'SELECT s.*, COALESCE(b.name, "") AS branch_name, COALESCE(u.email, "") AS user_email,
                        COALESCE(c.sync_uuid, c.uuid, "") AS customer_sync_uuid, COALESCE(c.phone, "") AS customer_phone
                 FROM sales s
                 LEFT JOIN branches b ON b.id=s.branch_id
                 LEFT JOIN users u ON u.id=s.user_id
                 LEFT JOIN customers c ON c.id=s.customer_id
                 WHERE ' . $pendingWhere('s') . ' ORDER BY s.id ASC LIMIT 100'
            ),
            static fn($r) => ($r['created_at'] ?? '') . '|' . ($r['total'] ?? 0) . '|' . ($r['branch_id'] ?? 1)
        );

        $salePayloads = [];
        foreach ($sales as $s) {
            $items = self::safeRows(
                'SELECT si.*, p.sku AS product_sku, COALESCE(un.code, "") AS unit_code
                 FROM sale_items si
                 JOIN products p ON p.id=si.product_id
                 LEFT JOIN units un ON un.id=si.unit_id
                 WHERE si.sale_id = ?',
                [$s['id']]
            );
            $payments = self::safeRows('SELECT * FROM payments WHERE sale_id = ?', [$s['id']]);
            $salePayloads[] = ['sale' => $s, 'items' => $items, 'payments' => $payments];
        }

        $movements = self::ensureSyncUuids(
            'stock_movements',
            'MV',
            self::safeRows(
                'SELECT m.*, COALESCE(b.name, "") AS branch_name, p.sku AS product_sku, COALESCE(u.email, "") AS user_email
                 FROM stock_movements m
                 LEFT JOIN branches b ON b.id=m.branch_id
                 JOIN products p ON p.id=m.product_id
                 LEFT JOIN users u ON u.id=m.user_id
                 WHERE ' . $pendingWhere('m') . ' ORDER BY m.id ASC LIMIT 200'
            ),
            static fn($r) => ($r['branch_id'] ?? 1) . '|' . ($r['product_sku'] ?? '') . '|' . ($r['kind'] ?? '') . '|' . ($r['reference'] ?? '') . '|' . ($r['created_at'] ?? '')
        );

        if (empty($branches) && empty($products) && empty($customers) && empty($units)
            && empty($suppliers) && empty($purchases) && empty($transfers)
            && empty($repairs) && empty($salePayloads) && empty($movements)) {
            return [];
        }

        return [
            'branch_id' => $sales[0]['branch_id'] ?? $customers[0]['branch_id'] ?? 1,
            'branches' => $branches,
            'products' => $products,
            'customers' => $customers,
            'units' => $units,
            'suppliers' => $suppliers,
            'purchases' => $purchases,
            'transfers' => $transfers,
            'repairs' => $repairs,
            'sales' => $salePayloads,
            'stock_movements' => $movements,
            'timestamp' => date('c'),
        ];
    }

    private static function applyPushAcknowledgements(array $srv): array {
        $counts = [
            'synced_branches' => self::markSyncedIds('branches', $srv['synced_branches'] ?? []),
            'synced_products' => self::markSyncedIds('products', $srv['synced_products'] ?? []),
            'synced_customers' => self::markSyncedIds('customers', $srv['synced_customers'] ?? []),
            'synced_units' => self::markSyncedIds('units', $srv['synced_units'] ?? []),
            'synced_suppliers' => self::markSyncedIds('suppliers', $srv['synced_suppliers'] ?? []),
            'synced_purchases' => self::markSyncedIds('purchases', $srv['synced_purchases'] ?? []),
            'synced_transfers' => self::markSyncedIds('transfers', $srv['synced_transfers'] ?? []),
            'synced_repairs' => self::markSyncedIds('repairs', $srv['synced_repairs'] ?? []),
            'synced_sales' => self::markSyncedIds('sales', $srv['synced_sales'] ?? []),
            'synced_movements' => self::markSyncedIds('stock_movements', $srv['synced_movements'] ?? []),
        ];

        BaseRepository::run(
            'UPDATE settings SET last_synced_at=' . (Database::isSqlite() ? "DATETIME('now','localtime')" : 'NOW()') . ' WHERE id = 1'
        );

        $totalSynced = array_sum($counts);
        return array_merge($counts, [
            'success' => true,
            'synced_count' => $totalSynced,
            'message' => "Pushed {$totalSynced} offline record(s) to cloud MySQL.",
        ]);
    }

    /**
     * Pushes all pending offline local SQLite records to the online Namecheap MySQL server.
     */
    public static function pushToCloud(): array {
        if (!Database::isSqlite()) {
            $sync = self::syncDirectMysqlWithSqlite();
            return $sync['push'] ?? ['success' => true, 'synced_count' => 0, 'message' => 'Direct Server MySQL active.'];
        }

        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $cloudUrl = trim((string) ($settings['cloud_backup_url'] ?? ''));
        $apiKey = trim((string) ($settings['cloud_api_key'] ?? ''));

        if ($cloudUrl === '') {
            return ['success' => false, 'error' => 'Central cloud URL is not configured in settings.'];
        }
        if (!self::isInternetAvailable()) {
            return ['success' => false, 'error' => 'Device is offline. Saved locally in SQLite; will sync when reconnected.'];
        }

        $postData = self::collectPendingPushPayload();
        if (empty($postData)) {
            return [
                'success' => true,
                'synced_branches' => 0,
                'synced_products' => 0,
                'synced_customers' => 0,
                'synced_units' => 0,
                'synced_suppliers' => 0,
                'synced_purchases' => 0,
                'synced_transfers' => 0,
                'synced_repairs' => 0,
                'synced_sales' => 0,
                'synced_movements' => 0,
                'synced_count' => 0,
                'message' => 'All local data is already up to date with the cloud.',
            ];
        }

        $endpoint = BackupService::resolveCloudEndpoint($cloudUrl, 'sync.receive');
        $res = self::postJson($endpoint, $postData, $apiKey);
        if (!$res['success']) {
            return ['success' => false, 'error' => $res['error'] ?? 'Sync transmission failed.'];
        }

        return self::applyPushAcknowledgements($res['data'] ?? []);
    }

    /**
     * Pulls authoritative online data across all branches (branches, users, products, stock, units,
     * customers, suppliers, purchases, transfers, repairs, sales, settings) from cloud MySQL into local SQLite.
     */
    public static function pullFromCloud(): array {
        if (!Database::isSqlite()) {
            $sync = self::syncDirectMysqlWithSqlite();
            return $sync['pull'] ?? ['success' => true, 'products_synced' => 0, 'message' => 'Direct Server MySQL active; offline cache refreshed.'];
        }

        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $cloudUrl = trim((string) ($settings['cloud_backup_url'] ?? ''));
        $apiKey = trim((string) ($settings['cloud_api_key'] ?? ''));

        if ($cloudUrl === '' || !self::isInternetAvailable()) {
            return ['success' => false, 'error' => 'Offline or no cloud URL.'];
        }

        $endpoint = BackupService::resolveCloudEndpoint($cloudUrl, 'sync.catalog');
        $res = self::getJson($endpoint, $apiKey);
        if (!$res['success']) {
            return ['success' => false, 'error' => $res['error'] ?? 'Catalog pull failed.'];
        }

        return self::applyServerCatalogSnapshot($res['data'] ?? []);
    }

    private static function applyServerCatalogSnapshot(array $data): array {
        $isSqlite = Database::isSqlite();
        $stats = [
            'branches_synced' => 0,
            'products_synced' => 0,
            'stock_synced' => 0,
            'units_synced' => 0,
            'customers_synced' => 0,
            'repairs_synced' => 0,
            'transfers_synced' => 0,
            'sales_synced' => 0,
        ];

        BaseRepository::transaction(function () use ($data, $isSqlite, &$stats) {
            // 1. Branches (map by name)
            $branchByName = [];
            foreach ($data['branches'] ?? [] as $b) {
                $name = trim((string) ($b['name'] ?? ''));
                if ($name === '') continue;
                $existingId = (int) BaseRepository::scalar('SELECT id FROM branches WHERE name=? LIMIT 1', [$name]);
                if ($existingId > 0) {
                    BaseRepository::run(
                        'UPDATE branches SET phone=?, address=?, synced=1 WHERE id=? AND synced=1',
                        [$b['phone'] ?? '', $b['address'] ?? '', $existingId]
                    );
                    $branchByName[$name] = $existingId;
                } else {
                    $newId = BaseRepository::insert(
                        'INSERT INTO branches (name, phone, address, sync_uuid, synced) VALUES (?,?,?,?,1)',
                        [$name, $b['phone'] ?? '', $b['address'] ?? '', $b['sync_uuid'] ?? ('BR-' . substr(md5($name), 0, 10))]
                    );
                    $branchByName[$name] = $newId;
                }
                $stats['branches_synced']++;
            }

            $resolveLocalBranch = static function (?string $name, int $fallbackId = 1) use ($branchByName): int {
                if ($name && isset($branchByName[$name])) {
                    return $branchByName[$name];
                }
                $exists = BaseRepository::scalar('SELECT id FROM branches WHERE id=? LIMIT 1', [$fallbackId]);
                return $exists ? (int) $exists : (int) (BaseRepository::scalar('SELECT id FROM branches ORDER BY id ASC LIMIT 1') ?: 1);
            };

            // 2. Role permissions & Staff users (enables offline logins for staff created online)
            if (!empty($data['role_permissions'])) {
                foreach ($data['role_permissions'] as $rp) {
                    $sql = $isSqlite
                        ? 'INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?,?)'
                        : 'INSERT IGNORE INTO role_permissions (role, permission) VALUES (?,?)';
                    BaseRepository::run($sql, [$rp['role'], $rp['permission']]);
                }
            }

            $userByEmail = [];
            foreach ($data['users'] ?? [] as $u) {
                $email = strtolower(trim((string) ($u['email'] ?? '')));
                if ($email === '' || empty($u['password_hash'])) continue;
                $bId = empty($u['branch_name']) ? null : $resolveLocalBranch($u['branch_name'], (int) ($u['branch_id'] ?? 1));
                $existingId = (int) BaseRepository::scalar('SELECT id FROM users WHERE email=? LIMIT 1', [$email]);
                if ($existingId > 0) {
                    BaseRepository::run(
                        'UPDATE users SET branch_id=?, name=?, password_hash=?, role=?, active=? WHERE id=?',
                        [$bId, $u['name'], $u['password_hash'], $u['role'], (int) ($u['active'] ?? 1), $existingId]
                    );
                    $userByEmail[$email] = $existingId;
                } else {
                    $newU = BaseRepository::insert(
                        'INSERT INTO users (branch_id, name, email, password_hash, role, active) VALUES (?,?,?,?,?,?)',
                        [$bId, $u['name'], $email, $u['password_hash'], $u['role'], (int) ($u['active'] ?? 1)]
                    );
                    $userByEmail[$email] = $newU;
                }
            }
            $defaultUserId = (int) (BaseRepository::scalar('SELECT id FROM users ORDER BY id ASC LIMIT 1') ?: 1);
            $resolveLocalUser = static fn(?string $email): int => ($email && isset($userByEmail[strtolower($email)]))
                ? $userByEmail[strtolower($email)]
                : $defaultUserId;

            // 3. Products (match safely by SKU, preserve dirty local rows)
            $productBySku = [];
            foreach ($data['products'] ?? [] as $p) {
                $sku = trim((string) ($p['sku'] ?? ''));
                if ($sku === '' || empty($p['name'])) continue;
                $existing = BaseRepository::one('SELECT id, synced FROM products WHERE sku=? LIMIT 1', [$sku]);
                $syncUuid = $p['sync_uuid'] ?? ('PRD-' . substr(md5($sku), 0, 10));
                if ($existing) {
                    if ((int) ($existing['synced'] ?? 1) === 1) {
                        BaseRepository::run(
                            'UPDATE products SET barcode=?, name=?, brand=?, category=?, cost=?, price=?, reorder_level=?, serialized=?, commission_type=?, commission_value=?, active=?, sync_uuid=?, synced=1 WHERE id=?',
                            [
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
                                $syncUuid,
                                $existing['id'],
                            ]
                        );
                    }
                    $productBySku[$sku] = (int) $existing['id'];
                } else {
                    // Clear conflicting barcode if reassigned on server
                    if (!empty($p['barcode'])) {
                        BaseRepository::run('UPDATE products SET barcode=NULL WHERE barcode=?', [$p['barcode']]);
                    }
                    $newPid = BaseRepository::insert(
                        'INSERT INTO products (sku, barcode, name, brand, category, cost, price, reorder_level, serialized, commission_type, commission_value, active, sync_uuid, synced) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
                        [
                            $sku,
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
                            $syncUuid,
                        ]
                    );
                    $productBySku[$sku] = $newPid;
                }
                $stats['products_synced']++;
            }

            // 4. Branch stock quantities (authoritative after push)
            $pendingStockBlocking = (int) BaseRepository::scalar('SELECT COUNT(*) FROM sales WHERE synced=0')
                + (int) BaseRepository::scalar('SELECT COUNT(*) FROM stock_movements WHERE synced=0');
            if ($pendingStockBlocking === 0) {
                foreach ($data['stock'] ?? [] as $st) {
                    $sku = (string) ($st['product_sku'] ?? '');
                    if (!isset($productBySku[$sku])) continue;
                    $pid = $productBySku[$sku];
                    $bid = $resolveLocalBranch($st['branch_name'] ?? null, (int) ($st['branch_id'] ?? 1));
                    $sql = $isSqlite
                        ? 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,?) ON CONFLICT(branch_id, product_id) DO UPDATE SET qty=excluded.qty'
                        : 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty=VALUES(qty)';
                    BaseRepository::run($sql, [$bid, $pid, max(0, (int) $st['qty'])]);
                    $stats['stock_synced']++;
                }
            }

            // 5. Device units
            foreach ($data['units'] ?? [] as $un) {
                $sku = (string) ($un['product_sku'] ?? '');
                $code = trim((string) ($un['code'] ?? ''));
                if ($code === '' || !isset($productBySku[$sku])) continue;
                $pid = $productBySku[$sku];
                $bid = $resolveLocalBranch($un['branch_name'] ?? null, (int) ($un['branch_id'] ?? 1));
                $syncUuid = $un['sync_uuid'] ?? ('UNT-' . substr(md5($code), 0, 10));
                $existing = BaseRepository::one('SELECT id, synced FROM units WHERE code=? LIMIT 1', [$code]);
                if ($existing) {
                    if ((int) ($existing['synced'] ?? 1) === 1) {
                        BaseRepository::run(
                            'UPDATE units SET branch_id=?, product_id=?, imei=?, grade=?, state=?, sync_uuid=?, synced=1 WHERE id=?',
                            [$bid, $pid, $un['imei'] ?: null, $un['grade'] ?? 'New', $un['state'] ?? 'Available', $syncUuid, $existing['id']]
                        );
                    }
                } else {
                    if (!empty($un['imei'])) {
                        BaseRepository::run('UPDATE units SET imei=NULL WHERE imei=?', [$un['imei']]);
                    }
                    BaseRepository::run(
                        'INSERT INTO units (product_id, branch_id, code, imei, grade, state, sync_uuid, synced) VALUES (?,?,?,?,?,?,?,1)',
                        [$pid, $bid, $code, $un['imei'] ?: null, $un['grade'] ?? 'New', $un['state'] ?? 'Available', $syncUuid]
                    );
                }
                $stats['units_synced']++;
            }

            // 6. Customers
            foreach ($data['customers'] ?? [] as $c) {
                if (empty($c['name']) || empty($c['phone'])) continue;
                $bid = $resolveLocalBranch($c['branch_name'] ?? null, (int) ($c['branch_id'] ?? 1));
                $syncUuid = (string) ($c['sync_uuid'] ?? ('CUS-' . substr(md5(($c['phone'] ?? '') . '|' . ($c['name'] ?? '')), 0, 10)));
                $existing = BaseRepository::one(
                    'SELECT id, synced FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=?) LIMIT 1',
                    [$syncUuid, $bid, $c['phone']]
                );
                if ($existing) {
                    if ((int) ($existing['synced'] ?? 1) === 1) {
                        BaseRepository::run(
                            'UPDATE customers SET name=?, email=?, notes=?, sync_uuid=?, synced=1 WHERE id=?',
                            [$c['name'], $c['email'] ?? '', $c['notes'] ?? '', $syncUuid, $existing['id']]
                        );
                    }
                } elseif ($isSqlite) {
                    BaseRepository::run(
                        'INSERT INTO customers (uuid, branch_id, name, phone, email, notes, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
                        [$syncUuid, $bid, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', $syncUuid, $c['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO customers (branch_id, name, phone, email, notes, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,1,?)',
                        [$bid, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', $syncUuid, $c['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                }
                $stats['customers_synced']++;
            }

            // 7. Suppliers & Purchases
            $supplierByName = [];
            foreach ($data['suppliers'] ?? [] as $sp) {
                $sName = trim((string) ($sp['name'] ?? ''));
                if ($sName === '') continue;
                $existingId = (int) BaseRepository::scalar('SELECT id FROM suppliers WHERE name=? LIMIT 1', [$sName]);
                if ($existingId > 0) {
                    $supplierByName[$sName] = $existingId;
                } else {
                    $supplierByName[$sName] = BaseRepository::insert(
                        'INSERT INTO suppliers (name, phone, sync_uuid, synced) VALUES (?,?,?,1)',
                        [$sName, $sp['phone'] ?? '', $sp['sync_uuid'] ?? ('SUP-' . substr(md5($sName), 0, 10))]
                    );
                }
            }

            foreach ($data['purchases'] ?? [] as $pu) {
                $sku = (string) ($pu['product_sku'] ?? '');
                $sName = (string) ($pu['supplier_name'] ?? '');
                if (!isset($productBySku[$sku], $supplierByName[$sName])) continue;
                $bid = $resolveLocalBranch($pu['branch_name'] ?? null, (int) ($pu['branch_id'] ?? 1));
                $sid = $supplierByName[$sName];
                $pid = $productBySku[$sku];
                $syncUuid = $pu['sync_uuid'] ?? ('PO-' . substr(md5("{$bid}|{$sid}|{$pu['invoice']}|{$pid}"), 0, 10));
                $existing = BaseRepository::one(
                    'SELECT id, synced FROM purchases WHERE sync_uuid=? OR (branch_id=? AND supplier_id=? AND invoice=? AND product_id=?) LIMIT 1',
                    [$syncUuid, $bid, $sid, $pu['invoice'], $pid]
                );
                if ($existing) {
                    if ((int) ($existing['synced'] ?? 1) === 1) {
                        BaseRepository::run(
                            'UPDATE purchases SET balance=?, sync_uuid=?, synced=1 WHERE id=?',
                            [(int) $pu['balance'], $syncUuid, $existing['id']]
                        );
                    }
                } else {
                    BaseRepository::run(
                        'INSERT INTO purchases (branch_id, supplier_id, product_id, qty, unit_cost, balance, invoice, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)',
                        [$bid, $sid, $pid, (int) $pu['qty'], (int) $pu['unit_cost'], (int) $pu['balance'], $pu['invoice'], $syncUuid, $pu['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                }
            }

            // 8. Stock transfers
            foreach ($data['transfers'] ?? [] as $tr) {
                $sku = (string) ($tr['product_sku'] ?? '');
                if (!isset($productBySku[$sku])) continue;
                $pid = $productBySku[$sku];
                $fromB = $resolveLocalBranch($tr['from_branch_name'] ?? null, (int) ($tr['from_branch'] ?? 1));
                $toB = $resolveLocalBranch($tr['to_branch_name'] ?? null, (int) ($tr['to_branch'] ?? 1));
                $unitId = !empty($tr['unit_code']) ? (BaseRepository::scalar('SELECT id FROM units WHERE code=? LIMIT 1', [$tr['unit_code']]) ?: null) : null;
                $syncUuid = $tr['sync_uuid'] ?? ('TR-' . substr(md5("{$fromB}|{$toB}|{$sku}|" . ($tr['created_at'] ?? '')), 0, 10));
                $existing = BaseRepository::one('SELECT id, synced FROM transfers WHERE sync_uuid=? LIMIT 1', [$syncUuid]);
                if ($existing) {
                    if ((int) ($existing['synced'] ?? 1) === 1) {
                        BaseRepository::run('UPDATE transfers SET status=?, synced=1 WHERE id=?', [$tr['status'], $existing['id']]);
                    }
                } else {
                    BaseRepository::run(
                        'INSERT INTO transfers (from_branch, to_branch, product_id, qty, unit_id, status, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
                        [$fromB, $toB, $pid, (int) $tr['qty'], $unitId, $tr['status'], $syncUuid, $tr['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                }
                $stats['transfers_synced']++;
            }

            // 9. Repairs
            foreach ($data['repairs'] ?? [] as $rep) {
                if (empty($rep['device'])) continue;
                $bid = $resolveLocalBranch($rep['branch_name'] ?? null, (int) ($rep['branch_id'] ?? 1));
                $syncUuid = (string) ($rep['sync_uuid'] ?? ('REP-' . substr(md5(($rep['device'] ?? '') . '|' . ($rep['created_at'] ?? '')), 0, 10)));
                $cid = (int) (BaseRepository::scalar(
                    'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=?) LIMIT 1',
                    [$rep['customer_sync_uuid'] ?? '', $bid, $rep['customer_phone'] ?? '']
                ) ?: 0);
                if ($cid <= 0) continue;
                $techId = !empty($rep['technician_email']) ? ($userByEmail[strtolower($rep['technician_email'])] ?? null) : null;
                $existing = BaseRepository::one('SELECT id, synced FROM repairs WHERE sync_uuid=? LIMIT 1', [$syncUuid]);
                if ($existing) {
                    if ((int) ($existing['synced'] ?? 1) === 1) {
                        BaseRepository::run(
                            'UPDATE repairs SET status=?, notes=?, technician_id=?, synced=1 WHERE id=?',
                            [$rep['status'] ?? 'Received', $rep['notes'] ?? '', $techId, $existing['id']]
                        );
                    }
                } elseif ($isSqlite) {
                    BaseRepository::run(
                        'INSERT INTO repairs (uuid, branch_id, customer_id, technician_id, device, serial, issue, accessories, notes, estimate, due_date, status, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)',
                        [
                            $syncUuid, $bid, $cid, $techId, $rep['device'], $rep['serial'] ?? '',
                            $rep['issue'] ?? '', $rep['accessories'] ?? '', $rep['notes'] ?? '',
                            (int) ($rep['estimate'] ?? 0), $rep['due_date'] ?? date('Y-m-d'),
                            $rep['status'] ?? 'Received', $syncUuid, $rep['created_at'] ?? date('Y-m-d H:i:s'),
                        ]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO repairs (branch_id, customer_id, technician_id, device, serial, issue, accessories, notes, estimate, due_date, status, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)',
                        [
                            $bid, $cid, $techId, $rep['device'], $rep['serial'] ?? '',
                            $rep['issue'] ?? '', $rep['accessories'] ?? '', $rep['notes'] ?? '',
                            (int) ($rep['estimate'] ?? 0), $rep['due_date'] ?? date('Y-m-d'),
                            $rep['status'] ?? 'Received', $syncUuid, $rep['created_at'] ?? date('Y-m-d H:i:s'),
                        ]
                    );
                }
                $stats['repairs_synced']++;
            }

            // 10. Online branch sales (latest history pulled to local DB without duplicating)
            foreach ($data['sales'] ?? [] as $entry) {
                $s = $entry['sale'] ?? [];
                if (empty($s)) continue;
                $syncUuid = (string) ($s['sync_uuid'] ?? ('SL-' . ($s['id'] ?? 0) . '-' . substr(md5(($s['created_at'] ?? '') . '|' . ($s['total'] ?? 0)), 0, 8)));
                if (BaseRepository::scalar('SELECT id FROM sales WHERE sync_uuid=? LIMIT 1', [$syncUuid])) {
                    continue;
                }
                $bid = $resolveLocalBranch($s['branch_name'] ?? null, (int) ($s['branch_id'] ?? 1));
                $uid = $resolveLocalUser($s['user_email'] ?? null);
                $cid = (!empty($s['customer_sync_uuid']) || !empty($s['customer_phone']))
                    ? (BaseRepository::scalar(
                        'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=?) LIMIT 1',
                        [$s['customer_sync_uuid'] ?? '', $bid, $s['customer_phone'] ?? '']
                    ) ?: null)
                    : null;
                $drawerId = self::ensureSyncDrawer($bid, $uid, substr((string) ($s['created_at'] ?? date('Y-m-d')), 0, 10));

                $saleSql = $isSqlite
                    ? 'INSERT INTO sales (uuid, branch_id, user_id, drawer_id, customer_id, subtotal, discount, tax, total, credit, due_date, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)'
                    : 'INSERT INTO sales (branch_id, user_id, drawer_id, customer_id, subtotal, discount, tax, total, credit, due_date, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)';
                $saleParams = $isSqlite
                    ? [$syncUuid, $bid, $uid, $drawerId, $cid, (int) $s['subtotal'], (int) $s['discount'], (int) $s['tax'], (int) $s['total'], (int) ($s['credit'] ?? 0), $s['due_date'] ?? null, $syncUuid, $s['created_at'] ?? date('Y-m-d H:i:s')]
                    : [$bid, $uid, $drawerId, $cid, (int) $s['subtotal'], (int) $s['discount'], (int) $s['tax'], (int) $s['total'], (int) ($s['credit'] ?? 0), $s['due_date'] ?? null, $syncUuid, $s['created_at'] ?? date('Y-m-d H:i:s')];
                $newSaleId = BaseRepository::insert($saleSql, $saleParams);

                foreach ($entry['items'] ?? [] as $it) {
                    $pid = $productBySku[$it['product_sku'] ?? ''] ?? (int) ($it['product_id'] ?? 0);
                    if ($pid <= 0) continue;
                    $unId = !empty($it['unit_code']) ? (BaseRepository::scalar('SELECT id FROM units WHERE code=? LIMIT 1', [$it['unit_code']]) ?: null) : null;
                    BaseRepository::run(
                        'INSERT INTO sale_items (sale_id, product_id, unit_id, name, qty, price, total, refunded_qty, commission_amount) VALUES (?,?,?,?,?,?,?,?,?)',
                        [$newSaleId, $pid, $unId, $it['name'], (int) $it['qty'], (int) $it['price'], (int) $it['total'], (int) ($it['refunded_qty'] ?? 0), (int) ($it['commission_amount'] ?? 0)]
                    );
                }

                foreach ($entry['payments'] ?? [] as $pm) {
                    $pSql = $isSqlite
                        ? 'INSERT OR IGNORE INTO payments (sale_id, drawer_id, user_id, kind, method, amount, reference, created_at) VALUES (?,?,?,?,?,?,?,?)'
                        : 'INSERT IGNORE INTO payments (sale_id, drawer_id, user_id, kind, method, amount, reference, created_at) VALUES (?,?,?,?,?,?,?,?)';
                    BaseRepository::run($pSql, [$newSaleId, $drawerId, $uid, $pm['kind'] ?? 'Sale', $pm['method'] ?? 'Cash', (int) ($pm['amount'] ?? 0), !empty($pm['reference']) ? $pm['reference'] : null, $pm['created_at'] ?? date('Y-m-d H:i:s')]);
                }
                $stats['sales_synced']++;
            }

            // 11. Shop & receipt settings (preserve local cloud_backup_url/cloud_api_key/delete_pin_hash)
            if (!empty($data['settings']) && is_array($data['settings'])) {
                $st = $data['settings'];
                BaseRepository::run(
                    'UPDATE settings SET shop_name=?, shop_phone=?, shop_address=?, shop_email=?, invoice_prefix=?, paper_width=?, receipt_footer=?, tax_bps=?, show_tax_on_receipt=? WHERE id=1',
                    [
                        $st['shop_name'] ?? 'ZEEDAT POS',
                        $st['shop_phone'] ?? '',
                        $st['shop_address'] ?? '',
                        $st['shop_email'] ?? '',
                        $st['invoice_prefix'] ?? 'INV-',
                        $st['paper_width'] ?? '80',
                        $st['receipt_footer'] ?? 'Thank you for your business!',
                        (int) ($st['tax_bps'] ?? 0),
                        (int) ($st['show_tax_on_receipt'] ?? 1),
                    ]
                );
            }
        });

        BaseRepository::run(
            'UPDATE settings SET last_synced_at=' . ($isSqlite ? "DATETIME('now','localtime')" : 'NOW()') . ' WHERE id = 1'
        );

        return array_merge($stats, [
            'success' => true,
            'message' => "Synced {$stats['branches_synced']} branch(es), {$stats['products_synced']} product(s), {$stats['stock_synced']} stock record(s), {$stats['customers_synced']} customer(s), and {$stats['sales_synced']} online sale(s).",
        ]);
    }

    /**
     * Resolves or provisions a cycle + drawer on the target database so offline sales never fail drawer_id FK.
     */
    private static function ensureSyncDrawer(int $branchId, int $userId, string $businessDate): int {
        $existingOpen = BaseRepository::scalar('SELECT id FROM drawers WHERE branch_id=? AND closed_at IS NULL ORDER BY id DESC LIMIT 1', [$branchId]);
        if ($existingOpen) {
            return (int) $existingOpen;
        }
        $existingRecent = BaseRepository::scalar('SELECT id FROM drawers WHERE branch_id=? ORDER BY id DESC LIMIT 1', [$branchId]);
        if ($existingRecent) {
            return (int) $existingRecent;
        }

        $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', $businessDate) ? $businessDate : date('Y-m-d');
        $cycleSql = Database::isSqlite()
            ? 'INSERT OR IGNORE INTO cycles (branch_id, business_date) VALUES (?,?)'
            : 'INSERT IGNORE INTO cycles (branch_id, business_date) VALUES (?,?)';
        BaseRepository::run($cycleSql, [$branchId, $date]);
        $cycleId = (int) BaseRepository::scalar('SELECT id FROM cycles WHERE branch_id=? AND business_date=? LIMIT 1', [$branchId, $date]);

        return BaseRepository::insert(
            'INSERT INTO drawers (branch_id, user_id, cycle_id, opening, notes) VALUES (?,?,?,?,?)',
            [$branchId, $userId, $cycleId, 0, 'Cloud Sync Drawer']
        );
    }

    /**
     * Server Receiver: Applies incoming offline changes cleanly into Server MySQL with full FK mapping.
     */
    public static function handleSyncReceive(array $headers, array $payload, bool $internal = false): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $expectedKey = trim((string) ($settings['cloud_api_key'] ?? ''));
        $token = BackupService::extractBearerToken($headers);

        if (!$internal && $expectedKey !== '' && ($token === '' || !hash_equals($expectedKey, $token))) {
            return ['success' => false, 'code' => 401, 'error' => 'Invalid or missing sync key.'];
        }

        $isSqlite = Database::isSqlite();
        $acked = [
            'synced_branches' => [],
            'synced_products' => [],
            'synced_customers' => [],
            'synced_units' => [],
            'synced_suppliers' => [],
            'synced_purchases' => [],
            'synced_transfers' => [],
            'synced_repairs' => [],
            'synced_sales' => [],
            'synced_movements' => [],
        ];

        BaseRepository::transaction(function () use ($payload, $isSqlite, &$acked) {
            $defaultBranchId = (int) ($payload['branch_id'] ?? 1);
            $defaultUserId = (int) (BaseRepository::scalar('SELECT id FROM users WHERE active=1 ORDER BY id ASC LIMIT 1') ?: 1);

            $resolveBranch = static function (?string $name, int $fallbackId) use ($defaultBranchId): int {
                $clean = trim((string) $name);
                if ($clean !== '') {
                    $id = (int) BaseRepository::scalar('SELECT id FROM branches WHERE name=? LIMIT 1', [$clean]);
                    if ($id > 0) return $id;
                    return BaseRepository::insert('INSERT INTO branches (name, synced) VALUES (?,1)', [$clean]);
                }
                $check = (int) BaseRepository::scalar('SELECT id FROM branches WHERE id=? LIMIT 1', [$fallbackId ?: $defaultBranchId]);
                return $check > 0 ? $check : ((int) BaseRepository::scalar('SELECT id FROM branches ORDER BY id ASC LIMIT 1') ?: 1);
            };

            $resolveUser = static function (?string $email) use ($defaultUserId): int {
                $e = strtolower(trim((string) $email));
                if ($e !== '') {
                    $id = (int) BaseRepository::scalar('SELECT id FROM users WHERE email=? LIMIT 1', [$e]);
                    if ($id > 0) return $id;
                }
                return $defaultUserId;
            };

            $resolveProduct = static function (?string $sku, ?int $fallbackId = null): int {
                if ($sku) {
                    $id = (int) BaseRepository::scalar('SELECT id FROM products WHERE sku=? LIMIT 1', [$sku]);
                    if ($id > 0) return $id;
                }
                if ($fallbackId && BaseRepository::scalar('SELECT id FROM products WHERE id=? LIMIT 1', [$fallbackId])) {
                    return $fallbackId;
                }
                return 0;
            };

            // 1. Branches
            foreach ($payload['branches'] ?? [] as $b) {
                $name = trim((string) ($b['name'] ?? ''));
                if ($name === '') continue;
                $existing = BaseRepository::scalar('SELECT id FROM branches WHERE name=? LIMIT 1', [$name]);
                if ($existing) {
                    BaseRepository::run('UPDATE branches SET phone=?, address=?, sync_uuid=?, synced=1 WHERE id=?', [$b['phone'] ?? '', $b['address'] ?? '', $b['sync_uuid'] ?? null, $existing]);
                } else {
                    BaseRepository::run('INSERT INTO branches (name, phone, address, sync_uuid, synced) VALUES (?,?,?,?,1)', [$name, $b['phone'] ?? '', $b['address'] ?? '', $b['sync_uuid'] ?? null]);
                }
                $acked['synced_branches'][] = $b['id'];
            }

            // 2. Products
            foreach ($payload['products'] ?? [] as $p) {
                $sku = trim((string) ($p['sku'] ?? ''));
                if ($sku === '' || empty($p['name'])) continue;
                $existingId = (int) BaseRepository::scalar('SELECT id FROM products WHERE sku=? LIMIT 1', [$sku]);
                $barcode = !empty($p['barcode']) ? $p['barcode'] : null;
                if ($barcode !== null) {
                    $holder = (int) BaseRepository::scalar('SELECT id FROM products WHERE barcode=? LIMIT 1', [$barcode]);
                    if ($holder > 0 && $holder !== $existingId) {
                        $barcode = null;
                    }
                }
                if ($existingId > 0) {
                    BaseRepository::run(
                        'UPDATE products SET barcode=?, name=?, brand=?, category=?, cost=?, price=?, reorder_level=?, serialized=?, commission_type=?, commission_value=?, active=?, sync_uuid=?, synced=1 WHERE id=?',
                        [
                            $barcode, $p['name'], $p['brand'] ?? '', $p['category'],
                            (int) $p['cost'], (int) $p['price'], (int) ($p['reorder_level'] ?? 0), (int) ($p['serialized'] ?? 0),
                            $p['commission_type'] ?? 'fixed', (int) ($p['commission_value'] ?? 0), (int) ($p['active'] ?? 1),
                            $p['sync_uuid'] ?? null, $existingId,
                        ]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO products (sku, barcode, name, brand, category, cost, price, reorder_level, serialized, commission_type, commission_value, active, sync_uuid, synced) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
                        [
                            $sku, $barcode, $p['name'], $p['brand'] ?? '', $p['category'],
                            (int) $p['cost'], (int) $p['price'], (int) ($p['reorder_level'] ?? 0), (int) ($p['serialized'] ?? 0),
                            $p['commission_type'] ?? 'fixed', (int) ($p['commission_value'] ?? 0), (int) ($p['active'] ?? 1),
                            $p['sync_uuid'] ?? null,
                        ]
                    );
                }
                $acked['synced_products'][] = $p['id'];
            }

            // 3. Customers
            foreach ($payload['customers'] ?? [] as $c) {
                if (empty($c['name']) || empty($c['phone'])) continue;
                $bid = $resolveBranch($c['branch_name'] ?? null, (int) ($c['branch_id'] ?? $defaultBranchId));
                $syncUuid = (string) ($c['sync_uuid'] ?? $c['uuid'] ?? ('CUS-' . ($c['id'] ?? 0)));
                $existing = BaseRepository::one(
                    'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=?) LIMIT 1',
                    [$syncUuid, $bid, $c['phone']]
                );
                if ($existing) {
                    BaseRepository::run(
                        'UPDATE customers SET name=?, email=?, notes=?, sync_uuid=?, synced=1 WHERE id=?',
                        [$c['name'], $c['email'] ?? '', $c['notes'] ?? '', $syncUuid, $existing['id']]
                    );
                } elseif ($isSqlite) {
                    BaseRepository::run(
                        'INSERT INTO customers (uuid, branch_id, name, phone, email, notes, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
                        [$syncUuid, $bid, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', $syncUuid, $c['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO customers (branch_id, name, phone, email, notes, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,1,?)',
                        [$bid, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', $syncUuid, $c['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                }
                $acked['synced_customers'][] = $c['id'];
            }

            // 4. Units
            foreach ($payload['units'] ?? [] as $un) {
                $code = trim((string) ($un['code'] ?? ''));
                $pid = $resolveProduct($un['product_sku'] ?? null, (int) ($un['product_id'] ?? 0));
                if ($code === '' || $pid <= 0) continue;
                $bid = $resolveBranch($un['branch_name'] ?? null, (int) ($un['branch_id'] ?? $defaultBranchId));
                $imei = !empty($un['imei']) ? $un['imei'] : null;
                $existingId = (int) BaseRepository::scalar('SELECT id FROM units WHERE code=? LIMIT 1', [$code]);
                if ($imei !== null) {
                    $imeiHolder = (int) BaseRepository::scalar('SELECT id FROM units WHERE imei=? LIMIT 1', [$imei]);
                    if ($imeiHolder > 0 && $imeiHolder !== $existingId) {
                        $imei = null;
                    }
                }
                if ($existingId > 0) {
                    BaseRepository::run(
                        'UPDATE units SET branch_id=?, product_id=?, imei=?, grade=?, state=?, sync_uuid=?, synced=1 WHERE id=?',
                        [$bid, $pid, $imei, $un['grade'] ?? 'New', $un['state'] ?? 'Available', $un['sync_uuid'] ?? null, $existingId]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO units (product_id, branch_id, code, imei, grade, state, sync_uuid, synced) VALUES (?,?,?,?,?,?,?,1)',
                        [$pid, $bid, $code, $imei, $un['grade'] ?? 'New', $un['state'] ?? 'Available', $un['sync_uuid'] ?? null]
                    );
                }
                $acked['synced_units'][] = $un['id'];
            }

            // 5. Suppliers & Purchases
            foreach ($payload['suppliers'] ?? [] as $sp) {
                $sName = trim((string) ($sp['name'] ?? ''));
                if ($sName === '') continue;
                $existing = BaseRepository::scalar('SELECT id FROM suppliers WHERE name=? LIMIT 1', [$sName]);
                if ($existing) {
                    BaseRepository::run('UPDATE suppliers SET phone=?, sync_uuid=?, synced=1 WHERE id=?', [$sp['phone'] ?? '', $sp['sync_uuid'] ?? null, $existing]);
                } else {
                    BaseRepository::run('INSERT INTO suppliers (name, phone, sync_uuid, synced) VALUES (?,?,?,1)', [$sName, $sp['phone'] ?? '', $sp['sync_uuid'] ?? null]);
                }
                $acked['synced_suppliers'][] = $sp['id'];
            }

            foreach ($payload['purchases'] ?? [] as $pu) {
                $pid = $resolveProduct($pu['product_sku'] ?? null, (int) ($pu['product_id'] ?? 0));
                $sName = trim((string) ($pu['supplier_name'] ?? ''));
                if ($pid <= 0 || $sName === '') continue;
                $sid = (int) (BaseRepository::scalar('SELECT id FROM suppliers WHERE name=? LIMIT 1', [$sName])
                    ?: BaseRepository::insert('INSERT INTO suppliers (name, phone, synced) VALUES (?,?,1)', [$sName, '']));
                $bid = $resolveBranch($pu['branch_name'] ?? null, (int) ($pu['branch_id'] ?? $defaultBranchId));
                $syncUuid = (string) ($pu['sync_uuid'] ?? ('PO-' . substr(md5("{$bid}|{$sid}|{$pu['invoice']}|{$pid}"), 0, 10)));
                $existing = BaseRepository::scalar(
                    'SELECT id FROM purchases WHERE sync_uuid=? OR (branch_id=? AND supplier_id=? AND invoice=? AND product_id=?) LIMIT 1',
                    [$syncUuid, $bid, $sid, $pu['invoice'], $pid]
                );
                if ($existing) {
                    BaseRepository::run('UPDATE purchases SET balance=?, sync_uuid=?, synced=1 WHERE id=?', [(int) $pu['balance'], $syncUuid, $existing]);
                } else {
                    BaseRepository::run(
                        'INSERT INTO purchases (branch_id, supplier_id, product_id, qty, unit_cost, balance, invoice, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)',
                        [$bid, $sid, $pid, (int) $pu['qty'], (int) $pu['unit_cost'], (int) $pu['balance'], $pu['invoice'], $syncUuid, $pu['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                    $stkSql = $isSqlite
                        ? 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,?) ON CONFLICT(branch_id, product_id) DO UPDATE SET qty=stock.qty+excluded.qty'
                        : 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty=qty+VALUES(qty)';
                    BaseRepository::run($stkSql, [$bid, $pid, (int) $pu['qty']]);
                }
                $acked['synced_purchases'][] = $pu['id'];
            }

            // 6. Transfers
            foreach ($payload['transfers'] ?? [] as $tr) {
                $pid = $resolveProduct($tr['product_sku'] ?? null, (int) ($tr['product_id'] ?? 0));
                if ($pid <= 0) continue;
                $fromB = $resolveBranch($tr['from_branch_name'] ?? null, (int) ($tr['from_branch'] ?? $defaultBranchId));
                $toB = $resolveBranch($tr['to_branch_name'] ?? null, (int) ($tr['to_branch'] ?? $defaultBranchId));
                $unitId = !empty($tr['unit_code']) ? (BaseRepository::scalar('SELECT id FROM units WHERE code=? LIMIT 1', [$tr['unit_code']]) ?: null) : null;
                $syncUuid = (string) ($tr['sync_uuid'] ?? ('TR-' . ($tr['id'] ?? 0)));
                $existing = BaseRepository::one('SELECT id, status FROM transfers WHERE sync_uuid=? LIMIT 1', [$syncUuid]);
                $newStatus = $tr['status'] ?? 'Requested';
                if ($existing) {
                    if ($existing['status'] !== $newStatus) {
                        if ($newStatus === 'Dispatched') {
                            BaseRepository::run($isSqlite ? 'UPDATE stock SET qty=MAX(0, qty-?) WHERE branch_id=? AND product_id=?' : 'UPDATE stock SET qty=GREATEST(0, CAST(qty AS SIGNED)-?) WHERE branch_id=? AND product_id=?', [(int) $tr['qty'], $fromB, $pid]);
                        } elseif ($newStatus === 'Received') {
                            $stkSql = $isSqlite
                                ? 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,?) ON CONFLICT(branch_id, product_id) DO UPDATE SET qty=stock.qty+excluded.qty'
                                : 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty=qty+VALUES(qty)';
                            BaseRepository::run($stkSql, [$toB, $pid, (int) $tr['qty']]);
                        }
                        BaseRepository::run('UPDATE transfers SET status=?, synced=1 WHERE id=?', [$newStatus, $existing['id']]);
                    }
                } else {
                    BaseRepository::run(
                        'INSERT INTO transfers (from_branch, to_branch, product_id, qty, unit_id, status, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
                        [$fromB, $toB, $pid, (int) $tr['qty'], $unitId, $newStatus, $syncUuid, $tr['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                }
                $acked['synced_transfers'][] = $tr['id'];
            }

            // 7. Repairs
            foreach ($payload['repairs'] ?? [] as $r) {
                if (empty($r['device'])) continue;
                $bid = $resolveBranch($r['branch_name'] ?? null, (int) ($r['branch_id'] ?? $defaultBranchId));
                $syncUuid = (string) ($r['sync_uuid'] ?? $r['uuid'] ?? ('REP-' . ($r['id'] ?? 0)));
                $cid = (int) (BaseRepository::scalar(
                    'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=?) LIMIT 1',
                    [$r['customer_sync_uuid'] ?? '', $bid, $r['customer_phone'] ?? '']
                ) ?: 0);
                if ($cid <= 0 && !empty($r['customer_phone'])) {
                    $cUuid = $r['customer_sync_uuid'] ?: ('CUS-' . substr(md5($r['customer_phone']), 0, 10));
                    $cid = $isSqlite
                        ? BaseRepository::insert('INSERT INTO customers (uuid, branch_id, name, phone, sync_uuid, synced) VALUES (?,?,?,?,?,1)', [$cUuid, $bid, $r['customer_name'] ?? 'Walk-in', $r['customer_phone'], $cUuid])
                        : BaseRepository::insert('INSERT INTO customers (branch_id, name, phone, sync_uuid, synced) VALUES (?,?,?,?,1)', [$bid, $r['customer_name'] ?? 'Walk-in', $r['customer_phone'], $cUuid]);
                }
                if ($cid <= 0) {
                    $cid = (int) (BaseRepository::scalar('SELECT id FROM customers ORDER BY id ASC LIMIT 1') ?: 0);
                }
                if ($cid <= 0) continue;

                $techId = !empty($r['technician_email']) ? (BaseRepository::scalar('SELECT id FROM users WHERE email=? LIMIT 1', [$r['technician_email']]) ?: null) : null;
                $existingRep = BaseRepository::scalar('SELECT id FROM repairs WHERE sync_uuid=? LIMIT 1', [$syncUuid]);
                if ($existingRep) {
                    BaseRepository::run('UPDATE repairs SET status=?, notes=?, technician_id=?, synced=1 WHERE id=?', [$r['status'] ?? 'Received', $r['notes'] ?? '', $techId, $existingRep]);
                } elseif ($isSqlite) {
                    BaseRepository::run(
                        'INSERT INTO repairs (uuid, branch_id, customer_id, technician_id, device, serial, issue, accessories, notes, estimate, due_date, status, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)',
                        [$syncUuid, $bid, $cid, $techId, $r['device'], $r['serial'] ?? '', $r['issue'] ?? '', $r['accessories'] ?? '', $r['notes'] ?? '', (int) ($r['estimate'] ?? 0), $r['due_date'] ?? date('Y-m-d'), $r['status'] ?? 'Received', $syncUuid, $r['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO repairs (branch_id, customer_id, technician_id, device, serial, issue, accessories, notes, estimate, due_date, status, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)',
                        [$bid, $cid, $techId, $r['device'], $r['serial'] ?? '', $r['issue'] ?? '', $r['accessories'] ?? '', $r['notes'] ?? '', (int) ($r['estimate'] ?? 0), $r['due_date'] ?? date('Y-m-d'), $r['status'] ?? 'Received', $syncUuid, $r['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                }
                $acked['synced_repairs'][] = $r['id'];
            }

            // 8. Sales + Sale Items + Payments (with resolved Branch, User, Drawer, Customer, Product, Unit FKs)
            foreach ($payload['sales'] ?? [] as $saleEntry) {
                $s = $saleEntry['sale'] ?? [];
                if (empty($s)) continue;
                $bid = $resolveBranch($s['branch_name'] ?? null, (int) ($s['branch_id'] ?? $defaultBranchId));
                $uid = $resolveUser($s['user_email'] ?? null);
                $syncUuid = (string) ($s['sync_uuid'] ?? $s['uuid'] ?? ('SL-' . ($s['id'] ?? 0)));

                if (!BaseRepository::scalar('SELECT id FROM sales WHERE sync_uuid = ? LIMIT 1', [$syncUuid])) {
                    $cid = (!empty($s['customer_sync_uuid']) || !empty($s['customer_phone']))
                        ? (BaseRepository::scalar(
                            'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=?) LIMIT 1',
                            [$s['customer_sync_uuid'] ?? '', $bid, $s['customer_phone'] ?? '']
                        ) ?: null)
                        : null;
                    $drawerId = self::ensureSyncDrawer($bid, $uid, substr((string) ($s['created_at'] ?? date('Y-m-d')), 0, 10));

                    $saleSql = $isSqlite
                        ? 'INSERT INTO sales (uuid, branch_id, user_id, drawer_id, customer_id, subtotal, discount, tax, total, credit, due_date, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)'
                        : 'INSERT INTO sales (branch_id, user_id, drawer_id, customer_id, subtotal, discount, tax, total, credit, due_date, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)';
                    $saleParams = $isSqlite
                        ? [$syncUuid, $bid, $uid, $drawerId, $cid, (int) ($s['subtotal'] ?? 0), (int) ($s['discount'] ?? 0), (int) ($s['tax'] ?? 0), (int) ($s['total'] ?? 0), (int) ($s['credit'] ?? 0), $s['due_date'] ?? null, $syncUuid, $s['created_at'] ?? date('Y-m-d H:i:s')]
                        : [$bid, $uid, $drawerId, $cid, (int) ($s['subtotal'] ?? 0), (int) ($s['discount'] ?? 0), (int) ($s['tax'] ?? 0), (int) ($s['total'] ?? 0), (int) ($s['credit'] ?? 0), $s['due_date'] ?? null, $syncUuid, $s['created_at'] ?? date('Y-m-d H:i:s')];
                    $newSaleId = BaseRepository::insert($saleSql, $saleParams);

                    foreach ($saleEntry['items'] ?? [] as $it) {
                        $pid = $resolveProduct($it['product_sku'] ?? null, (int) ($it['product_id'] ?? 0));
                        if ($pid <= 0) continue;
                        $unId = !empty($it['unit_code']) ? (BaseRepository::scalar('SELECT id FROM units WHERE code=? LIMIT 1', [$it['unit_code']]) ?: null) : null;
                        BaseRepository::run(
                            'INSERT INTO sale_items (sale_id, product_id, unit_id, name, qty, price, total, refunded_qty, commission_amount) VALUES (?,?,?,?,?,?,?,?,?)',
                            [$newSaleId, $pid, $unId, $it['name'], (int) $it['qty'], (int) $it['price'], (int) $it['total'], (int) ($it['refunded_qty'] ?? 0), (int) ($it['commission_amount'] ?? 0)]
                        );
                        if ($unId) {
                            BaseRepository::run("UPDATE units SET state='Sold', synced=1 WHERE id=?", [$unId]);
                        }
                        $cat = BaseRepository::scalar('SELECT category FROM products WHERE id=?', [$pid]);
                        if ($cat !== 'Services') {
                            $stockSql = $isSqlite
                                ? 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,0) ON CONFLICT(branch_id, product_id) DO UPDATE SET qty = MAX(0, stock.qty - ?)'
                                : 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,0) ON DUPLICATE KEY UPDATE qty = GREATEST(0, CAST(qty AS SIGNED) - ?)';
                            BaseRepository::run($stockSql, [$bid, $pid, (int) $it['qty']]);
                        }
                    }

                    foreach ($saleEntry['payments'] ?? [] as $p) {
                        $paySql = $isSqlite
                            ? 'INSERT OR IGNORE INTO payments (sale_id, drawer_id, user_id, kind, method, amount, reference, created_at) VALUES (?,?,?,?,?,?,?,?)'
                            : 'INSERT IGNORE INTO payments (sale_id, drawer_id, user_id, kind, method, amount, reference, created_at) VALUES (?,?,?,?,?,?,?,?)';
                        BaseRepository::run($paySql, [$newSaleId, $drawerId, $uid, $p['kind'] ?? 'Sale', $p['method'] ?? 'Cash', (int) ($p['amount'] ?? 0), !empty($p['reference']) ? $p['reference'] : null, $p['created_at'] ?? date('Y-m-d H:i:s')]);
                    }
                }
                $acked['synced_sales'][] = $s['id'];
            }

            // 9. Manual stock adjustments / movements (skip deltas already applied by sales, purchases & transfers)
            foreach ($payload['stock_movements'] ?? [] as $mv) {
                $pid = $resolveProduct($mv['product_sku'] ?? null, (int) ($mv['product_id'] ?? 0));
                if ($pid <= 0) {
                    continue;
                }
                $syncUuid = (string) ($mv['sync_uuid'] ?? ('MV-' . ($mv['id'] ?? 0)));
                if (!BaseRepository::scalar('SELECT id FROM stock_movements WHERE sync_uuid=? LIMIT 1', [$syncUuid])) {
                    $bid = $resolveBranch($mv['branch_name'] ?? null, (int) ($mv['branch_id'] ?? $defaultBranchId));
                    $uid = $resolveUser($mv['user_email'] ?? null);
                    $kind = (string) ($mv['kind'] ?? '');
                    BaseRepository::run(
                        'INSERT INTO stock_movements (branch_id, product_id, user_id, qty, kind, reference, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
                        [$bid, $pid, $uid, (int) $mv['qty'], $kind, $mv['reference'] ?? '', $syncUuid, $mv['created_at'] ?? date('Y-m-d H:i:s')]
                    );

                    $handledByEntity = $kind === 'Sale'
                        || str_starts_with($kind, 'Purchase receiving:')
                        || $kind === 'Transfer dispatched'
                        || $kind === 'Transfer received';
                    if (!$handledByEntity && (int) $mv['qty'] !== 0) {
                        $delta = (int) $mv['qty'];
                        $stockSql = $isSqlite
                            ? 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,?) ON CONFLICT(branch_id, product_id) DO UPDATE SET qty = MAX(0, stock.qty + ?)'
                            : 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty = GREATEST(0, CAST(qty AS SIGNED) + ?)';
                        BaseRepository::run($stockSql, [$bid, $pid, max(0, $delta), $delta]);
                    }
                }
                $acked['synced_movements'][] = $mv['id'];
            }
        });

        return array_merge($acked, [
            'success' => true,
            'code' => 200,
            'server_time' => date('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Server Catalog: Returns complete multi-branch state from central MySQL for local SQLite sync.
     */
    public static function handleServerCatalog(int $branchId, array $headers = [], bool $internal = false): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $expectedKey = trim((string) ($settings['cloud_api_key'] ?? ''));
        if (!$internal && $expectedKey !== '') {
            $token = BackupService::extractBearerToken($headers ?: (function_exists('getallheaders') ? (getallheaders() ?: []) : []));
            if ($token === '' || !hash_equals($expectedKey, $token)) {
                Response::json(['error' => 'Invalid or missing sync key.'], 401);
            }
        }

        $products = BaseRepository::rows(
            "SELECT id, sku, barcode, name, brand, category, cost, price, reorder_level, serialized,
                    COALESCE(commission_type, 'fixed') AS commission_type, COALESCE(commission_value, 0) AS commission_value,
                    COALESCE(active, 1) AS active, sync_uuid
             FROM products ORDER BY id ASC"
        );

        $sales = BaseRepository::rows(
            "SELECT s.*, b.name AS branch_name, COALESCE(u.email, '') AS user_email,
                    COALESCE(c.sync_uuid, '') AS customer_sync_uuid, COALESCE(c.phone, '') AS customer_phone
             FROM sales s
             JOIN branches b ON b.id=s.branch_id
             LEFT JOIN users u ON u.id=s.user_id
             LEFT JOIN customers c ON c.id=s.customer_id
             ORDER BY s.id DESC LIMIT 200"
        );
        $saleEntries = [];
        foreach ($sales as $s) {
            $saleEntries[] = [
                'sale' => $s,
                'items' => BaseRepository::rows(
                    "SELECT si.*, p.sku AS product_sku, COALESCE(un.code, '') AS unit_code
                     FROM sale_items si JOIN products p ON p.id=si.product_id LEFT JOIN units un ON un.id=si.unit_id
                     WHERE si.sale_id=?",
                    [$s['id']]
                ),
                'payments' => BaseRepository::rows('SELECT * FROM payments WHERE sale_id=?', [$s['id']]),
            ];
        }

        return [
            'success' => true,
            'count' => count($products),
            'branches' => BaseRepository::rows('SELECT id, name, phone, address, sync_uuid FROM branches ORDER BY id ASC'),
            'role_permissions' => BaseRepository::rows('SELECT role, permission FROM role_permissions'),
            'users' => BaseRepository::rows(
                "SELECT u.id, u.branch_id, COALESCE(b.name, '') AS branch_name, u.name, u.email, u.password_hash, u.role, u.active
                 FROM users u LEFT JOIN branches b ON b.id=u.branch_id ORDER BY u.id ASC"
            ),
            'products' => $products,
            'stock' => BaseRepository::rows(
                "SELECT st.branch_id, b.name AS branch_name, p.sku AS product_sku, st.qty
                 FROM stock st JOIN branches b ON b.id=st.branch_id JOIN products p ON p.id=st.product_id"
            ),
            'units' => BaseRepository::rows(
                "SELECT u.*, b.name AS branch_name, p.sku AS product_sku
                 FROM units u JOIN branches b ON b.id=u.branch_id JOIN products p ON p.id=u.product_id ORDER BY u.id ASC"
            ),
            'customers' => BaseRepository::rows(
                "SELECT c.*, b.name AS branch_name FROM customers c JOIN branches b ON b.id=c.branch_id ORDER BY c.id ASC"
            ),
            'suppliers' => BaseRepository::rows('SELECT id, name, phone, sync_uuid FROM suppliers ORDER BY id ASC'),
            'purchases' => BaseRepository::rows(
                "SELECT pu.*, b.name AS branch_name, sp.name AS supplier_name, p.sku AS product_sku
                 FROM purchases pu JOIN branches b ON b.id=pu.branch_id JOIN suppliers sp ON sp.id=pu.supplier_id JOIN products p ON p.id=pu.product_id
                 ORDER BY pu.id DESC LIMIT 200"
            ),
            'transfers' => BaseRepository::rows(
                "SELECT t.*, fb.name AS from_branch_name, tb.name AS to_branch_name, p.sku AS product_sku, COALESCE(un.code, '') AS unit_code
                 FROM transfers t JOIN branches fb ON fb.id=t.from_branch JOIN branches tb ON tb.id=t.to_branch
                 JOIN products p ON p.id=t.product_id LEFT JOIN units un ON un.id=t.unit_id ORDER BY t.id DESC LIMIT 200"
            ),
            'repairs' => BaseRepository::rows(
                "SELECT r.*, b.name AS branch_name, COALESCE(c.sync_uuid, '') AS customer_sync_uuid, COALESCE(c.phone, '') AS customer_phone,
                        COALESCE(t.email, '') AS technician_email
                 FROM repairs r JOIN branches b ON b.id=r.branch_id LEFT JOIN customers c ON c.id=r.customer_id
                 LEFT JOIN users t ON t.id=r.technician_id ORDER BY r.id DESC LIMIT 200"
            ),
            'sales' => $saleEntries,
            'settings' => [
                'shop_name' => $settings['shop_name'] ?? 'ZEEDAT POS',
                'shop_phone' => $settings['shop_phone'] ?? '',
                'shop_address' => $settings['shop_address'] ?? '',
                'shop_email' => $settings['shop_email'] ?? '',
                'invoice_prefix' => $settings['invoice_prefix'] ?? 'INV-',
                'paper_width' => $settings['paper_width'] ?? '80',
                'receipt_footer' => $settings['receipt_footer'] ?? 'Thank you for your business!',
                'tax_bps' => (int) ($settings['tax_bps'] ?? 0),
                'show_tax_on_receipt' => (int) ($settings['show_tax_on_receipt'] ?? 1),
            ],
        ];
    }

    /**
     * When running directly against live Server MySQL, pushes any offline rows created in local
     * SQLite during outages into MySQL and mirrors the latest MySQL state back to local SQLite.
     */
    public static function syncDirectMysqlWithSqlite(): array {
        $sqlitePath = Database::getSqlitePath();
        if (!is_file($sqlitePath)) {
            return ['ran' => false, 'reason' => 'no_local_sqlite'];
        }

        $mysqlPdo = Database::getConnection();
        if (Database::isSqlite()) {
            return ['ran' => false, 'reason' => 'mysql_offline'];
        }

        $sqlitePdo = Database::openSqlite($sqlitePath, true);
        $pushSummary = ['success' => true, 'synced_count' => 0, 'message' => 'No pending offline records.'];
        $pullSummary = ['success' => true, 'products_synced' => 0];

        try {
            Database::overrideConnection('sqlite', $sqlitePdo);
            $pendingPayload = self::collectPendingPushPayload();

            Database::overrideConnection('mysql', $mysqlPdo);
            if (!empty($pendingPayload)) {
                $ack = self::handleSyncReceive([], $pendingPayload, true);
                Database::overrideConnection('sqlite', $sqlitePdo);
                $pushSummary = self::applyPushAcknowledgements($ack);
                Database::overrideConnection('mysql', $mysqlPdo);
            }

            $catalog = self::handleServerCatalog(0, [], true);
            Database::overrideConnection('sqlite', $sqlitePdo);
            $pullSummary = self::applyServerCatalogSnapshot($catalog);
        } finally {
            Database::overrideConnection('mysql', $mysqlPdo);
        }

        return [
            'ran' => true,
            'mode' => 'direct_mysql',
            'is_online' => true,
            'push' => $pushSummary,
            'pull' => $pullSummary,
        ];
    }

    /**
     * Automatic background sync + backup triggered on internet reconnection or interval.
     */
    public static function runAutoSyncAndBackup(?int $branchId = null): array {
        if (strtolower(Database::env('DB_DRIVER', '')) === 'mysql') {
            Database::clearMysqlOfflineCache();
            Database::overrideConnection('mysql', null);
            Database::getConnection();
            if (!Database::isSqlite()) {
                return self::syncDirectMysqlWithSqlite();
            }
        }

        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $cloudUrl = trim((string) ($settings['cloud_backup_url'] ?? ''));
        $autoSync = !empty($settings['auto_sync_enabled']);
        $interval = max(5, (int) ($settings['sync_interval_minutes'] ?? 15));

        if ($cloudUrl === '') {
            return ['ran' => false, 'reason' => 'not_configured'];
        }
        if (!$autoSync) {
            return ['ran' => false, 'reason' => 'disabled'];
        }
        if (Database::env('ZEEDAT_PORTABLE', '0') === '1'
            && (parse_url($cloudUrl, PHP_URL_SCHEME) !== 'https' || trim((string) ($settings['cloud_api_key'] ?? '')) === '')) {
            return ['ran' => false, 'reason' => 'https_and_key_required'];
        }
        if (!self::isInternetAvailable()) {
            return ['ran' => false, 'is_online' => false, 'reason' => 'offline'];
        }

        $pushRes = self::pushToCloud();
        $pullRes = self::pullFromCloud();
        $pendingUpload = BackupService::uploadPendingBackups();

        $lastBackupAt = BaseRepository::scalar('SELECT created_at FROM backup_logs ORDER BY id DESC LIMIT 1');
        $shouldCreateBackup = true;
        if ($lastBackupAt) {
            $elapsedMinutes = (time() - strtotime((string) $lastBackupAt)) / 60;
            if ($elapsedMinutes < $interval) {
                $shouldCreateBackup = false;
            }
        }

        $backupRes = $shouldCreateBackup ? BackupService::createBackup($branchId, 'auto') : null;

        return [
            'ran' => true,
            'mode' => 'https_sync',
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
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $token,
            'X-Zeedat-Key: ' . $token,
            'User-Agent: Zeedat-POS-Client/1.0',
        ]);
        return self::finishCurl($ch);
    }

    private static function getJson(string $url, string $token): array {
        if (!function_exists('curl_init')) {
            return ['success' => false, 'error' => 'cURL not enabled'];
        }
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: application/json',
            'Authorization: Bearer ' . $token,
            'X-Zeedat-Key: ' . $token,
            'User-Agent: Zeedat-POS-Client/1.0',
        ]);
        return self::finishCurl($ch);
    }

    private static function finishCurl($ch): array {
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            return ['success' => false, 'error' => $curlError];
        }
        if ($httpCode >= 200 && $httpCode < 300) {
            $decoded = json_decode((string) $response, true);
            if (!is_array($decoded)) {
                return ['success' => false, 'error' => 'Server returned invalid JSON response.'];
            }
            return ['success' => true, 'data' => $decoded];
        }
        $hint = $httpCode === 404
            ? ' (Update Namecheap server with latest release/zeedat-namecheap-upload.zip)'
            : ($httpCode === 401 ? ' (Set matching Security API Key on BOTH online server and desktop app)' : '');
        return ['success' => false, 'error' => "HTTP {$httpCode}: {$response}{$hint}"];
    }
}
