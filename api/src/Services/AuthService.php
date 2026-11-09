<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Middleware\AuthMiddleware;
use Zeedat\Repositories\UserRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class AuthService {
    public static function login(array $body): array {
        $email = strtolower(Validator::str($body, 'email', 150));
        $password = $body['password'] ?? '';
        if (
            !is_string($password) ||
            strlen($password) > 72 ||
            $password === '' ||
            str_contains($password, "\0")
        ) {
            throw new ApiError('Email or password is incorrect.', 401);
        }

        $account = UserRepository::findByEmail($email);
        if (!$account || !password_verify($password, $account['password_hash']) || !$account['active']) {
            throw new ApiError('Email or password is incorrect.', 401);
        }

        session_regenerate_id(true);
        $_SESSION = [
            'user' => $account['id'],
            'csrf' => bin2hex(random_bytes(32)),
        ];

        return [
            'user' => AuthMiddleware::currentUser(),
            'csrf' => $_SESSION['csrf'],
        ];
    }

    public static function logout(): array {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
        return ['ok' => true];
    }
}
