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
        return BaseRepository::rows(
            "SELECT r.*, i.sale_id, i.name product, COALESCE(c.name, 'Walk-in') customer,
            x.replacement_sale_id, x.quoted_total, p.name replacement FROM returns_log r
            JOIN sale_items i ON r.sale_item_id=i.id
            JOIN sales s ON i.sale_id=s.id
            LEFT JOIN customers c ON s.customer_id=c.id
            LEFT JOIN exchanges x ON x.return_id=r.id
            LEFT JOIN products p ON p.id=x.product_id
            " . ($branch ? 'WHERE r.branch_id=?' : '') . ' ORDER BY r.id DESC LIMIT 100',
            $params
        );
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
