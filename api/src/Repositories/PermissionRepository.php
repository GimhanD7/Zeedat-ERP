<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

use Zeedat\Config\Constants;
use Zeedat\Config\Database;
use Zeedat\Support\ApiError;

class PermissionRepository extends BaseRepository {
    public const ALL_PERMISSIONS = [
        'dashboard' => [
            'id' => 'dashboard',
            'name' => 'Dashboard & Analytics',
            'description' => 'Real-time sales KPI widgets, branch revenue charts and notices',
            'category' => 'Management & Reports',
        ],
        'pos' => [
            'id' => 'pos',
            'name' => 'POS & Billing Terminal',
            'description' => 'Process customer sales, barcode scanning, discounts, drafts & print invoices',
            'category' => 'Operations & Sales',
        ],
        'repairs' => [
            'id' => 'repairs',
            'name' => 'Repair Desk & Workshop',
            'description' => 'Device intake, diagnose hardware issues, assign technicians, job statuses',
            'category' => 'Operations & Sales',
        ],
        'customers' => [
            'id' => 'customers',
            'name' => 'Customer Registry',
            'description' => 'View, create and update customer directory and credit balance accounts',
            'category' => 'Operations & Sales',
        ],
        'sales' => [
            'id' => 'sales',
            'name' => 'Sales History',
            'description' => 'Search completed transactions, view past invoices and reprint receipts',
            'category' => 'Operations & Sales',
        ],
        'inventory' => [
            'id' => 'inventory',
            'name' => 'Inventory & Products',
            'description' => 'Manage catalog, multi-branch stock levels, barcodes, label printing & IMEI units',
            'category' => 'Inventory & Stock',
        ],
        'purchases' => [
            'id' => 'purchases',
            'name' => 'Purchases & Receiving',
            'description' => 'Create supplier purchase orders and receive inventory shipments',
            'category' => 'Inventory & Stock',
        ],
        'transfers' => [
            'id' => 'transfers',
            'name' => 'Stock Transfers',
            'description' => 'Request, dispatch, receive, and review inter-branch stock transfers',
            'category' => 'Inventory & Stock',
        ],
        'drawer' => [
            'id' => 'drawer',
            'name' => 'Cash Register & Movements',
            'description' => 'Open & close register, record cash movements, and cash audits',
            'category' => 'Finance & Cash',
        ],
        'returns' => [
            'id' => 'returns',
            'name' => 'Returns & Exchanges',
            'description' => 'Process customer return requests, refund approvals, and replacement sales',
            'category' => 'Finance & Cash',
        ],
        'reports' => [
            'id' => 'reports',
            'name' => 'Reports & Analytics',
            'description' => 'Export deep business reports, sales summaries, and profit analytics',
            'category' => 'Management & Reports',
        ],
        'staff' => [
            'id' => 'staff',
            'name' => 'Staff & Role Permissions',
            'description' => 'Create staff user accounts and manage role-based permission access',
            'category' => 'Management & Reports',
        ],
        'settings' => [
            'id' => 'settings',
            'name' => 'Shop Settings & Audits',
            'description' => 'Store preferences, receipt paper width, tax rates, and security audit logs',
            'category' => 'Management & Reports',
        ],
    ];

    public const DEFAULT_ROLE_PERMISSIONS = [
        'owner' => [
            'dashboard', 'pos', 'repairs', 'customers', 'sales',
            'inventory', 'purchases', 'transfers',
            'drawer', 'returns',
            'reports', 'staff', 'settings',
        ],
        'manager' => [
            'dashboard', 'pos', 'repairs', 'customers', 'sales',
            'inventory', 'purchases', 'transfers',
            'drawer', 'returns',
            'reports',
        ],
        'cashier' => [
            'pos',
            'repairs',
        ],
        'technician' => [
            'repairs',
        ],
        'stock' => [
            'inventory', 'purchases', 'transfers',
        ],
    ];

    private static ?\WeakMap $initialized = null;

