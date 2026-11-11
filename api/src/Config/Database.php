<?php
declare(strict_types=1);

namespace Zeedat\Config;

use PDO;
use Throwable;

class Database {
    private static ?PDO $connection = null;
    private static ?string $activeDriver = null;
    private static ?array $localEnv = null;

    public static function getSqlitePath(): string {
        return self::env(
            'ZEEDAT_SQLITE_PATH',
            dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'database' . DIRECTORY_SEPARATOR . 'zeedat_local.db'
        );
    }

    public static function isSqlite(): bool {
        return self::getDriver() === 'sqlite';
    }

    public static function getDriver(): string {
        if (self::$activeDriver !== null) {
            return self::$activeDriver;
        }

        $driver = strtolower(self::env('DB_DRIVER', ''));
        if ($driver === 'mysql') {
            self::$activeDriver = 'mysql';
            return 'mysql';
        }

        if ($driver === 'sqlite' || !empty(getenv('ZEEDAT_SQLITE_PATH'))) {
            self::$activeDriver = 'sqlite';
            return 'sqlite';
        }

        // Auto-detection: If local SQLite file exists, ALWAYS default to SQLite!
        if (file_exists(self::getSqlitePath())) {
            self::$activeDriver = 'sqlite';
            return 'sqlite';
        }

        self::$activeDriver = 'mysql';
        return 'mysql';
    }

    public static function getConnection(): PDO {
        if (self::$connection !== null) {
            return self::$connection;
        }

        $driver = self::getDriver();

        if ($driver === 'sqlite') {
            $sqlitePath = self::getSqlitePath();
            $dir = dirname($sqlitePath);
            if (!is_dir($dir)) {
                mkdir($dir, 0755, true);
            }

            self::$connection = new PDO(
                "sqlite:{$sqlitePath}",
                null,
                null,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_TIMEOUT => 15,
                ]
            );

            self::$connection->exec('PRAGMA foreign_keys = ON;');
            self::$connection->exec('PRAGMA journal_mode = WAL;');
            self::$connection->exec('PRAGMA busy_timeout = 5000;');

            // Custom SQLite functions for MySQL compatibility
            self::$connection->sqliteCreateFunction('CONCAT', function (...$args) {
                return implode('', $args);
            });
            self::$connection->sqliteCreateFunction('GREATEST', function (...$args) {
                return max($args);
            });
            self::$connection->sqliteCreateFunction('LEAST', function (...$args) {
                return min($args);
            });

            // Automatically check and run migrations if tables are missing
            \Zeedat\Services\AutoMigrator::run(self::$connection, 'sqlite');

            return self::$connection;
        }

        // MySQL Connection
        $host = self::env('DB_HOST', '127.0.0.1');
        $port = self::env('DB_PORT', '3306');
        $name = self::env('DB_NAME', 'zeedat_pos');
        $user = self::env('DB_USER', 'root');
        $pass = self::env('DB_PASSWORD', '');

        try {
            self::$connection = new PDO(
                "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
                $user,
                $pass,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_TIMEOUT => 3,
                ]
            );

            self::$connection->exec("SET time_zone = '+05:30'");
            self::$connection->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');

            // Automatically check and run migrations if tables are missing
            if (self::env('DB_AUTO_MIGRATE', '1') !== '0') {
                \Zeedat\Services\AutoMigrator::run(self::$connection, 'mysql');
            }
        } catch (Throwable $e) {
            // If MySQL fails and local SQLite exists, fallback to SQLite
            if (file_exists(self::getSqlitePath())) {
                self::$activeDriver = 'sqlite';
                self::$connection = null;
                return self::getConnection();
            }
            throw $e;
        }

        return self::$connection;
    }

    private static function loadLocalEnv(): array {
        if (self::$localEnv !== null) {
            return self::$localEnv;
        }
        $loaded = [];
        $envFile = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . '.env';
        if (is_file($envFile) && is_readable($envFile)) {
            $lines = @file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            foreach ($lines as $line) {
                $trimmed = trim($line);
                if ($trimmed === '' || str_starts_with($trimmed, '#') || !str_contains($trimmed, '=')) {
                    continue;
                }
                [$k, $v] = explode('=', $trimmed, 2);
                $k = trim($k);
                $v = trim($v);
                if (strlen($v) >= 2 && (($v[0] === '"' && $v[-1] === '"') || ($v[0] === "'" && $v[-1] === "'"))) {
                    $v = substr($v, 1, -1);
                }
                if ($k !== '') {
                    $loaded[$k] = $v;
                }
            }
        }
        $cfgFile = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'config.php';
        if (is_file($cfgFile) && is_readable($cfgFile)) {
            $cfg = require $cfgFile;
            if (is_array($cfg)) {
                foreach ($cfg as $k => $v) {
                    if (is_string($k) && $k !== '') {
                        $loaded[$k] = (string) $v;
                    }
                }
            }
        }
        self::$localEnv = $loaded;
        return self::$localEnv;
    }

    public static function env(string $key, string $fallback): string {
        $value = getenv($key);
        if ($value !== false && $value !== '') {
            return $value;
        }
        $local = self::loadLocalEnv();
        if (array_key_exists($key, $local) && $local[$key] !== '') {
            return $local[$key];
        }
        return $fallback;
    }
}
