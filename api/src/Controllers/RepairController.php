<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Repositories\RepairRepository;
use Zeedat\Repositories\UserRepository;
use Zeedat\Services\RepairService;

class RepairController {
    public static function getRepairs(int $branch, array $user): array {
        return RepairRepository::all($branch, $user);
    }

    public static function getTechnicians(int $branch): array {
        return UserRepository::technicians($branch);
    }

    public static function create(int $branch, array $body, ?array $user = null): array {
        return RepairService::create($branch, $body, $user);
    }

    public static function updateStatus(array $user, int $branch, array $body): array {
        return RepairService::updateStatus($user, $branch, $body);
    }

    public static function completeAndPay(array $user, int $branch, array $body): array {
        return RepairService::completeAndPay($user, $branch, $body);
    }

    public static function sendSms(int $branch, array $body): array {
        return RepairService::sendJobSms($branch, $body);
    }
}
