<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\SaleRepository;
use Zeedat\Services\CheckoutService;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class SaleController {
    public static function checkout(array $user, int $branch, array $body): array {
        return CheckoutService::checkout($user, $branch, $body);
    }

    public static function creditPayment(array $user, int $branch, array $body): array {
        return CheckoutService::creditPayment($user, $branch, $body);
    }

    public static function getSales(int $branch): array {
        return SaleRepository::recentSales($branch, 100);
    }

    public static function searchSales(int $branch, string $query): array {
        $q = trim($query);
        if ($q === '') {
            return SaleRepository::recentSales($branch, 20);
        }
        $params = $branch ? [$branch, "%{$q}%", "%{$q}%", "%{$q}%", "%{$q}%"] : ["%{$q}%", "%{$q}%", "%{$q}%", "%{$q}%"];
        $where = $branch ? 'WHERE s.branch_id=? AND (s.invoice_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR si.name LIKE ?)' : 'WHERE (s.invoice_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR si.name LIKE ?)';
        return BaseRepository::rows(
            "SELECT s.id, s.invoice_no, s.branch_id, s.user_id, s.customer_id,
                    s.subtotal, s.total, COALESCE(s.paid_amount, 0) AS paid_amount,
                    s.created_at, b.name AS branch, COALESCE(u.name, 'Staff') AS cashier,
                    COALESCE(c.name, 'Walk-in customer') AS customer,
                    COALESCE(c.phone, '') AS customer_phone,
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
             GROUP BY s.id ORDER BY s.id DESC LIMIT 30",
            $params
        );
    }

    public static function getInvoice(int $branch, array $query): array {
        $raw = trim((string) ($query['id'] ?? ''));
        if ($raw === '') throw new ApiError('Enter an invoice number or search term.');

        $id = (int) preg_replace('/\D/', '', (string) $raw);
        $invoice = null;
        if ($id > 0) {
            $invoice = SaleRepository::invoiceDetails($id, $branch);
        }

        if (!$invoice) {
            // Check by exact or partial invoice_no
            $matchedId = (int) BaseRepository::scalar(
                "SELECT s.id FROM sales s WHERE (s.invoice_no=? OR s.invoice_no LIKE ?) " . ($branch ? "AND s.branch_id=?" : "") . " ORDER BY s.id DESC LIMIT 1",
                $branch ? [$raw, '%' . $raw . '%', $branch] : [$raw, '%' . $raw . '%']
            );
            if ($matchedId) {
                $invoice = SaleRepository::invoiceDetails($matchedId, $branch);
            }
        }

        if (!$invoice) {
            // Check by serial / IMEI code
            $matchedId = (int) BaseRepository::scalar(
                "SELECT si.sale_id FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN units u ON si.unit_id=u.id WHERE (u.code=? OR u.imei=? OR u.code LIKE ?) " . ($branch ? "AND s.branch_id=?" : "") . " ORDER BY s.id DESC LIMIT 1",
                $branch ? [$raw, $raw, '%' . $raw . '%', $branch] : [$raw, $raw, '%' . $raw . '%']
            );
            if ($matchedId) {
                $invoice = SaleRepository::invoiceDetails($matchedId, $branch);
            }
        }

        if (!$invoice) {
            // Check by customer phone or customer name
            $matchedId = (int) BaseRepository::scalar(
                "SELECT s.id FROM sales s JOIN customers c ON s.customer_id=c.id WHERE (c.phone=? OR c.phone LIKE ? OR c.name LIKE ?) " . ($branch ? "AND s.branch_id=?" : "") . " ORDER BY s.id DESC LIMIT 1",
                $branch ? [$raw, '%' . $raw . '%', '%' . $raw . '%', $branch] : [$raw, '%' . $raw . '%', '%' . $raw . '%']
            );
            if ($matchedId) {
                $invoice = SaleRepository::invoiceDetails($matchedId, $branch);
            }
        }

        if (!$invoice) throw new ApiError('No matching invoice found for "' . $raw . '".', 404);

        $invoice['refunded'] = (int) BaseRepository::scalar(
            "SELECT COALESCE(SUM(r.amount),0) FROM returns_log r JOIN sale_items i ON i.id=r.sale_item_id WHERE i.sale_id=? AND r.status='Completed'",
            [$invoice['id']]
        );
        return $invoice;
    }

    public static function getDrafts(int $branch, array $user): array {
        if (!$branch) throw new ApiError('Select a branch.');
        return SaleRepository::drafts($branch, (int) $user['id']);
    }

    public static function saveDraft(string $route, array $user, int $branch, array $body): array {
        $id = empty($body['id']) ? null : Validator::integer($body['id'], 'Draft');
        if ($id && !BaseRepository::scalar('SELECT id FROM drafts WHERE id=? AND branch_id=? AND user_id=? FOR UPDATE', [$id, $branch, $user['id']])) {
            throw new ApiError('Held bill not found.', 404);
        }

        if ($route === 'draft.remove') {
            if (!$id) throw new ApiError('Select a held bill.');
            BaseRepository::run('DELETE FROM drafts WHERE id=?', [$id]);
            return ['id' => $id];
        }

        $payload = $body['payload'] ?? null;
        if (!is_array($payload) || empty($payload['cart']) || strlen($json = json_encode($payload, JSON_THROW_ON_ERROR)) > 30000) {
            throw new ApiError('Invalid held bill.');
        }

        if ($id) {
            BaseRepository::run('UPDATE drafts SET payload=? WHERE id=?', [$json, $id]);
        } else {
            $id = BaseRepository::insert('INSERT INTO drafts(branch_id, user_id, payload) VALUES (?,?,?)', [$branch, $user['id'], $json]);
        }

        return ['id' => $id];
    }
}
