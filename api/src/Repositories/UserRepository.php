<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class UserRepository extends BaseRepository {
    public static function assignedBranchIds(int $userId, ?int $primaryBranchId = null): array {
        $ids = [];
        try {
            $rows = self::rows('SELECT branch_id FROM user_branches WHERE user_id=? ORDER BY branch_id ASC', [$userId]);
            foreach ($rows as $r) {
                $bid = (int) ($r['branch_id'] ?? 0);
                if ($bid > 0) {
                    $ids[] = $bid;
                }
            }
        } catch (\Throwable) {
        }
        if ($primaryBranchId && $primaryBranchId > 0 && !in_array($primaryBranchId, $ids, true)) {
            array_unshift($ids, $primaryBranchId);
        }
        return array_values(array_unique($ids));
    }

    public static function formatBadgeCode(int $id, ?string $badgeCode = null): string {
        $clean = strtoupper(trim((string) $badgeCode));
        return $clean !== '' ? $clean : 'STF' . str_pad((string) $id, 5, '0', STR_PAD_LEFT);
    }

    public static function findActiveById(int $id): ?array {
        $user = self::one('SELECT id, branch_id, name, email, role, badge_code FROM users WHERE id=? AND active=1', [$id]);
        if ($user) {
            $user['badge_code'] = self::formatBadgeCode((int) $user['id'], $user['badge_code'] ?? null);
            $user['branch_ids'] = self::assignedBranchIds((int) $user['id'], $user['branch_id'] ? (int) $user['branch_id'] : null);
            $user['permissions'] = PermissionRepository::getEffectivePermissionsForUser((int) $user['id'], $user['role']);
        }
        return $user;
    }

    public static function findByEmail(string $email): ?array {
        return self::one('SELECT id, password_hash, active FROM users WHERE email=?', [$email]);
    }

    public static function allStaff(): array {
        $staff = self::rows("SELECT 
            u.id, 
            u.branch_id, 
            u.name, 
            u.email, 
            u.role, 
            u.badge_code,
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

        $byUser = [];
        try {
            $links = self::rows(
                'SELECT ub.user_id, ub.branch_id, br.name AS branch_name
                 FROM user_branches ub
                 JOIN branches br ON br.id = ub.branch_id
                 ORDER BY br.id ASC'
            );
            foreach ($links as $lnk) {
                $uid = (int) $lnk['user_id'];
                $byUser[$uid]['ids'][] = (int) $lnk['branch_id'];
                $byUser[$uid]['names'][] = (string) $lnk['branch_name'];
            }
        } catch (\Throwable) {
        }

        foreach ($staff as &$member) {
            $uid = (int) $member['id'];
            $member['badge_code'] = self::formatBadgeCode($uid, $member['badge_code'] ?? null);
            $primaryId = $member['branch_id'] ? (int) $member['branch_id'] : 0;
            $ids = $byUser[$uid]['ids'] ?? ($primaryId > 0 ? [$primaryId] : []);
            $names = $byUser[$uid]['names'] ?? (!empty($member['branch']) ? [(string) $member['branch']] : []);
            if ($primaryId > 0 && !in_array($primaryId, $ids, true)) {
                array_unshift($ids, $primaryId);
                if (!empty($member['branch'])) {
                    array_unshift($names, (string) $member['branch']);
                }
            }
            $member['branch_ids'] = array_values(array_unique($ids));
            $member['branch_names'] = array_values(array_unique($names));
            if ($member['role'] !== 'owner' && !empty($member['branch_names'])) {
                $member['branch'] = implode(', ', $member['branch_names']);
            }
        }
        unset($member);

        return $staff;
    }

    public static function technicians(int $branch): array {
        $and = $branch
            ? ' AND (u.branch_id=? OR EXISTS (SELECT 1 FROM user_branches ub WHERE ub.user_id=u.id AND ub.branch_id=?))'
            : '';
        $params = $branch ? [$branch, $branch] : [];
        return self::rows("SELECT id, name FROM users u WHERE u.role='technician' AND u.active=1 {$and} ORDER BY u.name", $params);
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
        $row['delete_pin_configured'] = trim((string) ($row['delete_pin_hash'] ?? '')) !== '';
        unset($row['delete_pin_hash']);
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
        int $showTaxOnReceipt = 1,
        string $receiptPrinterName = '',
        int $cashDrawerEnabled = 1,
        int $smsEnabled = 0,
        string $smsProviderUrl = '',
        string $smsApiKey = '',
        string $smsSenderId = ''
    ): void {
        self::run(
            'UPDATE settings SET shop_name=?, tax_bps=?, paper_width=?, shop_phone=?, shop_address=?, shop_email=?, receipt_footer=?, invoice_prefix=?, auto_print=?, show_tax_on_receipt=?, receipt_printer_name=?, cash_drawer_enabled=?, sms_enabled=?, sms_provider_url=?, sms_api_key=?, sms_sender_id=? WHERE id=1',
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
                $receiptPrinterName,
                $cashDrawerEnabled,
                $smsEnabled,
                $smsProviderUrl,
                $smsApiKey,
                $smsSenderId,
            ]
        );
    }
}
