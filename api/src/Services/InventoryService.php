<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\ProductRepository;
use Zeedat\Repositories\UserRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class InventoryService {
    public static function generateUniqueSku(string $category = 'Accessories'): string {
        $prefix = match ($category) {
            'Phones' => 'PHN',
            'Accessories' => 'ACC',
            'Repair Parts' => 'PRT',
            'Services' => 'SRV',
            default => 'PRD',
        };
        do {
            $sku = $prefix . '-' . str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        } while (BaseRepository::scalar('SELECT id FROM products WHERE sku=?', [$sku]));
        return $sku;
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
            BaseRepository::run('UPDATE products SET barcode=? WHERE id=?', [$code, $pid]);
            $updated[] = ['id' => $pid, 'barcode' => $code];
            $count++;
        }
        return ['updated' => $count, 'products' => $updated];
    }

    public static function saveProduct(array $user, array $body): array {
        $id = empty($body['id']) ? null : Validator::integer($body['id'], 'Product');
        $category = Validator::str($body, 'category', 40);

        // Auto-generate SKU by system if not provided
        $skuInput = trim((string) ($body['sku'] ?? ''));
        if ($skuInput === '') {
            if ($id) {
                $existingSku = BaseRepository::scalar('SELECT sku FROM products WHERE id=?', [$id]);
                $sku = $existingSku ?: self::generateUniqueSku($category);
            } else {
                $sku = self::generateUniqueSku($category);
            }
        } else {
            $sku = strtoupper(Validator::str($body, 'sku', 40));
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

        if ($id) {
            BaseRepository::run(
                'UPDATE products SET sku=?, barcode=?, name=?, brand=?, category=?, cost=?, price=?, reorder_level=? WHERE id=?',
                [$sku, $barcode ?: null, $name, $brand ?: '', $category, $cost, $price, $reorder, $id]
            );
        } else {
            $id = BaseRepository::insert(
                'INSERT INTO products(sku, barcode, name, brand, category, cost, price, reorder_level, serialized) VALUES (?,?,?,?,?,?,?,?,?)',
                [$sku, $barcode ?: null, $name, $brand ?: '', $category, $cost, $price, $reorder, $serialized]
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

        return ['id' => $id, 'sku' => $sku, 'name' => $name, 'barcode' => $barcode];
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

        BaseRepository::run('UPDATE products SET barcode=? WHERE id=?', [$barcode ?: null, $id]);

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
        $limit = (int) ($query['limit'] ?? 200);
        return ProductRepository::stockMovements($branch, $limit);
    }

    public static function receiveUnit(array $user, int $branch, array $body): array {
        $product = Validator::integer($body['product_id'] ?? null, 'Product');
        $p = ProductRepository::findById($product);
        if (!$p || !$p['serialized']) {
            throw new ApiError('Product must be serialized.');
        }

        $code = strtoupper(Validator::str($body, 'code', 50));
        $imei = Validator::str($body, 'imei', 60, false);
        $grade = Validator::str($body, 'grade', 20);

        $id = BaseRepository::insert(
            "INSERT INTO units(branch_id, product_id, code, imei, grade, state) VALUES (?,?,?,?,?,'Available')",
            [$branch, $product, $code, $imei ?: null, $grade]
        );

        ProductRepository::adjustStock($branch, $product, 1, 'Receive device unit', $code, (int) $user['id']);

        return ['id' => $id, 'code' => $code, 'state' => 'Available'];
    }

    public static function releaseUnit(array $user, int $branch, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Unit');
        $unit = BaseRepository::one("SELECT * FROM units WHERE id=? AND branch_id=? AND state='Inspection' FOR UPDATE", [$id, $branch]);
        if (!$unit) {
            throw new ApiError('Unit is not in inspection.', 404);
        }

        $reason = Validator::str($body, 'reason', 150);
        BaseRepository::run("UPDATE units SET state='Available' WHERE id=?", [$id]);
        ProductRepository::adjustStock($branch, (int) $unit['product_id'], 1, 'Inspection released to stock: ' . $reason, $unit['code'], (int) $user['id']);

        return ['id' => $id, 'state' => 'Available'];
    }

    public static function saveCustomer(int $branch, array $body): array {
        $id = empty($body['id']) ? null : Validator::integer($body['id'], 'Customer');
        $name = Validator::str($body, 'name', 120);
        $phone = Validator::str($body, 'phone', 30);
        $email = Validator::str($body, 'email', 150, false);
        $notes = Validator::str($body, 'notes', 500, false);

        if ($id) {
            BaseRepository::run(
                'UPDATE customers SET name=?, phone=?, email=?, notes=? WHERE id=? AND branch_id=?',
                [$name, $phone, $email ?: '', $notes ?: '', $id, $branch]
            );
        } else {
            $id = BaseRepository::insert(
                'INSERT INTO customers(branch_id, name, phone, email, notes) VALUES (?,?,?,?,?)',
                [$branch, $name, $phone, $email ?: '', $notes ?: '']
            );
        }

        return ['id' => $id, 'name' => $name];
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

        $hasHistory = ($saleCount + $purchaseCount + $transferCount + $exchangeCount + $unitCount) > 0;

        return BaseRepository::transaction(function () use ($id, $product, $hasHistory, $user) {
            BaseRepository::run('DELETE FROM stock WHERE product_id=?', [$id]);

            if ($hasHistory) {
                BaseRepository::run('UPDATE products SET active=0, barcode=NULL WHERE id=?', [$id]);
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
}
