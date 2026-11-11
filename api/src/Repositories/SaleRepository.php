<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class SaleRepository extends BaseRepository {
    public static function recentSales(int $branch, int $limit = 100): array {
        $where = $branch ? 'WHERE s.branch_id=?' : '';
        $params = $branch ? [$branch] : [];
        return self::rows("SELECT s.id, s.invoice_no, s.branch_id, s.user_id, s.customer_id,
            s.subtotal, s.discount, s.discount_bps, s.tax, s.tax_bps, s.total,
            COALESCE(s.paid_amount, 0) AS paid_amount, COALESCE(s.cash_tendered, 0) AS cash_tendered,
            COALESCE(s.change_amount, 0) AS change_amount, COALESCE(s.payment_methods, '') AS payment_methods,
            s.credit, s.due_date, COALESCE(s.notes, '') AS notes, s.created_at,
            b.name AS branch, COALESCE(u.name, 'Staff') AS cashier,
            COALESCE(c.name, 'Walk-in customer') AS customer, COALESCE(c.phone, '') AS customer_phone,
            GROUP_CONCAT(CONCAT(si.qty, 'x ', p.name) SEPARATOR ', ') AS items,
            COUNT(si.id) AS line_count,
            COALESCE(SUM(si.qty), 0) AS total_qty,
            COALESCE((SELECT SUM(rl.amount) FROM returns_log rl JOIN sale_items si2 ON si2.id=rl.sale_item_id WHERE si2.sale_id=s.id AND rl.status='Completed'), 0) AS refunded
            FROM sales s
            JOIN branches b ON b.id=s.branch_id
            LEFT JOIN users u ON u.id=s.user_id
            LEFT JOIN customers c ON c.id=s.customer_id
            JOIN sale_items si ON si.sale_id=s.id
            JOIN products p ON p.id=si.product_id
            {$where}
            GROUP BY s.id ORDER BY s.id DESC LIMIT {$limit}", $params);
    }

    public static function invoiceDetails(int $id, int $branch): ?array {
        $scope = $branch ? ' AND s.branch_id=?' : '';
        $params = $branch ? [$id, $branch] : [$id];
        $sale = self::one("SELECT s.*, b.name AS branch, COALESCE(b.phone, '') AS branch_phone, COALESCE(b.address, '') AS branch_address,
            COALESCE(u.name, 'Staff') AS cashier,
            COALESCE(c.name, 'Walk-in customer') AS customer,
            COALESCE(c.phone, '') AS customer_phone,
            COALESCE(c.email, '') AS customer_email,
            CAST(COALESCE(c.loyalty_points, 0) AS UNSIGNED) AS customer_points,
            CAST(COALESCE(c.wallet_balance, 0) AS UNSIGNED) AS customer_wallet
            FROM sales s
            JOIN branches b ON b.id=s.branch_id
            LEFT JOIN users u ON u.id=s.user_id
            LEFT JOIN customers c ON c.id=s.customer_id
            WHERE s.id=? {$scope}", $params);

        if (!$sale) return null;

        $sale['items'] = self::rows('SELECT si.*, p.name, p.sku, p.serialized, u.code, u.imei
            FROM sale_items si
            JOIN products p ON p.id=si.product_id
            LEFT JOIN units u ON u.id=si.unit_id
            WHERE si.sale_id=? ORDER BY si.id', [$id]);

        $sale['payments'] = self::rows('SELECT method, amount, reference, kind, created_at FROM payments WHERE sale_id=? ORDER BY id', [$id]);
        $sale['refunded'] = (int) self::scalar(
            "SELECT COALESCE(SUM(r.amount),0) FROM returns_log r JOIN sale_items i ON i.id=r.sale_item_id WHERE i.sale_id=? AND r.status='Completed'",
            [$id]
        );
        $sale['change'] = (int) ($sale['change_amount'] ?? 0);
        $cashPaidFallback = 0;
        foreach ($sale['payments'] as $pm) {
            if (strtolower((string) ($pm['method'] ?? '')) === 'cash') {
                $cashPaidFallback += (int) ($pm['amount'] ?? 0);
            }
        }
        $sale['cashTendered'] = (int) ($sale['cash_tendered'] ?? 0) ?: ($cashPaidFallback + $sale['change']);
        return $sale;
    }

    public static function drafts(int $branch, int $userId): array {
        return self::rows('SELECT id, payload, created_at FROM drafts WHERE branch_id=? AND user_id=? ORDER BY id DESC', [$branch, $userId]);
    }
}
