<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Middleware\AuthMiddleware;
use Zeedat\Repositories\UserRepository;
use Zeedat\Services\AuthService;
use Zeedat\Support\Response;

class AuthController {
    public static function session(): void {
        $user = AuthMiddleware::currentUser();
        Response::json([
            'user' => $user,
            'csrf' => $user ? ($_SESSION['csrf'] ?? null) : null,
        ]);
    }

    public static function login(array $body): void {
        $result = AuthService::login($body);
        if (!empty($result['user']['id'])) {
            try {
                UserRepository::logAudit(
                    (int) $result['user']['id'],
                    !empty($result['user']['branch_id']) ? (int) $result['user']['branch_id'] : null,
                    'auth.login',
                    ['name' => $result['user']['name'] ?? '', 'role' => $result['user']['role'] ?? '']
                );
            } catch (\Throwable) {
            }
        }
        Response::json($result);
    }

    public static function logout(): void {
        AuthMiddleware::verifyCsrf();
        $currentUser = AuthMiddleware::currentUser();
        if (!empty($currentUser['id'])) {
            try {
                UserRepository::logAudit(
                    (int) $currentUser['id'],
                    !empty($currentUser['branch_id']) ? (int) $currentUser['branch_id'] : null,
                    'auth.logout',
                    ['name' => $currentUser['name'] ?? '', 'role' => $currentUser['role'] ?? '']
                );
            } catch (\Throwable) {
            }
        }
        $result = AuthService::logout();
        Response::json($result);
    }
}
