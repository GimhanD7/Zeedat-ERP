<?php
declare(strict_types=1);

namespace Zeedat\Support;

use JsonException;
use PDOException;
use Throwable;

class Response {
    public static function json(mixed $data, int $status = 200): never {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data, JSON_THROW_ON_ERROR);
        exit;
    }

    public static function handleException(Throwable $e): never {
        if ($e instanceof JsonException) {
            self::json(['error' => 'Invalid JSON request.'], 400);
        }

        if ($e instanceof ApiError) {
            self::json(['error' => $e->getMessage()], $e->getCode());
        }

        if ($e instanceof PDOException) {
            if ($e->getCode() === '23000') {
                self::json(['error' => 'This record or reference already exists, or is in use.'], 409);
            }
            error_log($e->getMessage());
            self::json(['error' => 'Database operation failed. Check that MySQL is running and the schema is installed.'], 503);
        }

        error_log((string) $e);
        self::json(['error' => 'An unexpected server error occurred.'], 500);
    }
}
