<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Services\ReturnService;

class ReturnController
{
    public static function getReturns(int $branch): array
    {
        $params = $branch ? [$branch] : [];
        $returns = BaseRepository::rows(
            "SELECT r.*, i.sale_id, i.name product, COALESCE(c.name, 'Walk-in') customer,
            x.replacement_sale_id, x.qty replacement_qty, x.quoted_total, p.name replacement,
            rs.cash_tendered cash_received, rs.change_amount `change` FROM returns_log r
            JOIN sale_items i ON r.sale_item_id=i.id
            JOIN sales s ON i.sale_id=s.id
            LEFT JOIN customers c ON s.customer_id=c.id
            LEFT JOIN exchanges x ON x.return_id=r.id
            LEFT JOIN sales rs ON rs.id=x.replacement_sale_id
            LEFT JOIN products p ON p.id=x.product_id
            " . ($branch ? 'WHERE r.branch_id=?' : '') . ' ORDER BY r.id DESC LIMIT 100',
            $params
        );
        foreach ($returns as &$return) {
            if (!$return['replacement_sale_id']) continue;
            $return['replacement_items'] = BaseRepository::rows(
                'SELECT name,qty,price,total FROM sale_items WHERE sale_id=? ORDER BY id', [$return['replacement_sale_id']]
            );
            $return['settlement_payments'] = BaseRepository::rows(
                "SELECT method,amount,reference FROM payments WHERE sale_id=? AND method<>'Exchange Credit' ORDER BY id",
                [$return['replacement_sale_id']]
            );
        }
        return $returns;
    }

    public static function request(int $branch, array $body): array
    {
        return ReturnService::request($branch, $body);
    }

    public static function resolve(array $user, int $branch, array $body): array
    {
        return ReturnService::resolve($user, $branch, $body);
    }
}
