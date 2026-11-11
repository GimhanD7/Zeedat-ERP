<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\DrawerRepository;
use Zeedat\Repositories\ProductRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Helpers;
use Zeedat\Support\Validator;

class PurchaseService {
    public static function createSupplier(array $body): array {
        $name = Validator::str($body, 'name', 120);
        $phone = Validator::str($body, 'phone', 30, false);
        $id = BaseRepository::insert('INSERT INTO suppliers(name, phone, synced) VALUES (?,?,0)', [$name, $phone ?: '']);
        return ['id' => $id, 'name' => $name];
    }

    public static function receiveStock(array $user, int $branch, array $body): array {
        $supplier = Validator::integer($body['supplier_id'] ?? null, 'Supplier');
        if (!BaseRepository::scalar('SELECT id FROM suppliers WHERE id=?', [$supplier])) {
            throw new ApiError('Supplier not found.', 404);
        }

        $product = Validator::integer($body['product_id'] ?? null, 'Product');
        $p = ProductRepository::findById($product);
        if (!$p || $p['category'] === 'Services') {
            throw new ApiError('Cannot receive stock for this product.');
        }

        $invoice = Validator::str($body, 'invoice', 60);
        $unitCost = Validator::money($body, 'unit_cost');
        $qty = Validator::integer($body['qty'] ?? null, 'Quantity', 1, $p['serialized'] ? 1 : 10000);

        $purchaseId = BaseRepository::insert(
            'INSERT INTO purchases(branch_id, supplier_id, product_id, invoice, qty, unit_cost, balance, synced) VALUES (?,?,?,?,?,?,?,0)',
            [$branch, $supplier, $product, $invoice, $qty, $unitCost, $qty * $unitCost]
        );

        if ($p['serialized']) {
            $code = strtoupper(Validator::str($body, 'code', 50));
            $imei = Validator::str($body, 'imei', 60, false);
            $grade = Validator::str($body, 'grade', 20);

            BaseRepository::insert(
                "INSERT INTO units(branch_id, product_id, code, imei, grade, state, synced) VALUES (?,?,?,?,?,'Available',0)",
                [$branch, $product, $code, $imei ?: null, $grade]
            );
        }

        ProductRepository::adjustStock($branch, $product, $qty, 'Purchase receiving: ' . $invoice, Helpers::ref('PO', $purchaseId), (int) $user['id']);

        return ['id' => $purchaseId, 'balance' => $qty * $unitCost];
    }

    public static function paySupplier(array $user, int $branch, array $body): array {
        $drawer = DrawerService::openDrawer($user, $branch);
        $id = Validator::integer($body['id'] ?? null, 'Purchase invoice');
        $purchase = BaseRepository::one('SELECT * FROM purchases WHERE id=? AND branch_id=? FOR UPDATE', [$id, $branch]);
        if (!$purchase) {
            throw new ApiError('Purchase record not found.', 404);
        }

        $amount = Validator::money($body, 'amount');
        if ($amount <= 0 || $amount > (int) $purchase['balance']) {
            throw new ApiError('Payment exceeds the purchase balance.');
        }

        BaseRepository::run(
            'INSERT INTO supplier_payments(purchase_id, drawer_id, user_id, amount) VALUES (?,?,?,?)',
            [$id, $drawer['id'], $user['id'], $amount]
        );
        BaseRepository::run('UPDATE purchases SET balance=balance-?, synced=0 WHERE id=?', [$amount, $id]);

        DrawerRepository::addCashMovement(
            $user['id'],
            $drawer,
            -$amount,
            'Supplier Payment',
            Helpers::ref('PO', $id)
        );

        return ['id' => $id, 'amount' => $amount, 'balance' => (int) $purchase['balance'] - $amount];
    }

