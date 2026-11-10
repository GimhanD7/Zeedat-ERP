<?php
declare(strict_types=1);

namespace Zeedat\Support;

class Validator {
    public static function str(array $data, string $key, int $max = 100, bool $required = true): string {
        $value = $data[$key] ?? '';
        if (!is_string($value)) {
            throw new ApiError("Invalid {$key}.");
        }
        $value = trim($value);
        if (($required && $value === '') || mb_strlen($value) > $max) {
            throw new ApiError("Invalid {$key}.");
        }
        return $value;
    }

    public static function integer(mixed $value, string $label, int $min = 1, int $max = 2147483647): int {
        if (!is_numeric($value) || (int) $value != $value) {
            throw new ApiError("Invalid {$label}.");
        }
        $int = (int) $value;
        if ($int < $min || $int > $max) {
            throw new ApiError("Invalid {$label}.");
        }
        return $int;
    }

    public static function money(array $data, string $key): int {
        $amount = self::integer($data[$key] ?? null, $key, 0, 99999999999);
        return $amount;
    }

    public static function password(array $data, bool $required): string {
        $value = $data['password'] ?? '';
        if (
            !is_string($value) ||
            (($value !== '' || $required) &&
                (strlen($value) < 6 || strlen($value) > 72 || str_contains($value, "\0")))
        ) {
            throw new ApiError('Use a password between 6 and 72 characters.');
        }
        return $value;
    }

    public static function date(array $data, string $key, bool $futureOnly = false): string {
        $value = self::str($data, $key, 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            throw new ApiError("Invalid {$key}.");
        }
        [$y, $m, $d] = explode('-', $value);
        if (!checkdate((int) $m, (int) $d, (int) $y)) {
            throw new ApiError("Invalid {$key}.");
        }
        if ($futureOnly && $value < date('Y-m-d')) {
            throw new ApiError("{$key} cannot be in the past.");
        }
        return $value;
    }
}
