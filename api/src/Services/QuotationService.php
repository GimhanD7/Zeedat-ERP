<?php
declare(strict_types=1);

namespace Zeedat\Services;

use PDO;
use Throwable;
use Zeedat\Config\Database;
use Zeedat\Repositories\BaseRepository;
use Zeedat\Support\ApiError;
use Zeedat\Support\Validator;

final class QuotationService extends BaseRepository
{
    private static bool $tablesVerified = false;

    public static function ensureTables(?PDO $db = null): void
    {
        if (self::$tablesVerified && $db === null) {
            return;
        }
        $db ??= self::db();
        $isSqlite = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';

        if ($isSqlite) {
            $db->exec("CREATE TABLE IF NOT EXISTS quotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sync_uuid TEXT NOT NULL UNIQUE,
                synced INTEGER NOT NULL DEFAULT 0,
                branch_id INTEGER NOT NULL DEFAULT 1,
                user_id INTEGER NOT NULL DEFAULT 1,
                customer_id INTEGER NULL,
                doc_type TEXT NOT NULL DEFAULT 'Quotation',
                quote_no TEXT NOT NULL DEFAULT '',
                quote_date TEXT NOT NULL DEFAULT '',
                valid_until TEXT NOT NULL DEFAULT '14',
                client_name TEXT NOT NULL DEFAULT '',
                client_contact TEXT NOT NULL DEFAULT '',
                client_address TEXT NOT NULL DEFAULT '',
                header_phones TEXT NOT NULL DEFAULT '077 089 4099 | 074 192 8979',
                header_tagline TEXT NOT NULL DEFAULT 'Mobile Phones|Laptops|Computers|Accessories| Hardware & Software Repair',
                footer_addresses TEXT NOT NULL DEFAULT 'No. 148, Main Street, Battaramulla | No. 163, New Kandy Road, Malabe (Next to SLIIT Campus)',
                subtotal INTEGER NOT NULL DEFAULT 0,
                discount INTEGER NOT NULL DEFAULT 0,
                grand_total INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'Saved',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )");

            $db->exec("CREATE TABLE IF NOT EXISTS quotation_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quotation_id INTEGER NOT NULL,
                line_no INTEGER NOT NULL DEFAULT 1,
                product_id INTEGER NULL,
                description TEXT NOT NULL DEFAULT '',
                warranty TEXT NOT NULL DEFAULT '',
                qty INTEGER NOT NULL DEFAULT 1,
                unit_price INTEGER NOT NULL DEFAULT 0,
                line_total INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
            )");
            $db->exec('CREATE INDEX IF NOT EXISTS idx_quotations_branch ON quotations(branch_id, created_at)');
            $db->exec('CREATE INDEX IF NOT EXISTS idx_quotation_items_qid ON quotation_items(quotation_id, line_no)');
        } else {
            $db->exec("CREATE TABLE IF NOT EXISTS quotations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sync_uuid VARCHAR(64) NOT NULL UNIQUE,
                synced TINYINT(1) NOT NULL DEFAULT 0,
                branch_id INT NOT NULL DEFAULT 1,
                user_id INT NOT NULL DEFAULT 1,
                customer_id INT NULL,
                doc_type VARCHAR(20) NOT NULL DEFAULT 'Quotation',
                quote_no VARCHAR(40) NOT NULL DEFAULT '',
                quote_date VARCHAR(32) NOT NULL DEFAULT '',
                valid_until VARCHAR(60) NOT NULL DEFAULT '14',
                client_name VARCHAR(180) NOT NULL DEFAULT '',
                client_contact VARCHAR(120) NOT NULL DEFAULT '',
                client_address TEXT NULL,
                header_phones VARCHAR(160) NOT NULL DEFAULT '077 089 4099 | 074 192 8979',
                header_tagline VARCHAR(255) NOT NULL DEFAULT 'Mobile Phones|Laptops|Computers|Accessories| Hardware & Software Repair',
                footer_addresses VARCHAR(255) NOT NULL DEFAULT 'No. 148, Main Street, Battaramulla | No. 163, New Kandy Road, Malabe (Next to SLIIT Campus)',
                subtotal BIGINT NOT NULL DEFAULT 0,
                discount BIGINT NOT NULL DEFAULT 0,
                grand_total BIGINT NOT NULL DEFAULT 0,
                status VARCHAR(24) NOT NULL DEFAULT 'Saved',
                notes TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_quotations_branch (branch_id, created_at)
            ) ENGINE=InnoDB");

            $db->exec("CREATE TABLE IF NOT EXISTS quotation_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                quotation_id INT NOT NULL,
                line_no INT NOT NULL DEFAULT 1,
                product_id INT NULL,
                description VARCHAR(255) NOT NULL DEFAULT '',
                warranty VARCHAR(255) NOT NULL DEFAULT '',
                qty INT NOT NULL DEFAULT 1,
                unit_price BIGINT NOT NULL DEFAULT 0,
                line_total BIGINT NOT NULL DEFAULT 0,
                INDEX idx_quotation_items_qid (quotation_id, line_no)
            ) ENGINE=InnoDB");
        }

        self::$tablesVerified = true;
    }

