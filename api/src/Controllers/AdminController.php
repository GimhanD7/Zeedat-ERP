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

    public static function saveUserPermissions(array $user, array $body): array {
        $targetUserId = Validator::integer($body['user_id'] ?? null, 'Staff member');
        $overrides = $body['overrides'] ?? [];
        if (!is_array($overrides)) {
            throw new ApiError('Invalid user overrides payload.');
        }
        return PermissionRepository::saveUserPermissions($targetUserId, $overrides, (int) $user['id']);
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

        $shopPhone = Validator::str($body, 'shop_phone', 50, false) ?: '';
        $shopAddress = Validator::str($body, 'shop_address', 250, false) ?: '';
        $shopEmail = Validator::str($body, 'shop_email', 120, false) ?: '';
        $receiptFooter = Validator::str($body, 'receipt_footer', 250, false) ?: '';
        $invoicePrefix = Validator::str($body, 'invoice_prefix', 20, false) ?: 'INV-';
        $autoPrint = !empty($body['auto_print']) ? 1 : 0;
        $showTax = !empty($body['show_tax_on_receipt']) ? 1 : 0;

        UserRepository::updateSettings(
            $shopName,
            $taxBps,
            $paperWidth,
            $shopPhone,
            $shopAddress,
            $shopEmail,
            $receiptFooter,
            $invoicePrefix,
            $autoPrint,
            $showTax
        );

        return [
            'shop_name' => $shopName,
            'tax_bps' => $taxBps,
            'paper_width' => $paperWidth,
            'shop_phone' => $shopPhone,
            'shop_address' => $shopAddress,
            'shop_email' => $shopEmail,
            'receipt_footer' => $receiptFooter,
            'invoice_prefix' => $invoicePrefix,
            'auto_print' => $autoPrint,
            'show_tax_on_receipt' => $showTax,
        ];
    }

    public static function getBranchesSummary(): array {
        return BaseRepository::rows("SELECT 
            b.id,
            b.name,
            COALESCE(b.phone, '') AS phone,
            COALESCE(b.address, '') AS address,
            (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.active = 1) AS staff_count,
            (SELECT COALESCE(SUM(s.qty), 0) FROM stock s WHERE s.branch_id = b.id) AS stock_units,
            (SELECT COUNT(*) FROM sales sl WHERE sl.branch_id = b.id) AS sales_count
            FROM branches b
            ORDER BY b.id");
    }

    public static function saveBranch(array $user, array $body): array {
        if ($user['role'] !== 'owner') {
            throw new ApiError('Only the Owner can create or modify store branches.', 403);
        }

        $id = empty($body['id']) ? null : Validator::integer($body['id'], 'Branch');
        $name = Validator::str($body, 'name', 100);
        $phone = Validator::str($body, 'phone', 50, false) ?: '';
        $address = Validator::str($body, 'address', 250, false) ?: '';

        if ($id) {
            BaseRepository::run(
                'UPDATE branches SET name=?, phone=?, address=? WHERE id=?',
                [$name, $phone, $address, $id]
            );
            UserRepository::logAudit((int) $user['id'], $id, 'branch.update', ['id' => $id, 'name' => $name]);
        } else {
            $id = BaseRepository::insert(
                'INSERT INTO branches(name, phone, address) VALUES (?,?,?)',
                [$name, $phone, $address]
            );
            UserRepository::logAudit((int) $user['id'], $id, 'branch.create', ['id' => $id, 'name' => $name]);
        }

        return ['id' => $id, 'name' => $name, 'phone' => $phone, 'address' => $address];
    }

    public static function changePassword(array $user, array $body): array {
        $current = (string) ($body['current_password'] ?? '');
        $next = (string) ($body['new_password'] ?? '');

        if ($current === '') {
            throw new ApiError('Current password is required.');
        }
        if (strlen($next) < 6) {
            throw new ApiError('New password must be at least 6 characters.');
        }

        $row = BaseRepository::one('SELECT password_hash FROM users WHERE id=?', [$user['id']]);
        if (!$row || !password_verify($current, $row['password_hash'])) {
            throw new ApiError('Current password is incorrect.', 403);
        }

        BaseRepository::run(
            'UPDATE users SET password_hash=? WHERE id=?',
            [password_hash($next, PASSWORD_DEFAULT), $user['id']]
        );
        UserRepository::logAudit((int) $user['id'], null, 'profile.password', ['status' => 'changed']);

        return ['message' => 'Your password has been updated successfully.'];
    }

    public static function saveDeletePin(array $user, array $body): array {
        $newPin = trim((string) ($body['new_pin'] ?? ''));
        if (!preg_match('/^\d{4,8}$/', $newPin)) {
            throw new ApiError('Security PIN must be 4 to 8 digits (numbers only).');
        }

        $existingHash = trim((string) (BaseRepository::scalar('SELECT delete_pin_hash FROM settings WHERE id=1') ?? ''));
        if ($existingHash !== '') {
            if (!empty($body['use_account_password'])) {
                $pwd = (string) ($body['current_password'] ?? '');
                $uRow = BaseRepository::one('SELECT password_hash FROM users WHERE id=?', [$user['id']]);
                if ($pwd === '' || !$uRow || !password_verify($pwd, $uRow['password_hash'])) {
                    throw new ApiError('Account password is incorrect.', 403);
                }
            } else {
                $currentPin = trim((string) ($body['current_pin'] ?? ''));
                if ($currentPin === '' || !password_verify($currentPin, $existingHash)) {
                    throw new ApiError('Current Security PIN is incorrect.', 403);
                }
            }
        }

        BaseRepository::run(
            'UPDATE settings SET delete_pin_hash=? WHERE id=1',
            [password_hash($newPin, PASSWORD_DEFAULT)]
        );
        UserRepository::logAudit((int) $user['id'], null, 'settings.delete_pin', ['status' => $existingHash !== '' ? 'changed' : 'created']);

        return [
            'delete_pin_configured' => true,
            'message' => $existingHash !== ''
                ? 'Inventory delete PIN changed successfully.'
                : 'Inventory delete PIN configured successfully.',
        ];
    }
}
