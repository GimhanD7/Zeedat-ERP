<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\DrawerRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class DrawerService {
    public static function openDrawer(array $user, int $branch): array {
        $drawer = DrawerRepository::openDrawerForBranch($branch);
        if (!$drawer) {
            throw new ApiError('Open today’s cash drawer before completing transactions.');
        }
        if ((int) $drawer['user_id'] !== (int) $user['id']) {
            throw new ApiError('The active drawer is assigned to another cashier.');
        }
        $drawer['expected'] = (int) $drawer['opening'] + (int) BaseRepository::scalar(
            'SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE drawer_id=?',
            [$drawer['id']]
        );
        return $drawer;
    }

    public static function getRegister(int $branch, array $user, array $params = []): array {
        $drawer = DrawerRepository::openDrawerForBranch($branch);
        $blocked = false;
        if ($drawer) {
            if ((int) $drawer['user_id'] !== (int) $user['id']) {
                $blocked = true;
                $drawer = null;
            } else {
                $drawer['expected'] = (int) $drawer['opening'] + (int) BaseRepository::scalar(
                    'SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE drawer_id=?',
                    [$drawer['id']]
                );
            }
        }

        $movements = $drawer ? DrawerRepository::movements((int) $drawer['id']) : [];
        $paymentBreakdown = $drawer ? DrawerRepository::paymentBreakdown((int) $drawer['id']) : [];
        $history = DrawerRepository::history($branch, $user, 30);

        // Cashbook Ledger parameters
        $filterBranch = (isset($params['all_branches']) && $params['all_branches'] === '1' && in_array($user['role'], ['owner', 'manager'], true)) || $branch === 0
            ? 0
            : $branch;
        $startDate = !empty($params['start_date']) ? (string) $params['start_date'] : '';
        $endDate = !empty($params['end_date']) ? (string) $params['end_date'] : '';
        $type = !empty($params['type']) ? (string) $params['type'] : 'all';

        $ledger = DrawerRepository::cashbookLedger($filterBranch, $startDate, $endDate, $type, 500);

        $totalIn = 0;
        $totalOut = 0;
        $categoryMap = [];

        foreach ($ledger as $item) {
            $amt = (int) $item['amount'];
            if ($amt > 0) {
                $totalIn += $amt;
            } else {
                $totalOut += abs($amt);
            }

            $cat = $item['kind'] ?: 'General';
            if (!isset($categoryMap[$cat])) {
                $categoryMap[$cat] = ['name' => $cat, 'total' => 0, 'count' => 0];
            }
            $categoryMap[$cat]['total'] += $amt;
            $categoryMap[$cat]['count'] += 1;
        }

        return [
            'drawer' => $drawer,
            'blocked' => $blocked,
            'movements' => $movements,
            'payment_breakdown' => $paymentBreakdown,
            'history' => $history,
            'ledger' => $ledger,
            'summary' => [
                'total_in' => $totalIn,
                'total_out' => $totalOut,
                'net' => $totalIn - $totalOut,
                'count' => count($ledger),
            ],
            'categories' => array_values($categoryMap),
        ];
    }

    public static function open(array $user, int $branch, array $body): array {
        if (DrawerRepository::openDrawerForBranch($branch)) {
            throw new ApiError('A drawer session is already open at this branch.', 409);
        }

        $opening = Validator::money($body, 'opening');
        $date = date('Y-m-d');

        $cycle = BaseRepository::one('SELECT id, closed_at FROM cycles WHERE branch_id=? AND business_date=?', [$branch, $date]);
        if ($cycle && $cycle['closed_at'] !== null) {
            throw new ApiError("The business day for {$date} is already closed at this branch.", 409);
        }

        $cycleId = $cycle
            ? (int) $cycle['id']
            : BaseRepository::insert('INSERT INTO cycles(branch_id, business_date) VALUES (?,?)', [$branch, $date]);

        $id = BaseRepository::insert(
            'INSERT INTO drawers(branch_id, user_id, cycle_id, opening) VALUES (?,?,?,?)',
            [$branch, $user['id'], $cycleId, $opening]
        );

        return ['id' => $id, 'status' => 'Open', 'opening' => $opening, 'cycle_id' => $cycleId];
    }

    public static function close(array $user, int $branch, array $body): array {
        $drawer = self::openDrawer($user, $branch);
        $counted = Validator::money($body, 'counted');
        $notes = Validator::str($body, 'notes', 500, false);
        $expected = (int) $drawer['expected'];
        $variance = $counted - $expected;

        BaseRepository::run(
            'UPDATE drawers SET counted=?, expected=?, notes=?, closed_at=NOW() WHERE id=?',
            [$counted, $expected, $notes, $drawer['id']]
        );

        return [
            'id' => $drawer['id'],
            'expected' => $expected,
            'counted' => $counted,
            'variance' => $variance,
        ];
    }

    public static function movement(array $user, int $branch, array $body): array {
        $drawer = DrawerRepository::openDrawerForBranch($branch);
        if (!$drawer) {
            if (in_array($user['role'], ['owner', 'manager'], true) || !empty($body['auto_open'])) {
                self::open($user, $branch, ['opening' => 0]);
                $drawer = DrawerRepository::openDrawerForBranch($branch);
            } else {
                throw new ApiError('Open today’s cash drawer before recording cash movements.');
            }
        }
        if ((int) $drawer['user_id'] !== (int) $user['id'] && !in_array($user['role'], ['owner', 'manager'], true)) {
            throw new ApiError('The active drawer is assigned to another cashier.');
        }

        $direction = $body['direction'] ?? '';
        if (!in_array($direction, ['In', 'Out'], true)) {
            throw new ApiError('Invalid direction.');
        }

        $amount = Validator::money($body, 'amount');
        if ($amount <= 0) {
            throw new ApiError('Amount must be greater than zero.');
        }

        $reason = Validator::str($body, 'reason', 150, true);
        $category = trim((string)($body['category'] ?? ''));
        $kind = $category ? "{$direction}: {$category}" : "Cash {$direction}";
        $delta = $direction === 'In' ? $amount : -$amount;

        DrawerRepository::addCashMovement($user['id'], $drawer, $delta, $kind, $reason);

        return ['id' => $drawer['id'], 'amount' => $delta, 'kind' => $kind];
    }

    public static function closeCycle(int $branch, array $body): array {
        $date = Validator::date($body, 'business_date');
        $cycle = BaseRepository::one('SELECT id, closed_at FROM cycles WHERE branch_id=? AND business_date=?', [$branch, $date]);
        if (!$cycle) {
            throw new ApiError('No business cycle found for this date.', 404);
        }

        if (BaseRepository::scalar('SELECT id FROM drawers WHERE cycle_id=? AND closed_at IS NULL LIMIT 1', [$cycle['id']])) {
            throw new ApiError('Reconcile and close all drawer sessions for this date first.', 409);
        }

        BaseRepository::run('UPDATE cycles SET closed_at=NOW() WHERE id=?', [$cycle['id']]);

        return ['branch' => $branch, 'business_date' => $date, 'closed' => true];
    }
}
