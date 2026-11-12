<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Config\Constants;
use Zeedat\Middleware\RoleGuard;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\DrawerRepository;
use Zeedat\Repositories\ProductRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Helpers;
use Zeedat\Support\Validator;

final class ReservationService {
    public static function syncRows(bool $pending): array {
        return BaseRepository::rows(
            'SELECT r.*, b.name AS branch_name, c.sync_uuid AS customer_uuid, c.phone AS customer_phone,
                p.sku AS product_sku, u.code AS unit_code, s.sync_uuid AS sale_uuid
             FROM reservations r JOIN branches b ON b.id=r.branch_id JOIN customers c ON c.id=r.customer_id
             JOIN products p ON p.id=r.product_id LEFT JOIN units u ON u.id=r.unit_id LEFT JOIN sales s ON s.id=r.sale_id' .
            ($pending ? ' WHERE r.synced=0 ORDER BY r.id LIMIT 150' : ' ORDER BY r.id')
        );
    }

    public static function applySync(array $rows, bool $pull): array {
        $ack = [];
        foreach ($rows as $row) {
            $existing = BaseRepository::one('SELECT id, synced, version, change_token FROM reservations WHERE sync_uuid=? FOR UPDATE', [$row['sync_uuid']]);
            $version = (int) $row['version'];
            $token = (string) ($row['change_token'] ?? '');
            if ($existing && $pull && !(int) $existing['synced']) continue;
            if ($existing && !$pull && (int) $existing['version'] !== (int) $row['base_version']) {
                if ((int) $existing['version'] !== $version || $token === '' || $existing['change_token'] !== $token) {
                    throw new ApiError('A reservation was changed on another device. Its local changes are still pending.', 409);
                }
                $ack[(int) $row['id']] = $version;
                continue;
            }
            $branch = (int) BaseRepository::scalar('SELECT id FROM branches WHERE name=?', [$row['branch_name']]);
            $customer = (int) (BaseRepository::scalar('SELECT id FROM customers WHERE sync_uuid=? AND branch_id=?', [$row['customer_uuid'], $branch])
                ?: BaseRepository::scalar('SELECT id FROM customers WHERE phone=? AND branch_id=? AND deleted_at IS NULL', [$row['customer_phone'], $branch]));
            $product = (int) BaseRepository::scalar('SELECT id FROM products WHERE sku=?', [$row['product_sku']]);
            $unit = empty($row['unit_code']) ? null : (int) BaseRepository::scalar('SELECT id FROM units WHERE code=?', [$row['unit_code']]);
            $sale = empty($row['sale_uuid']) ? null : (int) BaseRepository::scalar('SELECT id FROM sales WHERE sync_uuid=?', [$row['sale_uuid']]);
            if (!$branch || !$customer || !$product || $unit === 0 || ($row['status'] === 'Delivered' && !$sale)) {
                continue;
            }
            if (!$pull && !$existing && $row['status'] === 'Held') {
                if ($unit && !ProductRepository::findAvailableUnit($unit, $branch, $product)) {
                    throw new ApiError('A reserved device is unavailable on the server. The reservation is still pending.', 409);
                }
                ProductRepository::assertStockAvailable($branch, $product, (int) $row['qty']);
            }
            if ($existing) {
                BaseRepository::run('UPDATE reservations SET paid=?, status=?, sale_id=?, version=?, base_version=?, change_token=?, synced=1 WHERE id=?',
                    [$row['paid'], $row['status'], $sale, $version, $version, $token, $existing['id']]);
            } else {
                BaseRepository::run(
                    'INSERT INTO reservations(sync_uuid, branch_id, customer_id, product_id, unit_id, qty, unit_price, tax_bps, total, paid, status, sale_id, version, base_version, change_token, created_at, synced)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)',
                    [$row['sync_uuid'], $branch, $customer, $product, $unit, $row['qty'], $row['unit_price'], $row['tax_bps'], $row['total'],
                        $row['paid'], $row['status'], $sale, $version, $version, $token, $row['created_at']]
                );
            }
            $ack[(int) $row['id']] = $version;
        }
        return $ack;
    }

    public static function forCustomer(int $customer): array {
        return BaseRepository::rows(
            'SELECT r.*, p.name AS product, u.code AS unit_code FROM reservations r JOIN products p ON p.id=r.product_id
             LEFT JOIN units u ON u.id=r.unit_id WHERE r.customer_id=? ORDER BY r.id DESC', [$customer]
        );
    }

