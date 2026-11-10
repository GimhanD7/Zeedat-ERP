<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/Autoloader.php';
\Zeedat\Autoloader::register();

use Zeedat\Config\Constants;
use Zeedat\Controllers\AdminController;
use Zeedat\Controllers\AuthController;
use Zeedat\Controllers\BackupController;
use Zeedat\Controllers\DashboardController;
use Zeedat\Controllers\DrawerController;
use Zeedat\Controllers\InventoryController;
use Zeedat\Controllers\PurchaseController;
use Zeedat\Controllers\RepairController;
use Zeedat\Controllers\ReturnController;
use Zeedat\Controllers\SaleController;
use Zeedat\Middleware\AuthMiddleware;
use Zeedat\Middleware\RoleGuard;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\BranchRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Helpers;
use Zeedat\Support\Idempotency;
use Zeedat\Support\Response;

AuthMiddleware::startSession();

try {
    $action = (string) ($_GET['route'] ?? 'session');
    $method = $_SERVER['REQUEST_METHOD'];

    if (!in_array($method, ['GET', 'POST'], true)) {
        throw new ApiError('Method not allowed.', 405);
    }

    // Public / Remote backup receiver (allows multipart upload with Bearer token)
    if ($action === 'backup.receive' && $method === 'POST') {
        BackupController::receive();
    }

    // Public / Remote sync endpoints (branch cashier PCs syncing to central cloud)
    if ($action === 'sync.catalog' && $method === 'GET') {
        $branchId = (int) ($_GET['branch'] ?? 1);
        Response::json(\Zeedat\Services\CloudSyncService::handleServerCatalog($branchId));
    }

    if ($method === 'POST') {
        $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
        if ($contentType !== 'application/json') {
            throw new ApiError('Expected application/json.', 415);
        }
    }

    $body = $method === 'POST' ? json_decode(file_get_contents('php://input'), true, 32, JSON_THROW_ON_ERROR) : [];
    if (!is_array($body)) {
        throw new ApiError('Expected a JSON object.', 400);
    }

    if ($action === 'sync.receive' && $method === 'POST') {
        $headers = getallheaders() ?: [];
        $res = \Zeedat\Services\CloudSyncService::handleSyncReceive($headers, $body);
        Response::json($res, $res['code'] ?? 200);
    }

    // Public / Authentication endpoints
    if ($action === 'login' && $method === 'POST') {
        AuthController::login($body);
    }

    if ($method === 'GET' && $action === 'session') {
        AuthController::session();
    }

    if ($method === 'GET' && $action === 'backup.download') {
        $user = AuthMiddleware::requireAuth();
        RoleGuard::allowPermission($user, 'settings');
        BackupController::download($user, $_GET);
    }

    // Authenticated endpoints
    $user = AuthMiddleware::requireAuth();

    if ($method === 'POST') {
        AuthMiddleware::verifyCsrf();

        if ($action === 'logout') {
            AuthController::logout();
        }

        session_write_close();

        $global = in_array($action, ['staff.save', 'staff.delete', 'staff.toggle', 'settings.save', 'supplier.create', 'backup.create', 'backup.save_settings', 'sync.push', 'sync.pull'], true);
        $branch = $global ? 0 : RoleGuard::branchFor($user, $body['branch'] ?? null);
        if ($branch) {
            BranchRepository::lock($branch);
        }

        $result = Idempotency::execute($user, $action, function () use ($action, $user, $branch, $body) {
            return match ($action) {
                'sale.checkout' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'pos');
                    return SaleController::checkout($user, $branch, $body);
                })(),
                'sale.credit' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'pos');
                    return SaleController::creditPayment($user, $branch, $body);
                })(),
                'draft.save', 'draft.remove' => (function () use ($action, $user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'pos');
                    return SaleController::saveDraft($action, $user, $branch, $body);
                })(),
                'drawer.open' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'drawer');
                    return DrawerController::open($user, $branch, $body);
                })(),
                'drawer.close' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'drawer');
                    return DrawerController::close($user, $branch, $body);
                })(),
                'drawer.movement' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'drawer');
                    return DrawerController::movement($user, $branch, $body);
                })(),
                'cycle.close' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'drawer');
                    return DrawerController::closeCycle($branch, $body);
                })(),
                'return.request' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'returns');
                    return ReturnController::request($branch, $body);
                })(),
                'return.resolve' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'returns');
                    return ReturnController::resolve($user, $branch, $body);
                })(),
                'customer.save' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'customers');
                    return InventoryController::saveCustomer($branch, $body);
                })(),
                'product.save' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'inventory');
                    return InventoryController::saveProduct($user, $body);
                })(),
                'product.barcode' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'inventory');
                    return InventoryController::updateBarcode($user, $body);
                })(),
                'barcode.bulk' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'inventory');
                    return InventoryController::bulkGenerateBarcodes($body);
                })(),
                'stock.adjust' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'inventory');
                    return InventoryController::adjustStock($user, $branch, $body);
                })(),
                'unit.receive' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'inventory');
                    return InventoryController::receiveUnit($user, $branch, $body);
                })(),
                'unit.release' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'inventory');
                    return InventoryController::releaseUnit($user, $branch, $body);
                })(),
                'repair.create' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'repairs');
                    return RepairController::create($branch, $body);
                })(),
                'repair.status' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'repairs');
                    return RepairController::updateStatus($user, $branch, $body);
                })(),
                'supplier.create' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'purchases');
                    return PurchaseController::createSupplier($body);
                })(),
                'purchase.receive' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'purchases');
                    return PurchaseController::receive($user, $branch, $body);
                })(),
                'purchase.pay' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'purchases');
                    return PurchaseController::pay($user, $branch, $body);
                })(),
                'transfer.request' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'transfers');
                    return PurchaseController::requestTransfer($user, $branch, $body);
                })(),
                'transfer.update' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'transfers');
                    return PurchaseController::updateTransfer($user, $body);
                })(),
                'staff.save' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'staff');
                    return AdminController::saveStaff($body);
                })(),
                'permissions.save' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'staff');
                    return AdminController::savePermissions($user, $body);
                })(),
                'permissions.reset' => (function () use ($user) {
                    RoleGuard::allowPermission($user, 'staff');
                    return AdminController::resetPermissions($user);
                })(),
                'staff.delete' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'staff');
                    return AdminController::deleteStaff($user, $body);
                })(),
                'staff.toggle' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'staff');
                    return AdminController::toggleStaffStatus($user, $body);
                })(),
                'settings.save' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'settings');
                    return AdminController::saveSettings($body);
                })(),
                'backup.create' => (function () use ($user, $branch, $body) {
                    RoleGuard::allowPermission($user, 'settings');
                    return BackupController::createBackup($user, $branch, $body);
                })(),
                'backup.save_settings' => (function () use ($user, $body) {
                    RoleGuard::allowPermission($user, 'settings');
                    return BackupController::saveSettings($user, $body);
                })(),
                'sync.push' => (function () use ($user) {
                    RoleGuard::allowPermission($user, 'settings');
                    return \Zeedat\Services\CloudSyncService::pushToCloud();
                })(),
                'sync.pull' => (function () use ($user) {
                    RoleGuard::allowPermission($user, 'settings');
                    return \Zeedat\Services\CloudSyncService::pullFromCloud();
                })(),
                default => throw new ApiError('Route not found.', 404),
            };
        });

        $details = array_intersect_key($result, array_flip([
            'id', 'status', 'previous', 'amount', 'replacement_sale_id',
            'expected', 'counted', 'variance', 'state', 'tax_bps', 'paper_width',
        ]));
        Helpers::audit($user, $branch ?: null, $action, $details);

        Response::json($result);
    }

    // GET requests
    session_write_close();

    if ($action === 'destinations') {
        RoleGuard::allow($user, ...Constants::STOCK_ROLES);
        Response::json(BranchRepository::destinations());
    }

    if ($action === 'branches') {
        $branches = $user['role'] === 'owner'
            ? BranchRepository::all()
            : [BranchRepository::findById((int) $user['branch_id'])];
        Response::json(array_filter($branches));
    }

    $branch = RoleGuard::branchFor($user, $_GET['branch'] ?? 0, false);

    $result = match ($action) {
        'dashboard' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'dashboard');
            return DashboardController::getDashboard($branch, $_GET);
        })(),
        'products' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'inventory');
            return InventoryController::getProducts($branch, $user);
        })(),
        'units' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'inventory');
            return InventoryController::getUnits($branch);
        })(),
        'customers' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'customers');
            $params = $branch ? [$branch] : [];
            return BaseRepository::rows(
                "SELECT c.*, b.name branch, CAST(COALESCE(t.total,0) AS UNSIGNED) total, CAST(COALESCE(t.credit,0) AS UNSIGNED) credit
                FROM customers c JOIN branches b ON b.id=c.branch_id
                LEFT JOIN (SELECT customer_id, SUM(total) total, SUM(credit) credit FROM sales GROUP BY customer_id) t ON t.customer_id=c.id
                " . ($branch ? 'WHERE c.branch_id=?' : '') . ' ORDER BY c.id DESC',
                $params
            );
        })(),
        'repairs' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'repairs');
            return RepairController::getRepairs($branch, $user);
        })(),
        'technicians' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'repairs');
            return RepairController::getTechnicians($branch);
        })(),
        'drafts' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'pos');
            return SaleController::getDrafts($branch, $user);
        })(),
        'sales' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'sales');
            return SaleController::getSales($branch);
        })(),
        'invoice' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'sales');
            return SaleController::getInvoice($branch, $_GET);
        })(),
        'drawer' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'drawer');
            if (!$branch) throw new ApiError('Select a branch.');
            return DrawerController::getRegister($branch, $user, $_GET);
        })(),
        'cashbook' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'drawer');
            if (!$branch) throw new ApiError('Select a branch.');
            return DrawerController::getRegister($branch, $user, $_GET);
        })(),
        'returns' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'returns');
            return ReturnController::getReturns($branch);
        })(),
        'purchases' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'purchases');
            return PurchaseController::getPurchases($branch);
        })(),
        'suppliers' => (function () use ($user) {
            RoleGuard::allowPermission($user, 'purchases');
            return PurchaseController::getSuppliers();
        })(),
        'transfers' => (function () use ($user, $branch) {
            RoleGuard::allowPermission($user, 'transfers');
            return PurchaseController::getTransfers($branch);
        })(),
        'staff' => (function () use ($user) {
            RoleGuard::allowPermission($user, 'staff');
            return AdminController::getStaff();
        })(),
        'permissions' => (function () use ($user) {
            RoleGuard::allowPermission($user, 'staff');
            return AdminController::getPermissions();
        })(),
        'settings' => (function () use ($user) {
            RoleGuard::allowPermission($user, 'settings');
            return AdminController::getSettings();
        })(),
        'audit' => (function () use ($user) {
            RoleGuard::allowPermission($user, 'settings');
            return AdminController::getAudit();
        })(),
        'barcode.generate' => (function () use ($user) {
            RoleGuard::allowPermission($user, 'inventory');
            return InventoryController::generateBarcode();
        })(),
        'backup.summary' => (function () use ($user) {
            RoleGuard::allowPermission($user, 'settings');
            return BackupController::getSummary();
        })(),
        'backup.history' => (function () use ($user) {
            RoleGuard::allowPermission($user, 'settings');
            return BackupController::getHistory();
        })(),
        'sync.status' => (function () use ($user) {
            RoleGuard::allowPermission($user, 'settings');
            return \Zeedat\Services\CloudSyncService::getStatus();
        })(),
        default => throw new ApiError('Route not found.', 404),
    };

    Response::json($result);
} catch (Throwable $e) {
    Response::handleException($e);
}
