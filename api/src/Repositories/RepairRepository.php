<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class RepairRepository extends BaseRepository {
    public static function all(int $branch, array $user): array {
        $clauses = [];
        $params = [];
        if ($branch) {
            $clauses[] = 'r.branch_id=?';
            $params[] = $branch;
        }
        if ($user['role'] === 'technician') {
            $clauses[] = 'r.technician_id=?';
            $params[] = $user['id'];
        }
        $where = $clauses ? 'WHERE ' . implode(' AND ', $clauses) : '';
        return self::rows("SELECT r.*, c.name customer, c.phone customer_phone, c.email customer_email, u.name technician, b.name branch_name FROM repairs r
            JOIN customers c ON c.id=r.customer_id
            JOIN branches b ON b.id=r.branch_id
            LEFT JOIN users u ON u.id=r.technician_id {$where} ORDER BY r.id DESC", $params);
    }
}
