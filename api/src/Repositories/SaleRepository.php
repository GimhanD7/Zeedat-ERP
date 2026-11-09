<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class SaleRepository extends BaseRepository {
    public static function recentSales(int $branch, int $limit = 100): array {
        $where = $branch ? 'WHERE s.branch_id=?' : '';
        $params = $branch ? [$branch] : [];
        return self::rows("SELECT s.id, s.branch_id, s.customer_id, s.subtotal, s.discount, s.tax, s.total, s.credit, s.created_at,
            b.name branch, COALESCE(c.name, 'Walk-in customer') customer,
            GROUP_CONCAT(CONCAT(si.qty, 'x ', p.name) SEPARATOR ', ') items
            FROM sales s
            JOIN branches b ON b.id=s.branch_id
            LEFT JOIN customers c ON c.id=s.customer_id
            JOIN sale_items si ON si.sale_id=s.id
            JOIN products p ON p.id=si.product_id
            {$where}
            GROUP BY s.id ORDER BY s.id DESC LIMIT {$limit}", $params);
    }

    public static function invoiceDetails(int $id, int $branch): ?array {
        $scope = $branch ? ' AND s.branch_id=?' : '';
        $params = $branch ? [$id, $branch] : [$id];
        $sale = self::one("SELECT s.*, b.name branch, COALESCE(c.name, 'Walk-in customer') customer,
            COALESCE(c.phone, '') customer_phone
            FROM sales s
            JOIN branches b ON b.id=s.branch_id
            LEFT JOIN customers c ON c.id=s.customer_id
            WHERE s.id=? {$scope}", $params);

        if (!$sale) return null;

        $sale['items'] = self::rows('SELECT si.*, p.name, p.sku, p.serialized, u.code, u.imei
            FROM sale_items si
            JOIN products p ON p.id=si.product_id
            LEFT JOIN units u ON u.id=si.unit_id
            WHERE si.sale_id=? ORDER BY si.id', [$id]);

        $sale['payments'] = self::rows('SELECT method, amount, reference, kind, created_at FROM payments WHERE sale_id=? ORDER BY id', [$id]);
        return $sale;
    }

    public static function drafts(int $branch, int $userId): array {
        return self::rows('SELECT id, payload, created_at FROM drafts WHERE branch_id=? AND user_id=? ORDER BY id DESC', [$branch, $userId]);
    }
}