    public static function nextNumber(string $docType = 'Quotation'): string
    {
        self::ensureTables();
        $maxId = (int) self::scalar('SELECT COALESCE(MAX(id), 0) FROM quotations');
        $next = $maxId + 1;
        return str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }

    public static function listAll(int $branch = 0): array
    {
        self::ensureTables();
        $params = $branch > 0 ? [$branch] : [];
        $rows = self::rows(
            "SELECT q.*, COALESCE(b.name, 'Main Branch') AS branch_name, COALESCE(u.name, 'Staff') AS created_by_name
             FROM quotations q
             LEFT JOIN branches b ON b.id = q.branch_id
             LEFT JOIN users u ON u.id = q.user_id
             " . ($branch > 0 ? 'WHERE q.branch_id = ?' : '') . "
             ORDER BY q.id DESC
             LIMIT 500",
            $params
        );

        if (!$rows) {
            return [];
        }

        $ids = array_map(static fn($r) => (int) $r['id'], $rows);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $items = self::rows(
            "SELECT qi.*, p.name AS product_name, p.sku AS product_sku
             FROM quotation_items qi
             LEFT JOIN products p ON p.id = qi.product_id
             WHERE qi.quotation_id IN ({$placeholders})
             ORDER BY qi.quotation_id ASC, qi.line_no ASC, qi.id ASC",
            $ids
        );

        $byQuote = [];
        foreach ($items as $item) {
            $qid = (int) $item['quotation_id'];
            $byQuote[$qid][] = [
                'id' => (int) $item['id'],
                'line_no' => (int) $item['line_no'],
                'product_id' => $item['product_id'] !== null ? (int) $item['product_id'] : null,
                'product_name' => (string) ($item['product_name'] ?? ''),
                'product_sku' => (string) ($item['product_sku'] ?? ''),
                'description' => (string) $item['description'],
                'warranty' => (string) ($item['warranty'] ?? ''),
                'qty' => (int) $item['qty'],
                'unit_price' => (int) $item['unit_price'],
                'line_total' => (int) $item['line_total'],
            ];
        }

        foreach ($rows as &$row) {
            $qid = (int) $row['id'];
            $row['id'] = $qid;
            $row['branch_id'] = (int) $row['branch_id'];
            $row['user_id'] = (int) $row['user_id'];
            $row['customer_id'] = $row['customer_id'] !== null ? (int) $row['customer_id'] : null;
            $row['subtotal'] = (int) $row['subtotal'];
            $row['discount'] = (int) $row['discount'];
            $row['grand_total'] = (int) $row['grand_total'];
            $row['items'] = $byQuote[$qid] ?? [];
        }

        return $rows;
    }

    public static function findOne(int $id): ?array
    {
        self::ensureTables();
        $row = self::one(
            "SELECT q.*, COALESCE(b.name, 'Main Branch') AS branch_name, COALESCE(u.name, 'Staff') AS created_by_name
             FROM quotations q
             LEFT JOIN branches b ON b.id = q.branch_id
             LEFT JOIN users u ON u.id = q.user_id
             WHERE q.id = ?",
            [$id]
        );
        if (!$row) {
            return null;
        }
        $items = self::rows(
            "SELECT qi.*, p.name AS product_name, p.sku AS product_sku
             FROM quotation_items qi
             LEFT JOIN products p ON p.id = qi.product_id
             WHERE qi.quotation_id = ?
             ORDER BY qi.line_no ASC, qi.id ASC",
            [$id]
        );
        $row['id'] = (int) $row['id'];
        $row['branch_id'] = (int) $row['branch_id'];
        $row['user_id'] = (int) $row['user_id'];
        $row['customer_id'] = $row['customer_id'] !== null ? (int) $row['customer_id'] : null;
        $row['subtotal'] = (int) $row['subtotal'];
        $row['discount'] = (int) $row['discount'];
        $row['grand_total'] = (int) $row['grand_total'];
        $row['items'] = array_map(static fn($item) => [
            'id' => (int) $item['id'],
            'line_no' => (int) $item['line_no'],
            'product_id' => $item['product_id'] !== null ? (int) $item['product_id'] : null,
            'product_name' => (string) ($item['product_name'] ?? ''),
            'product_sku' => (string) ($item['product_sku'] ?? ''),
            'description' => (string) $item['description'],
            'warranty' => (string) ($item['warranty'] ?? ''),
            'qty' => (int) $item['qty'],
            'unit_price' => (int) $item['unit_price'],
            'line_total' => (int) $item['line_total'],
        ], $items);

        return $row;
    }

