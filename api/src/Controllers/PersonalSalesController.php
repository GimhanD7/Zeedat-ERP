<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use DateTimeImmutable;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class PersonalSalesController
{
    public static function get(array $user, int $branch, array $query): array
    {
        $from = isset($query['from']) ? Validator::date($query, 'from') : date('Y-m-01');
        $to = isset($query['to']) ? Validator::date($query, 'to') : date('Y-m-d');
        if ($from > $to) throw new ApiError('End date must be after start date.');
        $end = (new DateTimeImmutable($to))->modify('+1 day')->format('Y-m-d');
        $scope = $branch ? ' AND s.branch_id=?' : '';
        $rows = BaseRepository::rows(
            "SELECT i.id,s.invoice_no,s.id sale_id,s.created_at,b.name branch,i.name,
                p.sku,p.category,COALESCE(i.brand_snapshot,p.brand,'') brand,
                i.qty,i.refunded_qty,i.total,i.commission_amount
             FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN products p ON p.id=i.product_id
             JOIN branches b ON b.id=s.branch_id
             WHERE (s.commission_user_id=? OR (s.commission_user_id IS NULL AND s.user_id=?))
                AND s.created_at>=? AND s.created_at<? {$scope}
             ORDER BY s.created_at DESC,i.id DESC",
            [(int) $user['id'], (int) $user['id'], $from, $end, ...($branch ? [$branch] : [])]
        );
        $totals = ['units' => 0, 'gross' => 0, 'returned' => 0, 'net' => 0, 'commission' => 0, 'branded' => 0, 'non_branded' => 0, 'services' => 0];
        $invoices = [];
        foreach ($rows as &$row) {
            $qty = (int) $row['qty'];
            $refunded = min($qty, (int) $row['refunded_qty']);
            $row['returned_amount'] = (int) bcdiv(bcmul((string) $row['total'], (string) $refunded, 0), (string) $qty, 0);
            $row['net_amount'] = (int) $row['total'] - $row['returned_amount'];
            $row['units'] = $qty - $refunded;
            $row['earned_commission'] = (int) $row['commission_amount']
                - (int) bcdiv(bcmul((string) $row['commission_amount'], (string) $refunded, 0), (string) $qty, 0);
            $row['branding'] = $row['category'] === 'Services' ? 'Service' : (trim($row['brand']) === '' ? 'Non-branded' : 'Branded');
            $totals['units'] += $row['units'];
            $totals['gross'] += (int) $row['total'];
            $totals['returned'] += $row['returned_amount'];
            $totals['net'] += $row['net_amount'];
            $totals['commission'] += $row['earned_commission'];
            $category = $row['branding'] === 'Service' ? 'services' : ($row['branding'] === 'Branded' ? 'branded' : 'non_branded');
            $totals[$category] += $row['net_amount'];
            $invoices[$row['sale_id']] = true;
        }
        unset($row);
        $totals['invoices'] = count($invoices);
        return ['from' => $from, 'to' => $to, 'totals' => $totals, 'items' => $rows];
    }
}
