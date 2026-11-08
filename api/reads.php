<?php
declare(strict_types=1);

function readRoute(string $route, array $user, array $query): array {
    if ($route === 'destinations') {
        allow($user, 'owner', 'manager', 'stock');
        return rows('SELECT id,name FROM branches ORDER BY id');
    }
    if ($route === 'branches') {
        return $user['role'] === 'owner' ? rows('SELECT * FROM branches ORDER BY id') :
            rows('SELECT * FROM branches WHERE id=?', [$user['branch_id']]);
    }
    $branch = branchFor($user, $query['branch'] ?? 0, false);
    $params = $branch ? [$branch] : [];
    $scope = $branch ? ' WHERE branch_id=?' : '';
    $and = $branch ? ' AND branch_id=?' : '';
    switch ($route) {
        case 'dashboard':
            allow($user, 'owner', 'manager');
            return dashboard($branch, integer($query['days'] ?? 7, 'Date range', 1, 366));
        case 'products':
            allow($user, 'owner', 'manager', 'cashier', 'stock');
            $qty = $branch
                ? 'SELECT product_id,SUM(qty) qty FROM stock WHERE branch_id=? GROUP BY product_id'
                : 'SELECT product_id,SUM(qty) qty FROM stock GROUP BY product_id';
            $priceFields = $user['role'] === 'cashier' ? '' : ',p.cost';
            return rows("SELECT p.id,p.sku,p.barcode,p.name,p.brand,p.category,p.price,p.reorder_level,p.serialized
                $priceFields,CAST(COALESCE(s.qty,0) AS UNSIGNED) qty FROM products p LEFT JOIN ($qty) s ON p.id=s.product_id ORDER BY p.id", $params);
        case 'units':
            allow($user, 'owner', 'manager', 'cashier', 'stock');
            if (!$branch) fail('Select a branch.');
            return rows("SELECT id,product_id,code,imei,grade,state FROM units WHERE branch_id=? ORDER BY id", [$branch]);
        case 'customers':
            allow($user, 'owner', 'manager', 'cashier');
            return rows("SELECT c.*, b.name branch, CAST(COALESCE(t.total,0) AS UNSIGNED) total,CAST(COALESCE(t.credit,0) AS UNSIGNED) credit
                FROM customers c JOIN branches b ON b.id=c.branch_id
                LEFT JOIN (SELECT customer_id,SUM(total) total,SUM(credit) credit FROM sales GROUP BY customer_id) t ON t.customer_id=c.id
                " . ($branch ? 'WHERE c.branch_id=?' : '') . " ORDER BY c.id DESC", $params);
        case 'repairs':
            allow($user, 'owner', 'manager', 'cashier', 'technician');
            $clauses = [];
            if ($branch) $clauses[] = 'r.branch_id=?';
            if ($user['role'] === 'technician') {
                $clauses[] = 'r.technician_id=?';
                $params[] = $user['id'];
            }
            $where = $clauses ? 'WHERE ' . implode(' AND ', $clauses) : '';
            return rows("SELECT r.*, c.name customer, u.name technician FROM repairs r
                JOIN customers c ON c.id=r.customer_id LEFT JOIN users u ON u.id=r.technician_id $where ORDER BY r.id DESC", $params);
        case 'technicians':
            allow($user, 'owner', 'manager', 'cashier');
            return rows("SELECT id,name FROM users WHERE role='technician' AND active=1 $and ORDER BY name", $params);
        case 'drafts':
            allow($user, 'owner', 'manager', 'cashier');
            if (!$branch) fail('Select a branch.');
            return rows('SELECT id,payload,created_at FROM drafts WHERE branch_id=? AND user_id=? ORDER BY id DESC', [$branch, $user['id']]);
        case 'sales':
            allow($user, 'owner', 'manager', 'cashier');
            return recentSales($branch, 100);
        case 'invoice':
            allow($user, 'owner', 'manager', 'cashier');
            $id = invoiceId($query['id'] ?? '');
            return invoice($id, $branch);
        case 'drawer':
            allow($user, 'owner', 'manager', 'cashier');
            if (!$branch) fail('Select a branch.');
            $drawer = one('SELECT d.*, c.business_date,u.name operator FROM drawers d JOIN cycles c ON c.id=d.cycle_id JOIN users u ON u.id=d.user_id WHERE d.branch_id=? AND d.closed_at IS NULL', [$branch]);
            $history = rows('SELECT d.*, c.business_date,u.name operator FROM drawers d JOIN cycles c ON c.id=d.cycle_id JOIN users u ON u.id=d.user_id WHERE d.branch_id=? AND d.closed_at IS NOT NULL ' . ($user['role'] === 'cashier' ? 'AND d.user_id=' . (int) $user['id'] : '') . ' ORDER BY d.id DESC LIMIT 20', [$branch]);
            if ($drawer && $user['role'] === 'cashier' && $drawer['user_id'] !== $user['id']) return ['drawer' => null, 'blocked' => true, 'history' => $history, 'movements' => []];
            $movements = $drawer ? rows('SELECT * FROM cash_movements WHERE drawer_id=? ORDER BY id DESC', [$drawer['id']]) : [];
            if ($drawer) $drawer['expected'] = (int) $drawer['opening'] + array_sum(array_column($movements, 'amount'));
            return ['drawer' => $drawer, 'history' => $history, 'movements' => $movements];
        case 'returns':
            allow($user, 'owner', 'manager', 'cashier');
            return rows("SELECT r.*, i.sale_id, i.name product, COALESCE(c.name,'Walk-in') customer,
                x.replacement_sale_id,x.quoted_total,p.name replacement FROM returns_log r
                JOIN sale_items i ON r.sale_item_id=i.id JOIN sales s ON i.sale_id=s.id LEFT JOIN customers c ON s.customer_id=c.id
                LEFT JOIN exchanges x ON x.return_id=r.id LEFT JOIN products p ON p.id=x.product_id
                " . ($branch ? 'WHERE r.branch_id=?' : '') . ' ORDER BY r.id DESC LIMIT 100', $params);
        case 'suppliers':
            allow($user, 'owner', 'manager', 'stock');
            return rows('SELECT * FROM suppliers ORDER BY name');
        case 'purchases':
            allow($user, 'owner', 'manager', 'stock');
            return rows("SELECT a.*,s.name supplier,p.name product FROM purchases a JOIN suppliers s ON s.id=a.supplier_id
                JOIN products p ON p.id=a.product_id $scope ORDER BY a.id DESC LIMIT 100", $params);
        case 'transfers':
            allow($user, 'owner', 'manager', 'stock');
            return rows('SELECT t.*, p.name product, a.name source, b.name destination FROM transfers t JOIN products p ON p.id=t.product_id
                JOIN branches a ON a.id=t.from_branch JOIN branches b ON b.id=t.to_branch ' .
                ($branch ? 'WHERE from_branch=? OR to_branch=?' : '') . ' ORDER BY t.id DESC LIMIT 100', $branch ? [$branch,$branch] : []);
        case 'staff':
            allow($user, 'owner');
            return rows('SELECT u.id,u.name,u.email,u.role,u.active,b.name branch FROM users u LEFT JOIN branches b ON b.id=u.branch_id ORDER BY u.id');
        case 'settings':
            return one('SELECT shop_name,tax_bps,paper_width FROM settings WHERE id=1');
        case 'audit':
            allow($user, 'owner');
            return rows('SELECT a.id,a.action,a.details,a.created_at,u.name actor FROM audit_log a JOIN users u ON u.id=a.user_id ' .
                ($branch ? 'WHERE a.branch_id=?' : '') . ' ORDER BY a.id DESC LIMIT 60', $params);
        default:
            fail('Route not found.', 404);
    }
}
function invoiceId(mixed $value): int {
    if (!is_string($value) && !is_int($value)) fail('Invalid invoice number.');
    $digits = ltrim(preg_replace('/^INV-/i', '', trim((string) $value)), '0');
    return integer($digits, 'Invoice number');
}
function invoice(int $id, int $branch): array {
    $sale = one("SELECT s.*,b.name branch,COALESCE(c.name,'Walk-in') customer FROM sales s JOIN branches b ON b.id=s.branch_id
        LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?" . ($branch ? ' AND s.branch_id=?' : ''), $branch ? [$id,$branch] : [$id]);
    if (!$sale) fail('Invoice not found for this branch.', 404);
    $sale['items'] = rows('SELECT i.*, u.code, u.imei FROM sale_items i LEFT JOIN units u ON u.id=i.unit_id WHERE i.sale_id=? ORDER BY i.id', [$id]);
    $sale['payments'] = rows('SELECT method,amount,kind,reference FROM payments WHERE sale_id=? ORDER BY id', [$id]);
    $sale['refunded'] = (int) scalar("SELECT COALESCE(SUM(r.amount),0) FROM returns_log r JOIN sale_items i ON i.id=r.sale_item_id WHERE i.sale_id=? AND r.status='Completed'", [$id]);
    return $sale;
}
function recentSales(int $branch, int $limit): array {
    return rows("SELECT s.id,s.branch_id,s.customer_id,s.created_at,s.total,s.credit,b.name branch,COALESCE(c.name,'Walk-in') customer,
        (SELECT GROUP_CONCAT(name ORDER BY id SEPARATOR ', ') FROM sale_items WHERE sale_id=s.id) items
        FROM sales s JOIN branches b ON b.id=s.branch_id LEFT JOIN customers c ON c.id=s.customer_id " .
        ($branch ? 'WHERE s.branch_id=?' : '') . " ORDER BY s.created_at DESC,s.id DESC LIMIT $limit", $branch ? [$branch] : []);
}
function dashboard(int $branch, int $days): array {
    $today = date('Y-m-d');
    $start = (new DateTimeImmutable($today))->modify('-' . ($days - 1) . ' days')->format('Y-m-d');
    $scope = $branch ? ' AND s.branch_id=?' : '';
    $params = $branch ? [$branch] : [];
    $daily = rows("SELECT DATE(s.created_at) day,SUM(s.total) total FROM sales s WHERE s.created_at>=? $scope GROUP BY DATE(s.created_at) ORDER BY day", [$start,...$params]);
    $daily = array_column($daily, 'total', 'day');
    $trend = [];
    for ($day = new DateTimeImmutable($start); $day->format('Y-m-d') <= $today; $day = $day->modify('+1 day')) {
        $key = $day->format('Y-m-d');
        $trend[] = ['day' => $key, 'total' => (int) ($daily[$key] ?? 0)];
    }
    $branchStats = rows("SELECT b.id,b.name,
        (SELECT COALESCE(SUM(total),0) FROM sales WHERE branch_id=b.id AND created_at>=?) sales,
        (SELECT COUNT(*) FROM sales WHERE branch_id=b.id AND created_at>=?) bills,
        (SELECT COUNT(*) FROM repairs WHERE branch_id=b.id AND created_at>=?) repairs
        FROM branches b " . ($branch ? 'WHERE b.id=?' : '') . ' ORDER BY b.id', [$today,$today,$today,...$params]);
    $repairStats = one("SELECT COUNT(*) open_count, COALESCE(SUM(due_date < ?),0) overdue FROM repairs s WHERE status NOT IN ('Delivered','Cancelled') $scope", [$today,...$params]);
    $low = rows("SELECT s.branch_id,p.name,p.sku,s.qty,p.reorder_level,b.name branch FROM stock s JOIN products p ON p.id=s.product_id
        JOIN branches b ON b.id=s.branch_id WHERE s.qty<=p.reorder_level $scope ORDER BY s.qty,p.name", $params);
    $collections = rows("SELECT p.method,SUM(p.amount) total,
        SUM(CASE WHEN p.created_at>=? THEN p.amount ELSE 0 END) today
        FROM payments p JOIN drawers s ON s.id=p.drawer_id WHERE p.created_at>=? $scope GROUP BY p.method", [$today,$start,...$params]);
    return [
        'today' => $today, 'sales' => array_sum(array_column($branchStats, 'sales')),
        'bills' => array_sum(array_column($branchStats, 'bills')), 'collected' => array_sum(array_column($collections, 'today')),
        'credit' => (int) scalar("SELECT COALESCE(SUM(credit),0) FROM sales s WHERE credit>0 $scope", $params),
        'credit_accounts' => (int) scalar("SELECT COUNT(DISTINCT customer_id) FROM sales s WHERE credit>0 $scope", $params),
        'repairs' => $repairStats, 'low' => $low, 'branches' => $branchStats, 'trend' => $trend, 'collections' => $collections,
        'pending' => rows("SELECT s.id,s.amount,s.reason,b.name branch FROM returns_log s JOIN branches b ON b.id=s.branch_id
            WHERE s.status='Pending' $scope ORDER BY s.id DESC LIMIT 8", $params),
        'recent' => recentSales($branch, 8),
    ];
}

