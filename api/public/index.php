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

    // Public standalone desktop app patch manifest & zip download
    if ($action === 'update.manifest' && $method === 'GET') {
        Response::json(\Zeedat\Services\PatchService::manifest());
    }

    if ($action === 'update.download' && $method === 'GET') {
        \Zeedat\Services\PatchService::streamDownload();
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

    if ($method === 'GET' && $action === 'product.image') {
        session_write_close();
        RoleGuard::allowAnyPermission($user, 'inventory', 'pos');
        \Zeedat\Support\ProductImage::stream((int) ($_GET['id'] ?? 0));
    }

    if ($method === 'POST') {
        AuthMiddleware::verifyCsrf();

        if ($action === 'logout') {
            AuthController::logout();
        }

        session_write_close();

        if (
            PHP_SAPI === 'cli-server' && PHP_OS_FAMILY === 'Windows'
            && in_array($action, ['sync.auto', 'sync.push', 'sync.pull', 'backup.create'], true)
            && \Zeedat\Config\Database::isSqlite()
        ) {
            $syncLock = fopen(\Zeedat\Config\Database::getSqlitePath() . '.sync.lock', 'c');
            if (!$syncLock || !flock($syncLock, LOCK_EX | LOCK_NB)) {
                if ($action === 'sync.auto') {
                    Response::json(['ran' => false, 'busy' => true]);
                }
                throw new ApiError('A sync or backup is already running. Try again shortly.', 409);
            }
        }

        $global = in_array($action, ['staff.save', 'staff.assign_branches', 'staff.delete', 'staff.toggle', 'permissions.save', 'permissions.reset', 'user.permissions.save', 'product.barcode', 'product.delete', 'barcode.bulk', 'barcode.log_print', 'barcode.save_setup', 'unit.update', 'settings.save', 'settings.pin.save', 'branch.save', 'profile.password', 'supplier.create', 'backup.create', 'backup.save_settings', 'sync.push', 'sync.pull', 'sync.auto'], true);
        $branch = $global ? 0 : RoleGuard::branchFor($user, $body['branch'] ?? null);
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
                        RoleGuard::allowAnyPermission($user, 'drawer', 'pos');
                        return DrawerController::open($user, $branch, $body);
                    })(),
                'drawer.close' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'drawer', 'pos');
                        return DrawerController::close($user, $branch, $body);
                    })(),
                'drawer.movement' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'drawer', 'pos');
                        return DrawerController::movement($user, $branch, $body);
                    })(),
                'cycle.close' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowPermission($user, 'drawer');
                        return DrawerController::closeCycle($branch, $body);
                    })(),
                'return.request' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'returns', 'pos');
                        if ($user['role'] === 'cashier') \Zeedat\Services\DrawerService::openDrawer($user, $branch);
                        return ReturnController::request($branch, $body);
                    })(),
                'return.resolve' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'returns', 'pos');
                        return ReturnController::resolve($user, $branch, $body);
                    })(),
                'customer.save' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'customers', 'pos', 'repairs');
                        return InventoryController::saveCustomer($branch, $body);
                    })(),
                'customer.wallet.topup' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'customers', 'pos');
                        return InventoryController::topUpWallet($user, $branch, $body);
                    })(),
                'customer.points.adjust' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'customers', 'pos');
                        return InventoryController::adjustCustomerPoints($user, $branch, $body);
                    })(),
                'customer.delete' => (function () use ($user, $branch, $body) {
                        RoleGuard::allow($user, 'owner');
                        return InventoryController::deleteCustomer($user, $branch, $body);
                    })(),
                'reservation.create', 'reservation.pay', 'reservation.deliver', 'reservation.cancel' => (function () use ($user, $branch, $body, $action) {
                        RoleGuard::allowAnyPermission($user, 'customers', 'pos');
                        return \Zeedat\Services\ReservationService::save($user, $branch, $body, $action);
                    })(),
                'product.save' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::saveProduct($user, $body);
                    })(),
                'product.import' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::importProducts($user, $branch, $body);
                    })(),
                'product.barcode' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::updateBarcode($user, $body);
                    })(),
                'product.delete' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::deleteProduct($user, $body);
                    })(),
                'barcode.bulk' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::bulkGenerateBarcodes($body);
                    })(),
                'barcode.log_print' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        $b = (int) ($body['branch'] ?? 0);
                        return InventoryController::logBarcodePrint($user, $b, $body);
                    })(),
                'barcode.save_setup' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::saveLabelSetup($body);
                    })(),
                'stock.adjust' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::adjustStock($user, $branch, $body);
                    })(),
                'stock.bulk_adjust' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::bulkAdjustStock($user, $branch, $body);
                    })(),
                'unit.receive' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::receiveUnit($user, $branch, $body);
                    })(),
                'unit.release' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::releaseUnit($user, $branch, $body);
                    })(),
                'unit.inspect' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::inspectUnit($user, $branch, $body);
                    })(),
                'unit.update' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'inventory');
                        return InventoryController::updateUnit($user, $body);
                    })(),
                'repair.create' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'repairs', 'pos');
                        return RepairController::create($branch, $body, $user);
                    })(),
                'repair.status' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'repairs', 'pos');
                        return RepairController::updateStatus($user, $branch, $body);
                    })(),
                'repair.complete' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'repairs', 'pos');
                        return RepairController::completeAndPay($user, $branch, $body);
                    })(),
                'repair.payment' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'customers', 'pos');
                        return RepairController::completeAndPay($user, $branch, ['payment_only' => true] + $body);
                    })(),
                'repair.sms' => (function () use ($user, $branch, $body) {
                        RoleGuard::allowAnyPermission($user, 'repairs', 'pos');
                        return RepairController::sendSms($branch, $body);
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
                'staff.assign_branches' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'staff');
                        return AdminController::assignUserBranches($user, $body);
                    })(),
                'permissions.save' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'staff');
                        return AdminController::savePermissions($user, $body);
                    })(),
                'permissions.reset' => (function () use ($user) {
                        RoleGuard::allowPermission($user, 'staff');
                        return AdminController::resetPermissions($user);
                    })(),
                'user.permissions.save' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'staff');
                        return AdminController::saveUserPermissions($user, $body);
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
                'settings.pin.save' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'settings');
                        return AdminController::saveDeletePin($user, $body);
                    })(),
                'branch.save' => (function () use ($user, $body) {
                        RoleGuard::allowPermission($user, 'settings');
                        return AdminController::saveBranch($user, $body);
                    })(),
                'profile.password' => (function () use ($user, $body) {
                        return AdminController::changePassword($user, $body);
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
                'bill.print' => (function () use ($body) {
                        return \Zeedat\Services\ThermalPrintService::printBill($body);
                    })(),
                'sync.auto' => (function () use ($user) {
                        $bId = $user['branch_id'] ? (int) $user['branch_id'] : null;
                        return \Zeedat\Services\CloudSyncService::runAutoSyncAndBackup($bId);
                    })(),
                default => throw new ApiError('Route not found.', 404),
            };
        }, $branch);

        if ($action !== 'sync.auto' && $action !== 'bill.print') {
            $details = array_intersect_key($result, array_flip([
                'id',
                'invoice_no',
                'status',
                'previous',
                'amount',
                'total',
                'replacement_sale_id',
                'difference',
                'cash_received',
                'change',
                'expected',
                'counted',
                'variance',
                'state',
                'tax_bps',
                'paper_width',
                'name',
                'sku',
                'badge_code',
                'seller_name',
                'commission_user_id',
                'customer',
                'device',
                'method',
                'direction',
                'kind',
                'reference',
                'message',
            ]));
            Helpers::audit($user, $branch ?: null, $action, $details);
        }

        Response::json($result);
    }

    // GET requests
    session_write_close();

    if ($action === 'destinations') {
        RoleGuard::allow($user, ...Constants::STOCK_ROLES);
        Response::json(BranchRepository::destinations());
    }

    if ($action === 'branches') {
        $all = BranchRepository::all();
        if ($user['role'] === 'owner') {
            $branches = $all;
        } else {
            $allowed = array_map('intval', $user['branch_ids'] ?? array_values(array_filter([(int) ($user['branch_id'] ?? 0)])));
            $branches = array_values(array_filter($all, static fn($b) => in_array((int) $b['id'], $allowed, true)));
        }
        Response::json($branches);
    }

    $branch = RoleGuard::branchFor($user, $_GET['branch'] ?? 0, false);

    $result = match ($action) {
        'dashboard' => (function () use ($user, $branch) {
                RoleGuard::allowPermission($user, 'dashboard');
                return DashboardController::getDashboard($branch, $_GET);
            })(),
        'products' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'inventory', 'pos');
                return InventoryController::getProducts($branch, $user);
            })(),
        'units' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'inventory', 'pos');
                return InventoryController::getUnits($branch);
            })(),
        'stock.movements' => (function () use ($user, $branch) {
                RoleGuard::allowPermission($user, 'inventory');
                return InventoryController::getStockMovements($branch, $_GET);
            })(),
        'customers' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'customers', 'pos', 'repairs');
                $params = $branch ? [$branch] : [];
                $walletDelta = \Zeedat\Services\CustomerWallet::WALLET_DELTA;
                return BaseRepository::rows(
                "SELECT c.*, b.name branch,
                    CAST(COALESCE(c.loyalty_points,0) AS UNSIGNED) loyalty_points,
                    CAST(COALESCE(c.wallet_balance,0) AS UNSIGNED) wallet_balance,
                    COALESCE(w.wallet_credits,0) wallet_credits,
                    COALESCE(w.wallet_debits,0) wallet_debits,
                    CAST(COALESCE(t.total,0) AS UNSIGNED) total,
                    CAST(COALESCE(t.credit,0) AS UNSIGNED) credit,
                    CAST(COALESCE(t.credit_count,0) AS UNSIGNED) credit_count,
                    CAST(COALESCE(t.sales_count,0) AS UNSIGNED) sales_count,
                    t.next_due_date,
                    t.last_sale_at,
                    CAST(COALESCE(rp.repair_due,0) AS UNSIGNED) repair_due,
                    CAST(COALESCE(rp.repair_due_count,0) AS UNSIGNED) repair_due_count,
                    rp.repair_next_due_date,
                    CAST(COALESCE(rsv.held_count, 0) AS UNSIGNED) reservation_count,
                    CAST(COALESCE(rsv.held_total, 0) AS UNSIGNED) reservation_total,
                    CAST(COALESCE(rsv.held_paid, 0) AS UNSIGNED) reservation_paid,
                    CAST(COALESCE(rsv.held_balance, 0) AS UNSIGNED) reservation_balance
                FROM customers c JOIN branches b ON b.id=c.branch_id
                LEFT JOIN (
                    SELECT customer_id,
                        SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END) wallet_credits,
                        SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END) wallet_debits
                    FROM (SELECT l.customer_id, {$walletDelta} AS delta FROM customer_wallet_logs l) wallet_entries
                    GROUP BY customer_id
                ) w ON w.customer_id=c.id
                LEFT JOIN (SELECT customer_id, SUM(total) total, SUM(credit) credit, SUM(CASE WHEN credit > 0 THEN 1 ELSE 0 END) credit_count, MIN(CASE WHEN credit > 0 THEN due_date ELSE NULL END) next_due_date, COUNT(*) sales_count, MAX(created_at) last_sale_at FROM sales GROUP BY customer_id) t ON t.customer_id=c.id
                LEFT JOIN (
                    SELECT customer_id,
                        SUM(CASE WHEN status != 'Cancelled' AND COALESCE(NULLIF(final_charge,0), estimate, 0) > COALESCE(paid_amount, advance_paid, 0)
                            THEN COALESCE(NULLIF(final_charge,0), estimate, 0) - COALESCE(paid_amount, advance_paid, 0) ELSE 0 END) repair_due,
                        SUM(CASE WHEN status != 'Cancelled' AND COALESCE(NULLIF(final_charge,0), estimate, 0) > COALESCE(paid_amount, advance_paid, 0)
                            THEN 1 ELSE 0 END) repair_due_count,
                        MIN(CASE WHEN status != 'Cancelled' AND COALESCE(NULLIF(final_charge,0), estimate, 0) > COALESCE(paid_amount, advance_paid, 0)
                            THEN due_date ELSE NULL END) repair_next_due_date
                    FROM repairs GROUP BY customer_id
                ) rp ON rp.customer_id=c.id
                LEFT JOIN (
                    SELECT customer_id,
                        COUNT(CASE WHEN status = 'Held' THEN 1 ELSE NULL END) held_count,
                        SUM(CASE WHEN status = 'Held' THEN total ELSE 0 END) held_total,
                        SUM(CASE WHEN status = 'Held' THEN paid ELSE 0 END) held_paid,
                        SUM(CASE WHEN status = 'Held' THEN total - paid ELSE 0 END) held_balance
                    FROM reservations
                    GROUP BY customer_id
                ) rsv ON rsv.customer_id = c.id
                WHERE c.deleted_at IS NULL" . ($branch ? ' AND c.branch_id=?' : '') . ' ORDER BY COALESCE(t.sales_count,0) DESC, COALESCE(t.total,0) DESC, c.id DESC',
                $params
                );
            })(),
        'customer.ledger' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'customers', 'pos');
                return InventoryController::getCustomerLedger($branch, $_GET);
            })(),
        'reservations' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'pos', 'customers', 'inventory');
                return \Zeedat\Services\ReservationService::forBranch($branch);
            })(),
        'repairs' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'repairs', 'pos');
                return RepairController::getRepairs($branch, $user);
            })(),
        'technicians' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'repairs', 'pos');
                return RepairController::getTechnicians($branch);
            })(),
        'drafts' => (function () use ($user, $branch) {
                RoleGuard::allowPermission($user, 'pos');
                return SaleController::getDrafts($branch, $user);
            })(),
        'sales' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'sales', 'customers', 'pos');
                return SaleController::getSales($branch);
            })(),
        'invoice' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'sales', 'customers', 'pos', 'reports');
                return SaleController::getInvoice($branch, $_GET);
            })(),
        'drawer' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'drawer', 'pos');
                if (!$branch && !in_array($user['role'], ['owner', 'manager'], true))
                    throw new ApiError('Select a branch.');
                return DrawerController::getRegister($branch, $user, $_GET);
            })(),
        'cashbook' => (function () use ($user, $branch) {
                RoleGuard::allowPermission($user, 'drawer');
                if (!$branch && !in_array($user['role'], ['owner', 'manager'], true))
                    throw new ApiError('Select a branch.');
                return DrawerController::getRegister($branch, $user, $_GET);
            })(),
        'returns' => (function () use ($user, $branch) {
                RoleGuard::allowAnyPermission($user, 'returns', 'pos');
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
        'staff.lookup' => (function () use ($user) {
                RoleGuard::allowAnyPermission($user, 'pos', 'repairs', 'staff', 'reports');
                $rows = BaseRepository::rows(
                "SELECT u.id, u.name, u.role, u.branch_id, u.badge_code, COALESCE(b.name, 'All Branches') AS branch_name
                 FROM users u
                 LEFT JOIN branches b ON b.id=u.branch_id
                 WHERE COALESCE(u.active, 1)=1
                 ORDER BY u.id ASC"
                );
                foreach ($rows as &$r) {
                    $r['badge_code'] = \Zeedat\Repositories\UserRepository::formatBadgeCode((int) $r['id'], $r['badge_code'] ?? null);
                }
                return $rows;
            })(),
        'reports' => (function () use ($user, $branch) {
                RoleGuard::allowPermission($user, 'reports');
                return DashboardController::getFullReports($branch, $_GET);
            })(),
        'permissions' => (function () use ($user) {
                RoleGuard::allowPermission($user, 'staff');
                return AdminController::getPermissions();
            })(),
        'settings' => (function () use ($user) {
                RoleGuard::allowAnyPermission($user, 'settings', 'pos', 'customers', 'repairs', 'inventory', 'drawer');
                $settings = AdminController::getSettings();
                if (!\Zeedat\Repositories\PermissionRepository::userHasPermission((int) $user['id'], $user['role'], 'settings')) {
                    unset($settings['cloud_api_key'], $settings['sms_api_key']);
                }
                return $settings;
            })(),
        'branches.summary' => (function () use ($user) {
                RoleGuard::allowPermission($user, 'settings');
                return AdminController::getBranchesSummary();
            })(),
        'audit' => (function () use ($user) {
                RoleGuard::allowPermission($user, 'settings');
                return AdminController::getAudit($_GET);
            })(),
        'barcode.generate' => (function () use ($user) {
                RoleGuard::allowPermission($user, 'inventory');
                return InventoryController::generateBarcode();
            })(),
        'barcode.stats' => (function () use ($user, $branch) {
                RoleGuard::allowPermission($user, 'inventory');
                return InventoryController::getBarcodePrintStats($branch);
            })(),
        'printers' => (function () use ($user) {
                RoleGuard::allowPermission($user, 'inventory');
                return InventoryController::getInstalledPrinters();
            })(),
        'backup.summary' => (function () use ($user) {
                RoleGuard::allowPermission($user, 'settings');
                return BackupController::getSummary();
            })(),
        'backup.history' => (function () use ($user) {
                RoleGuard::allowPermission($user, 'settings');
                return BackupController::getHistory();
            })(),
        'sync.status' => \Zeedat\Services\CloudSyncService::getStatus(),
        default => throw new ApiError('Route not found.', 404),
    };

    Response::json($result);
} catch (Throwable $e) {
    Response::handleException($e);
}
