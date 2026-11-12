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

        $customerRow = !empty($body['customer_id'])
            ? BaseRepository::one('SELECT id, name, phone, COALESCE(wallet_balance, 0) AS wallet_balance, COALESCE(loyalty_points, 0) AS loyalty_points FROM customers WHERE id=? AND branch_id=? FOR UPDATE', [$body['customer_id'], $branch])
            : null;
        $customer = $customerRow ? (int) $customerRow['id'] : null;

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

        $discountType = ($body['discount_type'] ?? 'percent') === 'fixed' ? 'fixed' : 'percent';
        if ($discountType === 'fixed') {
            $maxFixed = $user['role'] === 'cashier' ? Helpers::rate($subtotal, 500) : $subtotal;
            $discount = Validator::money($body, 'discount_amount');
            if ($discount > $maxFixed) {
                throw new ApiError(
                    $user['role'] === 'cashier'
                        ? 'Cashier discount cannot exceed 5% of the bill subtotal (' . number_format($maxFixed / 100, 2) . ' LKR).'
                        : 'Discount cannot exceed the bill subtotal.'
                );
            }
            $discountBps = $subtotal > 0 ? min(10000, (int) round(($discount * 10000) / $subtotal)) : 0;
        } else {
            $discountBps = Validator::integer($body['discount_bps'] ?? 0, 'Discount', 0, $user['role'] === 'cashier' ? 500 : 10000);
            $discount = Helpers::rate($subtotal, $discountBps);
        }

        $taxBps = (int) BaseRepository::scalar('SELECT tax_bps FROM settings WHERE id=1');
        $tax = Helpers::rate($subtotal - $discount, $taxBps);
        $total = $subtotal - $discount + $tax;

        if ($total !== Validator::money($body, 'expected_total')) {
            throw new ApiError('Prices changed. Refresh the bill before completing it.', 409);
        }

        $staffId = !empty($body['staff_id']) ? Validator::integer($body['staff_id'], 'Staff ID') : (int) $user['id'];
        $commissionUser = BaseRepository::one('SELECT id, name, role FROM users WHERE id=? AND active=1', [$staffId]);
        if (!$commissionUser) {
            throw new ApiError("Staff User ID #{$staffId} was not found or is inactive.", 404);
        }
        $commissionUserId = (int) $commissionUser['id'];

        $tenders = $body['payments'] ?? [];
        if (!is_array($tenders) || count($tenders) > 4) throw new ApiError('Invalid payment details.');

        $walletUsed = Validator::integer($body['wallet_amount'] ?? 0, 'Wallet amount', 0);
        if ($walletUsed > 0) {
            if (!$customer || !$customerRow) {
                throw new ApiError('Select a registered customer to pay using wallet balance.');
            }
            if ($walletUsed > (int) $customerRow['wallet_balance']) {
                throw new ApiError('Payment exceeds the customer wallet balance.');
            }
            if ($walletUsed > $total) {
                throw new ApiError('Wallet payment cannot exceed the bill total.');
            }
        }

        $paid = $walletUsed;
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

        $notes = Validator::str($body, 'notes', 500, false) ?: '';
        $methodLabels = array_keys($payments);
        if ($walletUsed > 0) {
            array_unshift($methodLabels, 'Wallet');
        }
        $paymentMethods = !empty($methodLabels) ? implode(' + ', $methodLabels) : ($credit ? 'Credit' : 'Cash');
        $prefixRaw = trim((string) (BaseRepository::scalar('SELECT invoice_prefix FROM settings WHERE id=1') ?: 'INV-'));
        $prefixCode = rtrim($prefixRaw, '-') ?: 'INV';

        // 1 Rupee (100 cents) = 1 Loyalty Point earned on settled bill value
        $pointsEarned = $customer ? intdiv(max(0, $total - $credit), 100) : 0;

        $syncUuid = 'SL-' . bin2hex(random_bytes(10));
        if (\Zeedat\Config\Database::isSqlite()) {
            $id = BaseRepository::insert(
                'INSERT INTO sales(uuid, sync_uuid, synced, branch_id, user_id, commission_user_id, drawer_id, customer_id, subtotal, discount, discount_type, discount_bps, tax, tax_bps, total, paid_amount, cash_tendered, change_amount, payment_methods, credit, due_date, notes, wallet_used, points_earned) VALUES (?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [$syncUuid, $syncUuid, $branch, $user['id'], $commissionUserId, $drawer['id'], $customer, $subtotal, $discount, $discountType, $discountBps, $tax, $taxBps, $total, $paid, $cashReceived, $change, $paymentMethods, $credit, $due, $notes, $walletUsed, $pointsEarned]
            );
        } else {
            $id = BaseRepository::insert(
                'INSERT INTO sales(sync_uuid, synced, branch_id, user_id, commission_user_id, drawer_id, customer_id, subtotal, discount, discount_type, discount_bps, tax, tax_bps, total, paid_amount, cash_tendered, change_amount, payment_methods, credit, due_date, notes, wallet_used, points_earned) VALUES (?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [$syncUuid, $branch, $user['id'], $commissionUserId, $drawer['id'], $customer, $subtotal, $discount, $discountType, $discountBps, $tax, $taxBps, $total, $paid, $cashReceived, $change, $paymentMethods, $credit, $due, $notes, $walletUsed, $pointsEarned]
            );
        }
        $invoiceNo = Helpers::ref($prefixCode, $id);
        BaseRepository::run('UPDATE sales SET invoice_no=? WHERE id=?', [$invoiceNo, $id]);

        if ($customer && ($walletUsed > 0 || $pointsEarned > 0)) {
            BaseRepository::run(
                'UPDATE customers SET wallet_balance = COALESCE(wallet_balance, 0) - ?, loyalty_points = COALESCE(loyalty_points, 0) + ?, synced=0 WHERE id=?',
                [$walletUsed, $pointsEarned, $customer]
            );
            BaseRepository::run(
                'INSERT INTO customer_wallet_logs(branch_id, customer_id, user_id, sale_id, amount, points_delta, kind, method, reference) VALUES (?,?,?,?,?,?,?,?,?)',
                [$branch, $customer, (int) $user['id'], $id, -$walletUsed, $pointsEarned, $walletUsed > 0 ? 'POS Wallet + Points' : 'POS Points', $paymentMethods, $invoiceNo]
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

            if ($unit) BaseRepository::run("UPDATE units SET state='Sold', synced=0 WHERE id=?", [$unit]);
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
        $sale = BaseRepository::one('SELECT id, credit, customer_id FROM sales WHERE id=? AND branch_id=? FOR UPDATE', [$id, $branch]);
        if (!$sale) throw new ApiError('Invoice not found.', 404);

        $amount = Validator::money($body, 'amount');
        if ($amount <= 0 || $amount > $sale['credit']) throw new ApiError('Payment exceeds the credit balance.');

        $method = $body['method'] ?? '';
        if (!in_array($method, Constants::TENDERS, true)) throw new ApiError('Invalid payment method.');
        $ref = $method === 'Cash' ? null : Validator::str($body, 'reference', 100, true);

        self::salePayment($user, $drawer, $sale['id'], $amount, $method, $ref, 'Credit');
        $cashAdd = $method === 'Cash' ? $amount : 0;
        $creditPoints = !empty($sale['customer_id']) ? intdiv($amount, 100) : 0;
        BaseRepository::run(
            "UPDATE sales SET credit=credit-?, paid_amount=COALESCE(paid_amount,0)+?, cash_tendered=COALESCE(cash_tendered,0)+?, points_earned=COALESCE(points_earned,0)+?, payment_methods=CASE WHEN COALESCE(payment_methods,'') IN ('','Credit') THEN ? WHEN INSTR(payment_methods, ?) > 0 THEN payment_methods ELSE CONCAT(payment_methods, ' + ', ?) END, synced=0 WHERE id=?",
            [$amount, $amount, $cashAdd, $creditPoints, $method, $method, $method, $sale['id']]
        );
        if (!empty($sale['customer_id']) && $creditPoints > 0) {
            BaseRepository::run(
                'UPDATE customers SET loyalty_points = COALESCE(loyalty_points, 0) + ?, synced=0 WHERE id=?',
                [$creditPoints, (int) $sale['customer_id']]
            );
        }

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
