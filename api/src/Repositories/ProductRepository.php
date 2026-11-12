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

        $products = self::rows("SELECT p.id, p.sku, p.barcode, p.name, p.brand, p.category, p.price, p.reorder_level, p.serialized,
            COALESCE(p.image_path, '') AS image_path,
            COALESCE(p.commission_type, 'fixed') AS commission_type, COALESCE(p.commission_value, 0) AS commission_value
            {$costField}, CAST(COALESCE(s.qty, 0) AS UNSIGNED) qty FROM products p LEFT JOIN ({$qty}) s ON p.id=s.product_id WHERE COALESCE(p.active, 1)=1 ORDER BY p.id", $params);

        $branchStocks = self::rows(
            "SELECT s.product_id, s.branch_id, b.name as branch_name, s.qty,
                    CAST(s.qty AS SIGNED) - COALESCE((SELECT SUM(r.qty) FROM reservations r WHERE r.branch_id=s.branch_id AND r.product_id=s.product_id AND r.status='Held'),0) AS available_qty
             FROM stock s
             JOIN branches b ON b.id=s.branch_id
             ORDER BY b.id"
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
                'available_qty' => max(0, (int) $bs['available_qty']),
            ];
            $totalsByProduct[$pid] = ($totalsByProduct[$pid] ?? 0) + $qtyVal;
        }

        foreach ($products as &$p) {
            $pid = (int) $p['id'];
            $p['branch_stocks'] = $stocksByProduct[$pid] ?? [];
            $p['total_qty'] = $totalsByProduct[$pid] ?? (int) $p['qty'];
            $p['image_url'] = \Zeedat\Support\ProductImage::imageUrl($pid, $p['image_path'] ?? '');
        }

        return $products;
    }

    public static function findById(int $id): ?array {
        return self::one('SELECT * FROM products WHERE id=?', [$id]);
    }

    public static function units(int $branch = 0): array {
        $where = $branch > 0 ? 'WHERE u.branch_id=? AND COALESCE(p.active, 1)=1' : 'WHERE COALESCE(p.active, 1)=1';
        $params = $branch > 0 ? [$branch] : [];

        return self::rows(
            "SELECT u.id, u.branch_id, b.name AS branch_name, u.product_id,
                    p.name AS product_name, p.sku, p.category, p.cost, p.price,
                    u.code, COALESCE(u.imei, '') AS imei, u.grade, u.state,
                    CASE WHEN EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=u.id AND r.status='Held') THEN 1 ELSE 0 END AS reserved
             FROM units u
             JOIN products p ON p.id=u.product_id
             JOIN branches b ON b.id=u.branch_id
             {$where}
             ORDER BY u.id DESC",
            $params
        );
    }

    public static function findAvailableUnit(int $unitId, int $branch, int $productId): ?array {
        return self::one("SELECT id FROM units WHERE id=? AND branch_id=? AND product_id=? AND state='Available'
            AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=units.id AND r.status='Held') FOR UPDATE", [$unitId, $branch, $productId]);
    }

    public static function assertStockAvailable(int $branch, int $productId, int $qty, int $releasingHold = 0): void {
        $stock = (int) self::scalar('SELECT qty FROM stock WHERE branch_id=? AND product_id=? FOR UPDATE', [$branch, $productId]);
        $held = (int) self::scalar("SELECT COALESCE(SUM(qty),0) FROM reservations WHERE branch_id=? AND product_id=? AND status='Held' AND id<>?", [$branch, $productId, $releasingHold]);
        if ($stock - $held < $qty) {
            throw new \Zeedat\Support\ApiError('Insufficient available stock. Some items may be reserved for customers.', 409);
        }
    }

    public static function adjustStock(int $branch, int $productId, int $delta, string $kind, ?string $reference = null, int $userId = 1): void {
        if ($delta < 0) {
            self::assertStockAvailable($branch, $productId, -$delta);
            self::run('UPDATE stock SET qty=qty-? WHERE branch_id=? AND product_id=?', [-$delta, $branch, $productId]);
        } else {
            $stockSql = \Zeedat\Config\Database::isSqlite()
                ? 'INSERT INTO stock(branch_id, product_id, qty) VALUES (?,?,?) ON CONFLICT(branch_id, product_id) DO UPDATE SET qty=stock.qty+excluded.qty'
                : 'INSERT INTO stock(branch_id, product_id, qty) VALUES (?,?,?) ON DUPLICATE KEY UPDATE qty=qty+VALUES(qty)';
            self::run($stockSql, [$branch, $productId, $delta]);
        }
        self::run(
            'INSERT INTO stock_movements(branch_id, product_id, user_id, qty, kind, reference, synced) VALUES (?,?,?,?,?,?,0)',
            [$branch, $productId, $userId, $delta, $kind, $reference ?? '']
        );
    }

    public static function stockMovements(int $branch, int $limit = 300, string $from = '', string $to = ''): array {
        $clauses = [];
        $params = [];
        if ($branch > 0) {
            $clauses[] = 'm.branch_id=?';
            $params[] = $branch;
        }
        if ($from !== '') {
            $clauses[] = 'DATE(m.created_at)>=?';
            $params[] = $from;
        }
        if ($to !== '') {
            $clauses[] = 'DATE(m.created_at)<=?';
            $params[] = $to;
        }
        $where = empty($clauses) ? '' : 'WHERE ' . implode(' AND ', $clauses);
        $safeLimit = max(1, min(500, $limit));

        return self::rows(
            "SELECT m.id, m.branch_id, b.name AS branch_name, m.product_id,
                    p.name AS product_name, p.sku, p.category, COALESCE(p.barcode, '') AS barcode,
                    COALESCE(u.name, 'System') AS user_name,
                    m.qty, m.kind, m.reference, m.created_at
             FROM stock_movements m
             JOIN products p ON p.id=m.product_id
             JOIN branches b ON b.id=m.branch_id
             LEFT JOIN users u ON u.id=m.user_id
             {$where}
             ORDER BY m.id DESC
             LIMIT {$safeLimit}",
            $params
        );
    }
}
