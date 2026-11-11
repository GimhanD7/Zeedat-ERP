<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Config\Constants;
use Zeedat\Middleware\RoleGuard;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\DrawerRepository;
use Zeedat\Repositories\ProductRepository;
use Zeedat\Repositories\SaleRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Helpers;
use Zeedat\Support\Validator;

class CheckoutService {
    public static function checkout(array $user, int $branch, array $body): array {
        $drawer = DrawerService::openDrawer($user, $branch);
        $lines = $body['items'] ?? null;
        if (!is_array($lines) || !$lines || count($lines) > 100) {
            throw new ApiError('Add between 1 and 100 lines to the bill.');
        }

        $customer = !empty($body['customer_id'])
            ? (int) BaseRepository::scalar('SELECT id FROM customers WHERE id=? AND branch_id=?', [$body['customer_id'], $branch])
            : null;

        $draft = empty($body['draft_id']) ? null : Validator::integer($body['draft_id'], 'Draft');
        if ($draft && !BaseRepository::scalar('SELECT id FROM drafts WHERE id=? AND branch_id=? AND user_id=? FOR UPDATE', [$draft, $branch, $user['id']])) {
            throw new ApiError('The held bill was already used or removed.', 409);
        }

        $subtotal = 0;
        $items = [];
        $claimed = [];

        foreach ($lines as $line) {
            if (!is_array($line)) throw new ApiError('Invalid bill line.');
            $product = Validator::integer($line['product_id'] ?? null, 'Product');
            $qty = Validator::integer($line['qty'] ?? null, 'Quantity', 1, 1000);
            $p = ProductRepository::findById($product);
            if (!$p) throw new ApiError('Product is unavailable.', 404);

            $unit = null;
            if ($p['serialized']) {
                $unit = Validator::integer($line['unit_id'] ?? null, 'Device unit');
                if ($qty !== 1 || isset($claimed[$unit]) || !ProductRepository::findAvailableUnit($unit, $branch, $product)) {
                    throw new ApiError('The selected device is unavailable.', 409);
                }
                $claimed[$unit] = true;
            }

            $extended = (int) $p['price'] * $qty;
            $subtotal += $extended;
            $items[] = [$p, $qty, $unit, $extended];
        }

        if ($subtotal > 99999999999) throw new ApiError('Bill exceeds the transaction limit.');

        $discountBps = Validator::integer($body['discount_bps'] ?? 0, 'Discount', 0, $user['role'] === 'cashier' ? 500 : 10000);
        $discount = Helpers::rate($subtotal, $discountBps);
        $taxBps = (int) BaseRepository::scalar('SELECT tax_bps FROM settings WHERE id=1');
        $tax = Helpers::rate($subtotal - $discount, $taxBps);
        $total = $subtotal - $discount + $tax;

        if ($total !== Validator::money($body, 'expected_total')) {
            throw new ApiError('Prices changed. Refresh the bill before completing it.', 409);
        }

        $tenders = $body['payments'] ?? [];
        if (!is_array($tenders) || count($tenders) > 4) throw new ApiError('Invalid payment details.');

        $paid = 0;
        $cashReceived = 0;
        $payments = [];

        foreach ($tenders as $tender) {
            if (!is_array($tender)) throw new ApiError('Invalid payment.');
            $method = $tender['method'] ?? '';
            if (!in_array($method, Constants::TENDERS, true)) throw new ApiError('Invalid payment method.');
            if (isset($payments[$method])) throw new ApiError('Use one entry per payment method.');

            $amount = Validator::money($tender, 'amount');
            if ($amount <= 0) throw new ApiError('Payment amount must be greater than zero.');

            $ref = $method === 'Cash' ? null : Validator::str($tender, 'reference', 100, true);
            $payments[$method] = [$amount, $ref];
            $paid += $amount;
            if ($method === 'Cash') $cashReceived = $amount;
        }

        $change = max(0, $paid - $total);
        if ($change > $cashReceived) throw new ApiError('Non-cash tender exceeds the total.');
        if ($change) $payments['Cash'][0] -= $change;

        $credit = max(0, $total - $paid);
        $due = null;
        if ($credit) {
            RoleGuard::allow($user, 'owner', 'manager');
            if (!$customer || empty($body['allow_credit'])) {
                throw new ApiError('Confirm credit and select a customer for the remaining balance.');
            }
            $due = Validator::date($body, 'due_date', true);
        }

        $syncUuid = 'SL-' . bin2hex(random_bytes(10));
        if (\Zeedat\Config\Database::isSqlite()) {
            $id = BaseRepository::insert(
                'INSERT INTO sales(uuid, sync_uuid, synced, branch_id, user_id, drawer_id, customer_id, subtotal, discount, tax, total, credit, due_date) VALUES (?,?,0,?,?,?,?,?,?,?,?,?,?)',
                [$syncUuid, $syncUuid, $branch, $user['id'], $drawer['id'], $customer, $subtotal, $discount, $tax, $total, $credit, $due]
            );
        } else {
            $id = BaseRepository::insert(
                'INSERT INTO sales(sync_uuid, synced, branch_id, user_id, drawer_id, customer_id, subtotal, discount, tax, total, credit, due_date) VALUES (?,0,?,?,?,?,?,?,?,?,?,?)',
                [$syncUuid, $branch, $user['id'], $drawer['id'], $customer, $subtotal, $discount, $tax, $total, $credit, $due]
            );
        }

        $processed = 0;
        $allocated = 0;
        foreach ($items as [$p, $qty, $unit, $extended]) {
            $processed += $extended;
            $cumulative = $subtotal ? (int) bcdiv(bcmul((string) $processed, (string) $total, 0), (string) $subtotal, 0) : 0;
            $lineTotal = $cumulative - $allocated;
            $commType = (string) ($p['commission_type'] ?? 'fixed');
            $commVal = (int) ($p['commission_value'] ?? 0);
            $lineCommission = $commType === 'percent'
                ? Helpers::rate($lineTotal, $commVal)
                : $commVal * $qty;

            if ($unit) BaseRepository::run("UPDATE units SET state='Sold' WHERE id=?", [$unit]);
            if ($p['category'] !== 'Services') {
                ProductRepository::adjustStock($branch, $p['id'], -$qty, 'Sale', Helpers::ref('INV', $id), (int) $user['id']);
            }
            BaseRepository::run(
                'INSERT INTO sale_items(sale_id, product_id, unit_id, name, qty, price, total, commission_amount) VALUES (?,?,?,?,?,?,?,?)',
                [$id, $p['id'], $unit, $p['name'], $qty, $p['price'], $lineTotal, $lineCommission]
            );
            $allocated = $cumulative;
        }

        foreach ($payments as $method => [$amount, $reference]) {
            if ($amount) {
                self::salePayment($user, $drawer, $id, $amount, $method, $reference, 'Sale');
            }
        }

        if ($draft) BaseRepository::run('DELETE FROM drafts WHERE id=?', [$draft]);

        $invoice = SaleRepository::invoiceDetails($id, $branch);
        $invoice['change'] = $change;
        return $invoice;
    }

