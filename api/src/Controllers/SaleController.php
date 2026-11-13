<?php
declare(strict_types=1);

namespace Zeedat\Controllers;

use Zeedat\Repositories\BaseRepository;
use Zeedat\Repositories\SaleRepository;
use Zeedat\Services\CheckoutService;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

class SaleController
{
    public static function checkout(array $user, int $branch, array $body): array
    {
        return CheckoutService::checkout($user, $branch, $body);
    }

    public static function creditPayment(array $user, int $branch, array $body): array
    {
        return CheckoutService::creditPayment($user, $branch, $body);
    }

    public static function getSales(int $branch): array
    {
        return SaleRepository::recentSales($branch, 100);
    }

    public static function getInvoice(int $branch, array $query): array
    {
        $raw = $query['id'] ?? '';
        $id = (int) preg_replace('/\D/', '', (string) $raw);
        if (!$id)
            throw new ApiError('Invalid invoice number.');

        $invoice = SaleRepository::invoiceDetails($id, $branch);
        if (!$invoice)
            throw new ApiError('Invoice not found for this branch.', 404);

        $invoice['refunded'] = (int) BaseRepository::scalar(
            "SELECT COALESCE(SUM(r.amount),0) FROM returns_log r JOIN sale_items i ON i.id=r.sale_item_id WHERE i.sale_id=? AND r.status='Completed'",
            [$id]
        );
        return $invoice;
    }

    public static function getDrafts(int $branch, array $user): array
    {
        if (!$branch)
            throw new ApiError('Select a branch.');
        return SaleRepository::drafts($branch, (int) $user['id']);
    }

    public static function saveDraft(string $route, array $user, int $branch, array $body): array
    {
        $id = empty($body['id']) ? null : Validator::integer($body['id'], 'Draft');
        if ($id && !BaseRepository::scalar('SELECT id FROM drafts WHERE id=? AND branch_id=? AND user_id=? FOR UPDATE', [$id, $branch, $user['id']])) {
            throw new ApiError('Held bill not found.', 404);
        }

        if ($route === 'draft.remove') {
            if (!$id)
                throw new ApiError('Select a held bill.');
            BaseRepository::run('DELETE FROM drafts WHERE id=?', [$id]);
            return ['id' => $id];
        }

        $payload = $body['payload'] ?? null;
        if (!is_array($payload) || empty($payload['cart']) || strlen($json = json_encode($payload, JSON_THROW_ON_ERROR)) > 30000) {
            throw new ApiError('Invalid held bill.');
        }

        if ($id) {
            BaseRepository::run('UPDATE drafts SET payload=? WHERE id=?', [$json, $id]);
        } else {
            $id = BaseRepository::insert('INSERT INTO drafts(branch_id, user_id, payload) VALUES (?,?,?)', [$branch, $user['id'], $json]);
        }

        return ['id' => $id];
    }
}
