<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class DrawerRepository extends BaseRepository {
    public static function openDrawerForBranch(int $branch): ?array {
        if ($branch <= 0) return null;
        return self::one(
            'SELECT d.*, c.business_date, u.name AS operator FROM drawers d JOIN cycles c ON c.id=d.cycle_id LEFT JOIN users u ON u.id=d.user_id WHERE d.branch_id=? AND d.closed_at IS NULL',
            [$branch]
        );
    }

    public static function paymentBreakdown(int $drawerId): array {
        return self::rows(
            'SELECT method, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM payments WHERE drawer_id=? GROUP BY method',
            [$drawerId]
        );
    }

    public static function movements(int $drawerId): array {
        return self::rows(
            'SELECT cm.*, u.name operator_name 
             FROM cash_movements cm 
             LEFT JOIN users u ON u.id=cm.user_id 
             WHERE cm.drawer_id=? 
             ORDER BY cm.id DESC', 
            [$drawerId]
        );
    }

    public static function cashbookLedger(int $branch = 0, string $startDate = '', string $endDate = '', string $type = 'all', int $limit = 300): array {
        $where = ['1=1'];
        $params = [];

        if ($branch > 0) {
            $where[] = 'd.branch_id = ?';
            $params[] = $branch;
        }

        if ($startDate !== '') {
            $where[] = 'DATE(cm.created_at) >= ?';
            $params[] = $startDate;
        }

        if ($endDate !== '') {
            $where[] = 'DATE(cm.created_at) <= ?';
            $params[] = $endDate;
        }

        if ($type === 'in') {
            $where[] = 'cm.amount > 0';
        } elseif ($type === 'out') {
            $where[] = 'cm.amount < 0';
        } elseif ($type === 'sale') {
            $where[] = "(cm.kind LIKE '%Sale%' OR cm.reference LIKE '%INV-%')";
        } elseif ($type === 'expense') {
            $where[] = "(cm.amount < 0 AND cm.kind NOT LIKE '%Return%')";
        }

        $whereClause = implode(' AND ', $where);

        $sql = "SELECT 
                    cm.id,
                    cm.drawer_id,
                    cm.user_id,
                    cm.amount,
                    cm.kind,
                    cm.reference,
                    cm.created_at,
                    u.name AS operator_name,
                    b.name AS branch_name,
                    d.branch_id,
                    c.business_date
                FROM cash_movements cm
                JOIN drawers d ON d.id = cm.drawer_id
                LEFT JOIN cycles c ON c.id = d.cycle_id
                LEFT JOIN users u ON u.id = cm.user_id
                LEFT JOIN branches b ON b.id = d.branch_id
                WHERE {$whereClause}
                ORDER BY cm.id DESC
                LIMIT {$limit}";

        return self::rows($sql, $params);
    }

    public static function history(int $branch, array $user, int $limit = 20): array {
        $cashierFilter = $user['role'] === 'cashier' ? 'AND d.user_id=' . (int) $user['id'] : '';
        $branchFilter = $branch > 0 ? 'AND d.branch_id = ?' : '';
        $params = $branch > 0 ? [$branch] : [];
        return self::rows(
            "SELECT d.*, c.business_date, u.name operator, b.name branch_name FROM drawers d
            JOIN cycles c ON c.id=d.cycle_id
            JOIN users u ON u.id=d.user_id
            LEFT JOIN branches b ON b.id=d.branch_id
            WHERE d.closed_at IS NOT NULL {$branchFilter} {$cashierFilter}
            ORDER BY d.id DESC LIMIT {$limit}",
            $params
        );
    }

    public static function addCashMovement(int $userId, array $drawer, int $amount, string $kind, string $reference): void {
        $syncUuid = 'CM-' . bin2hex(random_bytes(8));
        if (\Zeedat\Config\Database::isSqlite()) {
            self::run(
                'INSERT INTO cash_movements(uuid, sync_uuid, synced, drawer_id, user_id, amount, kind, reference) VALUES (?,?,0,?,?,?,?,?)',
                [$syncUuid, $syncUuid, $drawer['id'], $userId, $amount, $kind, $reference]
            );
        } else {
            self::run(
                'INSERT INTO cash_movements(sync_uuid, synced, drawer_id, user_id, amount, kind, reference) VALUES (?,0,?,?,?,?,?)',
                [$syncUuid, $drawer['id'], $userId, $amount, $kind, $reference]
            );
        }
    }
}
