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
        return [
            'date' => $date, 'baseline_date' => $baselineDate, 'branches' => $rows,
            'month_comparison' => self::monthComparison($branches, $date, $history),
        ];
    }

    private static function monthComparison(array $branches, string $date, ?array $history): array
    {
        $start = new DateTimeImmutable(substr($date, 0, 7) . '-01');
        $priorStart = $start->modify('-1 year');
        $end = $start->modify('+1 month')->format('Y-m-d');
        $priorEnd = $priorStart->modify('+1 month')->format('Y-m-d');
        $rows = [];
        foreach ($branches as $branch) {
            $current = self::monthRevenue((int) $branch['id'], $start->format('Y-m-d'), $end);
            $prior = self::monthRevenue((int) $branch['id'], $priorStart->format('Y-m-d'), $priorEnd);
            $useBackup = $history && in_array(strtolower(trim($branch['name'])), ['battaramulla mobile', 'baththaramulla mobile'], true);
            $backupDays = $useBackup ? array_column($history['days'], null, 'day') : [];
            $points = [];
            for ($day = 1; $day <= (int) $start->format('t'); $day++) {
                $currentDate = $start->format('Y-m-') . sprintf('%02d', $day);
                $priorDate = $priorStart->format('Y-m-') . sprintf('%02d', $day);
                $baseline = $day <= (int) $priorStart->format('t') && $prior
                    ? (int) ($prior[$priorDate] ?? 0) : null;
                if ($useBackup && $day <= (int) $priorStart->format('t')
                    && $priorDate >= $history['days'][0]['day']
                    && $priorDate <= $history['days'][array_key_last($history['days'])]['day']) {
                    $baseline = isset($backupDays[$priorDate])
                        ? (int) $backupDays[$priorDate]['revenue'] - (int) $backupDays[$priorDate]['refunds'] : 0;
                }
                $points[] = [
                    'day' => $day, 'date' => $currentDate,
                    'current' => $currentDate <= $date ? (int) ($current[$currentDate] ?? 0) : null,
                    'previous' => $baseline,
                ];
            }
            $rows[] = ['id' => (int) $branch['id'], 'name' => $branch['name'], 'points' => $points];
        }
        return ['month' => $start->format('Y-m'), 'previous_month' => $priorStart->format('Y-m'), 'branches' => $rows];
    }

    private static function monthRevenue(int $branch, string $start, string $end): array
    {
        $rows = BaseRepository::rows(
            "SELECT day,SUM(amount) total FROM (
                SELECT DATE(created_at) day,total amount FROM sales WHERE branch_id=? AND created_at>=? AND created_at<?
                UNION ALL
                SELECT DATE(created_at) day,-CAST(amount AS SIGNED) amount FROM returns_log
                WHERE branch_id=? AND status='Completed' AND created_at>=? AND created_at<?
             ) revenue GROUP BY day",
            [$branch, $start, $end, $branch, $start, $end]
        );
        return array_column($rows, 'total', 'day');
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