    public static function requestTransfer(array $user, int $branch, array $body): array {
        $to = Validator::integer($body['to_branch'] ?? null, 'Destination branch');
        if ($to === $branch || !BaseRepository::scalar('SELECT id FROM branches WHERE id=?', [$to])) {
            throw new ApiError('Select a valid destination branch.');
        }

        $product = Validator::integer($body['product_id'] ?? null, 'Product');
        $p = ProductRepository::findById($product);
        if (!$p || $p['category'] === 'Services') {
            throw new ApiError('Cannot transfer this product.');
        }

        $qty = Validator::integer($body['qty'] ?? null, 'Quantity', 1, $p['serialized'] ? 1 : 10000);
        $unit = null;
        if ($p['serialized']) {
            $unit = Validator::integer($body['unit_id'] ?? null, 'Device unit');
            if (!ProductRepository::findAvailableUnit($unit, $branch, $product)) {
                throw new ApiError('Selected device is not available at this branch.', 409);
            }
        }

        $id = BaseRepository::insert(
            "INSERT INTO transfers(from_branch, to_branch, product_id, unit_id, qty, status, synced) VALUES (?,?,?,?,?, 'Requested', 0)",
            [$branch, $to, $product, $unit, $qty]
        );

        return ['id' => $id, 'status' => 'Requested'];
    }

    public static function updateTransfer(array $user, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Transfer');
        $transfer = BaseRepository::one('SELECT * FROM transfers WHERE id=? FOR UPDATE', [$id]);
        if (!$transfer) {
            throw new ApiError('Transfer not found.', 404);
        }

        $next = $body['status'] ?? '';
        if (!in_array($next, ['Dispatched', 'Received', 'Rejected'], true)) {
            throw new ApiError('Invalid transfer status.');
        }

        $fromBranch = (int) $transfer['from_branch'];
        $toBranch = (int) $transfer['to_branch'];
        $actingBranch = (int) ($body['branch'] ?? 0);
        $allowedBranches = array_map('intval', $user['branch_ids'] ?? array_values(array_filter([(int) ($user['branch_id'] ?? 0)])));

        if ($next === 'Dispatched') {
            if ($transfer['status'] !== 'Requested') {
                throw new ApiError('Only requested transfers can be dispatched.');
            }
            if ($user['role'] !== 'owner' && !in_array($fromBranch, $allowedBranches, true)) {
                throw new ApiError('Only the source branch can dispatch.', 403);
            }
            if ($actingBranch !== $fromBranch) {
                throw new ApiError('Switch to the source branch to dispatch.', 403);
            }

            if ($transfer['unit_id']) {
                if (!ProductRepository::findAvailableUnit((int) $transfer['unit_id'], $fromBranch, (int) $transfer['product_id'])) {
                    throw new ApiError('Device is unavailable at source branch.', 409);
                }
                BaseRepository::run("UPDATE units SET state='In Transit', synced=0 WHERE id=?", [$transfer['unit_id']]);
            }

            ProductRepository::adjustStock($fromBranch, (int) $transfer['product_id'], -(int) $transfer['qty'], 'Transfer dispatched', Helpers::ref('ST', $id), (int) $user['id']);
            BaseRepository::run("UPDATE transfers SET status='Dispatched', synced=0 WHERE id=?", [$id]);

            return ['id' => $id, 'status' => 'Dispatched'];
        }

        if ($next === 'Received') {
            if ($transfer['status'] !== 'Dispatched') {
                throw new ApiError('Only dispatched transfers can be received.');
            }
            if ($user['role'] !== 'owner' && !in_array($toBranch, $allowedBranches, true)) {
                throw new ApiError('Only the destination branch can receive.', 403);
            }
            if ($actingBranch !== $toBranch) {
                throw new ApiError('Switch to the destination branch to receive.', 403);
            }

            if ($transfer['unit_id']) {
                BaseRepository::run("UPDATE units SET branch_id=?, state='Available', synced=0 WHERE id=?", [$toBranch, $transfer['unit_id']]);
            }

            ProductRepository::adjustStock($toBranch, (int) $transfer['product_id'], (int) $transfer['qty'], 'Transfer received', Helpers::ref('ST', $id), (int) $user['id']);
            BaseRepository::run("UPDATE transfers SET status='Received', synced=0 WHERE id=?", [$id]);

            return ['id' => $id, 'status' => 'Received'];
        }

        if ($next === 'Rejected') {
            if ($transfer['status'] !== 'Requested') {
                throw new ApiError('Only requested transfers can be rejected.');
            }
            if ($user['role'] !== 'owner' && !in_array($fromBranch, $allowedBranches, true)) {
                throw new ApiError('Only the source branch can reject.', 403);
            }

            BaseRepository::run("UPDATE transfers SET status='Rejected', synced=0 WHERE id=?", [$id]);

            return ['id' => $id, 'status' => 'Rejected'];
        }

        throw new ApiError('Invalid transition.');
    }
}
