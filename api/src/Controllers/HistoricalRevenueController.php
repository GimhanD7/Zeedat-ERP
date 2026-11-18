<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Support\ApiError;

class HistoricalRevenueController
{
    public static function get(): array
    {
        $path = dirname(__DIR__) . '/Data/legacy-revenue.json';
        if (!is_file($path)) {
            throw new ApiError('Historical revenue analysis is not available.', 503);
        }
        return json_decode(file_get_contents($path), true, 32, JSON_THROW_ON_ERROR);
    }
}
