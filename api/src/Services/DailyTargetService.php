<?php
declare(strict_types=1);

namespace Zeedat\Services;

use DateTimeImmutable;
use Zeedat\Repositories\BaseRepository;

class DailyTargetService
{
    public static function get(int $branch, string $date): array
    {
        $year = (int) substr($date, 0, 4) - 1;
        $month = (int) substr($date, 5, 2);
        $day = (int) substr($date, 8, 2);
        if (!checkdate($month, $day, $year)) $day = 28;
        $baselineDate = sprintf('%04d-%02d-%02d', $year, $month, $day);
        $branches = BaseRepository::rows(
            'SELECT id,name FROM branches' . ($branch ? ' WHERE id=?' : '') . ' ORDER BY id',
            $branch ? [$branch] : []
        );
        $path = dirname(__DIR__) . '/Data/legacy-revenue.json';
        $history = is_file($path) ? json_decode(file_get_contents($path), true, 32, JSON_THROW_ON_ERROR) : null;
        $rows = [];
        foreach ($branches as $item) {
            $id = (int) $item['id'];
            $actual = self::revenue($id, $date);
            $prior = self::revenue($id, $baselineDate);
            $known = $prior['invoices'] > 0;
            $source = $known ? 'Recorded invoices' : null;
            if ($history && in_array(strtolower(trim($item['name'])), ['battaramulla mobile', 'baththaramulla mobile'], true)
                && $baselineDate >= $history['days'][0]['day']
                && $baselineDate <= $history['days'][array_key_last($history['days'])]['day']) {
                $prior = ['net' => 0, 'invoices' => 0];
                foreach ($history['days'] as $record) {
                    if ($record['day'] === $baselineDate) {
                        $prior = ['net' => (int) $record['revenue'] - (int) $record['refunds'], 'invoices' => (int) $record['invoices']];
                        break;
                    }
                }
                $known = true;
                $source = 'Historical branch backup';
            }
            $target = $known ? max(0, $prior['net']) : null;
            $rows[] = [
                'id' => $id, 'name' => $item['name'], 'actual' => $actual['net'],
                'baseline' => $known ? $prior['net'] : null, 'target' => $target,
                'remaining' => $known ? max(0, $target - $actual['net']) : null,
                'progress' => $target > 0 ? round(max(0, $actual['net']) * 100 / $target, 1) : null,
                'source' => $source,
            ];
        }
        return ['date' => $date, 'baseline_date' => $baselineDate, 'branches' => $rows];
    }

    private static function revenue(int $branch, string $date): array
    {
        $end = (new DateTimeImmutable($date))->modify('+1 day')->format('Y-m-d');
        $sales = BaseRepository::one(
            'SELECT COALESCE(SUM(total),0) total,COUNT(*) invoices FROM sales WHERE branch_id=? AND created_at>=? AND created_at<?',
            [$branch, $date, $end]
        );
        $refunds = (int) BaseRepository::scalar(
            "SELECT COALESCE(SUM(amount),0) FROM returns_log WHERE branch_id=? AND status='Completed' AND created_at>=? AND created_at<?",
            [$branch, $date, $end]
        );
        return ['net' => (int) $sales['total'] - $refunds, 'invoices' => (int) $sales['invoices']];
    }
}
