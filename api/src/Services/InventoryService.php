<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\DrawerRepository;
use Zeedat\Repositories\ProductRepository;
use Zeedat\Repositories\UserRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class InventoryService {
    public static function generateUniqueSku(string $category = 'Accessories'): string {
        $rows = BaseRepository::rows('SELECT sku FROM products');
        $maxNum = 0;
        $taken = [];
        foreach ($rows as $row) {
            $existing = trim((string) ($row['sku'] ?? ''));
            if ($existing === '') {
                continue;
            }
            $taken[strtoupper($existing)] = true;
            if (preg_match('/^ZEE(\d+)$/i', $existing, $m)) {
                $num = (int) $m[1];
                if ($num > $maxNum) {
                    $maxNum = $num;
                }
            }
        }

        $next = max(1, $maxNum + 1);
        do {
            $candidate = 'ZEE' . str_pad((string) $next, 5, '0', STR_PAD_LEFT);
            $next++;
        } while (isset($taken[$candidate]));

        return $candidate;
    }

    public static function generateBarcode(array $excludeCodes = [], ?int $productId = null): array {
        $attempts = 0;
        do {
            if ($attempts === 0 && $productId !== null && $productId > 0 && $productId < 10000000) {
                $code = 'ZD' . str_pad((string) $productId, 7, '0', STR_PAD_LEFT);
            } else {
                $code = 'ZD' . str_pad((string) random_int(1000000, 9999999), 7, '0', STR_PAD_LEFT);
            }
            $attempts++;
            if ($attempts > 1000) {
                throw new ApiError('Failed to generate unique ZD barcode. Please try again.');
            }
        } while (
            in_array($code, $excludeCodes, true) ||
            BaseRepository::scalar('SELECT id FROM products WHERE barcode=? OR sku=?', [$code, $code])
        );

        return ['barcode' => $code];
    }

    public static function bulkGenerateBarcodes(array $body = []): array {
        $ids = $body['product_ids'] ?? null;
        // Strictly assign internal ZD barcodes ONLY to active items without a manufacturer/existing barcode
        $condition = "(barcode IS NULL OR barcode='') AND COALESCE(active, 1)=1";

        if (is_array($ids) && count($ids) > 0) {
            $inClause = implode(',', array_map('intval', $ids));
            $products = BaseRepository::rows("SELECT id FROM products WHERE id IN ({$inClause}) AND {$condition} AND category!='Services' ORDER BY id");
        } else {
            $products = BaseRepository::rows("SELECT id FROM products WHERE {$condition} AND category!='Services' ORDER BY id");
        }

        $count = 0;
        $updated = [];
        $batchGenerated = [];
        foreach ($products as $p) {
            $pid = (int) $p['id'];
            $code = self::generateBarcode($batchGenerated, $pid)['barcode'];
            $batchGenerated[] = $code;
            BaseRepository::run('UPDATE products SET barcode=?, synced=0 WHERE id=?', [$code, $pid]);
            $updated[] = ['id' => $pid, 'barcode' => $code];
            $count++;
        }
        return ['updated' => $count, 'products' => $updated];
    }

    public static function saveProduct(array $user, array $body): array {
        $id = empty($body['id']) ? null : Validator::integer($body['id'], 'Product');
        $category = Validator::str($body, 'category', 40);

        // Auto-generated sequential Item Code (ZEE00001, ZEE00002...) — never entered manually by users
        if ($id) {
            $existingSku = trim((string) BaseRepository::scalar('SELECT sku FROM products WHERE id=?', [$id]));
            $sku = $existingSku !== '' ? $existingSku : self::generateUniqueSku($category);
        } else {
            $sku = self::generateUniqueSku($category);
        }

        // Services do not have barcodes
        if ($category === 'Services') {
            $barcode = '';
        } else {
            $barcode = Validator::str($body, 'barcode', 40, false);
            if ($barcode === '' && !empty($body['auto_barcode'])) {
                $barcode = self::generateBarcode()['barcode'];
            }
        }

        $skuOwner = BaseRepository::scalar('SELECT id FROM products WHERE sku=? AND id!=?', [$sku, $id ?? 0]);
        if ($skuOwner) {
            throw new ApiError('A product with this SKU already exists.', 409);
        }

        if ($barcode !== '') {
            $existing = BaseRepository::one('SELECT id, name, sku FROM products WHERE barcode=? AND id!=?', [$barcode, $id ?? 0]);
            if ($existing) {
                throw new ApiError("Barcode '{$barcode}' is already assigned to '{$existing['name']}' ({$existing['sku']}). One barcode can only belong to one product.", 409);
            }
        }

        $name = Validator::str($body, 'name', 120);
        $brand = Validator::str($body, 'brand', 60, false);
        $category = Validator::str($body, 'category', 40);
        $cost = Validator::money($body, 'cost');
        $price = Validator::money($body, 'price');
        $reorder = Validator::integer($body['reorder_level'] ?? 0, 'Reorder level', 0);
        $serialized = !empty($body['serialized']) ? 1 : 0;

        $commType = strtolower(trim((string) ($body['commission_type'] ?? 'fixed')));
        if (!in_array($commType, ['fixed', 'percent'], true)) {
            throw new ApiError('Invalid commission type.');
        }
        $commValue = Validator::integer($body['commission_value'] ?? 0, 'Commission', 0, $commType === 'percent' ? 10000 : 100000000);
        if ($category === 'Services' && $commValue <= 0) {
            throw new ApiError('Please enter a commission greater than 0 for Services.');
        }

        $existingProduct = $id ? ProductRepository::findById($id) : null;
        $imagePath = (string) ($existingProduct['image_path'] ?? '');
        if (!empty($body['remove_image'])) {
            \Zeedat\Support\ProductImage::delete($imagePath);
            $imagePath = '';
        } elseif (!empty($body['image_data']) && is_string($body['image_data'])) {
            $imagePath = \Zeedat\Support\ProductImage::saveFromDataUri($body['image_data'], $imagePath);
        }

        if ($id) {
            BaseRepository::run(
                'UPDATE products SET sku=?, barcode=?, name=?, brand=?, category=?, cost=?, price=?, reorder_level=?, commission_type=?, commission_value=?, image_path=?, synced=0 WHERE id=?',
                [$sku, $barcode ?: null, $name, $brand ?: '', $category, $cost, $price, $reorder, $commType, $commValue, $imagePath, $id]
            );
        } else {
            $id = BaseRepository::insert(
                'INSERT INTO products(sku, barcode, name, brand, category, cost, price, reorder_level, serialized, commission_type, commission_value, image_path, synced) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)',
                [$sku, $barcode ?: null, $name, $brand ?: '', $category, $cost, $price, $reorder, $serialized, $commType, $commValue, $imagePath]
            );
        }

        // Branch-wise initial stock or stock updates
        if ($category !== 'Services' && !$serialized) {
            if (!empty($body['branch_stock_map']) && is_array($body['branch_stock_map'])) {
                foreach ($body['branch_stock_map'] as $branchId => $qty) {
                    $bId = (int) $branchId;
                    $targetQty = max(0, (int) $qty);
                    if ($bId > 0) {
                        $currentStock = (int) BaseRepository::scalar('SELECT qty FROM stock WHERE branch_id=? AND product_id=?', [$bId, $id]);
                        $diff = $targetQty - $currentStock;
                        if ($diff !== 0) {
                            ProductRepository::adjustStock(
                                $bId,
                                $id,
                                $diff,
                                !empty($body['id']) ? 'Stock update from product settings' : 'Initial stock',
                                'INIT-' . $id,
                                (int) ($user['id'] ?? 1)
                            );
                        }
                    }
                }
            } elseif (!empty($body['initial_stock']) && (int) $body['initial_stock'] > 0 && !empty($body['branch'])) {
                $bId = (int) $body['branch'];
                $initQty = (int) $body['initial_stock'];
                $currentStock = (int) BaseRepository::scalar('SELECT qty FROM stock WHERE branch_id=? AND product_id=?', [$bId, $id]);
                $diff = $initQty - $currentStock;
                if ($diff !== 0) {
                    ProductRepository::adjustStock(
                        $bId,
                        $id,
                        $diff,
                        'Initial stock',
                        'INIT-' . $id,
                        (int) ($user['id'] ?? 1)
                    );
                }
            }
        }

        return [
            'id' => $id,
            'sku' => $sku,
            'name' => $name,
            'barcode' => $barcode,
            'image_path' => $imagePath,
            'image_url' => \Zeedat\Support\ProductImage::imageUrl((int) $id, $imagePath),
        ];
    }

    public static function updateBarcode(array $user, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Product');
        $product = ProductRepository::findById($id);
        if (!$product) {
            throw new ApiError('Product not found.', 404);
        }
        if ($product['category'] === 'Services') {
            throw new ApiError('Services do not use barcodes.');
        }

        $barcode = Validator::str($body, 'barcode', 40, false);
        if ($barcode === '' && !empty($body['auto_generate'])) {
            if (!empty($product['barcode'])) {
                throw new ApiError("'{$product['name']}' already has a barcode ({$product['barcode']}). Internal ZD barcodes are only assigned to items without a manufacturer barcode.");
            }
            $barcode = self::generateBarcode([], $id)['barcode'];
        }

        if ($barcode !== '') {
            $existing = BaseRepository::one('SELECT id, name, sku FROM products WHERE barcode=? AND id!=?', [$barcode, $id]);
            if ($existing) {
                throw new ApiError("Barcode '{$barcode}' is already assigned to '{$existing['name']}' ({$existing['sku']}). One barcode can only belong to one product.", 409);
            }
        }

        BaseRepository::run('UPDATE products SET barcode=?, synced=0 WHERE id=?', [$barcode ?: null, $id]);

        return ['id' => $id, 'barcode' => $barcode];
    }

    private static function applyStockAdjustmentEntry(
        int $branch,
        array $entry,
        string $reason,
        string $reference,
        int $userId,
        string $defaultMode = 'in'
    ): array {
        $product = Validator::integer($entry['product_id'] ?? null, 'Product');
        $p = ProductRepository::findById($product);
        if (!$p || $p['serialized'] || $p['category'] === 'Services') {
            throw new ApiError('Product cannot have stock adjusted directly: ' . ($p['name'] ?? "#{$product}"));
        }

        $mode = strtolower(trim((string) ($entry['mode'] ?? '')));
        if ($mode === '' && isset($entry['direction'])) {
            $dir = (string) $entry['direction'];
            if (!in_array($dir, ['In', 'Out'], true)) {
                throw new ApiError('Invalid adjustment direction.');
            }
            $mode = strtolower($dir);
        } elseif ($mode === '') {
            $mode = $defaultMode;
        }
        if (!in_array($mode, ['in', 'out', 'set'], true)) {
            throw new ApiError('Invalid stock adjustment mode.');
        }

        $currentQty = (int) (BaseRepository::scalar(
            'SELECT qty FROM stock WHERE branch_id=? AND product_id=?',
            [$branch, $product]
        ) ?? 0);

        if ($mode === 'set') {
            $rawTarget = $entry['target_qty'] ?? ($entry['qty'] ?? null);
            $targetQty = Validator::integer($rawTarget, 'Target stock count', 0, 100000);
            $delta = $targetQty - $currentQty;
        } else {
            $qty = Validator::integer($entry['qty'] ?? null, 'Quantity', 1, 10000);
            $delta = $mode === 'in' ? $qty : -$qty;
        }

        if ($delta !== 0) {
            $kind = $mode === 'set' ? 'Stocktake: ' . $reason : $reason;
            ProductRepository::adjustStock($branch, $product, $delta, substr($kind, 0, 150), $reference, $userId);
        }

        return [
            'product_id' => $product,
            'old_qty' => $currentQty,
            'delta' => $delta,
            'new_qty' => $currentQty + $delta,
        ];
    }

    public static function adjustStock(array $user, int $branch, array $body): array {
        if ($branch <= 0) {
            throw new ApiError('Select a specific branch to adjust stock.');
        }

        $reason = Validator::str($body, 'reason', 150);
        $reference = trim(substr((string) ($body['reference'] ?? ''), 0, 100));
        if ($reference === '') {
            $reference = 'ADJ-' . date('ymdHis');
        }

        return BaseRepository::transaction(function () use ($user, $branch, $body, $reason, $reference) {
            $applied = self::applyStockAdjustmentEntry($branch, $body, $reason, $reference, (int) $user['id'], '');
            return $applied + [
                'reason' => $reason,
                'reference' => $reference,
            ];
        });
    }

    public static function bulkAdjustStock(array $user, int $branch, array $body): array {
        if ($branch <= 0) {
            throw new ApiError('Select a specific branch to adjust stock.');
        }

        $items = $body['items'] ?? [];
        if (!is_array($items) || empty($items)) {
            throw new ApiError('Add at least one item to adjust.');
        }
        if (count($items) > 250) {
            throw new ApiError('Maximum 250 items can be adjusted in a single batch.');
        }

        $defaultReason = Validator::str($body, 'reason', 150);
        $reference = trim(substr((string) ($body['reference'] ?? ''), 0, 100));
        if ($reference === '') {
            $reference = 'ADJ-' . date('ymdHis');
        }

        return BaseRepository::transaction(function () use ($user, $branch, $items, $defaultReason, $reference) {
            $results = [];
            $skipped = 0;

            foreach ($items as $entry) {
                if (!is_array($entry)) continue;
                $itemReason = trim(substr((string) ($entry['reason'] ?? ''), 0, 150));
                $reason = $itemReason !== '' ? $itemReason : $defaultReason;
                $applied = self::applyStockAdjustmentEntry($branch, $entry, $reason, $reference, (int) $user['id'], 'set');
                if ($applied['delta'] === 0) {
                    $skipped++;
                    continue;
                }
                $results[] = $applied;
            }

            return [
                'adjusted' => count($results),
                'skipped' => $skipped,
                'reference' => $reference,
                'results' => $results,
            ];
        });
    }

    public static function getStockMovements(int $branch, array $query = []): array {
        $limit = (int) ($query['limit'] ?? 300);
        $from = !empty($query['from']) ? Validator::date($query, 'from') : '';
        $to = !empty($query['to']) ? Validator::date($query, 'to') : '';
        return ProductRepository::stockMovements($branch, $limit, $from, $to);
    }

    public static function receiveUnit(array $user, int $branch, array $body): array {
        if ($branch <= 0) {
            throw new ApiError('Select a specific branch to receive a device unit.');
        }

        $product = Validator::integer($body['product_id'] ?? null, 'Product');
        $p = ProductRepository::findById($product);
        if (!$p || !$p['serialized']) {
            throw new ApiError('Product must be serialized.');
        }

        $rawCode = strtoupper(trim((string) ($body['code'] ?? '')));
        if ($rawCode === '') {
            do {
                $code = 'UNIT-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
            } while (BaseRepository::scalar('SELECT id FROM units WHERE code=?', [$code]));
        } else {
            $code = strtoupper(Validator::str($body, 'code', 50));
            if (BaseRepository::scalar('SELECT id FROM units WHERE code=?', [$code])) {
                throw new ApiError("Unit code '{$code}' already exists.", 409);
            }
        }

        $imei = Validator::str($body, 'imei', 60, false);
        if ($imei !== '' && BaseRepository::scalar('SELECT id FROM units WHERE imei=?', [$imei])) {
            throw new ApiError("IMEI / Serial '{$imei}' is already registered to another unit.", 409);
        }

        $grade = Validator::str($body, 'grade', 20);
        if (!in_array($grade, ['New', 'Used', 'Refurbished'], true)) {
            throw new ApiError('Invalid unit condition grade.');
        }

        $state = trim((string) ($body['state'] ?? 'Available'));
        if (!in_array($state, ['Available', 'Inspection'], true)) {
            throw new ApiError('Initial unit state must be Available or Inspection.');
        }

        return BaseRepository::transaction(function () use ($user, $branch, $product, $code, $imei, $grade, $state) {
            $id = BaseRepository::insert(
                'INSERT INTO units(branch_id, product_id, code, imei, grade, state, synced) VALUES (?,?,?,?,?,?,0)',
                [$branch, $product, $code, $imei ?: null, $grade, $state]
            );

            if ($state === 'Available') {
                ProductRepository::adjustStock($branch, $product, 1, 'Receive device unit', $code, (int) $user['id']);
            }

            return ['id' => $id, 'code' => $code, 'state' => $state, 'grade' => $grade];
        });
    }

    public static function releaseUnit(array $user, int $branch, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Unit');
        $reason = Validator::str($body, 'reason', 150);

        return BaseRepository::transaction(function () use ($user, $branch, $id, $reason) {
            $unit = $branch > 0
                ? BaseRepository::one("SELECT * FROM units WHERE id=? AND branch_id=? AND state='Inspection' FOR UPDATE", [$id, $branch])
                : BaseRepository::one("SELECT * FROM units WHERE id=? AND state='Inspection' FOR UPDATE", [$id]);
            if (!$unit) {
                throw new ApiError('Unit is not in inspection.', 404);
            }

            $targetBranch = (int) $unit['branch_id'];
            BaseRepository::run("UPDATE units SET state='Available', synced=0 WHERE id=?", [$id]);
            ProductRepository::adjustStock($targetBranch, (int) $unit['product_id'], 1, 'Inspection released to stock: ' . $reason, $unit['code'], (int) $user['id']);

            return ['id' => $id, 'state' => 'Available', 'code' => $unit['code']];
        });
    }

    public static function inspectUnit(array $user, int $branch, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Unit');
        $reason = Validator::str($body, 'reason', 150);

        return BaseRepository::transaction(function () use ($user, $branch, $id, $reason) {
            $unit = $branch > 0
                ? BaseRepository::one("SELECT * FROM units WHERE id=? AND branch_id=? AND state='Available' FOR UPDATE", [$id, $branch])
                : BaseRepository::one("SELECT * FROM units WHERE id=? AND state='Available' FOR UPDATE", [$id]);
            if (!$unit) {
                throw new ApiError('Only Available units can be moved to Inspection.', 404);
            }

            $targetBranch = (int) $unit['branch_id'];
            if (!ProductRepository::findAvailableUnit($id, $targetBranch, (int) $unit['product_id'])) {
                throw new ApiError('This device is reserved for a customer.', 409);
            }
            BaseRepository::run("UPDATE units SET state='Inspection', synced=0 WHERE id=?", [$id]);
            ProductRepository::adjustStock($targetBranch, (int) $unit['product_id'], -1, 'Moved to inspection: ' . $reason, $unit['code'], (int) $user['id']);

            return ['id' => $id, 'state' => 'Inspection', 'code' => $unit['code']];
        });
    }

    public static function updateUnit(array $user, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Unit');
        $unit = BaseRepository::one('SELECT * FROM units WHERE id=?', [$id]);
        if (!$unit) {
            throw new ApiError('Device unit not found.', 404);
        }
        if ($unit['state'] === 'Sold') {
            throw new ApiError('Sold units cannot be modified.');
        }

        $imei = Validator::str($body, 'imei', 60, false);
        if ($imei !== '' && BaseRepository::scalar('SELECT id FROM units WHERE imei=? AND id!=?', [$imei, $id])) {
            throw new ApiError("IMEI / Serial '{$imei}' is already registered to another unit.", 409);
        }

        $grade = Validator::str($body, 'grade', 20);
        if (!in_array($grade, ['New', 'Used', 'Refurbished'], true)) {
            throw new ApiError('Invalid unit condition grade.');
        }

        BaseRepository::run('UPDATE units SET imei=?, grade=?, synced=0 WHERE id=?', [$imei ?: null, $grade, $id]);
        UserRepository::logAudit((int) $user['id'], (int) $unit['branch_id'], 'unit.update', [
            'id' => $id,
            'code' => $unit['code'],
            'grade' => $grade,
        ]);

        return ['id' => $id, 'code' => $unit['code'], 'imei' => $imei, 'grade' => $grade];
    }

    public static function saveCustomer(int $branch, array $body): array {
        $id = empty($body['id']) ? null : Validator::integer($body['id'], 'Customer');
        $name = Validator::str($body, 'name', 120);
        $phone = Validator::str($body, 'phone', 30);
        $email = Validator::str($body, 'email', 150, false);
        $notes = Validator::str($body, 'notes', 500, false);

        if ($id) {
            BaseRepository::run(
                'UPDATE customers SET name=?, phone=?, email=?, notes=?, synced=0 WHERE id=? AND branch_id=? AND deleted_at IS NULL',
                [$name, $phone, $email ?: '', $notes ?: '', $id, $branch]
            );
        } elseif (\Zeedat\Config\Database::isSqlite()) {
            $uuid = 'CUS-' . bin2hex(random_bytes(8));
            $id = BaseRepository::insert(
                'INSERT INTO customers(uuid, sync_uuid, synced, branch_id, name, phone, email, notes, loyalty_points, wallet_balance) VALUES (?,?,0,?,?,?,?,?,0,0)',
                [$uuid, $uuid, $branch, $name, $phone, $email ?: '', $notes ?: '']
            );
        } else {
            $uuid = 'CUS-' . bin2hex(random_bytes(8));
            $id = BaseRepository::insert(
                'INSERT INTO customers(sync_uuid, synced, branch_id, name, phone, email, notes, loyalty_points, wallet_balance) VALUES (?,0,?,?,?,?,?,0,0)',
                [$uuid, $branch, $name, $phone, $email ?: '', $notes ?: '']
            );
        }

        $saved = BaseRepository::one(
            'SELECT id, branch_id, name, phone, email, notes, CAST(COALESCE(loyalty_points,0) AS UNSIGNED) AS loyalty_points, CAST(COALESCE(wallet_balance,0) AS UNSIGNED) AS wallet_balance FROM customers WHERE id=?',
            [$id]
        );
        return $saved ?: [
            'id' => $id,
            'branch_id' => $branch,
            'name' => $name,
            'phone' => $phone,
            'email' => $email ?: '',
            'notes' => $notes ?: '',
            'loyalty_points' => 0,
            'wallet_balance' => 0,
        ];
    }

    public static function topUpCustomerWallet(array $user, int $branch, array $body): array {
        $cid = Validator::integer($body['customer_id'] ?? null, 'Customer');
        $amount = Validator::money($body, 'amount');
        if ($amount <= 0) {
            throw new ApiError('Wallet top-up amount must be greater than zero.');
        }
        $method = (string) ($body['method'] ?? 'Cash');
        if (!in_array($method, \Zeedat\Config\Constants::TENDERS, true)) {
            throw new ApiError('Invalid payment method.');
        }
        $reference = Validator::str($body, 'reference', 100, false) ?: '';

        $out = BaseRepository::transaction(function () use ($user, $branch, $cid, $amount, $method, $reference) {
            $cust = BaseRepository::one('SELECT * FROM customers WHERE id=? AND branch_id=? AND deleted_at IS NULL FOR UPDATE', [$cid, $branch]);
            if (!$cust) {
                throw new ApiError('Customer not found in this branch.', 404);
            }

            if ($method === 'Cash') {
                $drawer = DrawerService::openDrawer($user, $branch);
                DrawerRepository::addCashMovement(
                    (int) $user['id'],
                    $drawer,
                    $amount,
                    'Wallet Top-Up',
                    $cust['name'] . ($cust['phone'] ? ' (' . $cust['phone'] . ')' : '')
                );
            }

            BaseRepository::run(
                'UPDATE customers SET wallet_balance = COALESCE(wallet_balance, 0) + ?, synced=0 WHERE id=?',
                [$amount, $cid]
            );
            $logId = BaseRepository::insert(
                'INSERT INTO customer_wallet_logs(branch_id, customer_id, user_id, amount, points_delta, kind, method, reference) VALUES (?,?,?,?,0,?,?,?)',
                [$branch, $cid, (int) ($user['id'] ?? 1), $amount, 'Top-Up', $method, $reference]
            );

            $updated = BaseRepository::one(
                'SELECT CAST(COALESCE(wallet_balance,0) AS UNSIGNED) AS wallet_balance, CAST(COALESCE(loyalty_points,0) AS UNSIGNED) AS loyalty_points FROM customers WHERE id=?',
                [$cid]
            );
            return [
                'id' => $cid,
                'log_id' => $logId,
                'customer_id' => $cid,
                'customer_name' => (string) ($cust['name'] ?? ''),
                'customer_phone' => (string) ($cust['phone'] ?? ''),
                'branch_id' => $branch,
                'cashier' => (string) ($user['name'] ?? 'Staff'),
                'amount' => $amount,
                'method' => $method,
                'reference' => $reference !== '' ? $reference : sprintf('WLT-%06d', $logId),
                'wallet_balance' => (int) ($updated['wallet_balance'] ?? 0),
                'loyalty_points' => (int) ($updated['loyalty_points'] ?? 0),
                'created_at' => date('Y-m-d H:i:s'),
            ];
        });

        $branchName = (string) (BaseRepository::scalar('SELECT name FROM branches WHERE id=?', [$branch]) ?: '');
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $smsMsg = SmsService::buildPaymentReceivedMessage([
            'type' => 'wallet_topup',
            'customer' => $out['customer_name'],
            'amount' => $out['amount'],
            'method' => $out['method'],
            'wallet_balance' => $out['wallet_balance'],
        ], $settings, $branchName);
        $out['branch_name'] = $branchName;
        $out['sms'] = SmsService::send(
            $branch,
            null,
            $out['customer_phone'],
            $smsMsg,
            'payment_received',
            $cid,
            $out['customer_name']
        );

        return $out;
    }

    public static function getCustomerLedger(int $branch, int $customerId): array {
        $cid = Validator::integer($customerId, 'Customer');
        $params = $branch > 0 ? [$cid, $branch] : [$cid];
        $cust = BaseRepository::one(
            'SELECT c.*, b.name AS branch,
                CAST(COALESCE(c.loyalty_points,0) AS UNSIGNED) AS loyalty_points,
                CAST(COALESCE(c.wallet_balance,0) AS UNSIGNED) AS wallet_balance
             FROM customers c JOIN branches b ON b.id=c.branch_id
             WHERE c.id=? AND c.deleted_at IS NULL' . ($branch > 0 ? ' AND c.branch_id=?' : ''),
            $params
        );
        if (!$cust) {
            throw new ApiError('Customer not found.', 404);
        }

        $walletDelta = CustomerWallet::WALLET_DELTA;
        $walletLogs = BaseRepository::rows(
            "SELECT l.*, {$walletDelta} AS wallet_delta, COALESCE(u.name, 'Staff') AS user_name
             FROM customer_wallet_logs l
             LEFT JOIN users u ON u.id=l.user_id
             WHERE l.customer_id=?
             ORDER BY l.id DESC LIMIT 200",
            [$cid]
        );

        $creditPayments = BaseRepository::rows(
            "SELECT pm.id, pm.sale_id, s.invoice_no, s.total AS sale_total, s.paid_amount AS sale_paid, s.credit AS sale_credit,
                    pm.method, pm.amount, pm.reference, pm.created_at,
                    COALESCE(u.name, 'Staff') AS user_name
             FROM payments pm
             JOIN sales s ON s.id=pm.sale_id
             LEFT JOIN users u ON u.id=pm.user_id
             WHERE s.customer_id=? AND pm.kind='Credit'
             ORDER BY pm.id DESC LIMIT 200",
            [$cid]
        );

        return [
            'customer' => $cust,
            'wallet_logs' => $walletLogs,
            'credit_payments' => $creditPayments,
            'receivables' => BaseRepository::rows(
                'SELECT id, branch_id, invoice_no, total, credit, due_date, created_at FROM sales WHERE customer_id=? AND credit>0 ORDER BY due_date, id',
                [$cid]
            ),
            'reservations' => ReservationService::forCustomer($cid),
        ];
    }

    public static function adjustCustomerPoints(array $user, int $branch, array $body): array {
        $cid = Validator::integer($body['customer_id'] ?? null, 'Customer');
        $delta = Validator::integer($body['delta'] ?? null, 'Points adjustment', -1000000, 1000000);
        if ($delta === 0) {
            throw new ApiError('Points adjustment cannot be zero.');
        }
        $reason = Validator::str($body, 'reason', 120, false) ?: ($delta > 0 ? 'Bonus / Adjustment' : 'Points Redemption');

        return BaseRepository::transaction(function () use ($user, $branch, $cid, $delta, $reason) {
            $cust = BaseRepository::one('SELECT * FROM customers WHERE id=? AND branch_id=? AND deleted_at IS NULL FOR UPDATE', [$cid, $branch]);
            if (!$cust) {
                throw new ApiError('Customer not found in this branch.', 404);
            }
            $current = (int) ($cust['loyalty_points'] ?? 0);
            $next = $current + $delta;
            if ($next < 0) {
                throw new ApiError("Cannot deduct " . abs($delta) . " pts. Available balance is {$current} pts.");
            }

            BaseRepository::run(
                'UPDATE customers SET loyalty_points=?, synced=0 WHERE id=?',
                [$next, $cid]
            );
            BaseRepository::run(
                'INSERT INTO customer_wallet_logs(branch_id, customer_id, user_id, amount, points_delta, kind, method, reference) VALUES (?,?,?,0,?,?,?,?)',
                [$branch, $cid, (int) ($user['id'] ?? 1), $delta, $delta > 0 ? 'Loyalty Bonus' : 'Points Redeem', 'Points', $reason]
            );
            UserRepository::logAudit((int) $user['id'], $branch, 'customer.points', [
                'customer_id' => $cid,
                'delta' => $delta,
                'balance' => $next,
                'reason' => $reason,
            ]);

            return ['id' => $cid, 'loyalty_points' => $next, 'delta' => $delta];
        });
    }

    public static function deleteCustomer(array $user, int $branch, array $body): array {
        if ($user['role'] !== 'owner') {
            throw new ApiError('Only the owner can delete a customer account.', 403);
        }
        $hash = (string) BaseRepository::scalar('SELECT delete_pin_hash FROM settings WHERE id=1');
        if ($hash === '') {
            throw new ApiError('Set a Delete PIN in Settings first.', 409);
        }
        if (!password_verify((string) ($body['pin'] ?? ''), $hash)) {
            throw new ApiError('Incorrect Delete PIN.', 403);
        }
        $cid = Validator::integer($body['id'] ?? null, 'Customer');
        return BaseRepository::transaction(function () use ($user, $branch, $cid) {
            $cust = BaseRepository::one('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL FOR UPDATE', [$cid]);
            if (!$cust) {
                throw new ApiError('Customer not found.', 404);
            }
            if ($branch > 0 && (int) $cust['branch_id'] !== $branch) {
                throw new ApiError('Customer belongs to another branch.', 403);
            }
            $salesCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM sales WHERE customer_id=?', [$cid]);
            $repairsCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM repairs WHERE customer_id=?', [$cid]);
            $reservations = (int) BaseRepository::scalar('SELECT COUNT(*) FROM reservations WHERE customer_id=?', [$cid]);
            if ($salesCount > 0 || $repairsCount > 0 || $reservations > 0) {
                throw new ApiError('Customer accounts with invoices, repair jobs, or reservations must be retained.');
            }
            if ((int) ($cust['wallet_balance'] ?? 0) > 0) {
                throw new ApiError("Cannot delete '{$cust['name']}' while wallet balance is non-zero.");
            }

            BaseRepository::run('UPDATE customers SET deleted_at=NOW(), synced=0 WHERE id=?', [$cid]);
            UserRepository::logAudit((int) $user['id'], (int) $cust['branch_id'], 'customer.delete', [
                'id' => $cid,
                'name' => $cust['name'],
                'phone' => $cust['phone'],
            ]);

            return ['deleted' => true, 'id' => $cid, 'message' => "Customer '{$cust['name']}' deleted."];
        });
    }

    public static function logBarcodePrint(array $user, int $branch, array $body): array {
        $items = $body['items'] ?? [];
        if (!is_array($items) || empty($items)) {
            return ['logged' => 0];
        }

        $logged = 0;
        foreach ($items as $item) {
            $pid = (int) ($item['product_id'] ?? 0);
            $copies = max(1, (int) ($item['copies'] ?? 1));
            $price = max(0, (int) ($item['price'] ?? 0));
            if ($pid <= 0) continue;

            BaseRepository::run(
                'INSERT INTO barcode_print_logs(branch_id, product_id, user_id, copies, price) VALUES (?,?,?,?,?)',
                [$branch, $pid, (int) ($user['id'] ?? 1), $copies, $price]
            );
            $logged++;
        }

        return ['logged' => $logged];
    }

    public static function getBarcodePrintStats(int $branch): array {
        $where = $branch > 0 ? 'WHERE branch_id = ?' : '';
        $params = $branch > 0 ? [$branch] : [];

        $rows = BaseRepository::rows(
            "SELECT 
                product_id,
                SUM(copies) AS total_labels,
                COUNT(*) AS times_printed,
                MAX(created_at) AS last_printed_at,
                (SELECT price FROM barcode_print_logs b2 
                 WHERE b2.product_id = barcode_print_logs.product_id " . ($branch > 0 ? 'AND b2.branch_id = barcode_print_logs.branch_id' : '') . " 
                 ORDER BY b2.id DESC LIMIT 1) AS last_price
            FROM barcode_print_logs
            {$where}
            GROUP BY product_id",
            $params
        );

        $map = [];
        foreach ($rows as $r) {
            $map[(string) $r['product_id']] = [
                'total_labels' => (int) $r['total_labels'],
                'times_printed' => (int) $r['times_printed'],
                'last_printed_at' => $r['last_printed_at'],
                'last_price' => (int) ($r['last_price'] ?? 0),
            ];
        }
        return $map;
    }

    public static function getInstalledPrinters(): array {
        $savedPrinter = trim((string) (BaseRepository::scalar('SELECT label_printer_name FROM settings WHERE id=1') ?? ''));
        $defaultPrinter = '';
        $printers = [];

        if (PHP_OS_FAMILY === 'Windows' && function_exists('exec')) {
            $ps = 'Add-Type -AssemblyName System.Drawing; '
                . '$def = (New-Object System.Drawing.Printing.PrinterSettings).PrinterName; '
                . '$list = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters); '
                . '@{ default_printer = $def; printers = $list } | ConvertTo-Json -Compress';
            $out = [];
            $code = 0;
            @exec('powershell -NoProfile -ExecutionPolicy Bypass -Command "' . $ps . '" 2>nul', $out, $code);
            $raw = trim(implode("\n", $out));
            if ($code === 0 && $raw !== '') {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    $defaultPrinter = trim((string) ($decoded['default_printer'] ?? ''));
                    $rawList = $decoded['printers'] ?? [];
                    if (is_string($rawList)) {
                        $rawList = [$rawList];
                    }
                    if (is_array($rawList)) {
                        foreach ($rawList as $name) {
                            $n = trim((string) $name);
                            if ($n !== '' && !in_array($n, $printers, true)) {
                                $printers[] = $n;
                            }
                        }
                    }
                }
            }
        }

        if ($defaultPrinter !== '' && !in_array($defaultPrinter, $printers, true)) {
            array_unshift($printers, $defaultPrinter);
        }

        return [
            'saved_printer' => $savedPrinter,
            'default_printer' => $defaultPrinter,
            'printers' => $printers,
        ];
    }

    public static function saveLabelSetup(array $body): array {
        $printerName = trim(substr((string) ($body['label_printer_name'] ?? ''), 0, 255));
        $labelW = max(20, min(120, (int) ($body['label_width_mm'] ?? 50)));
        $labelH = max(15, min(100, (int) ($body['label_height_mm'] ?? 30)));
        $across = max(1, min(4, (int) ($body['label_across'] ?? 2)));
        $rollW = max(30, min(220, (int) ($body['label_roll_mm'] ?? 106)));
        $showDigits = !empty($body['label_show_digits']) ? 1 : 0;

        BaseRepository::run(
            'UPDATE settings SET label_printer_name=?, label_width_mm=?, label_height_mm=?, label_across=?, label_roll_mm=?, label_show_digits=? WHERE id=1',
            [$printerName, $labelW, $labelH, $across, $rollW, $showDigits]
        );

        return [
            'label_printer_name' => $printerName,
            'label_width_mm' => $labelW,
            'label_height_mm' => $labelH,
            'label_across' => $across,
            'label_roll_mm' => $rollW,
            'label_show_digits' => $showDigits,
        ];
    }

    public static function deleteProduct(array $user, array $body): array {
        $id = Validator::integer($body['id'] ?? ($body['product_id'] ?? null), 'Product');
        $pin = trim((string) ($body['pin'] ?? ''));

        $pinHash = trim((string) (BaseRepository::scalar('SELECT delete_pin_hash FROM settings WHERE id=1') ?? ''));
        if ($pinHash === '') {
            throw new ApiError('Inventory Delete PIN is not set yet. Configure a PIN in Settings first.', 400);
        }
        if ($pin === '' || !password_verify($pin, $pinHash)) {
            throw new ApiError('Incorrect Security PIN.', 403);
        }

        $product = ProductRepository::findById($id);
        if (!$product || (isset($product['active']) && (int) $product['active'] === 0)) {
            throw new ApiError('Product not found.', 404);
        }
        $saleCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM sale_items WHERE product_id=?', [$id]);
        $purchaseCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM purchases WHERE product_id=?', [$id]);
        $transferCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM transfers WHERE product_id=?', [$id]);
        $exchangeCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM exchanges WHERE product_id=?', [$id]);
        $unitCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM units WHERE product_id=?', [$id]);

        $reservationCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM reservations WHERE product_id=?', [$id]);
        $hasHistory = ($saleCount + $purchaseCount + $transferCount + $exchangeCount + $unitCount + $reservationCount) > 0;

        return BaseRepository::transaction(function () use ($id, $product, $hasHistory, $user) {
            BaseRepository::scalar('SELECT id FROM products WHERE id=? FOR UPDATE', [$id]);
            if (BaseRepository::scalar("SELECT id FROM reservations WHERE product_id=? AND status='Held' LIMIT 1", [$id])) {
                throw new ApiError('Settle or cancel the active reservations before deleting this product.', 409);
            }
            BaseRepository::run('DELETE FROM stock WHERE product_id=?', [$id]);

            if ($hasHistory) {
                if (!empty($product['image_path'])) {
                    \Zeedat\Support\ProductImage::delete($product['image_path']);
                }
                BaseRepository::run("UPDATE products SET active=0, barcode=NULL, image_path='', synced=0 WHERE id=?", [$id]);
                UserRepository::logAudit((int) $user['id'], null, 'product.archive', [
                    'id' => $id,
                    'sku' => $product['sku'],
                    'name' => $product['name'],
                ]);
                return [
                    'id' => $id,
                    'deleted' => true,
                    'archived' => true,
                    'message' => "Item '{$product['name']}' deleted from inventory (sales/purchase records preserved).",
                ];
            }

            if (!empty($product['image_path'])) {
                \Zeedat\Support\ProductImage::delete($product['image_path']);
            }
            BaseRepository::run('DELETE FROM stock_movements WHERE product_id=?', [$id]);
            BaseRepository::run('DELETE FROM barcode_print_logs WHERE product_id=?', [$id]);
            BaseRepository::run('DELETE FROM products WHERE id=?', [$id]);

            UserRepository::logAudit((int) $user['id'], null, 'product.delete', [
                'id' => $id,
                'sku' => $product['sku'],
                'name' => $product['name'],
            ]);

            return [
                'id' => $id,
                'deleted' => true,
                'archived' => false,
                'message' => "Item '{$product['name']}' permanently deleted.",
            ];
        });
    }

    public static function importProducts(array $user, int $branch, array $body): array {
        $rows = $body['items'] ?? null;
        if (!is_array($rows) || empty($rows)) {
            throw new ApiError('No items provided for import.');
        }
        if (count($rows) > 1000) {
            throw new ApiError('Import up to 1,000 rows per batch.');
        }

        $mode = ($body['mode'] ?? 'add') === 'set' ? 'set' : 'add';
        $allowedCategories = ['Phones', 'Accessories', 'Repair Parts', 'Services'];

        return BaseRepository::transaction(function () use ($user, $branch, $rows, $mode, $allowedCategories) {
            $created = 0;
            $updated = 0;
            $stockAdjusted = 0;
            $skipped = 0;
            $batchRef = 'XLS-' . date('YmdHis');

            $validBranchIds = [];
            foreach (BaseRepository::rows('SELECT id FROM branches') as $br) {
                $validBranchIds[(int) $br['id']] = true;
            }

            foreach ($rows as $raw) {
                if (!is_array($raw)) {
                    $skipped++;
                    continue;
                }
                $name = preg_replace('/\s+/', ' ', trim((string) ($raw['name'] ?? '')));
                if ($name === '') {
                    $skipped++;
                    continue;
                }
                if (mb_strlen($name) > 120) {
                    $name = mb_substr($name, 0, 120);
                }

                $rawCat = trim((string) ($raw['category'] ?? 'Accessories'));
                $category = 'Accessories';
                foreach ($allowedCategories as $validCat) {
                    if (strcasecmp($rawCat, $validCat) === 0) {
                        $category = $validCat;
                        break;
                    }
                }

                $brand = mb_substr(trim((string) ($raw['brand'] ?? '')), 0, 60);
                $barcode = $category === 'Services' ? '' : mb_substr(trim((string) ($raw['barcode'] ?? '')), 0, 40);
                $skuInput = trim((string) ($raw['sku'] ?? ''));

                $cost = max(0, (int) ($raw['cost'] ?? 0));
                $price = max(0, (int) ($raw['price'] ?? 0));
                $qty = max(0, (int) ($raw['qty'] ?? 0));
                $reorder = max(0, (int) ($raw['reorder_level'] ?? 0));
                $commType = strtolower(trim((string) ($raw['commission_type'] ?? 'fixed'))) === 'percent' ? 'percent' : 'fixed';
                $commVal = max(0, (int) ($raw['commission_value'] ?? 0));
                if ($commType === 'percent' && $commVal > 10000) {
                    $commVal = 10000;
                }

                // Match existing product strictly without duplicating names:
                // 1) exact Name (case-insensitive), 2) Item Code (SKU), 3) Barcode
                $existing = BaseRepository::one('SELECT id, sku, name, barcode, serialized FROM products WHERE LOWER(TRIM(name))=LOWER(?) LIMIT 1', [$name]);
                if (!$existing && $skuInput !== '') {
                    $existing = BaseRepository::one('SELECT id, sku, name, barcode, serialized FROM products WHERE UPPER(sku)=UPPER(?) LIMIT 1', [$skuInput]);
                }
                if (!$existing && $barcode !== '') {
                    $existing = BaseRepository::one('SELECT id, sku, name, barcode, serialized FROM products WHERE barcode=? LIMIT 1', [$barcode]);
                }

                if ($existing) {
                    $pid = (int) $existing['id'];
                    // Ensure renaming by SKU/barcode doesn't collide with another product's unique name
                    $nameHolder = (int) BaseRepository::scalar('SELECT id FROM products WHERE LOWER(TRIM(name))=LOWER(?) AND id!=?', [$name, $pid]);
                    $finalName = $nameHolder > 0 ? (string) $existing['name'] : $name;

                    if ($barcode !== '') {
                        $holder = (int) BaseRepository::scalar('SELECT id FROM products WHERE barcode=? AND id!=?', [$barcode, $pid]);
                        if ($holder > 0) {
                            $barcode = (string) ($existing['barcode'] ?? '');
                        }
                    } else {
                        $barcode = (string) ($existing['barcode'] ?? '');
                    }
                    BaseRepository::run(
                        'UPDATE products SET barcode=?, name=?, brand=?, category=?, cost=?, price=?, reorder_level=?, commission_type=?, commission_value=?, active=1, synced=0 WHERE id=?',
                        [$barcode !== '' ? $barcode : null, $finalName, $brand, $category, $cost, $price, $reorder, $commType, $commVal, $pid]
                    );
                    $updated++;
                } else {
                    $sku = self::generateUniqueSku($category);
                    if ($barcode !== '') {
                        $holder = (int) BaseRepository::scalar('SELECT id FROM products WHERE barcode=?', [$barcode]);
                        if ($holder > 0) {
                            $barcode = '';
                        }
                    }
                    $pid = BaseRepository::insert(
                        'INSERT INTO products(sku, barcode, name, brand, category, cost, price, reorder_level, serialized, commission_type, commission_value, image_path, synced) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,0)',
                        [$sku, $barcode !== '' ? $barcode : null, $name, $brand, $category, $cost, $price, $reorder, $commType, $commVal, '']
                    );
                    $created++;
                }

                if ($category !== 'Services' && empty($existing['serialized'])) {
                    $branchMap = !empty($raw['branch_stocks']) && is_array($raw['branch_stocks'])
                        ? $raw['branch_stocks']
                        : ($branch > 0 ? [$branch => $qty] : []);

                    foreach ($branchMap as $bKey => $bQtyRaw) {
                        $bId = (int) $bKey;
                        if ($bId <= 0 || !isset($validBranchIds[$bId])) continue;
                        $targetQty = max(0, (int) $bQtyRaw);
                        $currentQty = (int) BaseRepository::scalar('SELECT COALESCE(qty, 0) FROM stock WHERE branch_id=? AND product_id=?', [$bId, $pid]);
                        $delta = $mode === 'set' ? ($targetQty - $currentQty) : $targetQty;
                        if ($delta !== 0) {
                            ProductRepository::adjustStock(
                                $bId,
                                $pid,
                                $delta,
                                'Excel Import',
                                $batchRef,
                                (int) ($user['id'] ?? 1)
                            );
                            $stockAdjusted++;
                        }
                    }
                }
            }

            return [
                'created' => $created,
                'updated' => $updated,
                'stock_adjusted' => $stockAdjusted,
                'skipped' => $skipped,
                'total_processed' => $created + $updated,
                'batch_ref' => $batchRef,
            ];
        });
    }
}
