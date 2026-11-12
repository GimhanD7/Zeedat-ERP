<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Support\ApiError;

final class CustomerWallet {
    public const WALLET_DELTA = "CASE
        WHEN l.kind IN ('Top-Up', 'Reservation refund', 'POS Wallet + Points')
          OR (l.method='Wallet' AND l.kind IN ('Credit settlement', 'Repair Advance', 'Repair Payment', 'Reservation deposit'))
        THEN l.amount ELSE 0 END";

    public static function paymentPoints(int $alreadyPaid, int $amount): int {
        return intdiv($alreadyPaid + $amount, 100) - intdiv($alreadyPaid, 100);
    }

    public static function recordPoints(array $user, int $branch, int $customer, int $points, string $kind, string $method, string $reference): void {
        if ($points < 0) {
            $balance = (int) BaseRepository::scalar('SELECT loyalty_points FROM customers WHERE id=? FOR UPDATE', [$customer]);
            $points = max(-$balance, $points);
        }
        if ($points === 0) return;
        BaseRepository::run('UPDATE customers SET loyalty_points=CAST(loyalty_points AS SIGNED)+?, synced=0 WHERE id=?', [$points, $customer]);
        BaseRepository::run(
            'INSERT INTO customer_wallet_logs(branch_id, customer_id, user_id, amount, points_delta, kind, method, reference) VALUES (?,?,?,0,?,?,?,?)',
            [$branch, $customer, $user['id'], $points, $kind, $method, $reference]
        );
    }

    public static function entry(array $user, int $branch, int $customer, int $amount, string $kind, string $method, string $reference): void {
        BaseRepository::run(
            'INSERT INTO customer_wallet_logs(branch_id, customer_id, user_id, amount, points_delta, kind, method, reference) VALUES (?,?,?,?,0,?,?,?)',
            [$branch, $customer, $user['id'], $amount, $kind, $method, $reference]
        );
    }

    public static function debit(array $user, int $branch, int $customer, int $amount, string $kind, string $reference): void {
        $updated = BaseRepository::run(
            'UPDATE customers SET wallet_balance=wallet_balance-?, synced=0 WHERE id=? AND branch_id=? AND deleted_at IS NULL AND wallet_balance>=?',
            [$amount, $customer, $branch, $amount]
        )->rowCount();
        if (!$updated) {
            throw new ApiError('The customer has insufficient wallet funds.', 409);
        }
        self::entry($user, $branch, $customer, -$amount, $kind, 'Wallet', $reference);
    }

    public static function recordAppliedPayment(array $user, int $branch, int $customer, int $amount, string $kind, string $method, string $reference): void {
        if ($method === 'Wallet') {
            self::debit($user, $branch, $customer, $amount, $kind, $reference);
            return;
        }
        self::entry($user, $branch, $customer, $amount, 'Payment received', $method, $reference);
        self::entry($user, $branch, $customer, -$amount, $kind, $method, $reference);
    }
}
