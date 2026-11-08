<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/reads.php';
require __DIR__ . '/sales.php';
require __DIR__ . '/writes.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

try {
    $action = (string) ($_GET['route'] ?? 'session');
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET','POST'], true)) fail('Method not allowed.', 405);
    if ($method === 'POST' && strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        fail('Expected application/json.', 415);
    }
    $body = $method === 'POST' ? json_decode(file_get_contents('php://input'), true, 32, JSON_THROW_ON_ERROR) : [];
    if (!is_array($body)) fail('Expected a JSON object.', 400);
    if ($action === 'login' && $method === 'POST') {
        $email = strtolower(str($body, 'email', 150));
        $password = $body['password'] ?? '';
        if (!is_string($password) || strlen($password) > 72 || $password === '' || str_contains($password, "\0")) fail('Email or password is incorrect.', 401);
        $account = one('SELECT id,password_hash,active FROM users WHERE email=?', [$email]);
        if (!$account || !password_verify($password, $account['password_hash']) || !$account['active']) fail('Email or password is incorrect.', 401);
        session_regenerate_id(true);
        $_SESSION = ['user' => $account['id'], 'csrf' => bin2hex(random_bytes(32))];
        respond(['user' => currentUser(), 'csrf' => $_SESSION['csrf']]);
    }
    $user = currentUser();
    if ($method === 'GET' && $action === 'session') {
        respond(['user' => $user, 'csrf' => $user ? $_SESSION['csrf'] : null]);
    }
    if (!$user) fail('Sign in to continue.', 401);
    if ($method === 'POST') {
        if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) fail('Session verification failed.', 403);
        if ($action === 'logout') {
            $_SESSION = [];
            session_destroy();
            respond(['ok' => true]);
        }
        session_write_close();
        respond(requestOnce($user, $body, $action, fn() => writeRoute($action, $user, $body)));
    }
    session_write_close();
    respond(readRoute($action, $user, $_GET));
} catch (JsonException) {
    respond(['error' => 'Invalid JSON request.'], 400);
} catch (ApiError $e) {
    respond(['error' => $e->getMessage()], $e->getCode());
} catch (PDOException $e) {
    if ($e->getCode() === '23000') respond(['error' => 'This record or reference already exists, or is in use.'], 409);
    error_log($e->getMessage());
    respond(['error' => 'Database operation failed. Check that MySQL is running and the schema is installed.'], 503);
} catch (Throwable $e) {
    error_log((string) $e);
    respond(['error' => 'An unexpected server error occurred.'], 500);
}
