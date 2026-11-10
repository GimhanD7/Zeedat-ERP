<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class UserRepository extends BaseRepository {
    public static function findActiveById(int $id): ?array {
        $user = self::one('SELECT id, branch_id, name, email, role FROM users WHERE id=? AND active=1', [$id]);
        if ($user) {
            $user['permissions'] = PermissionRepository::getEffectivePermissionsForUser((int) $user['id'], $user['role']);
        }
        return $user;
    }

    public static function findByEmail(string $email): ?array {
        return self::one('SELECT id, password_hash, active FROM users WHERE email=?', [$email]);
    }

    public static function allStaff(): array {
        return self::rows("SELECT 
            u.id, 
            u.branch_id, 
            u.name, 
            u.email, 
            u.role, 
            u.active, 
            b.name AS branch,
            COALESCE(s.sales_count, 0) AS sales_count,
            COALESCE(s.sales_total, 0) AS sales_total,
            COALESCE(r.repairs_count, 0) AS repairs_count,
            COALESCE(d.drawers_count, 0) AS drawers_count
        FROM users u 
        LEFT JOIN branches b ON b.id = u.branch_id
        LEFT JOIN (
            SELECT user_id, COUNT(*) AS sales_count, SUM(total) AS sales_total 
            FROM sales GROUP BY user_id
        ) s ON s.user_id = u.id
        LEFT JOIN (
            SELECT technician_id, COUNT(*) AS repairs_count 
            FROM repairs GROUP BY technician_id
        ) r ON r.technician_id = u.id
        LEFT JOIN (
            SELECT user_id, COUNT(*) AS drawers_count 
            FROM drawers GROUP BY user_id
        ) d ON d.user_id = u.id
        ORDER BY u.id");
    }

    public static function technicians(int $branch): array {
        $and = $branch ? ' AND branch_id=?' : '';
        $params = $branch ? [$branch] : [];
        return self::rows("SELECT id, name FROM users WHERE role='technician' AND active=1 {$and} ORDER BY name", $params);
    }

    public static function logAudit(int $userId, ?int $branchId, string $action, string|array $details): void {
        $json = is_string($details) ? $details : json_encode($details, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        self::run('INSERT INTO audit_log(user_id, branch_id, action, details) VALUES (?,?,?,?)', [
            $userId,
            $branchId,
            $action,
            $json,
        ]);
    }

    public static function getAuditLogs(int $limit = 100): array {
        return self::rows("SELECT a.id, a.action, a.details, a.created_at, u.name actor, b.name branch FROM audit_log a JOIN users u ON u.id=a.user_id LEFT JOIN branches b ON b.id=a.branch_id ORDER BY a.id DESC LIMIT {$limit}");
    }

    public static function getSettings(): array {
        $row = self::one('SELECT * FROM settings WHERE id=1') ?? [];
        $row['db_driver'] = \Zeedat\Config\Database::getDriver();
        return $row;
    }

    public static function updateSettings(
        string $shopName,
        int $taxBps,
        int $paperWidth,
        string $shopPhone = '',
        string $shopAddress = '',
        string $shopEmail = '',
        string $receiptFooter = '',
        string $invoicePrefix = 'INV-',
        int $autoPrint = 1,
        int $showTaxOnReceipt = 1
    ): void {
        self::run(
            'UPDATE settings SET shop_name=?, tax_bps=?, paper_width=?, shop_phone=?, shop_address=?, shop_email=?, receipt_footer=?, invoice_prefix=?, auto_print=?, show_tax_on_receipt=? WHERE id=1',
            [
                $shopName,
                $taxBps,
                $paperWidth,
                $shopPhone,
                $shopAddress,
                $shopEmail,
                $receiptFooter,
                $invoicePrefix,
                $autoPrint,
                $showTaxOnReceipt,
            ]
        );
    }
}
