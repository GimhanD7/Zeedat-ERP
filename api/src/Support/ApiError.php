<?php
declare(strict_types=1);

namespace Zeedat\Support;

use RuntimeException;

class ApiError extends RuntimeException {
    public function __construct(string $message, int $code = 422) {
        parent::__construct($message, $code);
    }
}
