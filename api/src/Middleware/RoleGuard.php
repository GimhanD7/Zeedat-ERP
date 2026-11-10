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
        if ($user['role'] === 'owner') {
            return;
        }
        if (!PermissionRepository::userHasPermission((int) $user['id'], $user['role'], $permission)) {
            $permInfo = PermissionRepository::ALL_PERMISSIONS[$permission] ?? null;
            $name = $permInfo['name'] ?? $permission;
            throw new ApiError("Access denied: Your account does not have permission for {$name}.", 403);
        }
    }

    public static function branchFor(array $user, mixed $requested, bool $required = true): int {
        $branch = Validator::integer($requested ?? 0, 'Branch', 0);
        if ($user['role'] !== 'owner') {
            if ($branch && $branch !== (int) $user['branch_id']) {
                throw new ApiError('Branch access denied.', 403);
            }
            $branch = (int) $user['branch_id'];
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
