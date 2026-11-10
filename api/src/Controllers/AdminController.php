<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\PermissionRepository;
use Zeedat\Repositories\UserRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class AdminController {
    public static function getStaff(): array {
        return UserRepository::allStaff();
    }

    public static function getPermissions(): array {
        return PermissionRepository::getPermissionsData();
    }

    public static function savePermissions(array $user, array $body): array {
        $matrix = $body['matrix'] ?? $body;
        if (!is_array($matrix)) {
            throw new ApiError('Invalid permissions payload.');
        }
        return PermissionRepository::savePermissions($matrix, (int) $user['id']);
    }

    public static function resetPermissions(array $user): array {
        return PermissionRepository::resetToDefaults((int) $user['id']);
    }

    public static function getAudit(): array {
        return UserRepository::getAuditLogs(100);
    }

    public static function getSettings(): array {
        return UserRepository::getSettings();
    }

    public static function saveStaff(array $body): array {
        $id = empty($body['id']) ? null : Validator::integer($body['id'], 'Staff member');
        $branch = Validator::integer($body['branch_id'] ?? null, 'Assigned branch');
        $name = Validator::str($body, 'name', 120);
        $email = strtolower(Validator::str($body, 'email', 150));
        $role = $body['role'] ?? '';
        if (!in_array($role, ['manager', 'cashier', 'technician', 'stock'], true)) {
            throw new ApiError('Invalid role.');
        }

        $password = Validator::password($body, $id === null);

        if ($id) {
            $user = BaseRepository::one('SELECT * FROM users WHERE id=?', [$id]);
            if (!$user || $user['role'] === 'owner') {
                throw new ApiError('Staff account cannot be modified.', 403);
            }
            $active = !empty($body['active']) ? 1 : 0;
            if ($password !== '') {
                BaseRepository::run(
                    'UPDATE users SET branch_id=?, name=?, email=?, role=?, password_hash=?, active=? WHERE id=?',
                    [$branch, $name, $email, $role, password_hash($password, PASSWORD_DEFAULT), $active, $id]
                );
            } else {
                BaseRepository::run(
                    'UPDATE users SET branch_id=?, name=?, email=?, role=?, active=? WHERE id=?',
                    [$branch, $name, $email, $role, $active, $id]
                );
            }
        } else {
            $id = BaseRepository::insert(
                'INSERT INTO users(branch_id, name, email, role, password_hash, active) VALUES (?,?,?,?,?,1)',
                [$branch, $name, $email, $role, password_hash($password, PASSWORD_DEFAULT)]
            );
        }

        return ['id' => $id, 'name' => $name, 'email' => $email, 'role' => $role];
    }

    public static function deleteStaff(array $user, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Staff member');
        $target = BaseRepository::one('SELECT * FROM users WHERE id=?', [$id]);
        if (!$target) {
            throw new ApiError('Staff account not found.', 404);
        }
        if ($target['role'] === 'owner') {
            throw new ApiError('The Owner account cannot be deleted.', 403);
        }
        if ((int) $user['id'] === $id) {
            throw new ApiError('You cannot delete your own active account.', 400);
        }

        // Check for historical financial / operational records
        $salesCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM sales WHERE user_id=?', [$id]);
        $drawersCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM drawers WHERE user_id=?', [$id]);
        $repairsCount = (int) BaseRepository::scalar('SELECT COUNT(*) FROM repairs WHERE technician_id=?', [$id]);

        if ($salesCount > 0 || $drawersCount > 0 || $repairsCount > 0) {
            // Soft delete/deactivate to prevent FK constraint errors and preserve audit history
            BaseRepository::run('UPDATE users SET active=0 WHERE id=?', [$id]);
            UserRepository::logAudit((int) $user['id'], null, 'staff.deactivate', ['id' => $id, 'name' => $target['name'], 'reason' => 'deleted_with_history']);
            return [
                'id' => $id,
                'deleted' => false,
                'deactivated' => true,
                'message' => "Account deactivated. Past financial and repair history preserved.",
            ];
        }

        // Hard delete if no transactions are linked
        BaseRepository::run('DELETE FROM requests WHERE user_id=?', [$id]);
        BaseRepository::run('DELETE FROM drafts WHERE user_id=?', [$id]);
        BaseRepository::run('DELETE FROM audit_log WHERE user_id=?', [$id]);
        BaseRepository::run('DELETE FROM users WHERE id=?', [$id]);

        UserRepository::logAudit((int) $user['id'], null, 'staff.delete', ['id' => $id, 'name' => $target['name']]);

        return [
            'id' => $id,
            'deleted' => true,
            'message' => "Staff member '{$target['name']}' has been permanently removed.",
        ];
    }

    public static function toggleStaffStatus(array $user, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Staff member');
        $target = BaseRepository::one('SELECT * FROM users WHERE id=?', [$id]);
        if (!$target) {
            throw new ApiError('Staff account not found.', 404);
        }
        if ($target['role'] === 'owner') {
            throw new ApiError('Owner account status cannot be changed.', 403);
        }
        if ((int) $user['id'] === $id) {
            throw new ApiError('You cannot deactivate your own active session.', 400);
        }

        $newStatus = empty($target['active']) ? 1 : 0;
        BaseRepository::run('UPDATE users SET active=? WHERE id=?', [$newStatus, $id]);

        UserRepository::logAudit((int) $user['id'], null, 'staff.toggle', ['id' => $id, 'active' => $newStatus]);

        return [
            'id' => $id,
            'active' => $newStatus,
            'message' => $newStatus ? 'Account activated.' : 'Account deactivated.',
        ];
    }

    public static function saveSettings(array $body): array {
        $shopName = Validator::str($body, 'shop_name', 100);
        $taxBps = Validator::integer($body['tax_bps'] ?? 0, 'Tax rate', 0, 10000);
        $paperWidth = (int) ($body['paper_width'] ?? 80);
        if (!in_array($paperWidth, [58, 80], true)) {
            throw new ApiError('Paper width must be 58 or 80 mm.');
        }

        UserRepository::updateSettings($shopName, $taxBps, $paperWidth);

        return ['shop_name' => $shopName, 'tax_bps' => $taxBps, 'paper_width' => $paperWidth];
    }
}
