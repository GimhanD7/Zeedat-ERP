<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Config\Constants;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\DrawerRepository;
use Zeedat\Repositories\ProductRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Helpers;
use Zeedat\Support\Validator;

class ReturnService
{
    public static function refundAmount(int $total, int $qty, int $refunded, int $delta): int
    {
        $prior = (int) bcdiv(bcmul((string) $total, (string) $refunded, 0), (string) $qty, 0);
        $next = (int) bcdiv(bcmul((string) $total, (string) ($refunded + $delta), 0), (string) $qty, 0);
        return $next - $prior;
    }

    public static function request(int $branch, array $body): array
    {
        $item = Validator::integer($body['item_id'] ?? null, 'Invoice line');
        $line = BaseRepository::one(
            'SELECT i.*, s.credit, p.category FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN products p ON p.id=i.product_id WHERE i.id=? AND s.branch_id=? FOR UPDATE',
            [$item, $branch]
        );
        if (!$line) {
            throw new ApiError('Invoice line not found.', 404);
        }
        if ($line['credit']) {
            throw new ApiError('Resolve the outstanding invoice credit before requesting a refund.');
        }

        $qty = Validator::integer($body['qty'] ?? null, 'Return quantity', 1, $line['qty']);
        if (BaseRepository::scalar("SELECT id FROM returns_log WHERE sale_item_id=? AND status='Pending' LIMIT 1", [$item])) {
            throw new ApiError('Review the existing pending request for this line first.', 409);
        }
        if ($qty + $line['refunded_qty'] > $line['qty']) {
            throw new ApiError('Quantity exceeds the available return balance.', 409);
        }

        $method = $body['method'] ?? '';
        if (!in_array($method, Constants::TENDERS, true)) {
            throw new ApiError('Invalid payment method.');
        }
        if (!BaseRepository::scalar(
            "SELECT pm.id FROM payments pm
             LEFT JOIN exchanges x ON x.replacement_sale_id=pm.sale_id
             LEFT JOIN returns_log r ON r.id=x.return_id
             WHERE pm.sale_id=? AND (pm.method=? OR (pm.method='Exchange Credit' AND r.method=?)) LIMIT 1",
            [$line['sale_id'], $method, $method]
        )) {
            throw new ApiError('Select a payment method used on the original invoice.');
        }

        $amount = self::refundAmount((int) $line['total'], (int) $line['qty'], (int) $line['refunded_qty'], $qty);
        $restock = !empty($body['restock']) && !$line['unit_id'] && $line['category'] !== 'Services';

        $id = BaseRepository::insert(
            'INSERT INTO returns_log(branch_id, sale_item_id, qty, reason, condition_note, restock, amount, method) VALUES (?,?,?,?,?,?,?,?)',
            [$branch, $item, $qty, Validator::str($body, 'reason', 500), Validator::str($body, 'condition_note', 100), $restock ? 1 : 0, $amount, $method]
        );

        if (!empty($body['replacement_product_id'])) {
            $addons = $body['addons'] ?? [];
            if (!is_array($addons) || count($addons) > 99) {
                throw new ApiError('Add at most 99 extra items.');
            }
            $items = self::exchangeItems($branch, [
                ['product_id' => $body['replacement_product_id'], 'unit_id' => $body['replacement_unit_id'] ?? null,
                    'qty' => $body['replacement_qty'] ?? 1],
                ...array_values($addons),
            ]);
            $replacement = array_shift($items);
            $extraItems = $items;
            BaseRepository::run(
                'INSERT INTO exchanges(return_id, product_id, unit_id, qty, quoted_total) VALUES (?,?,?,?,?)',
                [$id, $replacement['product_id'], $replacement['unit_id'], $replacement['qty'], $replacement['total'] + array_sum(array_column($extraItems, 'total'))]
            );
            foreach ($extraItems as $index => $extra) {
                BaseRepository::run('INSERT INTO exchange_addons(return_id,line_no,product_id,unit_id,qty) VALUES (?,?,?,?,?)',
                    [$id, $index + 1, $extra['product_id'], $extra['unit_id'], $extra['qty']]);
            }
        }

        return ['id' => $id, 'amount' => $amount, 'status' => 'Pending'];
    }