    public static function creditPayment(array $user, int $branch, array $body): array {
        $drawer = DrawerService::openDrawer($user, $branch);
        $invoiceNo = $body['invoice'] ?? '';
        $id = (int) preg_replace('/\D/', '', (string) $invoiceNo);
        $sale = BaseRepository::one('SELECT id, credit FROM sales WHERE id=? AND branch_id=? FOR UPDATE', [$id, $branch]);
        if (!$sale) throw new ApiError('Invoice not found.', 404);

        $amount = Validator::money($body, 'amount');
        if ($amount <= 0 || $amount > $sale['credit']) throw new ApiError('Payment exceeds the credit balance.');

        $method = $body['method'] ?? '';
        if (!in_array($method, Constants::TENDERS, true)) throw new ApiError('Invalid payment method.');
        $ref = $method === 'Cash' ? null : Validator::str($body, 'reference', 100, true);

        self::salePayment($user, $drawer, $sale['id'], $amount, $method, $ref, 'Credit');
        BaseRepository::run('UPDATE sales SET credit=credit-? WHERE id=?', [$amount, $sale['id']]);

        return SaleRepository::invoiceDetails($sale['id'], $branch);
    }

    public static function salePayment(array $user, array $drawer, int $saleId, int $amount, string $method, ?string $reference, string $kind): void {
        BaseRepository::run(
            'INSERT INTO payments(sale_id, drawer_id, user_id, kind, method, amount, reference) VALUES (?,?,?,?,?,?,?)',
            [$saleId, $drawer['id'], $user['id'], $kind, $method, $amount, $reference]
        );
        if ($method === 'Cash') {
            DrawerRepository::addCashMovement(
                $user['id'],
                $drawer,
                $amount,
                $kind === 'Sale' ? 'Cash Sale' : 'Credit Collection',
                Helpers::ref('INV', $saleId)
            );
        }
    }
}
