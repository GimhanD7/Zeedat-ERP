<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Support\ApiError;

final class CustomerWallet {
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
