<?php
declare(strict_types=1);

namespace Zeedat\Config;

use PDO;

class Database {
    private static ?PDO $connection = null;

    public static function getConnection(): PDO {
        if (self::$connection === null) {
            $host = self::env('DB_HOST', '127.0.0.1');
            $port = self::env('DB_PORT', '3306');
            $name = self::env('DB_NAME', 'zeedat_pos');
            $user = self::env('DB_USER', 'root');
            $pass = self::env('DB_PASSWORD', '');

            self::$connection = new PDO(
                "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
                $user,
                $pass,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]
            );

            self::$connection->exec("SET time_zone = '+05:30'");
            self::$connection->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
        }

        return self::$connection;
    }

    public static function env(string $key, string $fallback): string {
        $value = getenv($key);
        return $value === false ? $fallback : $value;
    }
}