    private static function exchangeItems(int $branch, array $lines): array
    {
        $taxRate = (int) BaseRepository::scalar('SELECT tax_bps FROM settings WHERE id=1');
        $items = [];
        $quantities = [];
        $units = [];
        foreach ($lines as $line) {
            if (!is_array($line)) throw new ApiError('Invalid exchange item.');
            $productId = Validator::integer($line['product_id'] ?? null, 'Exchange product');
            $product = ProductRepository::findById($productId);
            if (!$product || !$product['active'] || $product['category'] === 'Services') {
                throw new ApiError('Choose an available stock item.');
            }
            $qty = Validator::integer($line['qty'] ?? null, 'Exchange quantity', 1, $product['serialized'] ? 1 : 1000);
            $unit = null;
            if ($product['serialized']) {
                $unit = Validator::integer($line['unit_id'] ?? null, 'Exchange device');
                if (isset($units[$unit]) || !ProductRepository::findAvailableUnit($unit, $branch, $productId)) {
                    throw new ApiError('The selected device is unavailable or already on the exchange.', 409);
                }
                $units[$unit] = true;
            }
            $quantities[$productId] = ($quantities[$productId] ?? 0) + $qty;
            $subtotal = (int) $product['price'] * $qty;
            $items[] = [
                'product_id' => $productId, 'unit_id' => $unit, 'qty' => $qty,
                'name' => $product['name'], 'price' => (int) $product['price'],
                'subtotal' => $subtotal, 'total' => $subtotal + Helpers::rate($subtotal, $taxRate),
            ];
        }
        foreach ($quantities as $productId => $qty) {
            ProductRepository::assertStockAvailable($branch, $productId, $qty);
        }
        return $items;
    }

    private static function exchangePayments(array $body, int $due): array
    {
        $tenders = $body['payments'] ?? [['method' => 'Cash', 'amount' => $body['cash_received'] ?? $due]];
        if (!is_array($tenders) || count($tenders) > count(Constants::TENDERS)) {
            throw new ApiError('Invalid exchange payments.');
        }

        $payments = [];
        foreach ($tenders as $tender) {
            $method = is_array($tender) ? ($tender['method'] ?? '') : '';
            if (!in_array($method, Constants::TENDERS, true) || isset($payments[$method])) {
                throw new ApiError('Use one entry per supported payment method.');
            }
            $amount = Validator::money($tender, 'amount');
            if ($amount <= 0) throw new ApiError('Payment amount must be greater than zero.');
            $payments[$method] = [
                'method' => $method,
                'amount' => $amount,
                'reference' => $method === 'Cash' ? null : Validator::str($tender, 'reference', 100),
            ];
        }
        $paid = array_sum(array_column($payments, 'amount'));
        $cashReceived = $payments['Cash']['amount'] ?? 0;
        if ($paid < $due) throw new ApiError('Payments must cover the exchange difference.');
        $change = $paid - $due;
        if ($change > $cashReceived) throw new ApiError('Non-cash payments exceed the exchange difference.');
        if ($change) $payments['Cash']['amount'] -= $change;
        return [array_values(array_filter($payments, static fn($payment) => $payment['amount'] > 0)), $cashReceived, $change];
    }

