<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class PurchaseRepository extends BaseRepository {
    public static function purchases(int $branch): array {
        $where = $branch ? 'WHERE a.branch_id=?' : '';
        $params = $branch ? [$branch] : [];
        return self::rows(
            "SELECT a.*, s.name supplier, p.name product FROM purchases a
            JOIN suppliers s ON s.id=a.supplier_id
            JOIN products p ON p.id=a.product_id
            {$where} ORDER BY a.id DESC LIMIT 100",
            $params
        );
    }

    public static function suppliers(): array {
        return self::rows('SELECT * FROM suppliers ORDER BY name');
    }

    public static function transfers(int $branch): array {
        $where = $branch ? 'WHERE from_branch=? OR to_branch=?' : '';
        $params = $branch ? [$branch, $branch] : [];
        return self::rows(
            "SELECT t.*, p.name product, a.name source, b.name destination FROM transfers t
            JOIN products p ON p.id=t.product_id
            JOIN branches a ON a.id=t.from_branch
            JOIN branches b ON b.id=t.to_branch
            {$where} ORDER BY t.id DESC LIMIT 100",
            $params
        );
    }
}
