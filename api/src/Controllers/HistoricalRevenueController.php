<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Support\ApiError;
use Zeedat\Repositories\BaseRepository;

class HistoricalRevenueController
{
    public static function get(int $branch = 0): array
    {
        $path = dirname(__DIR__) . '/Data/legacy-revenue.json';
        if (!is_file($path)) {
            throw new ApiError('Historical revenue analysis is not available.', 503);
        }
        $data = json_decode(file_get_contents($path), true, 32, JSON_THROW_ON_ERROR);
        $data['from'] = $data['days'][0]['day'] ?? '';
        $data['to'] = $data['days'][array_key_last($data['days'])]['day'] ?? '';
        $data['available'] = true;
        if ($branch > 0) {
            $name = (string) BaseRepository::scalar('SELECT name FROM branches WHERE id=?', [$branch]);
            if (!in_array(strtolower(trim($name)), ['battaramulla mobile', 'baththaramulla mobile'], true)) {
                $data['available'] = false;
                $data['days'] = [];
                $data['selected_branch'] = $name;
            }
        }
        return $data;
    }
}