    /**
     * Creates or updates a Quotation or Generated Invoice.
     * Does NOT require or deduct product stock — 0-stock items and custom items are fully allowed.
     */
    public static function save(array $user, int $branch, array $body): array
    {
        self::ensureTables();

        $id = !empty($body['id']) ? (int) $body['id'] : 0;
        if ($branch <= 0) {
            $branch = (int) ($body['branch_id'] ?? $body['branch'] ?? $user['branch_id'] ?? self::scalar('SELECT id FROM branches ORDER BY id LIMIT 1') ?: 1);
        }

        $docType = in_array($body['doc_type'] ?? 'Quotation', ['Quotation', 'Invoice'], true)
            ? (string) $body['doc_type']
            : 'Quotation';

        $clientName = trim((string) ($body['client_name'] ?? ''));
        if ($clientName === '') {
            throw new ApiError('Enter the customer or company name (Quotation To / Invoice To).');
        }

        $clientContact = trim((string) ($body['client_contact'] ?? ''));
        $clientAddress = trim((string) ($body['client_address'] ?? ''));
        $customerId = !empty($body['customer_id']) ? (int) $body['customer_id'] : null;

        $quoteNo = trim((string) ($body['quote_no'] ?? ''));
        if ($quoteNo === '') {
            $quoteNo = self::nextNumber($docType);
        }

        $quoteDate = trim((string) ($body['quote_date'] ?? ''));
        if ($quoteDate === '') {
            $quoteDate = date('Y-m-d');
        }

        $validUntil = trim((string) ($body['valid_until'] ?? '14'));
        $headerPhones = trim((string) ($body['header_phones'] ?? '077 089 4099 | 074 192 8979'));
        $headerTagline = trim((string) ($body['header_tagline'] ?? 'Mobile Phones|Laptops|Computers|Accessories| Hardware & Software Repair'));
        $footerAddresses = trim((string) ($body['footer_addresses'] ?? 'No. 148, Main Street, Battaramulla | No. 163, New Kandy Road, Malabe (Next to SLIIT Campus)'));
        $status = trim((string) ($body['status'] ?? 'Saved')) ?: 'Saved';
        $notes = trim((string) ($body['notes'] ?? ''));

        $rawItems = $body['items'] ?? [];
        if (!is_array($rawItems) || count($rawItems) === 0) {
            throw new ApiError('Add at least one product or service line to the quotation.');
        }

        $cleanItems = [];
        $subtotal = 0;
        $lineNo = 1;

        foreach ($rawItems as $line) {
            if (!is_array($line)) {
                continue;
            }
            $desc = trim((string) ($line['description'] ?? ''));
            $warranty = trim((string) ($line['warranty'] ?? ''));
            $productId = !empty($line['product_id']) ? (int) $line['product_id'] : null;

            if ($desc === '' && $productId) {
                $pName = self::scalar('SELECT name FROM products WHERE id = ?', [$productId]);
                if ($pName) {
                    $desc = (string) $pName;
                }
            }

            if ($desc === '') {
                continue;
            }

            $qty = max(1, (int) ($line['qty'] ?? 1));
            $unitPrice = max(0, (int) round((float) ($line['unit_price'] ?? 0)));
            $lineTotal = $qty * $unitPrice;
            $subtotal += $lineTotal;

            $cleanItems[] = [
                'line_no' => $lineNo++,
                'product_id' => $productId,
                'description' => $desc,
                'warranty' => $warranty,
                'qty' => $qty,
                'unit_price' => $unitPrice,
                'line_total' => $lineTotal,
            ];
        }

        if (count($cleanItems) === 0) {
            throw new ApiError('Enter a description for at least one item.');
        }

        $discount = max(0, min($subtotal, (int) round((float) ($body['discount'] ?? 0))));
        $grandTotal = max(0, $subtotal - $discount);

        $savedId = self::transaction(function () use (
            $id,
            $branch,
            $user,
            $customerId,
            $docType,
            $quoteNo,
            $quoteDate,
            $validUntil,
            $clientName,
            $clientContact,
            $clientAddress,
            $headerPhones,
            $headerTagline,
            $footerAddresses,
            $subtotal,
            $discount,
            $grandTotal,
            $status,
            $notes,
            $cleanItems
        ) {
            $targetId = $id;
            if ($targetId > 0 && self::scalar('SELECT id FROM quotations WHERE id = ?', [$targetId])) {
                self::run(
                    "UPDATE quotations
                     SET branch_id = ?, customer_id = ?, doc_type = ?, quote_no = ?, quote_date = ?,
                         valid_until = ?, client_name = ?, client_contact = ?, client_address = ?,
                         header_phones = ?, header_tagline = ?, footer_addresses = ?,
                         subtotal = ?, discount = ?, grand_total = ?, status = ?, notes = ?,
                         synced = 0, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?",
                    [
                        $branch,
                        $customerId,
                        $docType,
                        $quoteNo,
                        $quoteDate,
                        $validUntil,
                        $clientName,
                        $clientContact,
                        $clientAddress,
                        $headerPhones,
                        $headerTagline,
                        $footerAddresses,
                        $subtotal,
                        $discount,
                        $grandTotal,
                        $status,
                        $notes,
                        $targetId,
                    ]
                );
                self::run('DELETE FROM quotation_items WHERE quotation_id = ?', [$targetId]);
            } else {
                $uuid = 'QUO-' . bin2hex(random_bytes(12));
                $targetId = self::insert(
                    "INSERT INTO quotations (
                        sync_uuid, synced, branch_id, user_id, customer_id, doc_type,
                        quote_no, quote_date, valid_until, client_name, client_contact, client_address,
                        header_phones, header_tagline, footer_addresses,
                        subtotal, discount, grand_total, status, notes
                    ) VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        $uuid,
                        $branch,
                        (int) ($user['id'] ?? 1),
                        $customerId,
                        $docType,
                        $quoteNo,
                        $quoteDate,
                        $validUntil,
                        $clientName,
                        $clientContact,
                        $clientAddress,
                        $headerPhones,
                        $headerTagline,
                        $footerAddresses,
                        $subtotal,
                        $discount,
                        $grandTotal,
                        $status,
                        $notes,
                    ]
                );
            }

            foreach ($cleanItems as $ci) {
                self::insert(
                    "INSERT INTO quotation_items (
                        quotation_id, line_no, product_id, description, warranty, qty, unit_price, line_total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        $targetId,
                        $ci['line_no'],
                        $ci['product_id'],
                        $ci['description'],
                        $ci['warranty'],
                        $ci['qty'],
                        $ci['unit_price'],
                        $ci['line_total'],
                    ]
                );
            }

