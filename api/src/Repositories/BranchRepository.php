<?php
declare(strict_types=1);

namespace Zeedat\Repositories;

class BranchRepository extends BaseRepository {
    public static function all(): array {
        return self::rows('SELECT * FROM branches ORDER BY id');
    }

    public static function findById(int $id): ?array {
        return self::one('SELECT * FROM branches WHERE id=?', [$id]);
    }

    public static function destinations(): array {
        return self::rows('SELECT id, name FROM branches ORDER BY id');
    }

    public static function exists(int $id): bool {
        return (bool) self::scalar('SELECT id FROM branches WHERE id=?', [$id]);
    }

    public static function lock(int $id): void {
        self::run('SELECT id FROM branches WHERE id=? FOR UPDATE', [$id]);
    }
}
