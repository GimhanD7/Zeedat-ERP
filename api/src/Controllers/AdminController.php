<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\PermissionRepository;
use Zeedat\Repositories\UserRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class AdminController
{
    public static function getStaff(): array
    {
        return UserRepository::allStaff();
    }

    public static function getPermissions(): array
    {
        return PermissionRepository::getPermissionsData();
    }

    public static function savePermissions(array $user, array $body): array
    {
        $matrix = $body['matrix'] ?? $body;
        if (!is_array($matrix)) {
            throw new ApiError('Invalid permissions payload.');
        }
        return PermissionRepository::savePermissions($matrix, (int) $user['id']);
    }

    public static function resetPermissions(array $user): array
    {
        return PermissionRepository::resetToDefaults((int) $user['id']);
    }

    public static function saveUserPermissions(array $user, array $body): array
    {
        $targetUserId = Validator::integer($body['user_id'] ?? null, 'Staff member');
        $overrides = $body['overrides'] ?? [];
        if (!is_array($overrides)) {
            throw new ApiError('Invalid user overrides payload.');
        }
        $res = PermissionRepository::saveUserPermissions($targetUserId, $overrides, (int) $user['id']);
        try {
            BaseRepository::run('UPDATE users SET synced=0 WHERE id=?', [$targetUserId]);
        } catch (\Throwable) {
        }
        return $res;
    }

    public static function getAudit(): array
    {
        return UserRepository::getAuditLogs(100);
    }

    public static function getSettings(): array
    {
        return UserRepository::getSettings();
    }

    private static function syncUserBranches(int $userId, array $branchIds): array
    {
        $clean = array_values(array_unique(array_filter(array_map('intval', $branchIds), static fn($v) => $v > 0)));
        if (empty($clean)) {
            throw new ApiError('Select at least one branch.');
        }

        $placeholders = implode(',', array_fill(0, count($clean), '?'));
        $validRows = BaseRepository::rows("SELECT id, name FROM branches WHERE id IN ({$placeholders}) ORDER BY id ASC", $clean);
        if (count($validRows) !== count($clean)) {
            throw new ApiError('One or more selected branches do not exist.', 404);
        }

        $primaryId = $clean[0];
        BaseRepository::transaction(function () use ($userId, $primaryId, $clean) {
            BaseRepository::run('UPDATE users SET branch_id=?, synced=0 WHERE id=?', [$primaryId, $userId]);
            BaseRepository::run('DELETE FROM user_branches WHERE user_id=?', [$userId]);
            foreach ($clean as $bid) {
                BaseRepository::run('INSERT INTO user_branches (user_id, branch_id) VALUES (?,?)', [$userId, $bid]);
            }
        });

        return [
            'branch_ids' => array_map(static fn($r) => (int) $r['id'], $validRows),
            'branch_names' => array_map(static fn($r) => (string) $r['name'], $validRows),
        ];
    }

    public static function assignUserBranches(array $admin, array $body): array
    {
        $targetId = Validator::integer($body['user_id'] ?? null, 'Staff member');
        $target = BaseRepository::one('SELECT id, name, role FROM users WHERE id=?', [$targetId]);
        if (!$target) {
            throw new ApiError('Staff account not found.', 404);
        }
        if ($target['role'] === 'owner') {
            throw new ApiError('Owner already has access to all branches.');
        }

        $rawIds = $body['branch_ids'] ?? [];
        if (!is_array($rawIds)) {
            throw new ApiError('Invalid branch_ids list.');
        }

        $synced = self::syncUserBranches($targetId, $rawIds);
        UserRepository::logAudit((int) $admin['id'], null, 'staff.assign_branches', [
            'user_id' => $targetId,
            'name' => $target['name'],
            'branch_ids' => $synced['branch_ids'],
        ]);

        return [
            'user_id' => $targetId,
            'branch_ids' => $synced['branch_ids'],
            'branch_names' => $synced['branch_names'],
            'branch' => implode(', ', $synced['branch_names']),
        ];
    }

    public static function saveStaff(array $body): array
    {
        $id = empty($body['id']) ? null : Validator::integer($body['id'], 'Staff member');
        $branchIds = !empty($body['branch_ids']) && is_array($body['branch_ids'])
            ? array_values(array_unique(array_filter(array_map('intval', $body['branch_ids']), static fn($v) => $v > 0)))
            : [];
        $branch = !empty($branchIds) ? $branchIds[0] : Validator::integer($body['branch_id'] ?? null, 'Assigned branch');
        if (empty($branchIds)) {
            $branchIds = [$branch];
        }
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
            if ((int) ($user['branch_id'] ?? 0) === $branch && empty($body['branch_ids'])) {
                $existingBranches = UserRepository::assignedBranchIds((int) $id);
                if (!empty($existingBranches)) {
                    $branchIds = $existingBranches;
                }
            }
            $active = !empty($body['active']) ? 1 : 0;
            if ($password !== '') {
                BaseRepository::run(
                    'UPDATE users SET branch_id=?, name=?, email=?, role=?, password_hash=?, active=?, synced=0 WHERE id=?',
                    [$branch, $name, $email, $role, password_hash($password, PASSWORD_DEFAULT), $active, $id]
                );
            } else {
                BaseRepository::run(
                    'UPDATE users SET branch_id=?, name=?, email=?, role=?, active=?, synced=0 WHERE id=?',
                    [$branch, $name, $email, $role, $active, $id]
                );
            }
        } else {
            $id = BaseRepository::insert(
                'INSERT INTO users(branch_id, name, email, role, password_hash, active, synced) VALUES (?,?,?,?,?,1,0)',
                [$branch, $name, $email, $role, password_hash($password, PASSWORD_DEFAULT)]
            );
            $badgeCode = UserRepository::formatBadgeCode((int) $id);
            BaseRepository::run('UPDATE users SET badge_code=?, synced=0 WHERE id=?', [$badgeCode, $id]);
        }

        $synced = self::syncUserBranches((int) $id, $branchIds);
        $badgeCode = UserRepository::formatBadgeCode((int) $id, (string) (BaseRepository::scalar('SELECT badge_code FROM users WHERE id=?', [$id]) ?: ''));

        return ['id' => $id, 'badge_code' => $badgeCode, 'name' => $name, 'email' => $email, 'role' => $role, 'branch_ids' => $synced['branch_ids']];
    }

    public static function deleteStaff(array $user, array $body): array
    {
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

        BaseRepository::run('UPDATE users SET active=0, synced=0 WHERE id=?', [$id]);
        UserRepository::logAudit((int) $user['id'], null, 'staff.deactivate', ['id' => $id, 'name' => $target['name']]);
        return [
            'id' => $id,
            'deleted' => false,
            'deactivated' => true,
            'message' => 'Account deactivated. Past activity is preserved.',
        ];
    }

    public static function toggleStaffStatus(array $user, array $body): array
    {
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
        BaseRepository::run('UPDATE users SET active=?, synced=0 WHERE id=?', [$newStatus, $id]);

        UserRepository::logAudit((int) $user['id'], null, 'staff.toggle', ['id' => $id, 'active' => $newStatus]);

        return [
            'id' => $id,
            'active' => $newStatus,
            'message' => $newStatus ? 'Account activated.' : 'Account deactivated.',
        ];
    }

    public static function saveSettings(array $body): array
    {
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
        $receiptPrinterName = Validator::str($body, 'receipt_printer_name', 150, false) ?: '';
        $cashDrawerEnabled = array_key_exists('cash_drawer_enabled', $body) ? (!empty($body['cash_drawer_enabled']) ? 1 : 0) : 1;
        $smsEnabled = !empty($body['sms_enabled']) ? 1 : 0;
        $smsProviderUrl = Validator::str($body, 'sms_provider_url', 500, false) ?: '';
        $smsApiKey = Validator::str($body, 'sms_api_key', 255, false) ?: '';
        $smsSenderId = Validator::str($body, 'sms_sender_id', 40, false) ?: '';

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
            $showTax,
            $receiptPrinterName,
            $cashDrawerEnabled,
            $smsEnabled,
            $smsProviderUrl,
            $smsApiKey,
            $smsSenderId
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
            'receipt_printer_name' => $receiptPrinterName,
            'cash_drawer_enabled' => $cashDrawerEnabled,
            'sms_enabled' => $smsEnabled,
            'sms_provider_url' => $smsProviderUrl,
            'sms_api_key' => $smsApiKey,
            'sms_sender_id' => $smsSenderId,
        ];
    }

    public static function getBranchesSummary(): array
    {
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

    public static function saveBranch(array $user, array $body): array
    {
        if ($user['role'] !== 'owner') {
            throw new ApiError('Only the Owner can create or modify store branches.', 403);
        }

        $id = empty($body['id']) ? null : Validator::integer($body['id'], 'Branch');
        $name = Validator::str($body, 'name', 100);
        $phone = Validator::str($body, 'phone', 50, false) ?: '';
        $address = Validator::str($body, 'address', 250, false) ?: '';

        if ($id) {
            BaseRepository::run(
                'UPDATE branches SET name=?, phone=?, address=?, synced=0 WHERE id=?',
                [$name, $phone, $address, $id]
            );
            UserRepository::logAudit((int) $user['id'], $id, 'branch.update', ['id' => $id, 'name' => $name]);
        } else {
            $id = BaseRepository::insert(
                'INSERT INTO branches(name, phone, address, synced) VALUES (?,?,?,0)',
                [$name, $phone, $address]
            );
            UserRepository::logAudit((int) $user['id'], $id, 'branch.create', ['id' => $id, 'name' => $name]);
        }

        return ['id' => $id, 'name' => $name, 'phone' => $phone, 'address' => $address];
    }

    public static function changePassword(array $user, array $body): array
    {
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
            'UPDATE users SET password_hash=?, synced=0 WHERE id=?',
            [password_hash($next, PASSWORD_DEFAULT), $user['id']]
        );
        UserRepository::logAudit((int) $user['id'], null, 'profile.password', ['status' => 'changed']);

        return ['message' => 'Your password has been updated successfully.'];
    }

    public static function saveDeletePin(array $user, array $body): array
    {
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
