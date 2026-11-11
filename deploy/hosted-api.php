<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Cache-Control: no-store');
$route = $_GET['route'] ?? 'session';
if (!is_string($route) || $route === '') {
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

if (in_array($route, ['sync.catalog', 'sync.receive', 'backup.receive'], true)) {
    require_once __DIR__ . '/../api/src/Autoloader.php';
    Zeedat\Autoloader::register();
    try {
        $key = trim((string) Zeedat\Repositories\BaseRepository::scalar('SELECT cloud_api_key FROM settings WHERE id=1'));
        $token = Zeedat\Services\BackupService::extractBearerToken(function_exists('getallheaders') ? (getallheaders() ?: []) : []);
        if ($key === '' || $token === '' || !hash_equals($key, $token)) {
            Zeedat\Support\Response::json(['error' => 'Invalid or missing sync key.'], 401);
        }
    } catch (Throwable $error) {
        Zeedat\Support\Response::handleException($error);
    }
}

require __DIR__ . '/../api/public/index.php';
