<?php
declare(strict_types=1);

namespace Zeedat\Support;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\BranchRepository;

class Idempotency {
    public static function execute(array $user, string $action, callable $handler, int $branch = 0): array {
        $lockedHandler = static function () use ($branch, $handler): array {
            if ($branch) BranchRepository::lock($branch);
            return $handler();
        };
        $key = trim((string) ($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? ''));
        if ($key === '') {
            return BaseRepository::transaction($lockedHandler);
        }

        if (strlen($key) > 64) {
            throw new ApiError('Invalid idempotency key.');
        }

        $cached = BaseRepository::one(
            'SELECT response FROM requests WHERE user_id=? AND request_id=?',
            [$user['id'], $key]
        );
        if ($cached && $cached['response'] !== null) {
            return json_decode($cached['response'], true, 32, JSON_THROW_ON_ERROR);
        }

        $fingerprint = hash('sha256', $action . '|' . ($user['id'] ?? 0));

        return BaseRepository::transaction(function () use ($user, $key, $fingerprint, $branch, $handler) {
            if ($branch) {
                BranchRepository::lock($branch);
                $response = BaseRepository::scalar(
                    'SELECT response FROM requests WHERE user_id=? AND request_id=?',
                    [$user['id'], $key]
                );
                if (is_string($response)) return json_decode($response, true, 32, JSON_THROW_ON_ERROR);
            }
            $result = $handler();
            $sql = \Zeedat\Config\Database::isSqlite()
                ? 'INSERT INTO requests(user_id, request_id, fingerprint, response) VALUES (?,?,?,?) ON CONFLICT(user_id, request_id) DO UPDATE SET response=excluded.response'
                : 'INSERT INTO requests(user_id, request_id, fingerprint, response) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE response=VALUES(response)';
            BaseRepository::run(
                $sql,
                [$user['id'], $key, $fingerprint, json_encode($result, JSON_THROW_ON_ERROR)]
            );
            return $result;
        });
    }
}