    public static function ensureTable(?\PDO $db = null): void {
        $db ??= self::db();
        self::$initialized ??= new \WeakMap();
        if (isset(self::$initialized[$db])) {
            return;
        }
        $engine = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite' ? '' : ' ENGINE=InnoDB';

        $db->exec("CREATE TABLE IF NOT EXISTS role_permissions (
            role VARCHAR(40) NOT NULL,
            permission VARCHAR(60) NOT NULL,
            PRIMARY KEY(role, permission)
        ){$engine}");

        $db->exec("CREATE TABLE IF NOT EXISTS user_permissions (
            user_id INT NOT NULL,
            permission VARCHAR(60) NOT NULL,
            allowed TINYINT(1) NOT NULL DEFAULT 1,
            PRIMARY KEY(user_id, permission)
        ){$engine}");
        $db->exec("CREATE TABLE IF NOT EXISTS role_permission_sync (
            role VARCHAR(40) NOT NULL PRIMARY KEY,
            pending_token VARCHAR(32) NULL
        ){$engine}");

        if (!(int) $db->query('SELECT COUNT(*) FROM role_permissions')->fetchColumn()
            && !(int) $db->query('SELECT COUNT(*) FROM role_permission_sync')->fetchColumn()) {
            self::insertDefaults($db);
        }

        self::$initialized[$db] = true;
    }

    public static function seedDefaults(?\PDO $db = null): void {
        $db ??= self::db();
        $db->exec('DELETE FROM role_permissions');
        self::insertDefaults($db);
    }