            return $targetId;
        });

        return self::findOne((int) $savedId) ?? ['id' => (int) $savedId];
    }

    public static function updateStatus(array $user, array $body): array
    {
        self::ensureTables();
        $id = Validator::integer($body['id'] ?? null, 'Quotation ID');
        $existing = self::findOne($id);
        if (!$existing) {
            throw new ApiError('Quotation not found.', 404);
        }

        $operation = (string) ($body['operation'] ?? 'status');
        if ($operation === 'convert_to_invoice') {
            self::run(
                "UPDATE quotations SET doc_type = 'Invoice', status = 'Invoiced', synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                [$id]
            );
            return self::findOne($id) ?? $existing;
        }

        $status = trim((string) ($body['status'] ?? 'Saved')) ?: 'Saved';
        self::run(
            'UPDATE quotations SET status = ?, synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [$status, $id]
        );
        return self::findOne($id) ?? $existing;
    }

    public static function delete(int $id): array
    {
        self::ensureTables();
        if ($id <= 0 || !self::scalar('SELECT id FROM quotations WHERE id = ?', [$id])) {
            throw new ApiError('Quotation not found.', 404);
        }
        self::transaction(function () use ($id) {
            self::run('DELETE FROM quotation_items WHERE quotation_id = ?', [$id]);
            self::run('DELETE FROM quotations WHERE id = ?', [$id]);
        });
        return ['deleted' => true, 'id' => $id];
    }
}
