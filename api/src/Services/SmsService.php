<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Repositories\BaseRepository;

class SmsService {
    public static function normalizePhone(string $phone): string {
        $digits = preg_replace('/[^0-9+]/', '', trim($phone)) ?: '';
        if ($digits === '') {
            return '';
        }
        if (str_starts_with($digits, '+')) {
            return substr($digits, 1);
        }
        if (str_starts_with($digits, '0') && strlen($digits) === 10) {
            return '94' . substr($digits, 1);
        }
        return $digits;
    }

    public static function buildRepairMessage(array $job, array $settings, string $branchName = '', string $kind = 'intake'): string {
        $shop = trim((string) ($settings['shop_name'] ?? 'Zeedat')) ?: 'Zeedat';
        $branchLabel = trim($branchName) !== '' ? " ({$branchName})" : '';
        $cust = trim((string) ($job['customer'] ?? 'Customer')) ?: 'Customer';
        $jobNo = (string) ($job['job_number'] ?? sprintf('RJ-%06d', (int) ($job['id'] ?? 0)));
        $device = trim((string) ($job['device'] ?? 'Device'));
        $issue = trim((string) ($job['issue'] ?? ''));
        $due = (string) ($job['due_date'] ?? '');

        $fmtMoney = static fn(int $cents): string => 'LKR ' . number_format($cents / 100, 2);

        if ($kind === 'ready' || $kind === 'delivered') {
            $finalCharge = (int) ($job['final_charge'] ?: $job['estimate'] ?: 0);
            $paid = (int) ($job['paid_amount'] ?? $job['advance_paid'] ?? 0);
            $balance = max(0, $finalCharge - $paid);
            if ($kind === 'delivered' || ($job['status'] ?? '') === 'Delivered') {
                return "Hi {$cust}, your {$device} ({$jobNo}) repair is complete and handed over at {$shop}{$branchLabel}. Total: {$fmtMoney($finalCharge)}, Paid: {$fmtMoney($paid)}. Thank you!";
            }
            return "Hi {$cust}, your {$device} ({$jobNo}) repair at {$shop}{$branchLabel} is READY for collection. Total: {$fmtMoney($finalCharge)}, Balance Due: {$fmtMoney($balance)}.";
        }

        $est = (int) ($job['estimate'] ?? 0);
        $adv = (int) ($job['advance_paid'] ?? $job['advance'] ?? 0);
        $parts = [
            "Hi {$cust}, we received your {$device} ({$jobNo}) at {$shop}{$branchLabel}.",
            $issue !== '' ? "Issue: {$issue}." : '',
            'Est: ' . $fmtMoney($est) . ($adv > 0 ? ', Adv Paid: ' . $fmtMoney($adv) : '') . '.',
            $due !== '' ? "Due: {$due}." : '',
            'Thank you!',
        ];

        return implode(' ', array_filter($parts));
    }

    public static function send(int $branchId, ?int $repairId, string $phone, string $message, string $kind = 'intake'): array {
        $cleanPhone = self::normalizePhone($phone);
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $enabled = !empty($settings['sms_enabled']);
        $urlTemplate = trim((string) ($settings['sms_provider_url'] ?? ''));
        $apiKey = trim((string) ($settings['sms_api_key'] ?? ''));
        $senderId = trim((string) ($settings['sms_sender_id'] ?? ($settings['shop_name'] ?? 'ZEEDAT')));

        if ($cleanPhone === '') {
            return [
                'sent' => false,
                'status' => 'no_phone',
                'phone' => '',
                'message' => $message,
            ];
        }

        if (!$enabled || $urlTemplate === '' || !function_exists('curl_init')) {
            self::log($branchId, $repairId, $cleanPhone, $message, $kind, 'manual', '');
            return [
                'sent' => false,
                'status' => 'not_configured',
                'phone' => $cleanPhone,
                'message' => $message,
            ];
        }

        $isPlaceholderGet = str_contains($urlTemplate, '{phone}') || str_contains($urlTemplate, '{message}');
        $ch = curl_init();

        if ($isPlaceholderGet) {
            $url = strtr($urlTemplate, [
                '{phone}' => rawurlencode($cleanPhone),
                '{message}' => rawurlencode($message),
                '{sender_id}' => rawurlencode($senderId),
                '{api_key}' => rawurlencode($apiKey),
            ]);
            curl_setopt_array($ch, [
                CURLOPT_URL => $url,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_CONNECTTIMEOUT => 4,
            ]);
        } else {
            $payload = json_encode([
                'recipient' => $cleanPhone,
                'to' => $cleanPhone,
                'phone' => $cleanPhone,
                'sender_id' => $senderId,
                'message' => $message,
            ]);
            $headers = ['Content-Type: application/json', 'Accept: application/json'];
            if ($apiKey !== '') {
                $headers[] = 'Authorization: Bearer ' . $apiKey;
            }
            curl_setopt_array($ch, [
                CURLOPT_URL => $urlTemplate,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_CONNECTTIMEOUT => 4,
            ]);
        }

        $response = curl_exec($ch);
        $err = curl_error($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $code < 200 || $code >= 300) {
            $errorMsg = $err ?: "HTTP {$code}";
            self::log($branchId, $repairId, $cleanPhone, $message, $kind, 'failed', substr($errorMsg, 0, 240));
            return [
                'sent' => false,
                'status' => 'failed',
                'error' => $errorMsg,
                'phone' => $cleanPhone,
                'message' => $message,
            ];
        }

        self::log($branchId, $repairId, $cleanPhone, $message, $kind, 'sent', '');
        if ($repairId) {
            try {
                BaseRepository::run('UPDATE repairs SET sms_sent=1 WHERE id=?', [$repairId]);
            } catch (\Throwable) {
            }
        }

        return [
            'sent' => true,
            'status' => 'sent',
            'phone' => $cleanPhone,
            'message' => $message,
        ];
    }

    private static function log(int $branchId, ?int $repairId, string $phone, string $message, string $kind, string $status, string $error): void {
        try {
            BaseRepository::run(
                'INSERT INTO sms_logs(branch_id, repair_id, phone, message, kind, status, error_message) VALUES (?,?,?,?,?,?,?)',
                [$branchId, $repairId, $phone, $message, $kind, $status, $error]
            );
        } catch (\Throwable) {
        }
    }
}
