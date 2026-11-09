<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

use PDO;
use PDOStatement;
use Zeedat\Config\Database;

abstract class BaseRepository {
    protected static function db(): PDO {
        return Database::getConnection();
    }

    public static function run(string $sql, array $params = []): PDOStatement {
        $stmt = self::db()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public static function rows(string $sql, array $params = []): array {
        return self::run($sql, $params)->fetchAll();
    }

    public static function one(string $sql, array $params = []): ?array {
        $row = self::run($sql, $params)->fetch();
        return $row ? (array) $row : null;
    }

    public static function scalar(string $sql, array $params = []): mixed {
        return self::run($sql, $params)->fetchColumn();
    }

    public static function insert(string $sql, array $params): int {
        self::run($sql, $params);
        return (int) self::db()->lastInsertId();
    }

    public static function transaction(callable $callback): mixed {
        $db = self::db();
        if ($db->inTransaction()) {
            return $callback();
        }
        $db->beginTransaction();
        try {
            $result = $callback();
            $db->commit();
            return $result;
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }
}