    private static function insertDefaults(\PDO $db): void {
        $insertSql = $db->getAttribute(\PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "INSERT OR IGNORE INTO role_permissions (role, permission) VALUES (?, ?)"
            : "INSERT IGNORE INTO role_permissions (role, permission) VALUES (?, ?)";
        $stmt = $db->prepare($insertSql);
        foreach (self::DEFAULT_ROLE_PERMISSIONS as $role => $perms) {
            foreach ($perms as $perm) {
                if (isset(self::ALL_PERMISSIONS[$perm])) {
                    $stmt->execute([$role, $perm]);
                }
            }
        }
    }

    public static function markRoleChanged(string $role, ?string $token): void {
        $sql = Database::isSqlite()
            ? 'INSERT INTO role_permission_sync (role, pending_token) VALUES (?,?) ON CONFLICT(role) DO UPDATE SET pending_token=excluded.pending_token'
            : 'INSERT INTO role_permission_sync (role, pending_token) VALUES (?,?) ON DUPLICATE KEY UPDATE pending_token=VALUES(pending_token)';
        self::run($sql, [$role, $token]);
    }

    public static function getPermissionsByRole(): array {
        self::ensureTable();
        $rows = self::rows("SELECT role, permission FROM role_permissions ORDER BY role, permission");
        
        $matrix = [
            'owner' => array_keys(self::ALL_PERMISSIONS),
            'manager' => [],
            'cashier' => [],
            'technician' => [],
            'stock' => [],
        ];

        foreach ($rows as $r) {
            $role = $r['role'];
            $perm = $r['permission'];
            if (isset(self::ALL_PERMISSIONS[$perm]) && isset($matrix[$role])) {
                if (!in_array($perm, $matrix[$role], true)) {
                    $matrix[$role][] = $perm;
                }
            }
        }

        // Owner always has all permissions
        $matrix['owner'] = array_keys(self::ALL_PERMISSIONS);

        return $matrix;
    }

    public static function getPermissionsForRole(string $role): array {
        if ($role === 'owner') {
            return array_keys(self::ALL_PERMISSIONS);
        }

        self::ensureTable();
        $rows = self::rows("SELECT permission FROM role_permissions WHERE role = ?", [$role]);
        $perms = array_column($rows, 'permission');
        
        return array_values(array_intersect($perms, array_keys(self::ALL_PERMISSIONS)));
    }

    public static function hasPermission(string $role, string $permission): bool {
        if (!isset(self::ALL_PERMISSIONS[$permission])) {
            return false;
        }

        if ($role === 'owner') {
            return true;
        }

        self::ensureTable();
        $exists = self::scalar("SELECT 1 FROM role_permissions WHERE role = ? AND permission = ? LIMIT 1", [
            $role,
            $permission,
        ]);

        return (bool) $exists;
    }

    public static function savePermissions(array $matrix, int $adminUserId): array {
        self::ensureTable();
        $validRoles = ['manager', 'cashier', 'technician', 'stock'];
        $validPerms = array_keys(self::ALL_PERMISSIONS);

        self::transaction(function () use ($matrix, $validRoles, $validPerms, $adminUserId) {
            $stmt = self::db()->prepare("INSERT INTO role_permissions (role, permission) VALUES (?, ?)");
            foreach ($validRoles as $role) {
                if (isset($matrix[$role]) && is_array($matrix[$role])) {
                    self::run("DELETE FROM role_permissions WHERE role = ?", [$role]);
                    foreach ($matrix[$role] as $perm) {
                        if (in_array($perm, $validPerms, true)) {
                            $stmt->execute([$role, $perm]);
                        }
                    }
                    self::markRoleChanged($role, Database::isSqlite() ? bin2hex(random_bytes(16)) : null);
                }
            }

            UserRepository::logAudit(
                $adminUserId,
                null,
                'role_permissions.update',
                ['matrix' => $matrix]
            );
        });

        return self::getPermissionsData();
    }

    public static function resetToDefaults(int $adminUserId): array {
        self::ensureTable();

        self::transaction(function () use ($adminUserId) {
            self::seedDefaults();
            foreach (['manager', 'cashier', 'technician', 'stock'] as $role) {
                self::markRoleChanged($role, Database::isSqlite() ? bin2hex(random_bytes(16)) : null);
            }
            UserRepository::logAudit(
                $adminUserId,
                null,
                'role_permissions.reset',
                ['status' => 'defaults_restored']
            );
        });

        return self::getPermissionsData();
    }

    public static function getUserOverrides(int $userId): array {
        self::ensureTable();
        $rows = self::rows("SELECT permission, allowed FROM user_permissions WHERE user_id = ?", [$userId]);
        $map = [];
        foreach ($rows as $r) {
            $perm = $r['permission'];
            if (isset(self::ALL_PERMISSIONS[$perm])) {
                $map[$perm] = !empty($r['allowed']) ? 'allow' : 'deny';
            }
        }
        return $map;
    }

    public static function getAllUserOverrides(): array {
        self::ensureTable();
        $rows = self::rows("SELECT user_id, permission, allowed FROM user_permissions");
        $grouped = [];
        foreach ($rows as $r) {
            $uid = (string) $r['user_id'];
            $perm = $r['permission'];
            if (isset(self::ALL_PERMISSIONS[$perm])) {
                $grouped[$uid][$perm] = !empty($r['allowed']) ? 'allow' : 'deny';
            }
        }
        return $grouped;
    }

    public static function getEffectivePermissionsForUser(int $userId, string $role): array {
        if ($role === 'owner') {
            return array_keys(self::ALL_PERMISSIONS);
        }

        $rolePerms = self::getPermissionsForRole($role);
        $overrides = self::getUserOverrides($userId);

        $set = array_flip($rolePerms);
        foreach ($overrides as $perm => $mode) {
            if ($mode === 'allow') {
                $set[$perm] = true;
            } elseif ($mode === 'deny') {
                unset($set[$perm]);
            }
        }

        return array_keys($set);
    }

    public static function userHasPermission(int $userId, string $role, string $permission): bool {
        if (!isset(self::ALL_PERMISSIONS[$permission])) {
            return false;
        }
        if ($role === 'owner') {
            return true;
        }

        self::ensureTable();
        $override = self::one(
            "SELECT allowed FROM user_permissions WHERE user_id = ? AND permission = ? LIMIT 1",
            [$userId, $permission]
        );
        if ($override !== null) {
            return !empty($override['allowed']);
        }

        return self::hasPermission($role, $permission);
    }

    public static function saveUserPermissions(int $targetUserId, array $overrides, int $adminUserId): array {
        self::ensureTable();
        $target = self::one("SELECT id, name, role FROM users WHERE id = ?", [$targetUserId]);
        if (!$target) {
            throw new ApiError('Staff account not found.', 404);
        }
        if ($target['role'] === 'owner') {
            throw new ApiError('Owner permissions cannot be restricted.', 403);
        }

        $validPerms = array_keys(self::ALL_PERMISSIONS);

        self::transaction(function () use ($targetUserId, $target, $overrides, $validPerms, $adminUserId) {
            self::run("DELETE FROM user_permissions WHERE user_id = ?", [$targetUserId]);
            $stmt = self::db()->prepare("INSERT INTO user_permissions (user_id, permission, allowed) VALUES (?, ?, ?)");

            $saved = [];
            foreach ($overrides as $perm => $mode) {
                if (!in_array($perm, $validPerms, true)) continue;
                if ($mode === 'allow' || $mode === 'deny') {
                    $allowed = $mode === 'allow' ? 1 : 0;
                    $stmt->execute([$targetUserId, $perm, $allowed]);
                    $saved[$perm] = $mode;
                }
            }

            UserRepository::logAudit(
                $adminUserId,
                null,
                'user_permissions.update',
                ['target_user_id' => $targetUserId, 'name' => $target['name'], 'overrides' => $saved]
            );
        });

        return self::getPermissionsData();
    }

    public static function getPermissionsData(): array {
        return [
            'roles' => Constants::ROLES,
            'permissions' => array_values(self::ALL_PERMISSIONS),
            'matrix' => self::getPermissionsByRole(),
            'user_overrides' => self::getAllUserOverrides(),
        ];
    }
}
