<?php
declare(strict_types=1);

// Router for PHP's local development server. Serve only built assets and the API.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/api/index.php') {
    require __DIR__ . '/api/index.php';
    return;
}
$dist = realpath(__DIR__ . '/dist');
$file = $dist ? realpath($dist . ($path === '/' ? '/index.html' : $path)) : false;
if ($file && str_starts_with($file, $dist . DIRECTORY_SEPARATOR) && is_file($file)) {
    $type = match (pathinfo($file, PATHINFO_EXTENSION)) {
        'html' => 'text/html; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'svg' => 'image/svg+xml',
        default => 'application/octet-stream',
    };
    header('Content-Type: ' . $type);
    header('X-Content-Type-Options: nosniff');
    readfile($file);
    return;
}
http_response_code(404);
echo 'Page not found. Run npm run build before starting the PHP server.';
