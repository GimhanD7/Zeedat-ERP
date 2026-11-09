<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class DrawerRepository extends BaseRepository {
    public static function openDrawerForBranch(int $branch): ?array {
        return self::one(
            'SELECT d.*, c.business_date FROM drawers d JOIN cycles c ON c.id=d.cycle_id WHERE d.branch_id=? AND d.closed_at IS NULL',
            [$branch]
        );
    }

    public static function movements(int $drawerId): array {
        return self::rows('SELECT * FROM cash_movements WHERE drawer_id=? ORDER BY id DESC', [$drawerId]);
    }

    public static function history(int $branch, array $user, int $limit = 20): array {
        $cashierFilter = $user['role'] === 'cashier' ? 'AND d.user_id=' . (int) $user['id'] : '';
        return self::rows(
            "SELECT d.*, c.business_date, u.name operator FROM drawers d
            JOIN cycles c ON c.id=d.cycle_id
            JOIN users u ON u.id=d.user_id
            WHERE d.branch_id=? AND d.closed_at IS NOT NULL {$cashierFilter}
            ORDER BY d.id DESC LIMIT {$limit}",
            [$branch]
        );
    }

    public static function addCashMovement(int $userId, array $drawer, int $amount, string $kind, string $reference): void {
        self::run(
            'INSERT INTO cash_movements(drawer_id, user_id, amount, kind, reference) VALUES (?,?,?,?,?)',
            [$drawer['id'], $userId, $amount, $kind, $reference]
        );
    }
}
