<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use DateTimeImmutable;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\SaleRepository;
use Zeedat\Support\Validator;

class DashboardController {
    public static function getDashboard(int $branch, array $query): array {
        $days = Validator::integer($query['days'] ?? 7, 'Date range', 1, 366);
        $today = date('Y-m-d');
        $start = (new DateTimeImmutable($today))->modify('-' . ($days - 1) . ' days')->format('Y-m-d');
        $scope = $branch ? ' AND s.branch_id=?' : '';
        $params = $branch ? [$branch] : [];

        $daily = BaseRepository::rows(
            "SELECT DATE(s.created_at) day, SUM(s.total) total FROM sales s WHERE s.created_at>=? {$scope} GROUP BY DATE(s.created_at) ORDER BY day",
            [$start, ...$params]
        );
        $daily = array_column($daily, 'total', 'day');

        $trend = [];
        for ($day = new DateTimeImmutable($start); $day->format('Y-m-d') <= $today; $day = $day->modify('+1 day')) {
            $key = $day->format('Y-m-d');
            $trend[] = ['day' => $key, 'total' => (int) ($daily[$key] ?? 0)];
        }

        $branchStats = BaseRepository::rows(
            "SELECT b.id, b.name,
            (SELECT COALESCE(SUM(total),0) FROM sales WHERE branch_id=b.id AND created_at>=?) sales,
            (SELECT COUNT(*) FROM sales WHERE branch_id=b.id AND created_at>=?) bills,
            (SELECT COUNT(*) FROM repairs WHERE branch_id=b.id AND created_at>=?) repairs
            FROM branches b " . ($branch ? 'WHERE b.id=?' : '') . ' ORDER BY b.id',
            [$today, $today, $today, ...$params]
        );

        $repairStats = BaseRepository::one(
            "SELECT COUNT(*) open_count, COALESCE(SUM(due_date < ?),0) overdue FROM repairs s WHERE status NOT IN ('Delivered','Cancelled') {$scope}",
            [$today, ...$params]
        );

        $low = BaseRepository::rows(
            "SELECT s.branch_id, p.name, p.sku, s.qty, p.reorder_level, b.name branch FROM stock s JOIN products p ON p.id=s.product_id
            JOIN branches b ON b.id=s.branch_id WHERE s.qty<=p.reorder_level {$scope} ORDER BY s.qty, p.name",
            $params
        );

        $collections = BaseRepository::rows(
            "SELECT p.method, SUM(p.amount) total,
            SUM(CASE WHEN p.created_at>=? THEN p.amount ELSE 0 END) today
            FROM payments p JOIN drawers s ON s.id=p.drawer_id WHERE p.created_at>=? {$scope} GROUP BY p.method",
            [$today, $start, ...$params]
        );

        return [
            'today' => $today,
            'sales' => array_sum(array_column($branchStats, 'sales')),
            'bills' => array_sum(array_column($branchStats, 'bills')),
            'collected' => array_sum(array_column($collections, 'today')),
            'credit' => (int) BaseRepository::scalar("SELECT COALESCE(SUM(credit),0) FROM sales s WHERE credit>0 {$scope}", $params),
            'credit_accounts' => (int) BaseRepository::scalar("SELECT COUNT(DISTINCT customer_id) FROM sales s WHERE credit>0 {$scope}", $params),
            'repairs' => $repairStats,
            'low' => $low,
            'branches' => $branchStats,
            'trend' => $trend,
            'collections' => $collections,
            'pending' => BaseRepository::rows(
                "SELECT s.id, s.amount, s.reason, b.name branch FROM returns_log s JOIN branches b ON b.id=s.branch_id
                WHERE s.status='Pending' {$scope} ORDER BY s.id DESC LIMIT 8",
                $params
            ),
            'recent' => SaleRepository::recentSales($branch, 8),
        ];
    }
}
