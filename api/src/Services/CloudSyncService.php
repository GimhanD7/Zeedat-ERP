<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Throwable;
use Zeedat\Config\Database;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\PermissionRepository;
use Zeedat\Repositories\ProductRepository;
use Zeedat\Support\Response;

class CloudSyncService {
    private const WALLET_LOG_QUERY = "SELECT w.*, b.name AS branch_name, c.phone AS customer_phone,
        c.sync_uuid AS customer_sync_uuid, u.email AS user_email, s.sync_uuid AS sale_sync_uuid
        FROM customer_wallet_logs w JOIN customers c ON c.id=w.customer_id
        LEFT JOIN branches b ON b.id=w.branch_id LEFT JOIN users u ON u.id=w.user_id
        LEFT JOIN sales s ON s.id=w.sale_id";

    public static function isInternetAvailable(?string $probeUrl = null): bool {
        return BackupService::isInternetAvailable($probeUrl);
    }

    public static function getStatus(): array {
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $cloudUrl = BackupService::resolveEffectiveCloudUrl($settings);
        $driver = Database::getDriver();
        $configuredDriver = strtolower(Database::env('DB_DRIVER', $driver));
        $fallbackActive = Database::isFallbackActive();

        $tables = [
            'branches', 'users', 'products', 'customers', 'units', 'suppliers', 'purchases',
            'transfers', 'stock_movements', 'sales', 'repairs',
            'drawers', 'cash_movements', 'returns_log', 'supplier_payments', 'barcode_print_logs', 'audit_log', 'customer_wallet_logs',
        ];
        $counts = [];
        $totalPending = 0;
        if ($driver === 'sqlite') {
            foreach ($tables as $tbl) {
                try {
                    $cnt = (int) BaseRepository::scalar("SELECT COUNT(*) FROM {$tbl} WHERE synced = 0" . ($tbl === 'users' ? '' : " OR sync_uuid IS NULL OR sync_uuid = ''"));
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
        $pendingRoles = $driver === 'sqlite'
            ? (int) BaseRepository::scalar('SELECT COUNT(*) FROM role_permission_sync WHERE pending_token IS NOT NULL')
            : 0;
        $pendingReservations = $driver === 'sqlite'
            ? (int) BaseRepository::scalar('SELECT COUNT(*) FROM reservations WHERE synced=0')
            : 0;

        return [
            'driver' => $driver,
            'configured_driver' => $configuredDriver,
            'fallback_active' => $fallbackActive,
            'is_sqlite' => $driver === 'sqlite',
            'is_online' => self::isInternetAvailable($cloudUrl),
            'cloud_url' => $cloudUrl,
            'has_api_key' => !empty($settings['cloud_api_key']),
            'auto_sync_enabled' => (bool) ($settings['auto_sync_enabled'] ?? 1),
            'sync_interval_minutes' => (int) ($settings['sync_interval_minutes'] ?? 15),
            'last_synced_at' => $settings['last_synced_at'] ?? null,
            'unsynced_users' => $counts['users'],
            'unsynced_sales' => $counts['sales'],
            'unsynced_customers' => $counts['customers'],
            'unsynced_repairs' => $counts['repairs'],
            'unsynced_products' => $counts['products'],
            'unsynced_units' => $counts['units'],
            'unsynced_transfers' => $counts['transfers'],
            'unsynced_purchases' => $counts['purchases'],
            'unsynced_cashbook' => $counts['drawers'] + $counts['cash_movements'],
            'unsynced_drawers' => $counts['drawers'],
            'unsynced_cash_movements' => $counts['cash_movements'],
            'unsynced_returns' => $counts['returns_log'],
            'unsynced_supplier_payments' => $counts['supplier_payments'],
            'unsynced_barcodes' => $counts['barcode_print_logs'],
            'unsynced_audits' => $counts['audit_log'],
            'total_sales' => (int) BaseRepository::scalar('SELECT COUNT(*) FROM sales'),
            'unsynced_roles' => $pendingRoles,
            'unsynced_reservations' => $pendingReservations,
            'total_pending' => $totalPending + $pendingRoles + $pendingReservations,
        ];
    }

    private static function ensureSyncUuids(string $table, string $prefix, array $rows, callable $seedBuilder, bool $markPending = true): array {
        foreach ($rows as &$row) {
            if (empty($row['sync_uuid'])) {
                $seed = $seedBuilder($row);
                $uuid = $row['uuid'] ?? ($prefix . '-' . ($row['id'] ?? 0) . '-' . substr(md5($seed), 0, 10));
                $row['sync_uuid'] = $uuid;
                try {
                    if ($markPending) {
                        BaseRepository::run("UPDATE {$table} SET sync_uuid=?, synced=0 WHERE id=?", [$uuid, $row['id']]);
                    } else {
                        $changed = BaseRepository::run(
                            "UPDATE {$table} SET sync_uuid=? WHERE id=? AND (sync_uuid IS NULL OR sync_uuid='')",
                            [$uuid, $row['id']]
                        )->rowCount();
                        if (!$changed) {
                            $row['sync_uuid'] = BaseRepository::scalar("SELECT sync_uuid FROM {$table} WHERE id=?", [$row['id']]) ?: $uuid;
                        }
                    }
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

        $users = self::ensureSyncUuids(
            'users',
            'USR',
            self::safeRows(
                'SELECT u.*, COALESCE(b.name, "") AS branch_name
                 FROM users u LEFT JOIN branches b ON b.id=u.branch_id
                 WHERE u.synced = 0 ORDER BY u.id ASC LIMIT 200'
            ),
            static fn($r) => strtolower(trim((string) ($r['email'] ?? '')))
        );
        $userBranchesPush = [];
        $userPermissionsPush = [];
        if (!empty($users)) {
            $dirtyUserIds = array_map(static fn($u) => (int) $u['id'], $users);
            $inU = implode(',', array_unique(array_filter($dirtyUserIds, static fn($v) => $v > 0)));
            if ($inU !== '') {
                $userBranchesPush = BaseRepository::rows(
                    "SELECT u.email, b.name AS branch_name
                     FROM user_branches ub
                     JOIN users u ON u.id=ub.user_id
                     JOIN branches b ON b.id=ub.branch_id
                     WHERE ub.user_id IN ({$inU})"
                );
                $userPermissionsPush = BaseRepository::rows(
                    "SELECT u.email, up.permission, up.allowed
                     FROM user_permissions up
                     JOIN users u ON u.id=up.user_id
                     WHERE up.user_id IN ({$inU})"
                );
            }
        }

        $products = self::ensureSyncUuids(
            'products',
            'PRD',
            self::safeRows('SELECT * FROM products WHERE ' . $pendingWhere() . ' ORDER BY id ASC LIMIT 1000'),
            static fn($r) => (string) ($r['sku'] ?? $r['name'] ?? '')
        );

        $customers = self::ensureSyncUuids(
            'customers',
            'CUS',
            self::safeRows(
                'SELECT c.*, COALESCE(b.name, "") AS branch_name
                 FROM customers c LEFT JOIN branches b ON b.id=c.branch_id
                 WHERE ' . $pendingWhere('c') . ' ORDER BY c.id ASC LIMIT 500'
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
                        COALESCE(d.sync_uuid, "") AS drawer_sync_uuid,
                        COALESCE(c.sync_uuid, c.uuid, "") AS customer_sync_uuid, COALESCE(c.phone, "") AS customer_phone
                 FROM sales s
                 LEFT JOIN branches b ON b.id=s.branch_id
                 LEFT JOIN drawers d ON d.id=s.drawer_id
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

        $drawers = self::ensureSyncUuids(
            'drawers',
            'DRW',
            self::safeRows(
                'SELECT d.*, COALESCE(b.name, "") AS branch_name, COALESCE(u.email, "") AS user_email, COALESCE(c.business_date, "") AS business_date
                 FROM drawers d
                 LEFT JOIN branches b ON b.id=d.branch_id
                 LEFT JOIN users u ON u.id=d.user_id
                 LEFT JOIN cycles c ON c.id=d.cycle_id
                 WHERE ' . $pendingWhere('d') . ' ORDER BY d.id ASC LIMIT 100'
            ),
            static fn($r) => ($r['branch_id'] ?? 1) . '|' . ($r['business_date'] ?? '') . '|' . ($r['created_at'] ?? '')
        );

        $cashMovements = self::ensureSyncUuids(
            'cash_movements',
            'CM',
            self::safeRows(
                'SELECT cm.*, d.branch_id, COALESCE(b.name, "") AS branch_name, COALESCE(d.sync_uuid, "") AS drawer_sync_uuid,
                        COALESCE(c.business_date, "") AS business_date, COALESCE(u.email, "") AS user_email
                 FROM cash_movements cm
                 JOIN drawers d ON d.id=cm.drawer_id
                 LEFT JOIN branches b ON b.id=d.branch_id
                 LEFT JOIN cycles c ON c.id=d.cycle_id
                 LEFT JOIN users u ON u.id=cm.user_id
                 WHERE ' . $pendingWhere('cm') . ' ORDER BY cm.id ASC LIMIT 300'
            ),
            static fn($r) => ($r['drawer_id'] ?? 1) . '|' . ($r['amount'] ?? 0) . '|' . ($r['kind'] ?? '') . '|' . ($r['reference'] ?? '') . '|' . ($r['created_at'] ?? '')
        );

        $supplierPayments = self::ensureSyncUuids(
            'supplier_payments',
            'SPAY',
            self::safeRows(
                'SELECT sp.*, pu.branch_id, COALESCE(b.name, "") AS branch_name, COALESCE(pu.sync_uuid, "") AS purchase_sync_uuid,
                        sup.name AS supplier_name, pu.invoice AS purchase_invoice, p.sku AS product_sku,
                        COALESCE(d.sync_uuid, "") AS drawer_sync_uuid, COALESCE(u.email, "") AS user_email
                 FROM supplier_payments sp
                 JOIN purchases pu ON pu.id=sp.purchase_id
                 JOIN suppliers sup ON sup.id=pu.supplier_id
                 JOIN products p ON p.id=pu.product_id
                 LEFT JOIN branches b ON b.id=pu.branch_id
                 LEFT JOIN drawers d ON d.id=sp.drawer_id
                 LEFT JOIN users u ON u.id=sp.user_id
                 WHERE ' . $pendingWhere('sp') . ' ORDER BY sp.id ASC LIMIT 150'
            ),
            static fn($r) => ($r['purchase_id'] ?? 0) . '|' . ($r['amount'] ?? 0) . '|' . ($r['created_at'] ?? '')
        );

        $returnsRaw = self::ensureSyncUuids(
            'returns_log',
            'RET',
            self::safeRows(
                'SELECT rl.*, COALESCE(b.name, "") AS branch_name, COALESCE(s.sync_uuid, s.uuid, "") AS sale_sync_uuid,
                        p.sku AS product_sku, si.name AS sale_item_name, un.code AS sale_unit_code,
                        COALESCE(d.sync_uuid, "") AS drawer_sync_uuid
                 FROM returns_log rl
                 LEFT JOIN branches b ON b.id=rl.branch_id
                 JOIN sale_items si ON si.id=rl.sale_item_id
                 JOIN sales s ON s.id=si.sale_id
                 JOIN products p ON p.id=si.product_id
                 LEFT JOIN units un ON un.id=si.unit_id
                 LEFT JOIN drawers d ON d.id=rl.processed_drawer_id
                 WHERE ' . $pendingWhere('rl') . ' ORDER BY rl.id ASC LIMIT 100'
            ),
            static fn($r) => ($r['sale_item_id'] ?? 0) . '|' . ($r['qty'] ?? 0) . '|' . ($r['amount'] ?? 0) . '|' . ($r['created_at'] ?? '')
        );
        $returnsPayload = [];
        foreach ($returnsRaw as $ret) {
            $exch = BaseRepository::one(
                'SELECT ex.*, p.sku AS product_sku, COALESCE(un.code, "") AS unit_code, COALESCE(rs.sync_uuid, rs.uuid, "") AS replacement_sale_sync_uuid
                 FROM exchanges ex
                 JOIN products p ON p.id=ex.product_id
                 LEFT JOIN units un ON un.id=ex.unit_id
                 LEFT JOIN sales rs ON rs.id=ex.replacement_sale_id
                 WHERE ex.return_id=?',
                [$ret['id']]
            );
            if ($exch) {
                $exch['addons'] = BaseRepository::rows(
                    'SELECT a.line_no, a.qty, p.sku product_sku, u.code unit_code FROM exchange_addons a
                     JOIN products p ON p.id=a.product_id LEFT JOIN units u ON u.id=a.unit_id
                     WHERE a.return_id=? ORDER BY a.line_no',
                    [$ret['id']]
                );
            }
            $ret['exchange'] = $exch ?: null;
            $returnsPayload[] = $ret;
        }

        $barcodeLogs = self::ensureSyncUuids(
            'barcode_print_logs',
            'BPL',
            self::safeRows(
                'SELECT bp.*, COALESCE(b.name, "") AS branch_name, COALESCE(p.sku, "") AS product_sku, COALESCE(u.email, "") AS user_email
                 FROM barcode_print_logs bp
                 LEFT JOIN branches b ON b.id=bp.branch_id
                 LEFT JOIN products p ON p.id=bp.product_id
                 LEFT JOIN users u ON u.id=bp.user_id
                 WHERE ' . $pendingWhere('bp') . ' ORDER BY bp.id ASC LIMIT 150'
            ),
            static fn($r) => ($r['product_id'] ?? 0) . '|' . ($r['copies'] ?? 1) . '|' . ($r['created_at'] ?? '')
        );

        $auditLogs = self::ensureSyncUuids(
            'audit_log',
            'AUD',
            self::safeRows(
                'SELECT a.*, COALESCE(b.name, "") AS branch_name, COALESCE(u.email, "") AS user_email
                 FROM audit_log a
                 LEFT JOIN branches b ON b.id=a.branch_id
                 LEFT JOIN users u ON u.id=a.user_id
                 WHERE ' . $pendingWhere('a') . ' ORDER BY a.id ASC LIMIT 150'
            ),
            static fn($r) => ($r['action'] ?? '') . '|' . ($r['user_id'] ?? 0) . '|' . ($r['created_at'] ?? '')
        );

        $roleChanges = BaseRepository::rows('SELECT role, pending_token FROM role_permission_sync WHERE pending_token IS NOT NULL');
        foreach ($roleChanges as &$change) {
            $change['permissions'] = array_column(BaseRepository::rows(
                'SELECT permission FROM role_permissions WHERE role=? ORDER BY permission', [$change['role']]
            ), 'permission');
        }
        unset($change);
        $walletLogs = self::ensureSyncUuids(
            'customer_wallet_logs',
            'WLT',
            BaseRepository::rows(self::WALLET_LOG_QUERY . ' WHERE ' . $pendingWhere('w') . ' ORDER BY w.id LIMIT 150'),
            static fn($row) => bin2hex(random_bytes(16))
        );

        $reservations = ReservationService::syncRows(true);
        if (empty($branches) && empty($users) && empty($roleChanges) && empty($walletLogs) && empty($reservations) && empty($products) && empty($customers) && empty($units)
            && empty($suppliers) && empty($purchases) && empty($transfers)
            && empty($repairs) && empty($salePayloads) && empty($movements)
            && empty($drawers) && empty($cashMovements) && empty($supplierPayments)
            && empty($returnsPayload) && empty($barcodeLogs) && empty($auditLogs)) {
            return [];
        }

        return [
            'branch_id' => $sales[0]['branch_id'] ?? $drawers[0]['branch_id'] ?? $customers[0]['branch_id'] ?? 1,
            'branches' => $branches,
            'users' => $users,
            'user_branches' => $userBranchesPush,
            'user_permissions' => $userPermissionsPush,
            'role_changes' => $roleChanges,
            'customer_wallet_logs' => $walletLogs,
            'reservations' => $reservations,
            'products' => $products,
            'customers' => $customers,
            'units' => $units,
            'suppliers' => $suppliers,
            'purchases' => $purchases,
            'transfers' => $transfers,
            'repairs' => $repairs,
            'sales' => $salePayloads,
            'stock_movements' => $movements,
            'drawers' => $drawers,
            'cash_movements' => $cashMovements,
            'supplier_payments' => $supplierPayments,
            'returns_log' => $returnsPayload,
            'barcode_print_logs' => $barcodeLogs,
            'audit_log' => $auditLogs,
            'timestamp' => date('c'),
        ];
    }

    private static function applyPushAcknowledgements(array $srv): array {
        $reservationsSynced = 0;
        foreach ($srv['synced_reservations'] ?? [] as $id => $version) {
            $reservationsSynced += BaseRepository::run(
                'UPDATE reservations SET base_version=?, synced=CASE WHEN version=? THEN 1 ELSE 0 END WHERE id=? AND base_version<=?',
                [$version, $version, $id, $version]
            )->rowCount();
        }
        $acknowledgedRoles = 0;
        foreach ($srv['synced_roles'] ?? [] as $change) {
            $acknowledgedRoles += BaseRepository::run(
                'UPDATE role_permission_sync SET pending_token=NULL WHERE role=? AND pending_token=?',
                [$change['role'], $change['pending_token']]
            )->rowCount();
        }
        $counts = [
            'synced_reservations' => $reservationsSynced,
            'synced_wallet_logs' => self::markSyncedIds('customer_wallet_logs', $srv['synced_wallet_logs'] ?? []),
            'synced_roles' => $acknowledgedRoles,
            'synced_branches' => self::markSyncedIds('branches', $srv['synced_branches'] ?? []),
            'synced_users' => self::markSyncedIds('users', $srv['synced_users'] ?? []),
            'synced_products' => self::markSyncedIds('products', $srv['synced_products'] ?? []),
            'synced_customers' => self::markSyncedIds('customers', $srv['synced_customers'] ?? []),
            'synced_units' => self::markSyncedIds('units', $srv['synced_units'] ?? []),
            'synced_suppliers' => self::markSyncedIds('suppliers', $srv['synced_suppliers'] ?? []),
            'synced_purchases' => self::markSyncedIds('purchases', $srv['synced_purchases'] ?? []),
            'synced_transfers' => self::markSyncedIds('transfers', $srv['synced_transfers'] ?? []),
            'synced_repairs' => self::markSyncedIds('repairs', $srv['synced_repairs'] ?? []),
            'synced_sales' => self::markSyncedIds('sales', $srv['synced_sales'] ?? []),
            'synced_movements' => self::markSyncedIds('stock_movements', $srv['synced_movements'] ?? []),
            'synced_drawers' => self::markSyncedIds('drawers', $srv['synced_drawers'] ?? []),
            'synced_cash_movements' => self::markSyncedIds('cash_movements', $srv['synced_cash_movements'] ?? []),
            'synced_supplier_payments' => self::markSyncedIds('supplier_payments', $srv['synced_supplier_payments'] ?? []),
            'synced_returns' => self::markSyncedIds('returns_log', $srv['synced_returns'] ?? []),
            'synced_barcode_logs' => self::markSyncedIds('barcode_print_logs', $srv['synced_barcode_logs'] ?? []),
            'synced_audit_logs' => self::markSyncedIds('audit_log', $srv['synced_audit_logs'] ?? []),
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
        $cloudUrl = BackupService::resolveEffectiveCloudUrl($settings);
        $apiKey = trim((string) ($settings['cloud_api_key'] ?? ''));

        if ($cloudUrl === '') {
            return ['success' => false, 'error' => 'Central cloud URL is not configured in settings.'];
        }
        if (!self::isInternetAvailable($cloudUrl)) {
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
        $totals = [
            'synced_branches' => 0, 'synced_users' => 0, 'synced_roles' => 0, 'synced_products' => 0, 'synced_customers' => 0,
            'synced_units' => 0, 'synced_suppliers' => 0, 'synced_purchases' => 0,
            'synced_transfers' => 0, 'synced_repairs' => 0, 'synced_sales' => 0,
            'synced_movements' => 0, 'synced_drawers' => 0, 'synced_cash_movements' => 0,
            'synced_supplier_payments' => 0, 'synced_returns' => 0,
            'synced_barcode_logs' => 0, 'synced_audit_logs' => 0, 'synced_wallet_logs' => 0, 'synced_reservations' => 0, 'synced_count' => 0,
        ];

        for ($pass = 0; $pass < 10; $pass++) {
            $batchPayload = $pass === 0 ? $postData : self::collectPendingPushPayload();
            if (empty($batchPayload)) {
                break;
            }
            $res = self::postJson($endpoint, $batchPayload, $apiKey);
            if (!$res['success']) {
                return ['success' => false, 'error' => $res['error'] ?? 'Sync transmission failed.'];
            }
            $ackRes = self::applyPushAcknowledgements($res['data'] ?? []);
            foreach ($totals as $k => $v) {
                $totals[$k] += (int) ($ackRes[$k] ?? 0);
            }
            if ((int) ($ackRes['synced_count'] ?? 0) === 0) {
                return array_merge($totals, ['success' => false, 'error' => 'The server did not acknowledge the remaining changes. They are still pending locally.']);
            }
        }

        return array_merge($totals, [
            'success' => true,
            'message' => "Pushed {$totals['synced_count']} offline record(s) to cloud MySQL.",
        ]);
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
        $cloudUrl = BackupService::resolveEffectiveCloudUrl($settings);
        $apiKey = trim((string) ($settings['cloud_api_key'] ?? ''));

        if ($cloudUrl === '' || !self::isInternetAvailable($cloudUrl)) {
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
            'drawers_synced' => 0,
            'cash_movements_synced' => 0,
            'supplier_payments_synced' => 0,
            'returns_synced' => 0,
            'barcode_logs_synced' => 0,
            'audit_logs_synced' => 0,
        ];

        BaseRepository::transaction(function () use ($data, $isSqlite, &$stats) {
            // 1. Branches (map by name)
            $branchByName = [];
            foreach ($data['branches'] ?? [] as $b) {
                $name = trim((string) ($b['name'] ?? ''));
                if ($name === '') continue;
                $uuid = $b['sync_uuid'] ?? '';
                $existingId = (int) (($uuid !== '' ? BaseRepository::scalar('SELECT id FROM branches WHERE sync_uuid=?', [$uuid]) : false)
                    ?: BaseRepository::scalar('SELECT id FROM branches WHERE name=?', [$name]));
                if ($existingId > 0) {
                    BaseRepository::run(
                        'UPDATE branches SET name=?, phone=?, address=?, sync_uuid=COALESCE(?, sync_uuid), synced=1 WHERE id=? AND synced=1',
                        [$name, $b['phone'] ?? '', $b['address'] ?? '', $b['sync_uuid'] ?? null, $existingId]
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
            if (is_array($data['role_permissions'] ?? null)) {
                $permissions = [];
                foreach ($data['role_permissions'] as $row) {
                    $permissions[$row['role']][] = $row['permission'];
                }
                foreach (['manager', 'cashier', 'technician', 'stock'] as $role) {
                    if (!BaseRepository::scalar('SELECT pending_token FROM role_permission_sync WHERE role=?', [$role])) {
                        self::replaceRolePermissions($role, $permissions[$role] ?? []);
                    }
                }
            }

            [$userByEmail, $syncedUsers] = self::syncStaff($data, $resolveLocalBranch, true);
            $stats['users_synced'] = count($syncedUsers);
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
                    'SELECT id, synced FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=? AND deleted_at IS NULL) ORDER BY CASE WHEN sync_uuid=? THEN 0 ELSE 1 END LIMIT 1',
                    [$syncUuid, $bid, $c['phone'], $syncUuid]
                );
                if ($existing) {
                    if ((int) ($existing['synced'] ?? 1) === 1) {
                        BaseRepository::run(
                            'UPDATE customers SET name=?, phone=?, email=?, notes=?, loyalty_points=?, wallet_balance=?, sync_uuid=?, deleted_at=COALESCE(deleted_at, ?), synced=1 WHERE id=?',
                            [$c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', (int) ($c['loyalty_points'] ?? 0), (int) ($c['wallet_balance'] ?? 0), $syncUuid, $c['deleted_at'] ?? null, $existing['id']]
                        );
                    }
                } elseif ($isSqlite) {
                    BaseRepository::run(
                        'INSERT INTO customers (uuid, branch_id, name, phone, email, notes, loyalty_points, wallet_balance, sync_uuid, deleted_at, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)',
                        [$syncUuid, $bid, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', (int) ($c['loyalty_points'] ?? 0), (int) ($c['wallet_balance'] ?? 0), $syncUuid, $c['deleted_at'] ?? null, $c['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO customers (branch_id, name, phone, email, notes, loyalty_points, wallet_balance, sync_uuid, deleted_at, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)',
                        [$bid, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', (int) ($c['loyalty_points'] ?? 0), (int) ($c['wallet_balance'] ?? 0), $syncUuid, $c['deleted_at'] ?? null, $c['created_at'] ?? date('Y-m-d H:i:s')]
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
                    'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=? AND deleted_at IS NULL) ORDER BY CASE WHEN sync_uuid=? THEN 0 ELSE 1 END LIMIT 1',
                    [$rep['customer_sync_uuid'] ?? '', $bid, $rep['customer_phone'] ?? '', $rep['customer_sync_uuid'] ?? '']
                ) ?: 0);
                if ($cid <= 0) continue;
                $techId = !empty($rep['technician_email']) ? ($userByEmail[strtolower($rep['technician_email'])] ?? null) : null;
                $existing = BaseRepository::one('SELECT id, synced FROM repairs WHERE sync_uuid=? LIMIT 1', [$syncUuid]);
                if ($existing && (int) $existing['synced'] === 0) continue;
                self::writeSyncedRepair($rep, $bid, $cid, $techId, $syncUuid, (int) ($existing['id'] ?? 0), $isSqlite);
                $stats['repairs_synced']++;
            }

            // 9.5 Drawers / Cash Register shifts (before sales & cashbook movements)
            [$drawerMap, , $stats['drawers_synced']] = self::upsertSyncedDrawers(
                $data['drawers'] ?? [],
                $resolveLocalBranch,
                $resolveLocalUser,
                true
            );

            // 10. Online branch sales (latest history pulled to local DB without duplicating)
            foreach ($data['sales'] ?? [] as $entry) {
                $s = $entry['sale'] ?? [];
                if (empty($s)) continue;
                $syncUuid = (string) ($s['sync_uuid'] ?? ('SL-' . ($s['id'] ?? 0) . '-' . substr(md5(($s['created_at'] ?? '') . '|' . ($s['total'] ?? 0)), 0, 8)));
                $bid = $resolveLocalBranch($s['branch_name'] ?? null, (int) ($s['branch_id'] ?? 1));
                $uid = $resolveLocalUser($s['user_email'] ?? null);
                $drawerSyncUuid = (string) ($s['drawer_sync_uuid'] ?? '');
                $drawerId = ($drawerSyncUuid !== '' && isset($drawerMap[$drawerSyncUuid]))
                    ? $drawerMap[$drawerSyncUuid]
                    : self::ensureSyncDrawer($bid, $uid, substr((string) ($s['created_at'] ?? date('Y-m-d')), 0, 10));

                $existingSale = BaseRepository::one('SELECT id, synced FROM sales WHERE sync_uuid=? LIMIT 1', [$syncUuid]);
                if ($existingSale) {
                    if ((int) ($existingSale['synced'] ?? 1) === 1) {
                        self::updateSyncedSale((int) $existingSale['id'], $drawerId, $uid, $s, $entry['payments'] ?? [], $isSqlite);
                    }
                    continue;
                }

                $cid = (!empty($s['customer_sync_uuid']) || !empty($s['customer_phone']))
                    ? (BaseRepository::scalar(
                        'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=? AND deleted_at IS NULL) ORDER BY CASE WHEN sync_uuid=? THEN 0 ELSE 1 END LIMIT 1',
                        [$s['customer_sync_uuid'] ?? '', $bid, $s['customer_phone'] ?? '', $s['customer_sync_uuid'] ?? '']
                    ) ?: null)
                    : null;

                $newSaleId = self::insertSyncedSale($bid, $uid, $drawerId, $cid, $syncUuid, $s, $isSqlite);

                foreach ($entry['items'] ?? [] as $it) {
                    $pid = $productBySku[$it['product_sku'] ?? ''] ?? (int) ($it['product_id'] ?? 0);
                    if ($pid <= 0) continue;
                    $unId = !empty($it['unit_code']) ? (BaseRepository::scalar('SELECT id FROM units WHERE code=? LIMIT 1', [$it['unit_code']]) ?: null) : null;
                    BaseRepository::run(
                        'INSERT INTO sale_items (sale_id, product_id, unit_id, name, qty, price, total, refunded_qty, commission_amount) VALUES (?,?,?,?,?,?,?,?,?)',
                        [$newSaleId, $pid, $unId, $it['name'], (int) $it['qty'], (int) $it['price'], (int) $it['total'], (int) ($it['refunded_qty'] ?? 0), (int) ($it['commission_amount'] ?? 0)]
                    );
                }

                self::syncSalePayments($newSaleId, $drawerId, $uid, $entry['payments'] ?? [], $isSqlite);
                $stats['sales_synced']++;
            }

            // 10.1 Cashbook movements
            [, $stats['cash_movements_synced']] = self::upsertSyncedCashMovements(
                $data['cash_movements'] ?? [],
                $drawerMap,
                $resolveLocalBranch,
                $resolveLocalUser,
                $isSqlite
            );

            // 10.2 Supplier payments
            [, $stats['supplier_payments_synced']] = self::upsertSyncedSupplierPayments(
                $data['supplier_payments'] ?? [],
                $drawerMap,
                $resolveLocalBranch,
                $resolveLocalUser
            );

            // 10.3 Returns & Exchanges
            [, $stats['returns_synced']] = self::upsertSyncedReturns(
                $data['returns_log'] ?? [],
                $drawerMap,
                $resolveLocalBranch,
                true
            );

            // 10.4 Barcode print logs & Audit logs
            [, $stats['barcode_logs_synced']] = self::upsertSyncedBarcodeLogs(
                $data['barcode_print_logs'] ?? [],
                $resolveLocalBranch,
                $resolveLocalUser
            );
            [, $stats['audit_logs_synced']] = self::upsertSyncedAuditLogs(
                $data['audit_log'] ?? [],
                $resolveLocalBranch,
                $resolveLocalUser
            );
            $stats['wallet_logs_synced'] = count(self::syncWalletLogs(
                $data['customer_wallet_logs'] ?? [], $resolveLocalBranch, $resolveLocalUser
            ));
            $stats['reservations_synced'] = count(ReservationService::applySync($data['reservations'] ?? [], true));
            $stats['stock_movements_synced'] = 0;
            foreach ($data['stock_movements'] ?? [] as $movement) {
                $id = $productBySku[$movement['product_sku']] ?? null;
                $uuid = $movement['sync_uuid'] ?? '';
                if (!$id || $uuid === '' || BaseRepository::scalar('SELECT id FROM stock_movements WHERE sync_uuid=?', [$uuid])) {
                    continue;
                }
                BaseRepository::run(
                    'INSERT INTO stock_movements (branch_id, product_id, user_id, qty, kind, reference, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
                    [
                        $resolveLocalBranch($movement['branch_name'], (int) $movement['branch_id']),
                        $id, $resolveLocalUser($movement['user_email']), $movement['qty'], $movement['kind'],
                        $movement['reference'], $uuid, $movement['created_at'],
                    ]
                );
                $stats['stock_movements_synced']++;
            }

            // 11. Shop & receipt settings (preserve local cloud_backup_url/cloud_api_key/delete_pin_hash)
            if (!empty($data['settings']) && is_array($data['settings'])) {
                $st = $data['settings'];
                BaseRepository::run(
                    'UPDATE settings SET shop_name=?, shop_phone=?, shop_address=?, shop_email=?, invoice_prefix=?, paper_width=?, receipt_footer=?, tax_bps=?, show_tax_on_receipt=?, bill_layout=COALESCE(?,bill_layout) WHERE id=1',
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
                        $st['bill_layout'] ?? null,
                    ]
                );
            }
        });

        BaseRepository::run(
            'UPDATE settings SET last_synced_at=' . ($isSqlite ? "DATETIME('now','localtime')" : 'NOW()') . ' WHERE id = 1'
        );

        return array_merge($stats, [
            'success' => true,
            'message' => "Synced {$stats['branches_synced']} branch(es), {$stats['products_synced']} product(s), {$stats['stock_synced']} stock, {$stats['customers_synced']} customer(s), {$stats['sales_synced']} sale(s), {$stats['drawers_synced']} drawer(s), {$stats['cash_movements_synced']} cashbook entry(s), and {$stats['returns_synced']} return(s).",
        ]);
    }

    private static function writeSyncedRepair(array $row, int $branch, int $customer, ?int $technician, string $uuid, int $existing, bool $sqlite): void {
        $estimate = (int) ($row['estimate'] ?? 0);
        $advance = (int) ($row['advance_paid'] ?? 0);
        $paid = (int) ($row['paid_amount'] ?? $advance);
        $charge = (int) ($row['final_charge'] ?? $estimate);
        $method = (string) ($row['payment_method'] ?? '');
        $paidAt = $row['paid_at'] ?? null;
        if ($existing) {
            $current = BaseRepository::one('SELECT paid_amount, payment_method, paid_at, status FROM repairs WHERE id=? FOR UPDATE', [$existing]);
            if ((int) $current['paid_amount'] > $paid) {
                $paid = (int) $current['paid_amount'];
                $method = $current['payment_method'];
                $paidAt = $current['paid_at'];
            }
            $status = $current['status'] === 'Delivered' ? 'Delivered' : ($row['status'] ?? 'Received');
            BaseRepository::run(
                'UPDATE repairs SET status=?, notes=?, technician_id=?, estimate=?, advance_paid=?, final_charge=?, paid_amount=?, payment_method=?, paid_at=?, synced=1 WHERE id=?',
                [$status, $row['notes'] ?? '', $technician, $estimate, $advance, $charge, $paid, $method, $paidAt, $existing]
            );
            return;
        }
        $fields = [$branch, $customer, $technician, $row['device'], $row['serial'] ?? '', $row['issue'] ?? '',
            $row['accessories'] ?? '', $row['notes'] ?? '', $estimate, $row['due_date'] ?? date('Y-m-d'),
            $row['status'] ?? 'Received', $uuid, $row['created_at'] ?? date('Y-m-d H:i:s'), $advance, $charge, $paid, $method, $paidAt];
        BaseRepository::run(
            'INSERT INTO repairs (' . ($sqlite ? 'uuid, ' : '') .
            'branch_id, customer_id, technician_id, device, serial, issue, accessories, notes, estimate, due_date, status, sync_uuid,
                created_at, advance_paid, final_charge, paid_amount, payment_method, paid_at, synced)
             VALUES (' . ($sqlite ? '?, ' : '') . '?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
            $sqlite ? [$uuid, ...$fields] : $fields
        );
    }

    private static function syncWalletLogs(array $rows, callable $resolveBranch, callable $resolveUser): array {
        $acknowledged = [];
        foreach ($rows as $row) {
            $uuid = (string) ($row['sync_uuid'] ?? '');
            if ($uuid === '') continue;
            if (!BaseRepository::scalar('SELECT id FROM customer_wallet_logs WHERE sync_uuid=?', [$uuid])) {
                $branch = $resolveBranch($row['branch_name'] ?? null, (int) ($row['branch_id'] ?? 1));
                $customer = BaseRepository::scalar('SELECT id FROM customers WHERE sync_uuid=?', [$row['customer_sync_uuid'] ?? ''])
                    ?: BaseRepository::scalar('SELECT id FROM customers WHERE branch_id=? AND phone=?', [$branch, $row['customer_phone'] ?? '']);
                if (!$customer) continue;
                $sale = empty($row['sale_sync_uuid']) ? null : BaseRepository::scalar('SELECT id FROM sales WHERE sync_uuid=?', [$row['sale_sync_uuid']]);
                if ($sale === false) continue;
                BaseRepository::run(
                    'INSERT INTO customer_wallet_logs (branch_id, customer_id, user_id, sale_id, amount, points_delta, kind, method, reference, created_at, sync_uuid, synced) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
                    [$branch, $customer, $resolveUser($row['user_email'] ?? null), $sale, $row['amount'], $row['points_delta'],
                        $row['kind'], $row['method'], $row['reference'], $row['created_at'], $uuid]
                );
            }
            $acknowledged[] = $row['id'];
        }
        return $acknowledged;
    }

    private static function replaceRolePermissions(string $role, array $permissions): void {
        BaseRepository::run('DELETE FROM role_permissions WHERE role=?', [$role]);
        foreach (array_intersect(array_keys(PermissionRepository::ALL_PERMISSIONS), $permissions) as $permission) {
            BaseRepository::run('INSERT INTO role_permissions (role, permission) VALUES (?,?)', [$role, $permission]);
        }
        PermissionRepository::markRoleChanged($role, null);
    }

    private static function syncStaff(array $payload, callable $resolveBranch, bool $preservePending = false): array {
        $usersByEmail = [];
        $updatedUsers = [];
        $acknowledged = [];

        foreach ($payload['users'] ?? [] as $user) {
            $email = strtolower(trim((string) ($user['email'] ?? '')));
            if ($email === '' || empty($user['password_hash'])) continue;

            $uuid = trim((string) ($user['sync_uuid'] ?? ''));
            $existing = $uuid !== '' ? BaseRepository::one('SELECT * FROM users WHERE sync_uuid=?', [$uuid]) : null;
            $existing ??= BaseRepository::one('SELECT * FROM users WHERE email=?', [$email]);
            $id = (int) ($existing['id'] ?? 0);
            if ($preservePending && $existing && (int) $existing['synced'] === 0) {
                $usersByEmail[$email] = $id;
                continue;
            }
            if ((!$preservePending || $uuid === '') && !empty($existing['sync_uuid'])) {
                $uuid = $existing['sync_uuid'];
            }
            $branch = empty($user['branch_name']) ? null : $resolveBranch($user['branch_name'], (int) ($user['branch_id'] ?? 1));
            $badge = trim((string) ($user['badge_code'] ?? $existing['badge_code'] ?? ''));
            if ($badge === '' || BaseRepository::scalar('SELECT id FROM users WHERE badge_code=? AND id<>?', [$badge, $id])) {
                $badge = 'STF-' . strtoupper(bin2hex(random_bytes(8)));
            }
            $fields = [$branch, $user['name'], $email, $user['password_hash'], $user['role'], $badge, (int) ($user['active'] ?? 1), $uuid ?: null];
            if ($existing) {
                BaseRepository::run(
                    'UPDATE users SET branch_id=?, name=?, email=?, password_hash=?, role=?, badge_code=?, active=?, sync_uuid=?, synced=1 WHERE id=?',
                    [...$fields, $id]
                );
            } else {
                $id = BaseRepository::insert(
                    'INSERT INTO users (branch_id, name, email, password_hash, role, badge_code, active, sync_uuid, synced) VALUES (?,?,?,?,?,?,?,?,1)',
                    $fields
                );
            }
            $usersByEmail[$email] = $updatedUsers[$email] = $id;
            $acknowledged[] = $user['id'] ?? $id;
        }

        if (is_array($payload['user_branches'] ?? null)) {
            $branches = [];
            foreach ($payload['user_branches'] as $row) {
                $email = strtolower(trim((string) ($row['email'] ?? '')));
                $name = trim((string) ($row['branch_name'] ?? ''));
                if ($name === '' || !isset($updatedUsers[$email])) continue;
                $branchId = (int) BaseRepository::scalar('SELECT id FROM branches WHERE name=?', [$name]);
                if ($branchId === 0) {
                    throw new \RuntimeException('A staff assignment references a branch that has not synced.');
                }
                $branches[$email][$branchId] = $branchId;
            }
            foreach ($updatedUsers as $email => $id) {
                BaseRepository::run('DELETE FROM user_branches WHERE user_id=?', [$id]);
                foreach ($branches[$email] ?? [] as $branchId) {
                    BaseRepository::run('INSERT INTO user_branches (user_id, branch_id) VALUES (?,?)', [$id, $branchId]);
                }
            }
        }

        if (is_array($payload['user_permissions'] ?? null)) {
            $permissions = [];
            foreach ($payload['user_permissions'] as $row) {
                $email = strtolower(trim((string) ($row['email'] ?? '')));
                $permission = trim((string) ($row['permission'] ?? ''));
                if ($permission === '' || !isset($updatedUsers[$email])) continue;
                $permissions[$email][$permission] = (int) ($row['allowed'] ?? 1);
            }
            foreach ($updatedUsers as $email => $id) {
                BaseRepository::run('DELETE FROM user_permissions WHERE user_id=?', [$id]);
                foreach ($permissions[$email] ?? [] as $permission => $allowed) {
                    BaseRepository::run('INSERT INTO user_permissions (user_id, permission, allowed) VALUES (?,?,?)', [$id, $permission, $allowed]);
                }
            }
        }

        return [$usersByEmail, $acknowledged];
    }

    /** Resolves or provisions the drawer for a synced sale. */
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

    private static function insertSyncedSale(int $bid, int $uid, int $drawerId, ?int $cid, string $syncUuid, array $s, bool $isSqlite): int {
        $commonCols = 'branch_id, user_id, drawer_id, customer_id, invoice_no, subtotal, discount, discount_bps, tax, tax_bps, total, paid_amount, cash_tendered, change_amount, payment_methods, credit, due_date, notes, sync_uuid, synced, created_at';
        $commonVals = [
            $bid, $uid, $drawerId, $cid,
            (string) ($s['invoice_no'] ?? ''),
            (int) ($s['subtotal'] ?? 0),
            (int) ($s['discount'] ?? 0),
            (int) ($s['discount_bps'] ?? 0),
            (int) ($s['tax'] ?? 0),
            (int) ($s['tax_bps'] ?? 0),
            (int) ($s['total'] ?? 0),
            (int) ($s['paid_amount'] ?? 0),
            (int) ($s['cash_tendered'] ?? 0),
            (int) ($s['change_amount'] ?? 0),
            (string) ($s['payment_methods'] ?? ''),
            (int) ($s['credit'] ?? 0),
            $s['due_date'] ?? null,
            (string) ($s['notes'] ?? ''),
            $syncUuid,
            $s['created_at'] ?? date('Y-m-d H:i:s'),
        ];
        if ($isSqlite) {
            return BaseRepository::insert(
                "INSERT INTO sales (uuid, {$commonCols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
                array_merge([$syncUuid], $commonVals)
            );
        }
        return BaseRepository::insert(
            "INSERT INTO sales ({$commonCols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
            $commonVals
        );
    }

    private static function updateSyncedSale(int $saleId, int $drawerId, int $uid, array $s, array $payments, bool $isSqlite): void {
        BaseRepository::run(
            'UPDATE sales SET credit=?, paid_amount=COALESCE(?, paid_amount), cash_tendered=COALESCE(?, cash_tendered), change_amount=COALESCE(?, change_amount), payment_methods=CASE WHEN ? <> "" THEN ? ELSE payment_methods END, synced=1 WHERE id=?',
            [
                (int) ($s['credit'] ?? 0),
                isset($s['paid_amount']) ? (int) $s['paid_amount'] : null,
                isset($s['cash_tendered']) ? (int) $s['cash_tendered'] : null,
                isset($s['change_amount']) ? (int) $s['change_amount'] : null,
                (string) ($s['payment_methods'] ?? ''),
                (string) ($s['payment_methods'] ?? ''),
                $saleId,
            ]
        );
        self::syncSalePayments($saleId, $drawerId, $uid, $payments, $isSqlite);
    }

    private static function syncSalePayments(int $saleId, int $drawerId, int $userId, array $payments, bool $isSqlite): void {
        $seen = [];
        foreach ($payments as $pm) {
            $kind = $pm['kind'] ?? 'Sale';
            $method = $pm['method'] ?? 'Cash';
            $amount = (int) ($pm['amount'] ?? 0);
            $refVal = !empty($pm['reference']) ? (string) $pm['reference'] : null;
            $createdAt = $pm['created_at'] ?? date('Y-m-d H:i:s');

            $key = json_encode([$kind, $method, $amount, $refVal], JSON_THROW_ON_ERROR);
            $seen[$key] = ($seen[$key] ?? 0) + 1;
            $count = (int) BaseRepository::scalar(
                'SELECT COUNT(*) FROM payments WHERE sale_id=? AND kind=? AND method=? AND amount=? AND COALESCE(reference, "")=?',
                [$saleId, $kind, $method, $amount, $refVal ?? '']
            );
            if ($count >= $seen[$key]) {
                continue;
            }
            $pSql = $isSqlite
                ? 'INSERT OR IGNORE INTO payments (sale_id, drawer_id, user_id, kind, method, amount, reference, created_at) VALUES (?,?,?,?,?,?,?,?)'
                : 'INSERT IGNORE INTO payments (sale_id, drawer_id, user_id, kind, method, amount, reference, created_at) VALUES (?,?,?,?,?,?,?,?)';
            BaseRepository::run($pSql, [$saleId, $drawerId, $userId, $kind, $method, $amount, $refVal, $createdAt]);
        }
    }

    private static function upsertSyncedDrawers(array $drawers, callable $resolveBranch, callable $resolveUser, bool $respectDirtyLocal = false): array {
        $drawerMap = [];
        $ackedIds = [];
        $count = 0;

        foreach ($drawers as $d) {
            $bid = $resolveBranch($d['branch_name'] ?? null, (int) ($d['branch_id'] ?? 1));
            $uid = $resolveUser($d['user_email'] ?? null);
            $createdAt = (string) ($d['created_at'] ?? date('Y-m-d H:i:s'));
            $bDate = (string) ($d['business_date'] ?? substr($createdAt, 0, 10));
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $bDate)) {
                $bDate = date('Y-m-d');
            }
            $syncUuid = trim((string) ($d['sync_uuid'] ?? ''));
            if ($syncUuid === '') {
                $syncUuid = 'DRW-' . ($d['id'] ?? 0) . '-' . substr(md5("{$bid}|{$bDate}|{$createdAt}"), 0, 10);
            }

            $cycleSql = Database::isSqlite()
                ? 'INSERT OR IGNORE INTO cycles (branch_id, business_date) VALUES (?,?)'
                : 'INSERT IGNORE INTO cycles (branch_id, business_date) VALUES (?,?)';
            BaseRepository::run($cycleSql, [$bid, $bDate]);
            $cycleId = (int) BaseRepository::scalar('SELECT id FROM cycles WHERE branch_id=? AND business_date=? LIMIT 1', [$bid, $bDate]);

            $existing = BaseRepository::one('SELECT id, synced FROM drawers WHERE sync_uuid=? LIMIT 1', [$syncUuid]);
            if ($existing) {
                $localId = (int) $existing['id'];
                if (!$respectDirtyLocal || (int) ($existing['synced'] ?? 1) === 1) {
                    BaseRepository::run(
                        'UPDATE drawers SET counted=?, expected=?, notes=?, closed_at=?, synced=1 WHERE id=?',
                        [
                            isset($d['counted']) && $d['counted'] !== null ? (int) $d['counted'] : null,
                            isset($d['expected']) && $d['expected'] !== null ? (int) $d['expected'] : null,
                            $d['notes'] ?? '',
                            $d['closed_at'] ?? null,
                            $localId,
                        ]
                    );
                }
                $drawerMap[$syncUuid] = $localId;
            } elseif (empty($d['closed_at'])) {
                // Avoid violating MySQL UNIQUE(open_branch) if another open drawer already exists on target branch
                $openExisting = BaseRepository::one('SELECT id, sync_uuid FROM drawers WHERE branch_id=? AND closed_at IS NULL LIMIT 1', [$bid]);
                if ($openExisting) {
                    $localId = (int) $openExisting['id'];
                    if (empty($openExisting['sync_uuid'])) {
                        BaseRepository::run('UPDATE drawers SET sync_uuid=?, notes=?, synced=1 WHERE id=?', [$syncUuid, $d['notes'] ?? '', $localId]);
                    }
                    $drawerMap[$syncUuid] = $localId;
                } else {
                    $localId = BaseRepository::insert(
                        'INSERT INTO drawers (branch_id, user_id, cycle_id, opening, counted, expected, notes, sync_uuid, synced, created_at, closed_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)',
                        [
                            $bid,
                            $uid,
                            $cycleId,
                            (int) ($d['opening'] ?? 0),
                            isset($d['counted']) && $d['counted'] !== null ? (int) $d['counted'] : null,
                            isset($d['expected']) && $d['expected'] !== null ? (int) $d['expected'] : null,
                            $d['notes'] ?? '',
                            $syncUuid,
                            $createdAt,
                            null,
                        ]
                    );
                    $drawerMap[$syncUuid] = $localId;
                }
            } else {
                $localId = BaseRepository::insert(
                    'INSERT INTO drawers (branch_id, user_id, cycle_id, opening, counted, expected, notes, sync_uuid, synced, created_at, closed_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)',
                    [
                        $bid,
                        $uid,
                        $cycleId,
                        (int) ($d['opening'] ?? 0),
                        isset($d['counted']) && $d['counted'] !== null ? (int) $d['counted'] : null,
                        isset($d['expected']) && $d['expected'] !== null ? (int) $d['expected'] : null,
                        $d['notes'] ?? '',
                        $syncUuid,
                        $createdAt,
                        $d['closed_at'],
                    ]
                );
                $drawerMap[$syncUuid] = $localId;
            }

            if (isset($d['id'])) {
                $ackedIds[] = $d['id'];
            }
            $count++;
        }

        return [$drawerMap, $ackedIds, $count];
    }

    private static function resolveDrawerIdBySync(string $drawerSyncUuid, array $drawerMap, int $branchId, int $userId, string $businessDate): int {
        if ($drawerSyncUuid !== '' && isset($drawerMap[$drawerSyncUuid])) {
            return (int) $drawerMap[$drawerSyncUuid];
        }
        if ($drawerSyncUuid !== '') {
            $found = (int) BaseRepository::scalar('SELECT id FROM drawers WHERE sync_uuid=? LIMIT 1', [$drawerSyncUuid]);
            if ($found > 0) {
                return $found;
            }
        }
        return self::ensureSyncDrawer($branchId, $userId, $businessDate);
    }

    private static function upsertSyncedCashMovements(array $movements, array $drawerMap, callable $resolveBranch, callable $resolveUser, bool $isSqlite): array {
        $ackedIds = [];
        $count = 0;

        foreach ($movements as $cm) {
            $createdAt = (string) ($cm['created_at'] ?? date('Y-m-d H:i:s'));
            $syncUuid = trim((string) ($cm['sync_uuid'] ?? $cm['uuid'] ?? ''));
            if ($syncUuid === '') {
                $syncUuid = 'CM-' . ($cm['id'] ?? 0) . '-' . substr(md5(($cm['kind'] ?? '') . '|' . ($cm['amount'] ?? 0) . '|' . $createdAt), 0, 10);
            }

            if (!BaseRepository::scalar('SELECT id FROM cash_movements WHERE sync_uuid=? LIMIT 1', [$syncUuid])) {
                $bid = $resolveBranch($cm['branch_name'] ?? null, (int) ($cm['branch_id'] ?? 1));
                $uid = $resolveUser($cm['user_email'] ?? null);
                $bDate = (string) ($cm['business_date'] ?? substr($createdAt, 0, 10));
                $drawerId = self::resolveDrawerIdBySync((string) ($cm['drawer_sync_uuid'] ?? ''), $drawerMap, $bid, $uid, $bDate);

                if ($isSqlite) {
                    BaseRepository::run(
                        'INSERT INTO cash_movements (uuid, drawer_id, user_id, amount, kind, reference, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,1,?)',
                        [$syncUuid, $drawerId, $uid, (int) ($cm['amount'] ?? 0), (string) ($cm['kind'] ?? 'Cash'), (string) ($cm['reference'] ?? ''), $syncUuid, $createdAt]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO cash_movements (drawer_id, user_id, amount, kind, reference, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,1,?)',
                        [$drawerId, $uid, (int) ($cm['amount'] ?? 0), (string) ($cm['kind'] ?? 'Cash'), (string) ($cm['reference'] ?? ''), $syncUuid, $createdAt]
                    );
                }
                $count++;
            }

            if (isset($cm['id'])) {
                $ackedIds[] = $cm['id'];
            }
        }

        return [$ackedIds, $count];
    }

    private static function upsertSyncedSupplierPayments(array $payments, array $drawerMap, callable $resolveBranch, callable $resolveUser): array {
        $ackedIds = [];
        $count = 0;

        foreach ($payments as $sp) {
            $createdAt = (string) ($sp['created_at'] ?? date('Y-m-d H:i:s'));
            $syncUuid = trim((string) ($sp['sync_uuid'] ?? ''));
            if ($syncUuid === '') {
                $syncUuid = 'SPAY-' . ($sp['id'] ?? 0) . '-' . substr(md5(($sp['purchase_sync_uuid'] ?? '') . '|' . ($sp['amount'] ?? 0) . '|' . $createdAt), 0, 10);
            }

            if (!BaseRepository::scalar('SELECT id FROM supplier_payments WHERE sync_uuid=? LIMIT 1', [$syncUuid])) {
                $bid = $resolveBranch($sp['branch_name'] ?? null, (int) ($sp['branch_id'] ?? 1));
                $uid = $resolveUser($sp['user_email'] ?? null);
                $purchaseId = 0;
                if (!empty($sp['purchase_sync_uuid'])) {
                    $purchaseId = (int) BaseRepository::scalar('SELECT id FROM purchases WHERE sync_uuid=? LIMIT 1', [$sp['purchase_sync_uuid']]);
                }
                if ($purchaseId <= 0 && !empty($sp['purchase_invoice']) && !empty($sp['supplier_name']) && !empty($sp['product_sku'])) {
                    $purchaseId = (int) BaseRepository::scalar(
                        'SELECT pu.id FROM purchases pu JOIN suppliers sup ON sup.id=pu.supplier_id JOIN products p ON p.id=pu.product_id
                         WHERE pu.branch_id=? AND sup.name=? AND pu.invoice=? AND p.sku=? LIMIT 1',
                        [$bid, $sp['supplier_name'], $sp['purchase_invoice'], $sp['product_sku']]
                    );
                }
                if ($purchaseId <= 0) {
                    continue;
                }
                $drawerId = self::resolveDrawerIdBySync((string) ($sp['drawer_sync_uuid'] ?? ''), $drawerMap, $bid, $uid, substr($createdAt, 0, 10));
                BaseRepository::run(
                    'INSERT INTO supplier_payments (purchase_id, drawer_id, user_id, amount, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,1,?)',
                    [$purchaseId, $drawerId, $uid, (int) ($sp['amount'] ?? 0), $syncUuid, $createdAt]
                );
                $count++;
            }

            if (isset($sp['id'])) {
                $ackedIds[] = $sp['id'];
            }
        }

        return [$ackedIds, $count];
    }

    private static function upsertSyncedReturns(array $returns, array $drawerMap, callable $resolveBranch, bool $respectDirtyLocal = false): array {
        $ackedIds = [];
        $count = 0;

        foreach ($returns as $ret) {
            $createdAt = (string) ($ret['created_at'] ?? date('Y-m-d H:i:s'));
            $syncUuid = trim((string) ($ret['sync_uuid'] ?? ''));
            if ($syncUuid === '') {
                $syncUuid = 'RET-' . ($ret['id'] ?? 0) . '-' . substr(md5(($ret['sale_sync_uuid'] ?? '') . '|' . ($ret['amount'] ?? 0) . '|' . $createdAt), 0, 10);
            }

            $bid = $resolveBranch($ret['branch_name'] ?? null, (int) ($ret['branch_id'] ?? 1));
            $drawerId = !empty($ret['drawer_sync_uuid'])
                ? self::resolveDrawerIdBySync((string) $ret['drawer_sync_uuid'], $drawerMap, $bid, 1, substr($createdAt, 0, 10))
                : null;

            $existing = BaseRepository::one('SELECT id, sale_item_id, synced, status FROM returns_log WHERE sync_uuid=? LIMIT 1', [$syncUuid]);
            if ($existing) {
                if ((!$respectDirtyLocal || (int) ($existing['synced'] ?? 1) === 1)
                    && $existing['status'] !== ($ret['status'] ?? 'Pending')) {
                    BaseRepository::run(
                        'UPDATE returns_log SET status=?, reference=?, processed_drawer_id=?, synced=1 WHERE id=?',
                        [$ret['status'] ?? 'Pending', !empty($ret['reference']) ? $ret['reference'] : null, $drawerId, $existing['id']]
                    );
                }
            } else {
                $saleItemId = 0;
                if (!empty($ret['sale_sync_uuid']) && !empty($ret['product_sku'])) {
                    $unitCode = (string) ($ret['sale_unit_code'] ?? '');
                    $saleItemId = (int) BaseRepository::scalar(
                        'SELECT si.id FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id
                         LEFT JOIN units un ON un.id=si.unit_id
                         WHERE s.sync_uuid=? AND p.sku=? AND (? = \'\' OR un.code=?) ORDER BY si.id LIMIT 1',
                        [$ret['sale_sync_uuid'], $ret['product_sku'], $unitCode, $unitCode]
                    );
                }
                if ($saleItemId <= 0) {
                    continue;
                }
                $newRetId = BaseRepository::insert(
                    'INSERT INTO returns_log (branch_id, sale_item_id, qty, reason, condition_note, restock, amount, method, reference, status, processed_drawer_id, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?)',
                    [
                        $bid,
                        $saleItemId,
                        (int) ($ret['qty'] ?? 1),
                        (string) ($ret['reason'] ?? ''),
                        (string) ($ret['condition_note'] ?? ''),
                        !empty($ret['restock']) ? 1 : 0,
                        (int) ($ret['amount'] ?? 0),
                        (string) ($ret['method'] ?? 'Cash'),
                        !empty($ret['reference']) ? $ret['reference'] : null,
                        (string) ($ret['status'] ?? 'Pending'),
                        $drawerId,
                        $syncUuid,
                        $createdAt,
                    ]
                );

                $count++;
            }

            $saleItemId = $existing['sale_item_id'] ?? $saleItemId;
            BaseRepository::run(
                "UPDATE sale_items SET refunded_qty=(SELECT COALESCE(SUM(qty),0) FROM returns_log
                    WHERE sale_item_id=? AND status='Completed')
                 WHERE id=? AND refunded_qty<(SELECT COALESCE(SUM(qty),0) FROM returns_log
                    WHERE sale_item_id=? AND status='Completed')",
                [$saleItemId, $saleItemId, $saleItemId]
            );

            if ((!$existing || !$respectDirtyLocal || (int) $existing['synced'] === 1)
                && !empty($ret['exchange']) && is_array($ret['exchange'])) {
                $returnId = $existing['id'] ?? $newRetId;
                $ex = $ret['exchange'];
                $exPid = (int) BaseRepository::scalar('SELECT id FROM products WHERE sku=?', [$ex['product_sku'] ?? '']);
                $exUid = BaseRepository::scalar('SELECT id FROM units WHERE code=?', [$ex['unit_code'] ?? '']) ?: null;
                if (!$exPid || (!empty($ex['unit_code']) && !$exUid)) continue;
                $repSaleId = BaseRepository::scalar('SELECT id FROM sales WHERE sync_uuid=?', [$ex['replacement_sale_sync_uuid'] ?? '']) ?: null;
                $insert = Database::isSqlite() ? 'INSERT OR IGNORE' : 'INSERT IGNORE';
                BaseRepository::run(
                    "$insert INTO exchanges (return_id, product_id, unit_id, qty, quoted_total, replacement_sale_id) VALUES (?,?,?,?,?,?)",
                    [$returnId, $exPid, $exUid, (int) ($ex['qty'] ?? 1), (int) ($ex['quoted_total'] ?? 0), $repSaleId]
                );
                if ($repSaleId) {
                    BaseRepository::run('UPDATE exchanges SET replacement_sale_id=? WHERE return_id=? AND replacement_sale_id IS NULL', [$repSaleId, $returnId]);
                }
                foreach ($ex['addons'] ?? [] as $addon) {
                    $pid = BaseRepository::scalar('SELECT id FROM products WHERE sku=?', [$addon['product_sku'] ?? '']);
                    $uid = BaseRepository::scalar('SELECT id FROM units WHERE code=?', [$addon['unit_code'] ?? '']) ?: null;
                    if (!$pid || (!empty($addon['unit_code']) && !$uid)) continue 2;
                    BaseRepository::run(
                        "$insert INTO exchange_addons (return_id,line_no,product_id,unit_id,qty) VALUES (?,?,?,?,?)",
                        [$returnId, (int) $addon['line_no'], $pid, $uid, (int) $addon['qty']]
                    );
                }
            }

            if (isset($ret['id'])) {
                $ackedIds[] = $ret['id'];
            }
        }

        return [$ackedIds, $count];
    }

    private static function upsertSyncedBarcodeLogs(array $logs, callable $resolveBranch, callable $resolveUser): array {
        $ackedIds = [];
        $count = 0;

        foreach ($logs as $bp) {
            $createdAt = (string) ($bp['created_at'] ?? date('Y-m-d H:i:s'));
            $syncUuid = trim((string) ($bp['sync_uuid'] ?? ''));
            if ($syncUuid === '') {
                $syncUuid = 'BPL-' . ($bp['id'] ?? 0) . '-' . substr(md5(($bp['product_sku'] ?? '') . '|' . ($bp['copies'] ?? 1) . '|' . $createdAt), 0, 10);
            }

            if (!BaseRepository::scalar('SELECT id FROM barcode_print_logs WHERE sync_uuid=? LIMIT 1', [$syncUuid])) {
                $pid = !empty($bp['product_sku']) ? (int) BaseRepository::scalar('SELECT id FROM products WHERE sku=? LIMIT 1', [$bp['product_sku']]) : (int) ($bp['product_id'] ?? 0);
                if ($pid > 0) {
                    $bid = (int) ($bp['branch_id'] ?? 0) > 0 ? $resolveBranch($bp['branch_name'] ?? null, (int) $bp['branch_id']) : 0;
                    $uid = $resolveUser($bp['user_email'] ?? null);
                    BaseRepository::run(
                        'INSERT INTO barcode_print_logs (branch_id, product_id, user_id, copies, price, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,?,1,?)',
                        [$bid, $pid, $uid, max(1, (int) ($bp['copies'] ?? 1)), (int) ($bp['price'] ?? 0), $syncUuid, $createdAt]
                    );
                    $count++;
                }
            }

            if (isset($bp['id'])) {
                $ackedIds[] = $bp['id'];
            }
        }

        return [$ackedIds, $count];
    }

    private static function upsertSyncedAuditLogs(array $logs, callable $resolveBranch, callable $resolveUser): array {
        $ackedIds = [];
        $count = 0;

        foreach ($logs as $al) {
            $createdAt = (string) ($al['created_at'] ?? date('Y-m-d H:i:s'));
            $syncUuid = trim((string) ($al['sync_uuid'] ?? ''));
            if ($syncUuid === '') {
                $syncUuid = 'AUD-' . ($al['id'] ?? 0) . '-' . substr(md5(($al['action'] ?? '') . '|' . ($al['user_email'] ?? '') . '|' . $createdAt), 0, 10);
            }

            if (!BaseRepository::scalar('SELECT id FROM audit_log WHERE sync_uuid=? LIMIT 1', [$syncUuid])) {
                $uid = $resolveUser($al['user_email'] ?? null);
                $bid = !empty($al['branch_name']) || !empty($al['branch_id'])
                    ? $resolveBranch($al['branch_name'] ?? null, (int) ($al['branch_id'] ?? 1))
                    : null;
                BaseRepository::run(
                    'INSERT INTO audit_log (user_id, branch_id, action, details, sync_uuid, synced, created_at) VALUES (?,?,?,?,?,1,?)',
                    [$uid, $bid, (string) ($al['action'] ?? 'sync'), (string) ($al['details'] ?? '{}'), $syncUuid, $createdAt]
                );
                $count++;
            }

            if (isset($al['id'])) {
                $ackedIds[] = $al['id'];
            }
        }

        return [$ackedIds, $count];
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
            'synced_roles' => [],
            'synced_branches' => [],
            'synced_users' => [],
            'synced_products' => [],
            'synced_customers' => [],
            'synced_units' => [],
            'synced_suppliers' => [],
            'synced_purchases' => [],
            'synced_transfers' => [],
            'synced_repairs' => [],
            'synced_sales' => [],
            'synced_movements' => [],
            'synced_drawers' => [],
            'synced_cash_movements' => [],
            'synced_supplier_payments' => [],
            'synced_returns' => [],
            'synced_barcode_logs' => [],
            'synced_audit_logs' => [],
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
                $uuid = $b['sync_uuid'] ?? '';
                $existing = ($uuid !== '' ? BaseRepository::scalar('SELECT id FROM branches WHERE sync_uuid=?', [$uuid]) : false)
                    ?: BaseRepository::scalar('SELECT id FROM branches WHERE name=?', [$name]);
                if ($existing) {
                    BaseRepository::run('UPDATE branches SET name=?, phone=?, address=?, sync_uuid=COALESCE(sync_uuid, ?), synced=1 WHERE id=?', [$name, $b['phone'] ?? '', $b['address'] ?? '', $b['sync_uuid'] ?? null, $existing]);
                } else {
                    BaseRepository::run('INSERT INTO branches (name, phone, address, sync_uuid, synced) VALUES (?,?,?,?,1)', [$name, $b['phone'] ?? '', $b['address'] ?? '', $b['sync_uuid'] ?? null]);
                }
                $acked['synced_branches'][] = $b['id'];
            }

            [, $acked['synced_users']] = self::syncStaff($payload, $resolveBranch);
            foreach ($payload['role_changes'] ?? [] as $change) {
                $role = $change['role'] ?? '';
                $token = $change['pending_token'] ?? '';
                if (!in_array($role, ['manager', 'cashier', 'technician', 'stock'], true)
                    || !is_string($token) || !preg_match('/^[a-f0-9]{32}$/D', $token)
                    || !is_array($change['permissions'] ?? null)) {
                    continue;
                }
                self::replaceRolePermissions($role, $change['permissions']);
                $acked['synced_roles'][] = ['role' => $role, 'pending_token' => $token];
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
                    'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=? AND deleted_at IS NULL) ORDER BY CASE WHEN sync_uuid=? THEN 0 ELSE 1 END LIMIT 1',
                    [$syncUuid, $bid, $c['phone'], $syncUuid]
                );
                if ($existing) {
                    BaseRepository::run(
                        'UPDATE customers SET name=?, phone=?, email=?, notes=?, loyalty_points=?, wallet_balance=?, sync_uuid=?, deleted_at=COALESCE(deleted_at, ?), synced=1 WHERE id=?',
                        [$c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', (int) ($c['loyalty_points'] ?? 0), (int) ($c['wallet_balance'] ?? 0), $syncUuid, $c['deleted_at'] ?? null, $existing['id']]
                    );
                } elseif ($isSqlite) {
                    BaseRepository::run(
                        'INSERT INTO customers (uuid, branch_id, name, phone, email, notes, loyalty_points, wallet_balance, sync_uuid, deleted_at, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)',
                        [$syncUuid, $bid, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', (int) ($c['loyalty_points'] ?? 0), (int) ($c['wallet_balance'] ?? 0), $syncUuid, $c['deleted_at'] ?? null, $c['created_at'] ?? date('Y-m-d H:i:s')]
                    );
                } else {
                    BaseRepository::run(
                        'INSERT INTO customers (branch_id, name, phone, email, notes, loyalty_points, wallet_balance, sync_uuid, deleted_at, synced, created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)',
                        [$bid, $c['name'], $c['phone'], $c['email'] ?? '', $c['notes'] ?? '', (int) ($c['loyalty_points'] ?? 0), (int) ($c['wallet_balance'] ?? 0), $syncUuid, $c['deleted_at'] ?? null, $c['created_at'] ?? date('Y-m-d H:i:s')]
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
                    'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=? AND deleted_at IS NULL) ORDER BY CASE WHEN sync_uuid=? THEN 0 ELSE 1 END LIMIT 1',
                    [$r['customer_sync_uuid'] ?? '', $bid, $r['customer_phone'] ?? '', $r['customer_sync_uuid'] ?? '']
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
                self::writeSyncedRepair($r, $bid, $cid, $techId, $syncUuid, (int) $existingRep, $isSqlite);
                $acked['synced_repairs'][] = $r['id'];
            }

            // 7.5 Drawers / Cash Register shifts (resolved before sales & cashbook movements)
            [$drawerMap, $ackedDrawers] = self::upsertSyncedDrawers(
                $payload['drawers'] ?? [],
                $resolveBranch,
                $resolveUser,
                false
            );
            $acked['synced_drawers'] = $ackedDrawers;

            // 8. Sales + Sale Items + Payments (with resolved Branch, User, Drawer, Customer, Product, Unit FKs)
            $reservationBySale = [];
            foreach ($payload['reservations'] ?? [] as $reservation) {
                if ($reservation['status'] === 'Delivered' && !empty($reservation['sale_uuid'])) {
                    $reservationBySale[$reservation['sale_uuid']] = $reservation['sync_uuid'];
                }
            }
            foreach ($payload['sales'] ?? [] as $saleEntry) {
                $s = $saleEntry['sale'] ?? [];
                if (empty($s)) continue;
                $bid = $resolveBranch($s['branch_name'] ?? null, (int) ($s['branch_id'] ?? $defaultBranchId));
                $uid = $resolveUser($s['user_email'] ?? null);
                $syncUuid = (string) ($s['sync_uuid'] ?? $s['uuid'] ?? ('SL-' . ($s['id'] ?? 0)));
                $drawerId = self::resolveDrawerIdBySync(
                    (string) ($s['drawer_sync_uuid'] ?? ''),
                    $drawerMap,
                    $bid,
                    $uid,
                    substr((string) ($s['created_at'] ?? date('Y-m-d')), 0, 10)
                );

                $existingSaleId = (int) BaseRepository::scalar('SELECT id FROM sales WHERE sync_uuid = ? LIMIT 1', [$syncUuid]);
                $releasingHold = isset($reservationBySale[$syncUuid])
                    ? (int) BaseRepository::scalar("SELECT id FROM reservations WHERE sync_uuid=? AND branch_id=? AND status='Held'", [$reservationBySale[$syncUuid], $bid])
                    : 0;
                if ($existingSaleId > 0) {
                    self::updateSyncedSale($existingSaleId, $drawerId, $uid, $s, $saleEntry['payments'] ?? [], $isSqlite);
                } else {
                    $cid = (!empty($s['customer_sync_uuid']) || !empty($s['customer_phone']))
                        ? (BaseRepository::scalar(
                            'SELECT id FROM customers WHERE sync_uuid=? OR (branch_id=? AND phone=? AND deleted_at IS NULL) ORDER BY CASE WHEN sync_uuid=? THEN 0 ELSE 1 END LIMIT 1',
                            [$s['customer_sync_uuid'] ?? '', $bid, $s['customer_phone'] ?? '', $s['customer_sync_uuid'] ?? '']
                        ) ?: null)
                        : null;

                    $newSaleId = self::insertSyncedSale($bid, $uid, $drawerId, $cid, $syncUuid, $s, $isSqlite);

                    foreach ($saleEntry['items'] ?? [] as $it) {
                        $pid = $resolveProduct($it['product_sku'] ?? null, (int) ($it['product_id'] ?? 0));
                        if ($pid <= 0) continue;
                        $unId = !empty($it['unit_code']) ? (BaseRepository::scalar('SELECT id FROM units WHERE code=? LIMIT 1', [$it['unit_code']]) ?: null) : null;
                        if ($unId && BaseRepository::scalar("SELECT id FROM reservations WHERE unit_id=? AND status='Held' AND id<>?", [$unId, $releasingHold])) {
                            throw new \Zeedat\Support\ApiError('A synced sale includes a reserved device. The sale is still pending.', 409);
                        }
                        BaseRepository::run(
                            'INSERT INTO sale_items (sale_id, product_id, unit_id, name, qty, price, total, refunded_qty, commission_amount) VALUES (?,?,?,?,?,?,?,?,?)',
                            [$newSaleId, $pid, $unId, $it['name'], (int) $it['qty'], (int) $it['price'], (int) $it['total'], (int) ($it['refunded_qty'] ?? 0), (int) ($it['commission_amount'] ?? 0)]
                        );
                        if ($unId) {
                            BaseRepository::run("UPDATE units SET state='Sold', synced=1 WHERE id=?", [$unId]);
                        }
                        $cat = BaseRepository::scalar('SELECT category FROM products WHERE id=?', [$pid]);
                        if ($cat !== 'Services') {
                            if (BaseRepository::scalar("SELECT id FROM reservations WHERE branch_id=? AND product_id=? AND status='Held' LIMIT 1", [$bid, $pid])) {
                                ProductRepository::assertStockAvailable($bid, $pid, (int) $it['qty'], $releasingHold);
                            }
                            $stockSql = $isSqlite
                                ? 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,0) ON CONFLICT(branch_id, product_id) DO UPDATE SET qty = MAX(0, stock.qty - ?)'
                                : 'INSERT INTO stock (branch_id, product_id, qty) VALUES (?,?,0) ON DUPLICATE KEY UPDATE qty = GREATEST(0, CAST(qty AS SIGNED) - ?)';
                            BaseRepository::run($stockSql, [$bid, $pid, (int) $it['qty']]);
                        }
                    }

                    self::syncSalePayments($newSaleId, $drawerId, $uid, $saleEntry['payments'] ?? [], $isSqlite);
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

            // 10. Cashbook movements, Supplier payments, Returns & Exchanges, Barcode logs & Audit logs
            [$acked['synced_cash_movements']] = self::upsertSyncedCashMovements(
                $payload['cash_movements'] ?? [],
                $drawerMap,
                $resolveBranch,
                $resolveUser,
                $isSqlite
            );
            [$acked['synced_supplier_payments']] = self::upsertSyncedSupplierPayments(
                $payload['supplier_payments'] ?? [],
                $drawerMap,
                $resolveBranch,
                $resolveUser
            );
            [$acked['synced_returns']] = self::upsertSyncedReturns(
                $payload['returns_log'] ?? [],
                $drawerMap,
                $resolveBranch,
                false
            );
            [$acked['synced_barcode_logs']] = self::upsertSyncedBarcodeLogs(
                $payload['barcode_print_logs'] ?? [],
                $resolveBranch,
                $resolveUser
            );
            [$acked['synced_audit_logs']] = self::upsertSyncedAuditLogs(
                $payload['audit_log'] ?? [],
                $resolveBranch,
                $resolveUser
            );
            $acked['synced_wallet_logs'] = self::syncWalletLogs(
                $payload['customer_wallet_logs'] ?? [], $resolveBranch, $resolveUser
            );
            $acked['synced_reservations'] = ReservationService::applySync($payload['reservations'] ?? [], false);
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

        $drawers = self::ensureSyncUuids(
            'drawers',
            'DRW',
            self::safeRows(
                "SELECT d.*, b.name AS branch_name, COALESCE(u.email, '') AS user_email, COALESCE(c.business_date, '') AS business_date
                 FROM drawers d
                 JOIN branches b ON b.id=d.branch_id
                 LEFT JOIN users u ON u.id=d.user_id
                 LEFT JOIN cycles c ON c.id=d.cycle_id
                 ORDER BY d.id DESC"
            ),
            static fn($r) => ($r['branch_id'] ?? 1) . '|' . ($r['business_date'] ?? '') . '|' . ($r['created_at'] ?? ''),
            false
        );

        $sales = self::ensureSyncUuids(
            'sales',
            'SL',
            BaseRepository::rows(
                "SELECT s.*, b.name AS branch_name, COALESCE(u.email, '') AS user_email,
                        COALESCE(d.sync_uuid, '') AS drawer_sync_uuid,
                        COALESCE(c.sync_uuid, '') AS customer_sync_uuid, COALESCE(c.phone, '') AS customer_phone
                 FROM sales s
                 JOIN branches b ON b.id=s.branch_id
                 LEFT JOIN drawers d ON d.id=s.drawer_id
                 LEFT JOIN users u ON u.id=s.user_id
                 LEFT JOIN customers c ON c.id=s.customer_id
                 ORDER BY s.id DESC"
            ),
            static fn($r) => ($r['created_at'] ?? '') . '|' . ($r['total'] ?? 0) . '|' . ($r['branch_id'] ?? 1),
            false
        );
        $itemsBySale = [];
        foreach (BaseRepository::rows(
            "SELECT si.*, p.sku AS product_sku, COALESCE(un.code, '') AS unit_code
             FROM sale_items si JOIN products p ON p.id=si.product_id LEFT JOIN units un ON un.id=si.unit_id ORDER BY si.id"
        ) as $item) {
            $itemsBySale[$item['sale_id']][] = $item;
        }
        $paymentsBySale = [];
        foreach (BaseRepository::rows('SELECT * FROM payments ORDER BY id') as $payment) {
            $paymentsBySale[$payment['sale_id']][] = $payment;
        }
        $saleEntries = [];
        foreach ($sales as $sale) {
            $saleEntries[] = [
                'sale' => $sale,
                'items' => $itemsBySale[$sale['id']] ?? [],
                'payments' => $paymentsBySale[$sale['id']] ?? [],
            ];
        }

        $cashMovements = self::ensureSyncUuids(
            'cash_movements',
            'CM',
            self::safeRows(
                "SELECT cm.*, d.branch_id, b.name AS branch_name, COALESCE(d.sync_uuid, '') AS drawer_sync_uuid,
                        COALESCE(c.business_date, '') AS business_date, COALESCE(u.email, '') AS user_email
                 FROM cash_movements cm
                 JOIN drawers d ON d.id=cm.drawer_id
                 JOIN branches b ON b.id=d.branch_id
                 LEFT JOIN cycles c ON c.id=d.cycle_id
                 LEFT JOIN users u ON u.id=cm.user_id
                 ORDER BY cm.id DESC"
            ),
            static fn($r) => ($r['drawer_id'] ?? 1) . '|' . ($r['amount'] ?? 0) . '|' . ($r['kind'] ?? '') . '|' . ($r['reference'] ?? '') . '|' . ($r['created_at'] ?? ''),
            false
        );

        $supplierPayments = self::ensureSyncUuids(
            'supplier_payments',
            'SPAY',
            self::safeRows(
                "SELECT sp.*, pu.branch_id, b.name AS branch_name, COALESCE(pu.sync_uuid, '') AS purchase_sync_uuid,
                        sup.name AS supplier_name, pu.invoice AS purchase_invoice, p.sku AS product_sku,
                        COALESCE(d.sync_uuid, '') AS drawer_sync_uuid, COALESCE(u.email, '') AS user_email
                 FROM supplier_payments sp
                 JOIN purchases pu ON pu.id=sp.purchase_id
                 JOIN branches b ON b.id=pu.branch_id
                 JOIN suppliers sup ON sup.id=pu.supplier_id
                 JOIN products p ON p.id=pu.product_id
                 LEFT JOIN drawers d ON d.id=sp.drawer_id
                 LEFT JOIN users u ON u.id=sp.user_id
                 ORDER BY sp.id DESC"
            ),
            static fn($r) => ($r['purchase_id'] ?? 0) . '|' . ($r['amount'] ?? 0) . '|' . ($r['created_at'] ?? ''),
            false
        );

        $returnsRaw = self::ensureSyncUuids(
            'returns_log',
            'RET',
            self::safeRows(
                "SELECT rl.*, b.name AS branch_name, COALESCE(s.sync_uuid, '') AS sale_sync_uuid,
                        p.sku AS product_sku, si.name AS sale_item_name, un.code AS sale_unit_code,
                        COALESCE(d.sync_uuid, '') AS drawer_sync_uuid
                 FROM returns_log rl
                 JOIN branches b ON b.id=rl.branch_id
                 JOIN sale_items si ON si.id=rl.sale_item_id
                 JOIN sales s ON s.id=si.sale_id
                 JOIN products p ON p.id=si.product_id
                 LEFT JOIN units un ON un.id=si.unit_id
                 LEFT JOIN drawers d ON d.id=rl.processed_drawer_id
                 ORDER BY rl.id DESC"
            ),
            static fn($r) => ($r['sale_item_id'] ?? 0) . '|' . ($r['qty'] ?? 0) . '|' . ($r['amount'] ?? 0) . '|' . ($r['created_at'] ?? ''),
            false
        );
        foreach ($returnsRaw as &$retRow) {
            $exch = BaseRepository::one(
                "SELECT ex.*, p.sku AS product_sku, COALESCE(un.code, '') AS unit_code, COALESCE(rs.sync_uuid, '') AS replacement_sale_sync_uuid
                 FROM exchanges ex
                 JOIN products p ON p.id=ex.product_id
                 LEFT JOIN units un ON un.id=ex.unit_id
                 LEFT JOIN sales rs ON rs.id=ex.replacement_sale_id
                 WHERE ex.return_id=?",
                [$retRow['id']]
            );
            if ($exch) {
                $exch['addons'] = BaseRepository::rows(
                    'SELECT a.line_no, a.qty, p.sku product_sku, u.code unit_code FROM exchange_addons a
                     JOIN products p ON p.id=a.product_id LEFT JOIN units u ON u.id=a.unit_id
                     WHERE a.return_id=? ORDER BY a.line_no',
                    [$retRow['id']]
                );
            }
            $retRow['exchange'] = $exch ?: null;
        }
        unset($retRow);

        $barcodeLogs = self::ensureSyncUuids(
            'barcode_print_logs',
            'BPL',
            self::safeRows(
                "SELECT bp.*, COALESCE(b.name, '') AS branch_name, COALESCE(p.sku, '') AS product_sku, COALESCE(u.email, '') AS user_email
                 FROM barcode_print_logs bp
                 LEFT JOIN branches b ON b.id=bp.branch_id
                 LEFT JOIN products p ON p.id=bp.product_id
                 LEFT JOIN users u ON u.id=bp.user_id
                 ORDER BY bp.id DESC"
            ),
            static fn($r) => ($r['product_id'] ?? 0) . '|' . ($r['copies'] ?? 1) . '|' . ($r['created_at'] ?? ''),
            false
        );

        $auditLogs = self::ensureSyncUuids(
            'audit_log',
            'AUD',
            self::safeRows(
                "SELECT a.*, COALESCE(b.name, '') AS branch_name, COALESCE(u.email, '') AS user_email
                 FROM audit_log a
                 LEFT JOIN branches b ON b.id=a.branch_id
                 LEFT JOIN users u ON u.id=a.user_id
                 ORDER BY a.id DESC"
            ),
            static fn($r) => ($r['action'] ?? '') . '|' . ($r['user_id'] ?? 0) . '|' . ($r['created_at'] ?? ''),
            false
        );

        $users = self::ensureSyncUuids(
            'users',
            'USR',
            BaseRepository::rows(
                "SELECT u.id, u.branch_id, COALESCE(b.name, '') AS branch_name, u.name, u.email,
                        u.password_hash, u.role, u.badge_code, u.active, u.sync_uuid
                 FROM users u LEFT JOIN branches b ON b.id=u.branch_id ORDER BY u.id ASC"
            ),
            static fn($u) => strtolower(trim((string) $u['email'])),
            false
        );
        $userBranches = BaseRepository::rows(
            'SELECT u.email, b.name AS branch_name
             FROM user_branches ub JOIN users u ON u.id=ub.user_id JOIN branches b ON b.id=ub.branch_id'
        );
        $userPermissions = BaseRepository::rows(
            'SELECT u.email, up.permission, up.allowed
             FROM user_permissions up JOIN users u ON u.id=up.user_id'
        );

        return [
            'success' => true,
            'count' => count($products),
            'branches' => self::ensureSyncUuids(
                'branches', 'BR', BaseRepository::rows('SELECT id, name, phone, address, sync_uuid FROM branches ORDER BY id ASC'),
                static fn($row) => (string) $row['name'], false
            ),
            'role_permissions' => BaseRepository::rows('SELECT role, permission FROM role_permissions'),
            'users' => $users,
            'user_branches' => $userBranches,
            'user_permissions' => $userPermissions,
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
                 ORDER BY pu.id DESC"
            ),
            'transfers' => BaseRepository::rows(
                "SELECT t.*, fb.name AS from_branch_name, tb.name AS to_branch_name, p.sku AS product_sku, COALESCE(un.code, '') AS unit_code
                 FROM transfers t JOIN branches fb ON fb.id=t.from_branch JOIN branches tb ON tb.id=t.to_branch
                 JOIN products p ON p.id=t.product_id LEFT JOIN units un ON un.id=t.unit_id ORDER BY t.id DESC"
            ),
            'repairs' => self::ensureSyncUuids('repairs', 'REP', BaseRepository::rows(
                "SELECT r.*, b.name AS branch_name, COALESCE(c.sync_uuid, '') AS customer_sync_uuid, COALESCE(c.phone, '') AS customer_phone,
                        COALESCE(t.email, '') AS technician_email
                 FROM repairs r JOIN branches b ON b.id=r.branch_id LEFT JOIN customers c ON c.id=r.customer_id
                 LEFT JOIN users t ON t.id=r.technician_id ORDER BY r.id DESC"
            ), static fn($r) => ($r['device'] ?? '') . '|' . ($r['created_at'] ?? ''), false),
            'drawers' => $drawers,
            'sales' => $saleEntries,
            'cash_movements' => $cashMovements,
            'supplier_payments' => $supplierPayments,
            'returns_log' => $returnsRaw,
            'barcode_print_logs' => $barcodeLogs,
            'audit_log' => $auditLogs,
            'reservations' => ReservationService::syncRows(false),
            'customer_wallet_logs' => self::ensureSyncUuids(
                'customer_wallet_logs', 'WLT', BaseRepository::rows(self::WALLET_LOG_QUERY . ' ORDER BY w.id'),
                static fn($row) => bin2hex(random_bytes(16)), false
            ),
            'stock_movements' => self::ensureSyncUuids(
                'stock_movements', 'MV', BaseRepository::rows(
                    "SELECT m.*, b.name AS branch_name, p.sku AS product_sku, u.email AS user_email
                     FROM stock_movements m JOIN branches b ON b.id=m.branch_id
                     JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id ORDER BY m.id"
                ),
                static fn($row) => ($row['branch_id'] ?? 1) . '|' . ($row['product_sku'] ?? '') . '|' . ($row['kind'] ?? '') . '|' . ($row['reference'] ?? '') . '|' . ($row['created_at'] ?? ''),
                false
            ),
            'settings' => [
                'shop_name' => $settings['shop_name'] ?? 'ZEEDAT POS',
                'shop_phone' => $settings['shop_phone'] ?? '',
                'shop_address' => $settings['shop_address'] ?? '',
                'shop_email' => $settings['shop_email'] ?? '',
                'invoice_prefix' => $settings['invoice_prefix'] ?? 'INV-',
                'paper_width' => $settings['paper_width'] ?? '80',
                'receipt_footer' => $settings['receipt_footer'] ?? 'Thank you for your business!',
                'bill_layout' => $settings['bill_layout'] ?? null,
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
            $totalPushed = 0;
            for ($pass = 0; $pass < 10; $pass++) {
                Database::overrideConnection('sqlite', $sqlitePdo);
                $pendingPayload = self::collectPendingPushPayload();
                if (empty($pendingPayload)) {
                    break;
                }

                Database::overrideConnection('mysql', $mysqlPdo);
                $ack = self::handleSyncReceive([], $pendingPayload, true);
                Database::overrideConnection('sqlite', $sqlitePdo);
                $batchSummary = self::applyPushAcknowledgements($ack);
                $batchCount = (int) ($batchSummary['synced_count'] ?? 0);
                $totalPushed += $batchCount;
                $pushSummary = $batchSummary;
                $pushSummary['synced_count'] = $totalPushed;
                if ($batchCount === 0) {
                    break;
                }
            }

            Database::overrideConnection('mysql', $mysqlPdo);
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
        $cloudUrl = BackupService::resolveEffectiveCloudUrl($settings);
        $autoSync = !empty($settings['auto_sync_enabled']);
        $interval = max(5, (int) ($settings['sync_interval_minutes'] ?? 15));

        if ($cloudUrl === '' || !filter_var($cloudUrl, FILTER_VALIDATE_URL)) {
            return ['ran' => false, 'reason' => 'not_configured'];
        }
        if (!$autoSync) {
            return ['ran' => false, 'reason' => 'disabled'];
        }
        if (!self::isInternetAvailable($cloudUrl)) {
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
