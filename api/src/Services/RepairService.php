<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Config\Constants;
use Zeedat\Config\Database;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\DrawerRepository;
use Zeedat\Repositories\UserRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class RepairService {
    private static function resolveCashDrawer(array $user, int $branch, string $closedMessage): array {
        $drawer = DrawerRepository::openDrawerForBranch($branch);
        if (!$drawer) {
            if (in_array($user['role'] ?? '', ['owner', 'manager'], true)) {
                DrawerService::open($user, $branch, ['opening' => 0]);
                $drawer = DrawerRepository::openDrawerForBranch($branch);
            } else {
                throw new ApiError($closedMessage);
            }
        }
        if ((int) $drawer['user_id'] !== (int) ($user['id'] ?? 0) && !in_array($user['role'] ?? '', ['owner', 'manager'], true)) {
            throw new ApiError('The active drawer is assigned to another cashier.');
        }
        return $drawer;
    }

    public static function create(int $branch, array $body, ?array $user = null): array {
        $actor = $user ?: ['id' => 1, 'role' => 'owner'];
        if (!empty($body['customer_id'])) {
            $customerId = Validator::integer($body['customer_id'], 'Customer');
            $customerRow = BaseRepository::one('SELECT id, name, phone FROM customers WHERE id=? AND branch_id=?', [$customerId, $branch]);
            if (!$customerRow) {
                throw new ApiError('Customer not found.', 404);
            }
        } else {
            $custPhone = Validator::str($body, 'customer_phone', 40);
            $digits = preg_replace('/\D+/', '', $custPhone);
            $customerRow = null;
            if (strlen($digits) >= 7) {
                $branchCustomers = BaseRepository::rows('SELECT id, name, phone FROM customers WHERE branch_id=?', [$branch]);
                foreach ($branchCustomers as $bc) {
                    $bcDigits = preg_replace('/\D+/', '', (string) ($bc['phone'] ?? ''));
                    if ($bcDigits !== '' && ($bcDigits === $digits || (strlen($digits) >= 9 && str_ends_with($bcDigits, substr($digits, -9))))) {
                        $customerRow = $bc;
                        break;
                    }
                }
            }
            if (!$customerRow) {
                $custName = Validator::str($body, 'customer_name', 120);
                $custEmail = Validator::str($body, 'customer_email', 160, false) ?: '';
                $custNotes = Validator::str($body, 'customer_notes', 500, false) ?: '';
                if (Database::isSqlite()) {
                    $cUuid = 'cust_' . bin2hex(random_bytes(10));
                    $customerId = BaseRepository::insert(
                        'INSERT INTO customers(uuid, sync_uuid, branch_id, name, phone, email, notes, synced) VALUES (?,?,?,?,?,?,?,0)',
                        [$cUuid, $cUuid, $branch, $custName, $custPhone, $custEmail, $custNotes]
                    );
                } else {
                    $customerId = BaseRepository::insert(
                        'INSERT INTO customers(branch_id, name, phone, email, notes, synced) VALUES (?,?,?,?,?,0)',
                        [$branch, $custName, $custPhone, $custEmail, $custNotes]
                    );
                }
                $customerRow = ['id' => $customerId, 'name' => $custName, 'phone' => $custPhone];
            } else {
                $customerId = (int) $customerRow['id'];
            }
        }

        $technicianId = empty($body['technician_id']) ? null : Validator::integer($body['technician_id'], 'Technician');
        $technicianName = '';
        if ($technicianId) {
            $techRow = BaseRepository::one("SELECT id, name FROM users WHERE id=? AND role='technician' AND active=1", [$technicianId]);
            if (!$techRow) {
                throw new ApiError('Technician not found.', 404);
            }
            $technicianName = (string) $techRow['name'];
        }

        $brand = trim((string) ($body['brand'] ?? ''));
        $model = trim((string) ($body['model'] ?? ''));
        $deviceInput = trim((string) ($body['device'] ?? ''));
        if ($deviceInput === '') {
            $deviceInput = $brand ? ($model ? "{$brand} {$model}" : $brand) : $model;
        }
        $device = Validator::str(['device' => $deviceInput], 'device', 120);

        $serial = Validator::str($body, 'serial', 60, false);
        $issue = Validator::str($body, 'issue', 1000);
        $notes = Validator::str($body, 'notes', 1000, false);
        $accessories = Validator::str($body, 'accessories', 200, false);
        $estimate = Validator::money($body, 'estimate');
        $dueDate = Validator::date($body, 'due_date');
        $status = !empty($body['status']) ? (string) $body['status'] : 'Received';
        if ($status === 'Pending Intake') {
            $status = 'Received';
        }
        if (!in_array($status, ['Received', 'Diagnosing', 'Awaiting Approval', 'Waiting for Parts', 'In Progress', 'Testing', 'Ready'], true)) {
            $status = 'Received';
        }

        $advance = !empty($body['advance_payment']) ? max(0, (int) $body['advance_payment']) : 0;
        $advanceMethod = (string) ($body['advance_method'] ?? 'Cash');
        if (!in_array($advanceMethod, Constants::TENDERS, true)) {
            $advanceMethod = 'Cash';
        }
        if ($advance > 0) {
            $advanceNote = 'Advance Paid: ' . number_format($advance / 100, 2) . " LKR ({$advanceMethod})";
            $notes = $notes ? "{$notes} | {$advanceNote}" : $advanceNote;
        }

        $id = BaseRepository::transaction(function () use (
            $actor,
            $branch,
            $customerId,
            $technicianId,
            $device,
            $serial,
            $issue,
            $notes,
            $accessories,
            $estimate,
            $dueDate,
            $status,
            $advance,
            $advanceMethod
        ) {
            $paidAtSql = $advance > 0 ? ($advance > 0 ? date('Y-m-d H:i:s') : null) : null;
            if (Database::isSqlite()) {
                $uuid = 'rep_' . bin2hex(random_bytes(10));
                $id = BaseRepository::insert(
                    "INSERT INTO repairs(uuid, sync_uuid, branch_id, customer_id, technician_id, device, serial, issue, notes, accessories, estimate, advance_paid, final_charge, paid_amount, payment_method, paid_at, due_date, status, synced)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
                    [$uuid, $uuid, $branch, $customerId, $technicianId, $device, $serial ?: '', $issue, $notes ?: '', $accessories ?: '', $estimate, $advance, $estimate, $advance, $advance > 0 ? $advanceMethod : '', $paidAtSql, $dueDate, $status]
                );
            } else {
                $id = BaseRepository::insert(
                    "INSERT INTO repairs(branch_id, customer_id, technician_id, device, serial, issue, notes, accessories, estimate, advance_paid, final_charge, paid_amount, payment_method, paid_at, due_date, status, synced)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
                    [$branch, $customerId, $technicianId, $device, $serial ?: '', $issue, $notes ?: '', $accessories ?: '', $estimate, $advance, $estimate, $advance, $advance > 0 ? $advanceMethod : '', $paidAtSql, $dueDate, $status]
                );
            }

            if ($advance > 0 && $advanceMethod === 'Cash') {
                $drawer = self::resolveCashDrawer(
                    $actor,
                    $branch,
                    'Open today’s cash register before recording a cash repair advance.'
                );
                DrawerRepository::addCashMovement(
                    (int) ($actor['id'] ?? 1),
                    $drawer,
                    $advance,
                    'Repair Advance',
                    sprintf('RJ-%06d', $id)
                );
            }

            return $id;
        });

        $jobNumber = sprintf('RJ-%06d', $id);
        $branchName = (string) (BaseRepository::scalar('SELECT name FROM branches WHERE id=?', [$branch]) ?: '');
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $smsMessage = SmsService::buildRepairMessage([
            'id' => $id,
            'job_number' => $jobNumber,
            'customer' => $customerRow['name'],
            'device' => $device,
            'issue' => $issue,
            'estimate' => $estimate,
            'advance_paid' => $advance,
            'due_date' => $dueDate,
            'status' => $status,
        ], $settings, $branchName, 'intake');

        $sendIntakeSms = !array_key_exists('send_sms', $body) || !empty($body['send_sms']);
        $smsResult = $sendIntakeSms
            ? SmsService::send($branch, $id, (string) ($customerRow['phone'] ?? ''), $smsMessage, 'intake')
            : ['sent' => false, 'status' => 'skipped', 'phone' => (string) ($customerRow['phone'] ?? ''), 'message' => $smsMessage];

        return [
            'id' => $id,
            'job_number' => $jobNumber,
            'customer_id' => $customerId,
            'customer' => (string) ($customerRow['name'] ?? ''),
            'customer_phone' => (string) ($customerRow['phone'] ?? ''),
            'status' => $status,
            'device' => $device,
            'branch_name' => $branchName,
            'technician' => $technicianName,
            'advance_paid' => $advance,
            'final_charge' => $estimate,
            'paid_amount' => $advance,
            'balance_due' => max(0, $estimate - $advance),
            'sms_message' => $smsMessage,
            'sms' => $smsResult,
        ];
    }

    public static function updateStatus(array $user, int $branch, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Repair job');
        $job = BaseRepository::one(
            'SELECT r.*, c.name customer, c.phone customer_phone FROM repairs r JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND r.branch_id=? FOR UPDATE',
            [$id, $branch]
        );
        if (!$job) {
            throw new ApiError('Repair job not found.', 404);
        }

        if ($user['role'] === 'technician' && (int) $job['technician_id'] !== (int) $user['id']) {
            throw new ApiError('You can only update your assigned repair jobs.', 403);
        }

        $next = trim((string) ($body['status'] ?? ''));
        $techProvided = array_key_exists('technician_id', $body);
        $newTechId = $job['technician_id'] ? (int) $job['technician_id'] : null;

        if ($techProvided && $user['role'] !== 'technician') {
            $rawTech = $body['technician_id'];
            if ($rawTech === '' || $rawTech === null || (int) $rawTech === 0) {
                $newTechId = null;
            } else {
                $candidateTech = Validator::integer($rawTech, 'Technician');
                if (!BaseRepository::scalar("SELECT id FROM users WHERE id=? AND role='technician' AND active=1", [$candidateTech])) {
                    throw new ApiError('Technician not found.', 404);
                }
                $newTechId = $candidateTech;
            }
        }

        $targetStatus = $job['status'];
        if ($next !== '' && $next !== $job['status']) {
            $allowed = Constants::REPAIR_TRANSITIONS[$job['status']] ?? [];
            if ($user['role'] === 'cashier' && $next !== 'Delivered') {
                throw new ApiError('Cashiers may only deliver ready repairs.', 403);
            }
            if ($user['role'] === 'technician' && in_array($next, ['Cancelled', 'Delivered'], true)) {
                throw new ApiError('Technicians cannot cancel or deliver repairs.', 403);
            }
            if (!in_array($next, $allowed, true)) {
                throw new ApiError("Cannot transition repair from {$job['status']} to {$next}.");
            }
            $targetStatus = $next;
        }

        BaseRepository::run(
            'UPDATE repairs SET status=?, technician_id=?, synced=0 WHERE id=?',
            [$targetStatus, $newTechId, $id]
        );

        $smsResult = null;
        if ($targetStatus === 'Ready' && !empty($body['send_sms'])) {
            $branchName = (string) (BaseRepository::scalar('SELECT name FROM branches WHERE id=?', [$branch]) ?: '');
            $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
            $msg = SmsService::buildRepairMessage(array_merge($job, ['status' => 'Ready']), $settings, $branchName, 'ready');
            $smsResult = SmsService::send($branch, $id, (string) ($job['customer_phone'] ?? ''), $msg, 'ready');
        }

        return [
            'id' => $id,
            'status' => $targetStatus,
            'previous' => $job['status'],
            'technician_id' => $newTechId,
            'sms' => $smsResult,
        ];
    }

    public static function completeAndPay(array $user, int $branch, array $body): array {
        if ($user['role'] === 'technician') {
            throw new ApiError('Technicians cannot collect payments or deliver repairs.', 403);
        }

        $id = Validator::integer($body['id'] ?? null, 'Repair job');

        $out = BaseRepository::transaction(function () use ($user, $branch, $id, $body) {
            $job = BaseRepository::one(
                'SELECT r.*, c.name customer, c.phone customer_phone FROM repairs r JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND r.branch_id=? FOR UPDATE',
                [$id, $branch]
            );
            if (!$job) {
                throw new ApiError('Repair job not found.', 404);
            }
            if ($job['status'] === 'Cancelled') {
                throw new ApiError('Cancelled repair jobs cannot be completed.');
            }
            $existingFinal = (int) (($job['final_charge'] ?? 0) > 0 ? $job['final_charge'] : $job['estimate']);
            $alreadyPaid = (int) ($job['paid_amount'] ?? $job['advance_paid'] ?? 0);

            $finalCharge = array_key_exists('final_charge', $body)
                ? Validator::money($body, 'final_charge')
                : $existingFinal;

            $defaultPay = max(0, $finalCharge - $alreadyPaid);
            $payAmount = array_key_exists('pay_amount', $body)
                ? Validator::money($body, 'pay_amount')
                : $defaultPay;

            if ($job['status'] === 'Delivered' && $alreadyPaid >= $finalCharge && $payAmount <= 0) {
                throw new ApiError('This repair job is already completed and fully paid.');
            }
            if ($job['status'] === 'Delivered' && $payAmount <= 0) {
                throw new ApiError('Enter a payment amount greater than zero to record payment.');
            }

            $method = (string) ($body['payment_method'] ?? 'Cash');
            if (!in_array($method, Constants::TENDERS, true)) {
                throw new ApiError('Invalid payment method.');
            }

            $newTechId = $job['technician_id'] ? (int) $job['technician_id'] : null;
            if (!empty($body['technician_id'])) {
                $candidate = Validator::integer($body['technician_id'], 'Technician');
                if (BaseRepository::scalar("SELECT id FROM users WHERE id=? AND role='technician' AND active=1", [$candidate])) {
                    $newTechId = $candidate;
                }
            }

            $cashAdded = false;
            $jobNumber = sprintf('RJ-%06d', $id);
            if ($payAmount > 0 && $method === 'Cash') {
                $drawer = self::resolveCashDrawer(
                    $user,
                    $branch,
                    'Open today’s cash register before collecting cash payment.'
                );
                DrawerRepository::addCashMovement(
                    (int) $user['id'],
                    $drawer,
                    $payAmount,
                    'Repair Payment',
                    $jobNumber
                );
                $cashAdded = true;
            }

            $totalPaid = $alreadyPaid + $payAmount;
            $extraNote = trim((string) ($body['notes'] ?? ''));
            $mergedNotes = (string) ($job['notes'] ?? '');
            if ($extraNote !== '') {
                $mergedNotes = $mergedNotes !== '' ? "{$mergedNotes} | {$extraNote}" : $extraNote;
            }

            BaseRepository::run(
                "UPDATE repairs SET status='Delivered', technician_id=?, final_charge=?, paid_amount=?, payment_method=?, paid_at=?, notes=?, synced=0 WHERE id=?",
                [$newTechId, $finalCharge, $totalPaid, $method, date('Y-m-d H:i:s'), $mergedNotes, $id]
            );

            UserRepository::logAudit((int) $user['id'], $branch, 'repair.complete', [
                'repair_id' => $id,
                'job_number' => $jobNumber,
                'final_charge' => $finalCharge,
                'pay_amount' => $payAmount,
                'payment_method' => $method,
                'total_paid' => $totalPaid,
            ]);

            return [
                'id' => $id,
                'job_number' => $jobNumber,
                'status' => 'Delivered',
                'final_charge' => $finalCharge,
                'pay_amount' => $payAmount,
                'paid_amount' => $totalPaid,
                'balance_due' => max(0, $finalCharge - $totalPaid),
                'payment_method' => $method,
                'cash_movement_added' => $cashAdded,
                'job' => $job,
            ];
        });

        $branchName = (string) (BaseRepository::scalar('SELECT name FROM branches WHERE id=?', [$branch]) ?: '');
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $smsMsg = SmsService::buildRepairMessage(array_merge($out['job'], [
            'job_number' => $out['job_number'],
            'final_charge' => $out['final_charge'],
            'paid_amount' => $out['paid_amount'],
            'status' => 'Delivered',
        ]), $settings, $branchName, 'delivered');

        $smsRes = !empty($body['send_sms'])
            ? SmsService::send($branch, $id, (string) ($out['job']['customer_phone'] ?? ''), $smsMsg, 'delivered')
            : ['sent' => false, 'status' => 'skipped', 'phone' => (string) ($out['job']['customer_phone'] ?? ''), 'message' => $smsMsg];

        unset($out['job']);
        $out['sms_message'] = $smsMsg;
        $out['sms'] = $smsRes;
        return $out;
    }

    public static function sendJobSms(int $branch, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Repair job');
        $job = BaseRepository::one(
            'SELECT r.*, c.name customer, c.phone customer_phone FROM repairs r JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND r.branch_id=?',
            [$id, $branch]
        );
        if (!$job) {
            throw new ApiError('Repair job not found.', 404);
        }

        $kind = (string) ($body['kind'] ?? 'intake');
        $branchName = (string) (BaseRepository::scalar('SELECT name FROM branches WHERE id=?', [$branch]) ?: '');
        $settings = BaseRepository::one('SELECT * FROM settings WHERE id=1') ?? [];
        $custom = trim((string) ($body['message'] ?? ''));
        $msg = $custom !== '' ? $custom : SmsService::buildRepairMessage($job, $settings, $branchName, $kind);

        return SmsService::send($branch, $id, (string) ($job['customer_phone'] ?? ''), $msg, $kind);
    }
}
