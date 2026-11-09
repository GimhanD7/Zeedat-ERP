<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Repositories\PurchaseRepository;
use Zeedat\Services\PurchaseService;

class PurchaseController {
    public static function getPurchases(int $branch): array {
        return PurchaseRepository::purchases($branch);
    }

    public static function getSuppliers(): array {
        return PurchaseRepository::suppliers();
    }

    public static function getTransfers(int $branch): array {
        return PurchaseRepository::transfers($branch);
    }

    public static function createSupplier(array $body): array {
        return PurchaseService::createSupplier($body);
    }

    public static function receive(array $user, int $branch, array $body): array {
        return PurchaseService::receiveStock($user, $branch, $body);
    }

    public static function pay(array $user, int $branch, array $body): array {
        return PurchaseService::paySupplier($user, $branch, $body);
    }

    public static function requestTransfer(array $user, int $branch, array $body): array {
        return PurchaseService::requestTransfer($user, $branch, $body);
    }

    public static function updateTransfer(array $user, array $body): array {
        return PurchaseService::updateTransfer($user, $body);
    }
}
