<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class UserRepository extends BaseRepository {
    public static function findActiveById(int $id): ?array {
        $user = self::one('SELECT id, branch_id, name, email, role FROM users WHERE id=? AND active=1', [$id]);
        if ($user) {
            $user['permissions'] = PermissionRepository::getPermissionsForRole($user['role']);
        }
        return $user;
    }

    public static function findByEmail(string $email): ?array {
        return self::one('SELECT id, password_hash, active FROM users WHERE email=?', [$email]);
    }

    public static function allStaff(): array {
        return self::rows('SELECT u.id, u.name, u.email, u.role, u.active, b.name branch FROM users u LEFT JOIN branches b ON b.id=u.branch_id ORDER BY u.id');
    }

    public static function technicians(int $branch): array {
        $and = $branch ? ' AND branch_id=?' : '';
        $params = $branch ? [$branch] : [];
        return self::rows("SELECT id, name FROM users WHERE role='technician' AND active=1 {$and} ORDER BY name", $params);
    }

    public static function logAudit(int $userId, ?int $branchId, string $action, string|array $details): void {
        $json = is_string($details) ? $details : json_encode($details, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        self::run('INSERT INTO audit_log(user_id, branch_id, action, details) VALUES (?,?,?,?)', [
            $userId,
            $branchId,
            $action,
            $json,
        ]);
    }

    public static function getAuditLogs(int $limit = 100): array {
        return self::rows("SELECT a.id, a.action, a.details, a.created_at, u.name actor, b.name branch FROM audit_log a JOIN users u ON u.id=a.user_id LEFT JOIN branches b ON b.id=a.branch_id ORDER BY a.id DESC LIMIT {$limit}");
    }

    public static function getSettings(): array {
        return self::one('SELECT * FROM settings WHERE id=1') ?? [];
    }

    public static function updateSettings(string $shopName, int $taxBps, int $paperWidth): void {
        self::run('UPDATE settings SET shop_name=?, tax_bps=?, paper_width=? WHERE id=1', [
            $shopName,
            $taxBps,
            $paperWidth,
        ]);
    }
}
