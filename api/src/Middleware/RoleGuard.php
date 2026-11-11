<?php
declare(strict_types=1);

namespace Zeedat\Middleware;

use Zeedat\Repositories\BranchRepository;
use Zeedat\Repositories\PermissionRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class RoleGuard {
    public static function allow(array $user, string ...$roles): void {
        if (!in_array($user['role'], $roles, true)) {
            throw new ApiError('Your role cannot perform this action.', 403);
        }
    }

    public static function allowPermission(array $user, string $permission): void {
        self::allowAnyPermission($user, $permission);
    }

    public static function allowAnyPermission(array $user, string ...$permissions): void {
        if ($user['role'] === 'owner') {
            return;
        }
        foreach ($permissions as $permission) {
            if (PermissionRepository::userHasPermission((int) $user['id'], $user['role'], $permission)) {
                return;
            }
        }
        $primary = $permissions[0] ?? 'module';
        $permInfo = PermissionRepository::ALL_PERMISSIONS[$primary] ?? null;
        $name = $permInfo['name'] ?? $primary;
        throw new ApiError("Access denied: Your account does not have permission for {$name}.", 403);
    }

    public static function branchFor(array $user, mixed $requested, bool $required = true): int {
        $branch = Validator::integer($requested ?? 0, 'Branch', 0);
        if ($user['role'] !== 'owner') {
            $allowed = array_map('intval', $user['branch_ids'] ?? array_values(array_filter([(int) ($user['branch_id'] ?? 0)])));
            if ($branch > 0 && !in_array($branch, $allowed, true)) {
                throw new ApiError('Branch access denied.', 403);
            }
            if ($branch === 0) {
                $branch = (int) ($user['branch_id'] ?: ($allowed[0] ?? 0));
            }
        }
        if (!$branch && $required) {
            throw new ApiError('Select a branch to continue.');
        }
        if ($branch && !BranchRepository::exists($branch)) {
            throw new ApiError('Branch not found.', 404);
        }
        return $branch;
    }
}
