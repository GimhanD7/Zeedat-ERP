<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class PurchaseRepository extends BaseRepository {
    public static function purchases(int $branch): array {
        $where = $branch ? 'WHERE a.branch_id=?' : '';
        $params = $branch ? [$branch] : [];
        return self::rows(
            "SELECT a.*,
                    s.name AS supplier,
                    s.phone AS supplier_phone,
                    p.name AS product,
                    p.sku,
                    p.category,
                    p.serialized,
                    p.price AS selling_price,
                    b.name AS branch_name,
                    (a.qty * a.unit_cost) AS total_cost,
                    COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.purchase_id=a.id), 0) AS paid_amount
             FROM purchases a
             JOIN suppliers s ON s.id=a.supplier_id
             JOIN products p ON p.id=a.product_id
             JOIN branches b ON b.id=a.branch_id
             {$where} ORDER BY a.id DESC LIMIT 300",
            $params
        );
    }

    public static function suppliers(): array {
        return self::rows(
            'SELECT s.*,
                    COUNT(p.id) AS total_orders,
                    COALESCE(SUM(p.qty * p.unit_cost), 0) AS total_purchased,
                    COALESCE(SUM(p.balance), 0) AS balance_due
             FROM suppliers s
             LEFT JOIN purchases p ON p.supplier_id=s.id
             GROUP BY s.id
             ORDER BY s.name'
        );
    }

    public static function transfers(int $branch): array {
        $where = $branch ? 'WHERE t.from_branch=? OR t.to_branch=?' : '';
        $params = $branch ? [$branch, $branch] : [];
        return self::rows(
            "SELECT t.*,
                    p.name AS product,
                    p.sku,
                    p.category,
                    p.serialized,
                    p.price,
                    p.cost,
                    COALESCE(u.code, '') AS unit_code,
                    COALESCE(u.imei, '') AS unit_imei,
                    COALESCE(u.grade, 'New') AS unit_grade,
                    a.name AS source,
                    COALESCE(a.phone, '') AS source_phone,
                    b.name AS destination,
                    COALESCE(b.phone, '') AS destination_phone
             FROM transfers t
             JOIN products p ON p.id=t.product_id
             JOIN branches a ON a.id=t.from_branch
             JOIN branches b ON b.id=t.to_branch
             LEFT JOIN units u ON u.id=t.unit_id
             {$where} ORDER BY t.id DESC LIMIT 300",
            $params
        );
    }
}
