<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Repositories\ProductRepository;
use Zeedat\Services\InventoryService;
use Zeedat\Support\ApiError;

class InventoryController {
    public static function getProducts(int $branch, array $user): array {
        return ProductRepository::all($branch, $user['role'] !== 'cashier');
    }

    public static function getUnits(int $branch): array {
        if (!$branch) throw new ApiError('Select a branch.');
        return ProductRepository::units($branch);
    }

    public static function generateBarcode(): array {
        return InventoryService::generateBarcode();
    }

    public static function bulkGenerateBarcodes(array $body = []): array {
        return InventoryService::bulkGenerateBarcodes($body);
    }

    public static function saveProduct(array $user, array $body): array {
        return InventoryService::saveProduct($user, $body);
    }

    public static function updateBarcode(array $user, array $body): array {
        return InventoryService::updateBarcode($user, $body);
    }

    public static function adjustStock(array $user, int $branch, array $body): array {
        return InventoryService::adjustStock($user, $branch, $body);
    }

    public static function receiveUnit(array $user, int $branch, array $body): array {
        return InventoryService::receiveUnit($user, $branch, $body);
    }

    public static function releaseUnit(array $user, int $branch, array $body): array {
        return InventoryService::releaseUnit($user, $branch, $body);
    }

    public static function saveCustomer(int $branch, array $body): array {
        return InventoryService::saveCustomer($branch, $body);
    }
}
