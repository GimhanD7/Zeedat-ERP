<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Middleware\AuthMiddleware;
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
        Response::json($result);
    }

    public static function logout(): void {
        AuthMiddleware::verifyCsrf();
        $result = AuthService::logout();
        Response::json($result);
    }
}
