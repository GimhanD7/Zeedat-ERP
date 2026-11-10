<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class ProductRepository extends BaseRepository {
    public static function all(int $branch, bool $includeCost): array {
        $qty = $branch
            ? 'SELECT product_id, SUM(qty) qty FROM stock WHERE branch_id=? GROUP BY product_id'
            : 'SELECT product_id, SUM(qty) qty FROM stock GROUP BY product_id';
        $params = $branch ? [$branch] : [];
        $costField = $includeCost ? ', p.cost' : '';

        $products = self::rows("SELECT p.id, p.sku, p.barcode, p.name, p.brand, p.category, p.price, p.reorder_level, p.serialized
            {$costField}, CAST(COALESCE(s.qty, 0) AS UNSIGNED) qty FROM products p LEFT JOIN ({$qty}) s ON p.id=s.product_id ORDER BY p.id", $params);

        $branchStocks = self::rows(
            'SELECT s.product_id, s.branch_id, b.name as branch_name, s.qty
             FROM stock s
             JOIN branches b ON b.id=s.branch_id
             ORDER BY b.id'
        );

        $stocksByProduct = [];
        $totalsByProduct = [];
        foreach ($branchStocks as $bs) {
            $pid = (int) $bs['product_id'];
            $qtyVal = (int) $bs['qty'];
            $stocksByProduct[$pid][] = [
                'branch_id' => (int) $bs['branch_id'],
                'branch_name' => (string) $bs['branch_name'],
                'qty' => $qtyVal,
            ];
            $totalsByProduct[$pid] = ($totalsByProduct[$pid] ?? 0) + $qtyVal;
        }

        foreach ($products as &$p) {
            $pid = (int) $p['id'];
            $p['branch_stocks'] = $stocksByProduct[$pid] ?? [];
            $p['total_qty'] = $totalsByProduct[$pid] ?? (int) $p['qty'];
        }

        return $products;
    }

    public static function findById(int $id): ?array {
        return self::one('SELECT * FROM products WHERE id=?', [$id]);
    }

    public static function units(int $branch): array {
        return self::rows('SELECT id, product_id, code, imei, grade, state FROM units WHERE branch_id=? ORDER BY id', [$branch]);
    }

    public static function findAvailableUnit(int $unitId, int $branch, int $productId): ?array {
        return self::one("SELECT id FROM units WHERE id=? AND branch_id=? AND product_id=? AND state='Available' FOR UPDATE", [$unitId, $branch, $productId]);
    }

    public static function adjustStock(int $branch, int $productId, int $delta, string $kind, ?string $reference = null, int $userId = 1): void {
        $stockSql = \Zeedat\Config\Database::isSqlite()
            ? 'INSERT INTO stock(branch_id, product_id, qty) VALUES (?,?,?) ON CONFLICT(branch_id, product_id) DO UPDATE SET qty=stock.qty+excluded.qty'
            : 'INSERT INTO stock(branch_id, product_id, qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty=qty+VALUES(qty)';
        self::run($stockSql, [$branch, $productId, $delta]);
        self::run(
            'INSERT INTO stock_movements(branch_id, product_id, user_id, qty, kind, reference) VALUES (?,?,?,?,?,?)',
            [$branch, $productId, $userId, $delta, $kind, $reference ?? '']
        );
        if ((int) self::scalar('SELECT qty FROM stock WHERE branch_id=? AND product_id=?', [$branch, $productId]) < 0) {
            throw new \Zeedat\Support\ApiError('Stock cannot drop below zero.');
        }
    }
}
