<?php
declare(strict_types=1);

namespace Zeedat\Middleware;

use Zeedat\Repositories\UserRepository;
use Zeedat\Support\ApiError;

class AuthMiddleware {
    public static function startSession(): void {
        date_default_timezone_set('Asia/Colombo');
        ini_set('session.use_strict_mode', '1');
        session_name('zeedat_session');
        session_set_cookie_params([
            'httponly' => true,
            'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'samesite' => 'Strict',
        ]);
        if (PHP_SAPI !== 'cli' && session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
    }

    public static function currentUser(): ?array {
        if (!isset($_SESSION['user'])) {
            return null;
        }
        return UserRepository::findActiveById((int) $_SESSION['user']);
    }

    public static function verifyCsrf(): void {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        $sessionToken = $_SESSION['csrf'] ?? '';
        if (!$sessionToken || !hash_equals($sessionToken, $token)) {
            throw new ApiError('Session verification failed.', 403);
        }
    }

    public static function requireAuth(): array {
        $user = self::currentUser();
        if (!$user) {
            throw new ApiError('Sign in to continue.', 401);
        }
        return $user;
    }
}
