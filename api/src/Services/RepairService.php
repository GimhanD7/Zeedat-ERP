<?php
declare(strict_types=1);

namespace Zeedat\Services;

use Zeedat\Config\Constants;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class RepairService {
    public static function create(int $branch, array $body): array {
        $customer = Validator::integer($body['customer_id'] ?? null, 'Customer');
        if (!BaseRepository::scalar('SELECT id FROM customers WHERE id=? AND branch_id=?', [$customer, $branch])) {
            throw new ApiError('Customer not found.', 404);
        }

        $technician = empty($body['technician_id']) ? null : Validator::integer($body['technician_id'], 'Technician');
        if ($technician && !BaseRepository::scalar("SELECT id FROM users WHERE id=? AND role='technician' AND active=1", [$technician])) {
            throw new ApiError('Technician not found.', 404);
        }

        $brand = trim((string)($body['brand'] ?? ''));
        $model = trim((string)($body['model'] ?? ''));
        $deviceInput = trim((string)($body['device'] ?? ''));
        if (!$deviceInput) {
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
        if ($status === 'Pending Intake') $status = 'Received';

        $advance = !empty($body['advance_payment']) ? (int) $body['advance_payment'] : 0;
        if ($advance > 0) {
            $advanceNote = "Advance Paid: " . number_format($advance / 100, 2) . " LKR";
            $notes = $notes ? "{$notes} | {$advanceNote}" : $advanceNote;
        }

        if (\Zeedat\Config\Database::isSqlite()) {
            $uuid = 'rep_' . bin2hex(random_bytes(10));
            $id = BaseRepository::insert(
                "INSERT INTO repairs(uuid, branch_id, customer_id, technician_id, device, serial, issue, notes, accessories, estimate, due_date, status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                [$uuid, $branch, $customer, $technician, $device, $serial ?: '', $issue, $notes ?: '', $accessories ?: '', $estimate, $dueDate, $status]
            );
        } else {
            $id = BaseRepository::insert(
                "INSERT INTO repairs(branch_id, customer_id, technician_id, device, serial, issue, notes, accessories, estimate, due_date, status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                [$branch, $customer, $technician, $device, $serial ?: '', $issue, $notes ?: '', $accessories ?: '', $estimate, $dueDate, $status]
            );
        }

        return [
            'id' => $id,
            'job_number' => sprintf('RJ-%06d', $id),
            'status' => $status,
            'device' => $device,
        ];
    }

    public static function updateStatus(array $user, int $branch, array $body): array {
        $id = Validator::integer($body['id'] ?? null, 'Repair job');
        $job = BaseRepository::one('SELECT * FROM repairs WHERE id=? AND branch_id=? FOR UPDATE', [$id, $branch]);
        if (!$job) throw new ApiError('Repair job not found.', 404);

        if ($user['role'] === 'technician' && (int) $job['technician_id'] !== (int) $user['id']) {
            throw new ApiError('You can only update your assigned repair jobs.', 403);
        }

        $next = $body['status'] ?? '';
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

        BaseRepository::run('UPDATE repairs SET status=? WHERE id=?', [$next, $id]);

        return ['id' => $id, 'status' => $next, 'previous' => $job['status']];
    }
}
