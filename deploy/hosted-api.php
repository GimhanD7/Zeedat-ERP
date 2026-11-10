<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Cache-Control: no-store');
$route = $_GET['route'] ?? 'session';
if (!is_string($route) || in_array($route, ['sync.catalog', 'sync.receive', 'backup.receive'], true)) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(404);
    echo '{"error":"Route not found."}';
    exit;
}

try {
    require __DIR__ . '/hosted-config.php';
} catch (Throwable $error) {
    error_log($error->getMessage());
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(503);
    echo '{"error":"Hosting configuration is unavailable."}';
    exit;
}

require __DIR__ . '/../api/public/index.php';