    public static function save(array $user, int $branch, array $body, string $action): array {
        RoleGuard::allow($user, 'owner', 'manager', 'cashier');
        return BaseRepository::transaction(function () use ($user, $branch, $body, $action) {
            $drawer = DrawerService::openDrawer($user, $branch);
            if ($action === 'reservation.create') {
                $id = self::create($branch, $body);
            } else {
                $id = Validator::integer($body['id'] ?? null, 'Reservation');
            }
            $hold = BaseRepository::one("SELECT * FROM reservations WHERE id=? AND branch_id=? AND status='Held' FOR UPDATE", [$id, $branch]);
            if (!$hold) {
                throw new ApiError('This reservation is unavailable.', 409);
            }
            $reference = Helpers::ref('RSV', $id);
            $customer = (int) $hold['customer_id'];
            $paid = (int) $hold['paid'];
            $token = bin2hex(random_bytes(16));

            if ($action === 'reservation.deliver') {
                if ($paid !== (int) $hold['total']) {
                    throw new ApiError('Collect the remaining balance before handing over the item.', 409);
                }
                BaseRepository::run("UPDATE reservations SET status='Delivered', version=version+1, change_token=?, synced=0 WHERE id=?", [$token, $id]);
                $invoice = CheckoutService::checkout($user, $branch, [
                    'customer_id' => $customer,
                    'items' => [['product_id' => $hold['product_id'], 'unit_id' => $hold['unit_id'], 'qty' => $hold['qty']]],
                    'expected_total' => $hold['total'],
                    'notes' => 'Reservation ' . $reference,
                ], $hold);
                BaseRepository::run('UPDATE reservations SET sale_id=? WHERE id=?', [$invoice['id'], $id]);
                return ['id' => $id, 'status' => 'Delivered', 'invoice' => $invoice];
            }

            if ($action === 'reservation.cancel') {
                RoleGuard::allow($user, 'owner', 'manager');
                if ($paid > 0) {
                    BaseRepository::run('UPDATE customers SET wallet_balance=wallet_balance+?, synced=0 WHERE id=?', [$paid, $customer]);
                    CustomerWallet::entry($user, $branch, $customer, $paid, 'Reservation refund', 'Wallet', $reference);
                }
                BaseRepository::run("UPDATE reservations SET status='Cancelled', version=version+1, change_token=?, synced=0 WHERE id=?", [$token, $id]);
                return ['id' => $id, 'status' => 'Cancelled'];
            }

            $amount = Validator::money($body, 'amount');
            if ($amount <= 0 || $amount > (int) $hold['total'] - $paid) {
                throw new ApiError('Enter a payment greater than zero and within the remaining balance.');
            }
            $method = (string) ($body['method'] ?? 'Cash');
            if ($method !== 'Wallet' && !in_array($method, Constants::TENDERS, true)) {
                throw new ApiError('Invalid payment method.');
            }
            if ($method === 'Cash') {
                DrawerRepository::addCashMovement((int) $user['id'], $drawer, $amount, 'Reservation deposit', $reference);
            }
            CustomerWallet::recordAppliedPayment($user, $branch, $customer, $amount, 'Reservation deposit', $method, $reference);
            BaseRepository::run('UPDATE reservations SET paid=paid+?, version=version+1, change_token=?, synced=0 WHERE id=?', [$amount, $token, $id]);
            return ['id' => $id, 'status' => 'Held', 'paid' => $paid + $amount, 'balance' => (int) $hold['total'] - $paid - $amount];
        });
    }

    private static function create(int $branch, array $body): int {
        $customer = Validator::integer($body['customer_id'] ?? null, 'Customer');
        if (!BaseRepository::scalar('SELECT id FROM customers WHERE id=? AND branch_id=? AND deleted_at IS NULL FOR UPDATE', [$customer, $branch])) {
            throw new ApiError('Customer not found in this branch.', 404);
        }
        $product = BaseRepository::one('SELECT * FROM products WHERE id=? FOR UPDATE', [Validator::integer($body['product_id'] ?? null, 'Product')]);
        if (!$product || !(int) $product['active'] || $product['category'] === 'Services') {
            throw new ApiError('Select an active stock item.');
        }
        $productId = (int) $product['id'];
        $qty = Validator::integer($body['qty'] ?? 1, 'Quantity', 1, 1000);
        $unit = null;
        if ($product['serialized']) {
            $unit = Validator::integer($body['unit_id'] ?? null, 'Device unit');
            if ($qty !== 1 || !ProductRepository::findAvailableUnit($unit, $branch, $productId)) {
                throw new ApiError('Select one available device unit.', 409);
            }
        }
        ProductRepository::assertStockAvailable($branch, $productId, $qty);
        $tax = (int) BaseRepository::scalar('SELECT tax_bps FROM settings WHERE id=1');
        $subtotal = (int) $product['price'] * $qty;
        return BaseRepository::insert(
            'INSERT INTO reservations(sync_uuid, branch_id, customer_id, product_id, unit_id, qty, unit_price, tax_bps, total) VALUES (?,?,?,?,?,?,?,?,?)',
            ['RSV-' . bin2hex(random_bytes(16)), $branch, $customer, $productId, $unit, $qty, $product['price'], $tax, $subtotal + Helpers::rate($subtotal, $tax)]
        );
    }
}
