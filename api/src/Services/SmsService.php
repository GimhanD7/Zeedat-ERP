<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

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

    public static function buildPaymentReceivedMessage(array $info, array $settings = [], string $branchName = ''): string {
        $shop = trim((string) ($settings['shop_name'] ?? 'Zeedat')) ?: 'Zeedat';
        $branchLabel = trim($branchName) !== '' ? " ({$branchName})" : '';
        $cust = trim((string) ($info['customer'] ?? 'Customer')) ?: 'Customer';
        $type = (string) ($info['type'] ?? 'payment');
        $method = trim((string) ($info['method'] ?? 'Cash')) ?: 'Cash';
        $fmtMoney = static fn(int $cents): string => 'LKR ' . number_format($cents / 100, 2);

        if ($type === 'reservation_payment') {
            $rsvRef = (string) ($info['reservation_ref'] ?? 'RSV');
            $product = trim((string) ($info['product'] ?? 'Reserved Item')) ?: 'Reserved Item';
            $amount = (int) ($info['amount'] ?? 0);
            $total = (int) ($info['total'] ?? 0);
            $paid = (int) ($info['paid'] ?? 0);
            $balance = max(0, $total - $paid);
            return "Hi {$cust}, reservation payment of {$fmtMoney($amount)} ({$method}) received for {$product} ({$rsvRef}) at {$shop}{$branchLabel}. Total: {$fmtMoney($total)}, Paid: {$fmtMoney($paid)}, Balance Due: {$fmtMoney($balance)}. Thank you!";
        }

        if ($type === 'reservation_handover') {
            $rsvRef = (string) ($info['reservation_ref'] ?? 'RSV');
            $invoiceNo = (string) ($info['invoice_no'] ?? '');
            $product = trim((string) ($info['product'] ?? 'Reserved Item')) ?: 'Reserved Item';
            $total = (int) ($info['total'] ?? 0);
            $invPart = $invoiceNo !== '' ? " Invoice: {$invoiceNo}," : '';
            return "Hi {$cust}, your reserved item {$product} ({$rsvRef}) has been handed over at {$shop}{$branchLabel}.{$invPart} Total Paid: {$fmtMoney($total)}. Thank you!";
        }

        if ($type === 'credit_payment') {
            $invoiceNo = (string) ($info['invoice_no'] ?? 'Invoice');
            $amount = (int) ($info['amount'] ?? 0);
            $remaining = max(0, (int) ($info['remaining'] ?? 0));
            return "Hi {$cust}, credit payment of {$fmtMoney($amount)} ({$method}) received for Invoice {$invoiceNo} at {$shop}{$branchLabel}. Remaining Credit Balance: {$fmtMoney($remaining)}. Thank you!";
        }

        if ($type === 'wallet_topup') {
            $amount = (int) ($info['amount'] ?? 0);
            $walletBalance = (int) ($info['wallet_balance'] ?? 0);
            return "Hi {$cust}, wallet top-up payment of {$fmtMoney($amount)} ({$method}) received at {$shop}{$branchLabel}. Available Wallet Balance: {$fmtMoney($walletBalance)}. Thank you!";
        }

        if ($type === 'repair_payment') {
            $jobNo = (string) ($info['job_number'] ?? 'RJ');
            $device = trim((string) ($info['device'] ?? 'Device')) ?: 'Device';
            $amount = (int) ($info['amount'] ?? 0);
            $paid = (int) ($info['paid'] ?? 0);
            $balance = max(0, (int) ($info['balance'] ?? 0));
            return "Hi {$cust}, repair payment of {$fmtMoney($amount)} ({$method}) received for {$device} ({$jobNo}) at {$shop}{$branchLabel}. Total Paid: {$fmtMoney($paid)}, Balance Due: {$fmtMoney($balance)}. Thank you!";
        }

        if ($type === 'exchange_payment') {
            $invoiceNo = (string) ($info['invoice_no'] ?? '');
            $retRef = (string) ($info['return_ref'] ?? 'RET');
            $amount = (int) ($info['amount'] ?? 0);
            return "Hi {$cust}, exchange payment of {$fmtMoney($amount)} ({$method}) received for Bill {$invoiceNo} ({$retRef}) at {$shop}{$branchLabel}. Thank you!";
        }

        $invoiceNo = (string) ($info['invoice_no'] ?? 'Invoice');
        $total = (int) ($info['total'] ?? 0);
        $paid = (int) ($info['paid'] ?? 0);
        $credit = max(0, (int) ($info['credit'] ?? 0));
        if ($paid > 0) {
            $balPart = $credit > 0 ? ", Credit Balance Due: {$fmtMoney($credit)}" : '';
            return "Hi {$cust}, payment of {$fmtMoney($paid)} ({$method}) received for Invoice {$invoiceNo} at {$shop}{$branchLabel}. Bill Total: {$fmtMoney($total)}{$balPart}. Thank you!";
        }
        return "Hi {$cust}, Invoice {$invoiceNo} recorded at {$shop}{$branchLabel}. Total: {$fmtMoney($total)}, Credit Due: {$fmtMoney($credit)}. Thank you!";
    }

    public static function send(
        int $branchId,
        ?int $repairId,
        string $phone,
        string $message,
        string $kind = 'intake',
        ?int $customerId = null,
        string $customerName = '',
        ?int $existingLogId = null
    ): array {
        $cleanPhone = self::normalizePhone($phone);
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $enabled = !empty($settings['sms_enabled']);
        $urlTemplate = trim((string) ($settings['sms_provider_url'] ?? ''));
        $apiKey = trim((string) ($settings['sms_api_key'] ?? ''));
        $senderId = trim((string) ($settings['sms_sender_id'] ?? ($settings['shop_name'] ?? 'ZEEDAT')));

        if ($cleanPhone === '' || strlen($cleanPhone) < 9) {
            $errReason = $cleanPhone === '' ? 'Missing phone number' : 'Invalid phone number (' . $phone . ')';
            $logId = self::saveLog(
                $existingLogId,
                $branchId,
                $repairId,
                $customerId,
                $customerName,
                $phone !== '' ? $phone : '—',
                $message,
                $kind,
                'rejected',
                $errReason
            );
            return [
                'id' => $logId,
                'sent' => false,
                'status' => 'rejected',
                'error' => $errReason,
                'phone' => $phone,
                'message' => $message,
            ];
        }

        if (!$enabled || $urlTemplate === '' || !function_exists('curl_init')) {
            $logId = self::saveLog(
                $existingLogId,
                $branchId,
                $repairId,
                $customerId,
                $customerName,
                $cleanPhone,
                $message,
                $kind,
                'manual',
                ''
            );
            return [
                'id' => $logId,
                'sent' => false,
                'status' => 'manual',
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
            $status = ($code >= 400 && $code < 500) ? 'rejected' : 'failed';
            $logId = self::saveLog(
                $existingLogId,
                $branchId,
                $repairId,
                $customerId,
                $customerName,
                $cleanPhone,
                $message,
                $kind,
                $status,
                substr($errorMsg, 0, 240)
            );
            return [
                'id' => $logId,
                'sent' => false,
                'status' => $status,
                'error' => $errorMsg,
                'phone' => $cleanPhone,
                'message' => $message,
            ];
        }

        $logId = self::saveLog(
            $existingLogId,
            $branchId,
            $repairId,
            $customerId,
            $customerName,
            $cleanPhone,
            $message,
            $kind,
            'sent',
            ''
        );
        if ($repairId) {
            try {
                BaseRepository::run('UPDATE repairs SET sms_sent=1 WHERE id=?', [$repairId]);
            } catch (\Throwable) {
            }
        }

        return [
            'id' => $logId,
            'sent' => true,
            'status' => 'sent',
            'phone' => $cleanPhone,
            'message' => $message,
        ];
    }

    public static function getLogs(int $branch, array $query = []): array {
        $params = [];
        $where = [];
        if ($branch > 0) {
            $where[] = '(l.branch_id = ? OR l.branch_id = 0)';
            $params[] = $branch;
        }
        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        return BaseRepository::rows(
            "SELECT l.id,
                    l.branch_id,
                    COALESCE(b.name, 'All Branches') AS branch_name,
                    l.repair_id,
                    l.customer_id,
                    COALESCE(NULLIF(l.customer_name, ''), c.name, rc.name, 'Direct Recipient') AS customer_name,
                    l.phone,
                    l.message,
                    l.kind,
                    l.status,
                    l.error_message,
                    l.created_at
             FROM sms_logs l
             LEFT JOIN branches b ON b.id = l.branch_id
             LEFT JOIN customers c ON c.id = l.customer_id
             LEFT JOIN repairs r ON r.id = l.repair_id
             LEFT JOIN customers rc ON rc.id = r.customer_id
             {$whereSql}
             ORDER BY l.id DESC
             LIMIT 600",
            $params
        );
    }

    public static function sendSingle(int $branch, array $body): array {
        $phone = trim((string) ($body['phone'] ?? ''));
        $message = Validator::str($body, 'message', 1000);
        $kind = Validator::str($body, 'kind', 30, false) ?: 'single';
        $customerId = !empty($body['customer_id']) ? (int) $body['customer_id'] : null;
        $customerName = Validator::str($body, 'customer_name', 150, false) ?: '';
        $forceRejected = !empty($body['reject_immediately']);
        $rejectReason = Validator::str($body, 'reject_reason', 240, false) ?: 'Rejected manually';

        if ($customerId && $customerName === '') {
            $cust = BaseRepository::one('SELECT name, phone FROM customers WHERE id=?', [$customerId]);
            if ($cust) {
                $customerName = (string) ($cust['name'] ?? '');
                if ($phone === '') {
                    $phone = (string) ($cust['phone'] ?? '');
                }
            }
        }

        if ($forceRejected) {
            $cleanPhone = self::normalizePhone($phone) ?: ($phone ?: '—');
            $logId = self::saveLog(
                null,
                $branch,
                null,
                $customerId,
                $customerName,
                $cleanPhone,
                $message,
                $kind,
                'rejected',
                $rejectReason
            );
            return [
                'id' => $logId,
                'sent' => false,
                'status' => 'rejected',
                'phone' => $cleanPhone,
                'message' => $message,
                'error' => $rejectReason,
            ];
        }

        return self::send($branch, null, $phone, $message, $kind, $customerId, $customerName);
    }

    public static function sendBulk(int $branch, array $body): array {
        $recipients = $body['recipients'] ?? [];
        if (!is_array($recipients) || empty($recipients)) {
            throw new ApiError('Select at least one customer recipient.');
        }
        if (count($recipients) > 500) {
            throw new ApiError('Select at most 500 recipients per bulk batch.');
        }
        $template = Validator::str($body, 'message', 1000);
        $kind = Validator::str($body, 'kind', 30, false) ?: 'bulk';
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $shopName = trim((string) ($settings['shop_name'] ?? 'ZEEDAT POS')) ?: 'ZEEDAT POS';

        $sent = 0;
        $manual = 0;
        $failed = 0;
        $rejected = 0;

        foreach ($recipients as $rec) {
            if (!is_array($rec)) continue;
            $cId = !empty($rec['customer_id']) ? (int) $rec['customer_id'] : null;
            $cName = trim((string) ($rec['customer_name'] ?? $rec['name'] ?? 'Customer')) ?: 'Customer';
            $cPhone = trim((string) ($rec['phone'] ?? ''));
            $cCredit = 'LKR ' . number_format(((int) ($rec['credit'] ?? 0)) / 100, 2);
            $cPoints = (string) ((int) ($rec['points'] ?? $rec['loyalty_points'] ?? 0));
            $cBranch = trim((string) ($rec['branch'] ?? ''));

            $msg = strtr($template, [
                '{name}' => $cName,
                '{shop}' => $shopName,
                '{phone}' => $cPhone,
                '{credit}' => $cCredit,
                '{points}' => $cPoints,
                '{branch}' => $cBranch,
            ]);

            $res = self::send($branch, null, $cPhone, $msg, $kind, $cId, $cName);
            $st = $res['status'] ?? 'manual';
            if ($st === 'sent') {
                $sent++;
            } elseif ($st === 'rejected') {
                $rejected++;
            } elseif ($st === 'failed') {
                $failed++;
            } else {
                $manual++;
            }
        }

        return [
            'total' => count($recipients),
            'sent' => $sent,
            'manual' => $manual,
            'failed' => $failed,
            'rejected' => $rejected,
        ];
    }

    public static function manageLog(int $branch, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'SMS record');
        $operation = Validator::str($body, 'operation', 30);
        $row = BaseRepository::one('SELECT * FROM sms_logs WHERE id=?', [$id]);
        if (!$row) {
            throw new ApiError('SMS record not found.', 404);
        }

        if ($operation === 'delete') {
            BaseRepository::run('DELETE FROM sms_logs WHERE id=?', [$id]);
            return ['id' => $id, 'deleted' => true];
        }

        if ($operation === 'reject') {
            $reason = Validator::str($body, 'reason', 240, false) ?: 'Rejected by staff';
            BaseRepository::run(
                "UPDATE sms_logs SET status='rejected', error_message=? WHERE id=?",
                [$reason, $id]
            );
            return ['id' => $id, 'status' => 'rejected', 'error_message' => $reason];
        }

        if ($operation === 'mark_sent') {
            BaseRepository::run(
                "UPDATE sms_logs SET status='sent', error_message='' WHERE id=?",
                [$id]
            );
            return ['id' => $id, 'status' => 'sent'];
        }

        if ($operation === 'retry') {
            return self::send(
                (int) ($row['branch_id'] ?: $branch),
                !empty($row['repair_id']) ? (int) $row['repair_id'] : null,
                (string) $row['phone'],
                (string) $row['message'],
                (string) ($row['kind'] ?: 'single'),
                !empty($row['customer_id']) ? (int) $row['customer_id'] : null,
                (string) ($row['customer_name'] ?? ''),
                $id
            );
        }

        throw new ApiError('Unsupported SMS operation.');
    }

    private static function saveLog(
        ?int $existingLogId,
        int $branchId,
        ?int $repairId,
        ?int $customerId,
        string $customerName,
        string $phone,
        string $message,
        string $kind,
        string $status,
        string $error
    ): int {
        try {
            if ($existingLogId) {
                BaseRepository::run(
                    'UPDATE sms_logs SET phone=?, message=?, kind=?, status=?, error_message=?, created_at=CURRENT_TIMESTAMP WHERE id=?',
                    [$phone, $message, $kind, $status, $error, $existingLogId]
                );
                return $existingLogId;
            }
            return BaseRepository::insert(
                'INSERT INTO sms_logs(branch_id, repair_id, customer_id, customer_name, phone, message, kind, status, error_message) VALUES (?,?,?,?,?,?,?,?,?)',
                [$branchId, $repairId, $customerId, $customerName, $phone, $message, $kind, $status, $error]
            );
        } catch (\Throwable) {
            return 0;
        }
    }
}
