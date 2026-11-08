<?php
declare(strict_types=1);

const TENDERS = ['Cash','Card','Bank Transfer','Koko'];

function tenderReference(array $data, string $method): ?string {
    return $method === 'Cash' ? null : str($data, 'reference', 100);
}
function salePayment(array $user, array $drawer, int $sale, int $amount, string $method, ?string $reference, string $kind): void {
    run('INSERT INTO payments(sale_id,drawer_id,user_id,kind,method,amount,reference) VALUES (?,?,?,?,?,?,?)',
        [$sale,$drawer['id'],$user['id'],$kind,$method,$amount,$reference]);
    if ($method === 'Cash') cash($user, $drawer, $amount, $kind === 'Sale' ? 'Cash Sale' : 'Credit Collection', ref('INV',$sale));
}
function rate(int $amount, int $basisPoints): int { return intdiv($amount * $basisPoints + 5000, 10000); }
function checkout(array $user, int $branch, array $body): array {
    $drawer = openDrawer($user, $branch);
    $lines = $body['items'] ?? null;
    if (!is_array($lines) || !$lines || count($lines) > 100) fail('Add between 1 and 100 lines to the bill.');
    $customer = !empty($body['customer_id']) ? customerAt($body['customer_id'], $branch) : null;
    $draft = empty($body['draft_id']) ? null : integer($body['draft_id'], 'Draft');
    if ($draft && !scalar('SELECT id FROM drafts WHERE id=? AND branch_id=? AND user_id=? FOR UPDATE', [$draft,$branch,$user['id']])) fail('The held bill was already used or removed.', 409);
    $subtotal = 0;
    $items = [];
    $claimed = [];
    foreach ($lines as $line) {
        if (!is_array($line)) fail('Invalid bill line.');
        $product = integer($line['product_id'] ?? null, 'Product');
        $qty = integer($line['qty'] ?? null, 'Quantity', 1, 1000);
        $p = one('SELECT * FROM products WHERE id=?', [$product]);
        if (!$p) fail('Product is unavailable.', 404);
        $unit = null;
        if ($p['serialized']) {
            $unit = integer($line['unit_id'] ?? null, 'Device unit');
            if ($qty !== 1 || isset($claimed[$unit]) || !scalar("SELECT id FROM units WHERE id=? AND branch_id=? AND product_id=? AND state='Available' FOR UPDATE", [$unit,$branch,$product])) fail('The selected device is unavailable.', 409);
            $claimed[$unit] = true;
        }
        $extended = (int) $p['price'] * $qty;
        $subtotal += $extended;
        $items[] = [$p,$qty,$unit,$extended];
    }
    if ($subtotal > 99999999999) fail('Bill exceeds the transaction limit.');
    $discountBps = integer($body['discount_bps'] ?? 0, 'Discount', 0, $user['role'] === 'cashier' ? 500 : 10000);
    $discount = rate($subtotal, $discountBps);
    $tax = rate($subtotal - $discount, (int) scalar('SELECT tax_bps FROM settings WHERE id=1'));
    $total = $subtotal - $discount + $tax;
    if ($total !== money($body, 'expected_total')) fail('Prices changed. Refresh the bill before completing it.', 409);
    $tenders = $body['payments'] ?? [];
    if (!is_array($tenders) || count($tenders) > 4) fail('Invalid payment details.');
    $paid = 0;
    $cashReceived = 0;
    $payments = [];
    foreach ($tenders as $tender) {
        if (!is_array($tender)) fail('Invalid payment.');
        $method = choice($tender, 'method', TENDERS);
        if (isset($payments[$method])) fail('Use one entry per payment method.');
        $amount = money($tender, 'amount', 1);
        $payments[$method] = [$amount,tenderReference($tender,$method)];
        $paid += $amount;
        if ($method === 'Cash') $cashReceived = $amount;
    }
    $change = max(0, $paid - $total);
    if ($change > $cashReceived) fail('Non-cash tender exceeds the total.');
    if ($change) $payments['Cash'][0] -= $change;
    $credit = max(0, $total - $paid);
    $due = null;
    if ($credit) {
        allow($user, 'owner','manager');
        if (!$customer || empty($body['allow_credit'])) fail('Confirm credit and select a customer for the remaining balance.');
        $due = day($body,'due_date');
        if ($due < date('Y-m-d')) fail('Choose a credit due date today or later.');
    }
    $id = insert('INSERT INTO sales(branch_id,user_id,drawer_id,customer_id,subtotal,discount,tax,total,credit,due_date)
        VALUES (?,?,?,?,?,?,?,?,?,?)', [$branch,$user['id'],$drawer['id'],$customer,$subtotal,$discount,$tax,$total,$credit,$due]);
    $processed = 0;
    $allocated = 0;
    foreach ($items as [$p,$qty,$unit,$extended]) {
        $processed += $extended;
        $cumulative = 0;
        // Keep multiplication within signed 64-bit range while allocating the actual charged amount.
        if ($subtotal) {
            $cumulative = (int) bcdiv(bcmul((string) $processed,(string) $total,0), (string) $subtotal, 0);
        }
        if ($unit) run("UPDATE units SET state='Sold' WHERE id=?", [$unit]);
        if ($p['category'] !== 'Services') stockMove($user,$branch,$p['id'],-$qty,'Sale',ref('INV',$id));
        run('INSERT INTO sale_items(sale_id,product_id,unit_id,name,qty,price,total) VALUES (?,?,?,?,?,?,?)',
            [$id,$p['id'],$unit,$p['name'],$qty,$p['price'],$cumulative-$allocated]);
        $allocated = $cumulative;
    }
    foreach ($payments as $method => [$amount,$reference]) {
        if ($amount) salePayment($user,$drawer,$id,$amount,$method,$reference,'Sale');
    }
    if ($draft) run('DELETE FROM drafts WHERE id=?', [$draft]);
    $invoice = invoice($id,$branch);
    $invoice['change'] = $change;
    return $invoice;
}
function creditPayment(array $user, int $branch, array $body): array {
    $drawer = openDrawer($user,$branch);
    $sale = one('SELECT id,credit FROM sales WHERE id=? AND branch_id=? FOR UPDATE', [invoiceId($body['invoice'] ?? ''),$branch]);
    if (!$sale) fail('Invoice not found.',404);
    $amount = money($body,'amount',1);
    if ($amount > $sale['credit']) fail('Payment exceeds the credit balance.');
    $method = choice($body,'method',TENDERS);
    salePayment($user,$drawer,$sale['id'],$amount,$method,tenderReference($body,$method),'Credit');
    run('UPDATE sales SET credit=credit-? WHERE id=?', [$amount,$sale['id']]);
    return invoice($sale['id'],$branch);
}
function requestReturn(int $branch, array $body): array {
    $item = integer($body['item_id'] ?? null,'Invoice line');
    $line = one('SELECT i.*,s.credit,p.category FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN products p ON p.id=i.product_id WHERE i.id=? AND s.branch_id=? FOR UPDATE', [$item,$branch]);
    if (!$line) fail('Invoice line not found.',404);
    if ($line['credit']) fail('Resolve the outstanding invoice credit before requesting a refund.');
    $qty = integer($body['qty'] ?? null,'Return quantity',1,$line['qty']);
    if (scalar("SELECT id FROM returns_log WHERE sale_item_id=? AND status='Pending' LIMIT 1", [$item])) fail('Review the existing pending request for this line first.',409);
    if ($qty + $line['refunded_qty'] > $line['qty']) fail('Quantity exceeds the available return balance.',409);
    $method = choice($body,'method',TENDERS);
    $amount = refundAmount($line['total'],$line['qty'],$line['refunded_qty'],$qty);
    $restock = !empty($body['restock']) && !$line['unit_id'] && $line['category'] !== 'Services';
    $id = insert('INSERT INTO returns_log(branch_id,sale_item_id,qty,reason,condition_note,restock,amount,method) VALUES (?,?,?,?,?,?,?,?)', [
        $branch,$item,$qty,str($body,'reason',500),str($body,'condition_note',100),$restock ? 1 : 0,$amount,$method,
    ]);
    if (!empty($body['replacement_product_id'])) {
        if ($method !== 'Cash') fail('Exchanges require an original cash tender.');
        $replacement = one('SELECT p.*,s.qty available FROM products p JOIN stock s ON s.product_id=p.id
            WHERE p.id=? AND s.branch_id=?', [integer($body['replacement_product_id'],'Replacement product'),$branch]);
        if (!$replacement || !$replacement['available']) fail('Choose an available replacement product.');
        $units = integer($body['replacement_qty'] ?? null,'Replacement quantity',1,$replacement['serialized'] ? 1 : min(1000,$replacement['available']));
        $device = null;
        if ($replacement['serialized']) {
            $device = integer($body['replacement_unit_id'] ?? null,'Replacement device');
            if (!scalar("SELECT id FROM units WHERE id=? AND branch_id=? AND product_id=? AND state='Available'",
                [$device,$branch,$replacement['id']])) fail('Replacement device is unavailable.',409);
        }
        $subtotal = $replacement['price'] * $units;
        if ($subtotal > 99999999999) fail('Replacement exceeds the transaction limit.');
        $quote = $subtotal + rate($subtotal, (int) scalar('SELECT tax_bps FROM settings WHERE id=1'));
        run('INSERT INTO exchanges(return_id,product_id,unit_id,qty,quoted_total) VALUES (?,?,?,?,?)', [$id,$replacement['id'],$device,$units,$quote]);
    }
    return ['id'=>$id,'status'=>'Pending'];
}
function refundAmount(int $total,int $lineQty,int $previousQty,int $qty): int {
    return intdiv($total*($previousQty+$qty),$lineQty) - intdiv($total*$previousQty,$lineQty);
}
function resolveReturn(array $user, int $branch, array $body): array {
    $id = integer($body['id'] ?? null,'Return');
    $action = choice($body,'decision',['Completed','Rejected']);
    $return = one('SELECT r.*,i.sale_id,i.product_id,i.unit_id,i.qty line_qty,i.refunded_qty,i.total line_total
        FROM returns_log r JOIN sale_items i ON r.sale_item_id=i.id WHERE r.id=? AND r.branch_id=? FOR UPDATE', [$id,$branch]);
    if (!$return || $return['status'] !== 'Pending') fail('Return request is no longer pending.',409);
    if ($action === 'Rejected') {
        run("UPDATE returns_log SET status='Rejected' WHERE id=?", [$id]);
        return ['id'=>$id,'status'=>$action];
    }
    $drawer = openDrawer($user,$branch);
    $previousQty = $return['refunded_qty'];
    $qty = $previousQty + $return['qty'];
    if ($qty > $return['line_qty']) fail('Return quantity exceeds the remaining quantity.',409);
    $amount = refundAmount($return['line_total'],$return['line_qty'],$previousQty,$return['qty']);
    $method = $return['method'];
    $paid = (int) scalar('SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id=? AND method=?', [$return['sale_id'],$method]);
    $refunded = (int) scalar("SELECT COALESCE(SUM(r.amount),0) FROM returns_log r JOIN sale_items i ON r.sale_item_id=i.id
        WHERE i.sale_id=? AND r.method=? AND r.status='Completed'", [$return['sale_id'],$method]);
    if ($amount > $paid - $refunded) fail('The original tender has insufficient refundable balance.');
    $reference = $amount ? tenderReference($body,$method) : null;
    $exchange = one('SELECT * FROM exchanges WHERE return_id=?',[$id]);
    $replacementSale = null;
    if ($exchange) {
        $customer = scalar('SELECT customer_id FROM sales WHERE id=?',[$return['sale_id']]);
        $replacementSale = checkout($user,$branch,[
            'customer_id'=>$customer, 'expected_total'=>$exchange['quoted_total'],
            'items'=>[['product_id'=>$exchange['product_id'],'unit_id'=>$exchange['unit_id'],'qty'=>$exchange['qty']]],
            'payments'=>$exchange['quoted_total'] ? [['method'=>'Cash','amount'=>$exchange['quoted_total']]] : [],
        ])['id'];
        run('UPDATE exchanges SET replacement_sale_id=? WHERE return_id=?',[$replacementSale,$id]);
    }
    if ($method === 'Cash') cash($user,$drawer,-$amount,'Cash Refund',ref('RET',$id));
    if ($return['unit_id']) run("UPDATE units SET state='Inspection' WHERE id=? AND state='Sold'", [$return['unit_id']]);
    if ($return['restock']) stockMove($user,$branch,$return['product_id'],$return['qty'],'Return',ref('RET',$id));
    run('UPDATE sale_items SET refunded_qty=? WHERE id=?', [$qty,$return['sale_item_id']]);
    run("UPDATE returns_log SET status='Completed',amount=?,reference=?,processed_drawer_id=? WHERE id=?", [$amount,$reference,$drawer['id'],$id]);
    return ['id'=>$id,'status'=>$action,'amount'=>$amount,'replacement_sale_id'=>$replacementSale];
}

