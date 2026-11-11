<?php
declare(strict_types=1);

namespace Zeedat\Config;

use PDO;
use Throwable;

class Database {
    private static ?PDO $connection = null;
    private static ?string $activeDriver = null;
    private static ?array $localEnv = null;
    private static bool $fellBackToSqlite = false;

    public static function getSqlitePath(): string {
        return self::env(
            'ZEEDAT_SQLITE_PATH',
            dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'database' . DIRECTORY_SEPARATOR . 'zeedat_local.db'
        );
    }

    public static function isSqlite(): bool {
        return self::getDriver() === 'sqlite';
    }

    public static function isFallbackActive(): bool {
        self::getConnection();
        return self::$fellBackToSqlite;
    }

    public static function overrideConnection(string $driver, ?PDO $pdo): void {
        self::$activeDriver = $driver;
        self::$connection = $pdo;
    }

    public static function openSqlite(?string $sqlitePath = null, bool $migrate = true): PDO {
        $path = $sqlitePath ?: self::getSqlitePath();
        $dir = dirname($path);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $pdo = new PDO(
            "sqlite:{$path}",
            null,
            null,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_TIMEOUT => 15,
            ]
        );

        $pdo->exec('PRAGMA foreign_keys = ON;');
        $pdo->exec('PRAGMA journal_mode = WAL;');
        $pdo->exec('PRAGMA busy_timeout = 5000;');

        $pdo->sqliteCreateFunction('CONCAT', static fn(...$args) => implode('', $args));
        $pdo->sqliteCreateFunction('GREATEST', static fn(...$args) => max($args));
        $pdo->sqliteCreateFunction('LEAST', static fn(...$args) => min($args));

        if ($migrate) {
            \Zeedat\Services\AutoMigrator::run($pdo, 'sqlite');
        }

        return $pdo;
    }

    public static function clearMysqlOfflineCache(): void {
        $flag = self::getSqlitePath() . '.mysql_offline';
        if (is_file($flag)) {
            @unlink($flag);
        }
    }

    public static function isMysqlReachable(string $host, string $port, bool $forceProbe = false): bool {
        $flag = self::getSqlitePath() . '.mysql_offline';
        if (!$forceProbe && is_file($flag)) {
            $until = (int) @file_get_contents($flag);
            if ($until > time()) {
                return false;
            }
        }
        $sock = @fsockopen($host, (int) ($port ?: 3306), $errno, $errstr, 1.2);
        if (is_resource($sock)) {
            fclose($sock);
            self::clearMysqlOfflineCache();
            return true;
        }
        if (is_dir(dirname($flag))) {
            @file_put_contents($flag, (string) (time() + 10));
        }
        return false;
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
            self::$connection = self::openSqlite(self::getSqlitePath(), true);
            return self::$connection;
        }

        // MySQL Connection (fast reachability probe + automatic SQLite offline fallback)
        $host = self::env('DB_HOST', '127.0.0.1');
        $port = self::env('DB_PORT', '3306');
        $name = self::env('DB_NAME', 'zeedat_pos');
        $user = self::env('DB_USER', 'root');
        $pass = self::env('DB_PASSWORD', '');
        $sqliteExists = file_exists(self::getSqlitePath());

        if ($sqliteExists && !self::isMysqlReachable($host, $port)) {
            self::$fellBackToSqlite = true;
            self::$activeDriver = 'sqlite';
            self::$connection = null;
            return self::getConnection();
        }

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
            self::clearMysqlOfflineCache();
            self::$fellBackToSqlite = false;

            // Automatically check and run migrations if tables are missing
            if (self::env('DB_AUTO_MIGRATE', '1') !== '0') {
                \Zeedat\Services\AutoMigrator::run(self::$connection, 'mysql');
            }
        } catch (Throwable $e) {
            if ($sqliteExists) {
                @file_put_contents(self::getSqlitePath() . '.mysql_offline', (string) (time() + 10));
                self::$fellBackToSqlite = true;
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
