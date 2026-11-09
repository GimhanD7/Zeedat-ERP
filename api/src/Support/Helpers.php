<?php
declare(strict_types=1);

namespace Zeedat\Support;

use Zeedat\Repositories\UserRepository;

class Helpers {
    public static function ref(string $prefix, int $id): string {
        return $prefix . '-' . str_pad((string) $id, 6, '0', STR_PAD_LEFT);
    }

    public static function rate(int $amount, int $basisPoints): int {
        return intdiv($amount * $basisPoints + 5000, 10000);
    }

    public static function audit(array $user, ?int $branch, string $action, array $details): void {
        UserRepository::logAudit($user['id'], $branch, $action, json_encode($details, JSON_THROW_ON_ERROR));
    }
}
