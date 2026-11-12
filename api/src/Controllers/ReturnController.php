<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Services\ReturnService;

class ReturnController {
    public static function getReturns(int $branch): array {
        $params = $branch ? [$branch] : [];
        return BaseRepository::rows(
            "SELECT r.*,
                    i.sale_id,
                    i.name AS product,
                    i.price AS item_price,
                    i.total AS item_total,
                    COALESCE(u.code, '') AS item_unit_code,
                    COALESCE(u.imei, '') AS item_imei,
                    s.invoice_no,
                    s.created_at AS sale_date,
                    s.total AS sale_total,
                    s.payment_methods,
                    COALESCE(c.name, 'Walk-in') AS customer,
                    COALESCE(c.phone, '') AS customer_phone,
                    x.replacement_sale_id,
                    x.quoted_total,
                    x.qty AS replacement_qty,
                    p.name AS replacement,
                    COALESCE(rep_u.code, '') AS replacement_unit_code,
                    COALESCE(rep_u.imei, '') AS replacement_imei,
                    COALESCE(rep_s.invoice_no, '') AS replacement_invoice_no
             FROM returns_log r
             JOIN sale_items i ON r.sale_item_id=i.id
             JOIN sales s ON i.sale_id=s.id
             LEFT JOIN units u ON i.unit_id=u.id
             LEFT JOIN customers c ON s.customer_id=c.id
             LEFT JOIN exchanges x ON x.return_id=r.id
             LEFT JOIN products p ON p.id=x.product_id
             LEFT JOIN units rep_u ON x.unit_id=rep_u.id
             LEFT JOIN sales rep_s ON x.replacement_sale_id=rep_s.id
             " . ($branch ? 'WHERE r.branch_id=?' : '') . ' ORDER BY r.id DESC LIMIT 200',
            $params
        );
    }

    public static function request(array $user, int $branch, array $body): array {
        $result = ReturnService::request($branch, $body);
        if (!empty($body['direct']) && in_array($user['role'], ['owner', 'manager', 'cashier'], true)) {
            return ReturnService::resolve($user, $branch, [
                'id' => $result['id'],
                'decision' => 'Completed',
                'reference' => $body['reference'] ?? null,
            ]);
        }
        return $result;
    }

    public static function resolve(array $user, int $branch, array $body): array {
        return ReturnService::resolve($user, $branch, $body);
    }
}
