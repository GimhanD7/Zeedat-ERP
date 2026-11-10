<?php
declare(strict_types=1);

$file = dirname(__DIR__, 3) . '/config.php';
if (!is_file($file)) {
    throw new RuntimeException('Hosting configuration is missing.');
}

$config = require $file;
if (!is_array($config)) {
    throw new RuntimeException('Hosting configuration must return an array.');
}
foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as $key) {
    if (!isset($config[$key]) || !is_string($config[$key]) || $config[$key] === '') {
        throw new RuntimeException('Hosting configuration is missing ' . $key . '.');
    }
    putenv($key . '=' . $config[$key]);
}
putenv('DB_DRIVER=mysql');
putenv('DB_AUTO_MIGRATE=0');
putenv('ZEEDAT_SQLITE_PATH');
