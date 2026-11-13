<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

final class FinancialAuditRepository extends BaseRepository {
    public static function report(int $branch, string $from, string $to, int $staff): array {
        $params = [$from, $to];
        $scope = static fn(string $column): string => $branch ? " AND {$column}=?" : '';
        if ($branch) $params[] = $branch;
        $actor = static fn(string $column): string => $staff ? " AND {$column}=?" : '';
        if ($staff) $params[] = $staff;

        $invoices = self::rows(
            "SELECT s.id, s.invoice_no, s.created_at, s.branch_id, b.name AS branch_name, u.name AS cashier,
                    COALESCE(c.name, 'Walk-in') AS customer, s.total, s.credit, s.wallet_used, s.payment_methods,
                    s.total-s.credit AS paid_amount, s.due_date,
                    CASE WHEN s.credit=0 THEN 'Paid' WHEN s.credit>=s.total THEN 'Unpaid' ELSE 'Partially paid' END AS status,
                    (SELECT COALESCE(SUM(r.amount),0) FROM returns_log r JOIN sale_items i ON i.id=r.sale_item_id
                     WHERE i.sale_id=s.id AND r.status='Completed') AS refunded
             FROM sales s JOIN branches b ON b.id=s.branch_id JOIN users u ON u.id=s.user_id
             LEFT JOIN customers c ON c.id=s.customer_id
             WHERE DATE(s.created_at) BETWEEN ? AND ?{$scope('s.branch_id')}{$actor('s.user_id')}
             ORDER BY s.created_at DESC, s.id DESC", $params
        );
        $invoiceItems = self::rows(
            "SELECT i.id, i.sale_id, i.name, i.qty, i.price, i.total, i.refunded_qty,
                    s.invoice_no, s.created_at, p.sku, un.code AS serial
             FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN products p ON p.id=i.product_id
             LEFT JOIN units un ON un.id=i.unit_id
             WHERE DATE(s.created_at) BETWEEN ? AND ?{$scope('s.branch_id')}{$actor('s.user_id')}
             ORDER BY s.created_at DESC, s.id DESC, i.id", $params
        );
        $payments = self::rows(
            "SELECT pm.id, pm.created_at, pm.method, pm.kind, pm.amount, pm.reference,
                    s.id AS sale_id, s.invoice_no, s.branch_id, b.name AS branch_name,
                    u.name AS cashier, COALESCE(c.name, 'Walk-in') AS customer, 'Invoice payment' AS source
             FROM payments pm JOIN sales s ON s.id=pm.sale_id JOIN branches b ON b.id=s.branch_id
             LEFT JOIN users u ON u.id=pm.user_id LEFT JOIN customers c ON c.id=s.customer_id
             WHERE DATE(pm.created_at) BETWEEN ? AND ?{$scope('s.branch_id')}{$actor('pm.user_id')}", $params
        );
        $walletSales = self::rows(
            "SELECT s.id, s.created_at, 'Wallet' AS method, 'Sale' AS kind, s.wallet_used AS amount, NULL AS reference,
                    s.id AS sale_id, s.invoice_no, s.branch_id, b.name AS branch_name,
                    u.name AS cashier, COALESCE(c.name, 'Walk-in') AS customer, 'Wallet at checkout' AS source
             FROM sales s JOIN branches b ON b.id=s.branch_id JOIN users u ON u.id=s.user_id
             LEFT JOIN customers c ON c.id=s.customer_id
             WHERE s.wallet_used>0 AND DATE(s.created_at) BETWEEN ? AND ?{$scope('s.branch_id')}{$actor('s.user_id')}", $params
        );
        $accountPayments = self::rows(
            "SELECT l.id, l.created_at, l.method, l.kind, ABS(l.amount) AS amount, l.reference,
                    NULL AS sale_id, NULL AS invoice_no, l.branch_id, b.name AS branch_name,
                    u.name AS cashier, c.name AS customer, 'Customer ledger' AS source
             FROM customer_wallet_logs l JOIN customers c ON c.id=l.customer_id
             LEFT JOIN branches b ON b.id=l.branch_id LEFT JOIN users u ON u.id=l.user_id
             WHERE DATE(l.created_at) BETWEEN ? AND ?{$scope('l.branch_id')}{$actor('l.user_id')}
               AND ((l.amount>0 AND l.kind IN ('Payment received','Top-Up'))
                    OR (l.amount<0 AND l.method='Wallet' AND l.kind IN ('Reservation deposit','Repair Advance','Repair Payment')))", $params
        );
        $payments = [...$payments, ...$walletSales, ...$accountPayments];
        usort($payments, static fn(array $a, array $b): int =>
            [$b['created_at'], $b['source'], (int) $b['id']] <=> [$a['created_at'], $a['source'], (int) $a['id']]
        );
        $activity = self::rows(
            "SELECT a.id, a.created_at, a.action, a.details, u.name AS cashier, b.name AS branch_name
             FROM audit_log a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN branches b ON b.id=a.branch_id
             WHERE DATE(a.created_at) BETWEEN ? AND ?{$scope('a.branch_id')}{$actor('a.user_id')} AND a.action<>'sync.auto'
             ORDER BY a.created_at DESC, a.id DESC", $params
        );
        foreach ($activity as &$event) {
            $details = json_decode((string) $event['details'], true);
            $event['details'] = is_array($details) ? array_intersect_key($details, array_flip([
                'id', 'status', 'previous', 'amount', 'sale_id', 'replacement_sale_id', 'repair_id',
                'job_number', 'final_charge', 'pay_amount', 'payment_method', 'total_paid', 'expected',
                'counted', 'variance', 'state', 'product_id', 'qty', 'role',
            ])) : [];
        }
        unset($event);
        return ['invoice_audit' => $invoices, 'invoice_items_audit' => $invoiceItems, 'payment_audit' => $payments, 'activity_audit' => $activity];
    }
}
