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

class ReturnService {
    public static function refundAmount(int $total, int $qty, int $refunded, int $delta): int {
        $prior = (int) bcdiv(bcmul((string) $total, (string) $refunded, 0), (string) $qty, 0);
        $next = (int) bcdiv(bcmul((string) $total, (string) ($refunded + $delta), 0), (string) $qty, 0);
        return $next - $prior;
    }

    public static function request(int $branch, array $body): array {
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

        $amount = self::refundAmount((int) $line['total'], (int) $line['qty'], (int) $line['refunded_qty'], $qty);
        $restock = !empty($body['restock']) && !$line['unit_id'] && $line['category'] !== 'Services';

        $id = BaseRepository::insert(
            'INSERT INTO returns_log(branch_id, sale_item_id, qty, reason, condition_note, restock, amount, method) VALUES (?,?,?,?,?,?,?,?)',
            [$branch, $item, $qty, Validator::str($body, 'reason', 500), Validator::str($body, 'condition_note', 100), $restock ? 1 : 0, $amount, $method]
        );

        if (!empty($body['replacement_product_id'])) {
            if ($method !== 'Cash') {
                throw new ApiError('Exchanges require an original cash tender.');
            }
            $replacement = BaseRepository::one(
                'SELECT p.*, s.qty available FROM products p JOIN stock s ON s.product_id=p.id WHERE p.id=? AND s.branch_id=?',
                [Validator::integer($body['replacement_product_id'], 'Replacement product'), $branch]
            );
            if (!$replacement || !$replacement['available']) {
                throw new ApiError('Choose an available replacement product.');
            }

            $units = Validator::integer($body['replacement_qty'] ?? null, 'Replacement quantity', 1, $replacement['serialized'] ? 1 : min(1000, (int) $replacement['available']));
            $device = null;
            if ($replacement['serialized']) {
                $device = Validator::integer($body['replacement_unit_id'] ?? null, 'Replacement device');
                if (!BaseRepository::scalar("SELECT id FROM units WHERE id=? AND branch_id=? AND product_id=? AND state='Available' FOR UPDATE", [$device, $branch, $replacement['id']])) {
                    throw new ApiError('The replacement device is unavailable.', 409);
                }
            }

            $taxRate = (int) BaseRepository::scalar('SELECT tax_bps FROM settings WHERE id=1');
            $lineSubtotal = (int) $replacement['price'] * $units;
            $lineTax = Helpers::rate($lineSubtotal, $taxRate);
            $quoted = $lineSubtotal + $lineTax;

            BaseRepository::run(
                'INSERT INTO exchanges(return_id, product_id, unit_id, qty, quoted_total) VALUES (?,?,?,?,?)',
                [$id, $replacement['id'], $device, $units, $quoted]
            );
        }

        return ['id' => $id, 'amount' => $amount, 'status' => 'Pending'];
    }

    public static function resolve(array $user, int $branch, array $body): array {
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
            BaseRepository::run("UPDATE returns_log SET status='Rejected' WHERE id=?", [$id]);
            return ['id' => $id, 'status' => 'Rejected'];
        }

        $drawer = null;
        if ($row['method'] === 'Cash') {
            $drawer = DrawerService::openDrawer($user, $branch);
        }

        $reference = $row['method'] === 'Cash' ? null : Validator::str($body, 'reference', 100, true);

        if ($row['unit_id']) {
            BaseRepository::run("UPDATE units SET state='Inspection', synced=0 WHERE id=?", [$row['unit_id']]);
        } elseif ($row['restock']) {
            ProductRepository::adjustStock($branch, (int) $row['product_id'], (int) $row['qty'], 'Return restock', Helpers::ref('RET', $id), (int) $user['id']);
        }

        BaseRepository::run('UPDATE sale_items SET refunded_qty=refunded_qty+? WHERE id=?', [$row['qty'], $row['sale_item_id']]);

        $replacementSaleId = null;
        if ($row['replacement_product_id']) {
            $p = ProductRepository::findById((int) $row['replacement_product_id']);
            if ($row['replacement_unit_id'] && !BaseRepository::scalar("SELECT id FROM units WHERE id=? AND branch_id=? AND product_id=? AND state='Available' FOR UPDATE", [$row['replacement_unit_id'], $branch, $p['id']])) {
                throw new ApiError('The selected replacement device is unavailable.', 409);
            }

            $taxRate = (int) BaseRepository::scalar('SELECT tax_bps FROM settings WHERE id=1');
            $lineSubtotal = (int) $p['price'] * (int) $row['replacement_qty'];
            $lineTax = Helpers::rate($lineSubtotal, $taxRate);
            $total = $lineSubtotal + $lineTax;

            $replacementSaleId = BaseRepository::insert(
                'INSERT INTO sales(branch_id, user_id, drawer_id, customer_id, subtotal, discount, tax, total, credit, synced) VALUES (?,?,?,?,?,0,?,?,0,0)',
                [$branch, $user['id'], $drawer['id'], $row['customer_id'], $lineSubtotal, $lineTax, $total]
            );

            if ($row['replacement_unit_id']) {
                BaseRepository::run("UPDATE units SET state='Sold', synced=0 WHERE id=?", [$row['replacement_unit_id']]);
            }
            if ($p['category'] !== 'Services') {
                ProductRepository::adjustStock($branch, $p['id'], -(int) $row['replacement_qty'], 'Exchange replacement', Helpers::ref('INV', $replacementSaleId), (int) $user['id']);
            }

            BaseRepository::run(
                'INSERT INTO sale_items(sale_id, product_id, unit_id, name, qty, price, total) VALUES (?,?,?,?,?,?,?)',
                [$replacementSaleId, $p['id'], $row['replacement_unit_id'], $p['name'], $row['replacement_qty'], $p['price'], $total]
            );

            BaseRepository::run(
                'INSERT INTO payments(sale_id, drawer_id, user_id, kind, method, amount, reference) VALUES (?,?,?,?,?,?,?)',
                [$replacementSaleId, $drawer['id'], $user['id'], 'Sale', 'Cash', $total, Helpers::ref('RET', $id)]
            );

            BaseRepository::run('UPDATE exchanges SET replacement_sale_id=? WHERE return_id=?', [$replacementSaleId, $id]);

            $diff = $total - (int) $row['amount'];
            if ($diff !== 0) {
                DrawerRepository::addCashMovement(
                    $user['id'],
                    $drawer,
                    $diff,
                    $diff > 0 ? 'Exchange Difference In' : 'Exchange Difference Out',
                    Helpers::ref('INV', $replacementSaleId)
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
            "UPDATE returns_log SET status='Completed', processed_drawer_id=?, reference=? WHERE id=?",
            [$drawer['id'] ?? null, $reference, $id]
        );

        return [
            'id' => $id,
            'status' => 'Completed',
            'amount' => (int) $row['amount'],
            'replacement_sale_id' => $replacementSaleId,
        ];
    }
}