    public static function resolve(array $user, int $branch, array $body): array
    {
        if (!in_array($user['role'], ['owner', 'manager', 'cashier'], true)) {
            throw new ApiError('A cashier or manager must process a return.', 403);
        }
        if ($user['role'] === 'cashier') DrawerService::openDrawer($user, $branch);
        $id = Validator::integer($body['id'] ?? null, 'Return request');
        $row = BaseRepository::one(
            'SELECT r.*, si.sale_id, si.product_id, si.unit_id, si.name product, s.customer_id, s.branch_id,
                    x.product_id replacement_product_id, x.unit_id replacement_unit_id, x.qty replacement_qty, x.quoted_total
            FROM returns_log r
            JOIN sale_items si ON si.id=r.sale_item_id
            JOIN sales s ON s.id=si.sale_id
            LEFT JOIN exchanges x ON x.return_id=r.id
            WHERE r.id=? AND r.branch_id=? FOR UPDATE',
            [$id, $branch]
        );
        if (!$row || $row['status'] !== 'Pending') {
            throw new ApiError('Pending return request not found.', 404);
        }

        $decision = $body['decision'] ?? '';
        if (!in_array($decision, ['Completed', 'Rejected'], true)) {
            throw new ApiError('Invalid decision.');
        }

        if ($decision === 'Rejected') {
            BaseRepository::run("UPDATE returns_log SET status='Rejected', synced=0 WHERE id=?", [$id]);
            return ['id' => $id, 'status' => 'Rejected'];
        }
        $line = BaseRepository::one(
            'SELECT i.qty, i.refunded_qty, s.credit FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE i.id=? FOR UPDATE',
            [$row['sale_item_id']]
        );
        if (!$line || (int) $line['credit'] > 0 || (int) $line['refunded_qty'] + (int) $row['qty'] > (int) $line['qty']) {
            throw new ApiError('The invoice balance changed. Review this return request.', 409);
        }

        $drawer = null;
        if ($row['method'] === 'Cash' || $row['replacement_product_id']) {
            $drawer = DrawerService::openDrawer($user, $branch);
        }

        $needsRefund = !$row['replacement_product_id'] || (int) $row['quoted_total'] < (int) $row['amount'];
        $reference = $needsRefund && $row['method'] !== 'Cash'
            ? Validator::str($body, 'reference', 100)
            : null;

        if ($row['unit_id']) {
            BaseRepository::run("UPDATE units SET state='Inspection', synced=0 WHERE id=?", [$row['unit_id']]);
        } elseif ($row['restock']) {
            ProductRepository::adjustStock($branch, (int) $row['product_id'], (int) $row['qty'], 'Return restock', Helpers::ref('RET', $id), (int) $user['id']);
        }

        BaseRepository::run('UPDATE sale_items SET refunded_qty=refunded_qty+? WHERE id=?', [$row['qty'], $row['sale_item_id']]);

        $items = [];
        $payments = [];
        $replacementSaleId = null;
        $diff = null;
        $cashReceived = 0;
        $change = 0;
        if ($row['replacement_product_id']) {
            $items = self::exchangeItems($branch, [
                ['product_id' => $row['replacement_product_id'], 'unit_id' => $row['replacement_unit_id'], 'qty' => $row['replacement_qty']],
                ...BaseRepository::rows('SELECT product_id,unit_id,qty FROM exchange_addons WHERE return_id=? ORDER BY line_no', [$id]),
            ]);
            $taxRate = (int) BaseRepository::scalar('SELECT tax_bps FROM settings WHERE id=1');
            $lineSubtotal = array_sum(array_column($items, 'subtotal'));
            $total = array_sum(array_column($items, 'total'));
            $lineTax = $total - $lineSubtotal;
            if ($total !== (int) $row['quoted_total']) {
                throw new ApiError('The exchange price changed. Reject this request and create a new exchange.', 409);
            }

            $diff = $total - (int) $row['amount'];
            if ($diff < 0 && $row['method'] === 'Cash' && -$diff > $drawer['expected']) {
                throw new ApiError('The drawer does not have enough cash for the exchange refund.', 409);
            }
            $exchangeCredit = min($total, (int) $row['amount']);
            if ($diff > 0) {
                [$payments, $cashReceived, $change] = self::exchangePayments($body, $diff);
            }
            $settlement = $payments;
            if ($exchangeCredit > 0) {
                array_unshift($settlement, ['method' => 'Exchange Credit', 'amount' => $exchangeCredit, 'reference' => Helpers::ref('RET', $id)]);
            }
            $methods = implode(' + ', array_column($settlement, 'method'));
            $repUuid = 'SL-' . bin2hex(random_bytes(10));
            $prefixRaw = trim((string) (BaseRepository::scalar('SELECT invoice_prefix FROM settings WHERE id=1') ?: 'INV-'));
            $prefixCode = rtrim($prefixRaw, '-') ?: 'INV';
            if (\Zeedat\Config\Database::isSqlite()) {
                $replacementSaleId = BaseRepository::insert(
                    'INSERT INTO sales(uuid, sync_uuid, branch_id, user_id, drawer_id, customer_id, subtotal, discount, discount_bps, tax, tax_bps, total, paid_amount, cash_tendered, change_amount, payment_methods, credit, synced) VALUES (?,?,?,?,?,?,?,0,0,?,?,?,?,?,?,?,0,0)',
                    [$repUuid, $repUuid, $branch, $user['id'], $drawer['id'], $row['customer_id'], $lineSubtotal, $lineTax, $taxRate, $total, $total, $cashReceived, $change, $methods]
                );
            } else {
                $replacementSaleId = BaseRepository::insert(
                    'INSERT INTO sales(sync_uuid, branch_id, user_id, drawer_id, customer_id, subtotal, discount, discount_bps, tax, tax_bps, total, paid_amount, cash_tendered, change_amount, payment_methods, credit, synced) VALUES (?,?,?,?,?,?,0,0,?,?,?,?,?,?,?,0,0)',
                    [$repUuid, $branch, $user['id'], $drawer['id'], $row['customer_id'], $lineSubtotal, $lineTax, $taxRate, $total, $total, $cashReceived, $change, $methods]
                );
            }
            $invoiceNo = Helpers::ref($prefixCode, $replacementSaleId);
            BaseRepository::run('UPDATE sales SET invoice_no=? WHERE id=?', [$invoiceNo, $replacementSaleId]);
            foreach ($items as $item) {
                if ($item['unit_id']) {
                    BaseRepository::run("UPDATE units SET state='Sold', synced=0 WHERE id=?", [$item['unit_id']]);
                }
                ProductRepository::adjustStock($branch, $item['product_id'], -$item['qty'], 'Exchange replacement', $invoiceNo, (int) $user['id']);
                BaseRepository::run(
                    'INSERT INTO sale_items(sale_id, product_id, unit_id, name, qty, price, total) VALUES (?,?,?,?,?,?,?)',
                    [$replacementSaleId, $item['product_id'], $item['unit_id'], $item['name'], $item['qty'], $item['price'], $item['total']]
                );
            }

            foreach ($settlement as $payment) {
                BaseRepository::run(
                    'INSERT INTO payments(sale_id, drawer_id, user_id, kind, method, amount, reference) VALUES (?,?,?,?,?,?,?)',
                    [$replacementSaleId, $drawer['id'], $user['id'], 'Sale', $payment['method'], $payment['amount'], $payment['reference']]
                );
            }

            BaseRepository::run('UPDATE exchanges SET replacement_sale_id=? WHERE return_id=?', [$replacementSaleId, $id]);
            $cashNet = $diff < 0 && $row['method'] === 'Cash' ? $diff : $cashReceived - $change;
            if ($cashNet !== 0) {
                DrawerRepository::addCashMovement(
                    $user['id'], $drawer, $cashNet,
                    $cashNet > 0 ? 'Exchange Difference In' : 'Exchange Difference Out',
                    $invoiceNo
                );
            }
        } elseif ($drawer && $row['method'] === 'Cash') {
            DrawerRepository::addCashMovement(
                $user['id'],
                $drawer,
                -(int) $row['amount'],
                'Cash Refund',
                Helpers::ref('RET', $id)
            );
        }

        BaseRepository::run(
            "UPDATE returns_log SET status='Completed', processed_drawer_id=?, reference=?, synced=0 WHERE id=?",
            [$drawer['id'] ?? null, $reference, $id]
        );

        return [
            'id' => $id,
            'status' => 'Completed',
            'amount' => (int) $row['amount'],
            'replacement_sale_id' => $replacementSaleId,
            'difference' => $diff,
            'replacement_items' => $items,
            'settlement_payments' => $payments,
            'reference' => $reference,
            'cash_received' => $cashReceived,
            'change' => $change,
        ];
    }
}
