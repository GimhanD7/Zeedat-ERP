<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Services\DrawerService;

class DrawerController {
    public static function getRegister(int $branch, array $user): array {
        return DrawerService::getRegister($branch, $user);
    }

    public static function open(array $user, int $branch, array $body): array {
        return DrawerService::open($user, $branch, $body);
    }

    public static function close(array $user, int $branch, array $body): array {
        return DrawerService::close($user, $branch, $body);
    }

    public static function movement(array $user, int $branch, array $body): array {
        return DrawerService::movement($user, $branch, $body);
    }

    public static function closeCycle(int $branch, array $body): array {
        return DrawerService::closeCycle($branch, $body);
    }
}
