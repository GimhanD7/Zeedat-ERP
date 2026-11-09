<?php
declare(strict_types=1);

namespace Zeedat\Support;

use Zeedat\Repositories\BaseRepository;

class Idempotency {
    public static function execute(array $user, string $action, callable $handler): array {
        $key = trim((string) ($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? ''));
        if ($key === '') {
            return BaseRepository::transaction($handler);
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

        return BaseRepository::transaction(function () use ($user, $key, $fingerprint, $handler) {
            $result = $handler();
            BaseRepository::run(
                'INSERT INTO requests(user_id, request_id, fingerprint, response) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE response=VALUES(response)',
                [$user['id'], $key, $fingerprint, json_encode($result, JSON_THROW_ON_ERROR)]
            );
            return $result;
        });
    }
}
