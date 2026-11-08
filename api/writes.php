<?php
declare(strict_types=1);

const SELLERS = ['owner','manager','cashier'];
const MANAGERS = ['owner','manager'];
const STOCK_ROLES = ['owner','manager','stock'];
const REPAIR_TRANSITIONS = [
    'Received'=>['Diagnosing','Cancelled'], 'Diagnosing'=>['Awaiting Approval','Waiting for Parts','In Progress','Cancelled'],
    'Awaiting Approval'=>['Waiting for Parts','In Progress','Cancelled'], 'Waiting for Parts'=>['In Progress','Cancelled'],
    'In Progress'=>['Waiting for Parts','Testing','Cancelled'], 'Testing'=>['In Progress','Ready'], 'Ready'=>['Delivered','In Progress'],
];

function writeRoute(string $route, array $user, array $body): array {
    $global = in_array($route,['staff.save','settings.save','supplier.create'],true);
    $branch = $global ? 0 : branchFor($user,$body['branch'] ?? null);
    if ($branch) {
        // Serialize financial and stock operations within a branch. Transfers update only the acting branch's stock.
        run('SELECT id FROM branches WHERE id=? FOR UPDATE',[$branch]);
    }
    $result = match($route) {
        'sale.checkout' => authorized($user, SELLERS, fn() => checkout($user,$branch,$body)),
        'sale.credit' => authorized($user, SELLERS, fn() => creditPayment($user,$branch,$body)),
        'draft.save', 'draft.remove' => authorized($user, SELLERS, fn() => saveDraft($route,$user,$branch,$body)),
        'drawer.open','drawer.close','drawer.movement','cycle.close' => drawerWrite($route,$user,$branch,$body),
        'return.request' => authorized($user, SELLERS, fn() => requestReturn($branch,$body)),
        'return.resolve' => authorized($user, MANAGERS, fn() => resolveReturn($user,$branch,$body)),
        'customer.save' => authorized($user, SELLERS, fn() => saveCustomer($branch,$body)),
        'product.save','stock.adjust','unit.receive','unit.release' => authorized($user, STOCK_ROLES, fn() => inventoryWrite($route,$user,$branch,$body)),
        'repair.create','repair.status' => repairWrite($route,$user,$branch,$body),
        'supplier.create','purchase.receive','purchase.pay' => purchaseWrite($route,$user,$branch,$body),
        'transfer.request','transfer.update' => transferWrite($route,$user,$branch,$body),
        'staff.save','settings.save' => authorized($user, ['owner'], fn() => adminWrite($route,$body)),
        default => fail('Route not found.',404)
    };
    $details = array_intersect_key($result, array_flip(['id','status','previous','amount','replacement_sale_id','expected','counted','variance','state','tax_bps','paper_width']));
    audit($user,$branch ?: null,$route,$details);
    return $result;
}
function authorized(array $user,array $roles,callable $operation): array {
    allow($user,...$roles);
    return $operation();
}
function saveDraft(string $route, array $user, int $branch, array $body): array {
    $id = empty($body['id']) ? null : integer($body['id'],'Draft');
    if ($id && !scalar('SELECT id FROM drafts WHERE id=? AND branch_id=? AND user_id=? FOR UPDATE',[$id,$branch,$user['id']])) fail('Held bill not found.',404);
    if ($route === 'draft.remove') {
        if (!$id) fail('Select a held bill.');
        run('DELETE FROM drafts WHERE id=?',[$id]);
        return ['id'=>$id];
    }
    $payload = $body['payload'] ?? null;
    if (!is_array($payload) || empty($payload['cart']) || strlen($json = json_encode($payload,JSON_THROW_ON_ERROR)) > 30000) fail('Invalid held bill.');
    if ($id) run('UPDATE drafts SET payload=? WHERE id=?',[$json,$id]);
    else $id = insert('INSERT INTO drafts(branch_id,user_id,payload) VALUES (?,?,?)',[$branch,$user['id'],$json]);
    return ['id'=>$id];
}
function drawerWrite(string $route,array $user,int $branch,array $body): array {
    allow($user,...SELLERS);
    if ($route === 'cycle.close') {
        allow($user,...MANAGERS);
        $day = day($body,'business_date');
        $cycle = one('SELECT * FROM cycles WHERE branch_id=? AND business_date=? FOR UPDATE',[$branch,$day]);
        if (!$cycle || $cycle['closed_at']) fail('No open cycle exists for this date.',409);
        if (scalar('SELECT id FROM drawers WHERE cycle_id=? AND closed_at IS NULL',[$cycle['id']])) fail('Close the drawer before closing the business day.',409);
        run('UPDATE cycles SET closed_at=NOW() WHERE id=?',[$cycle['id']]);
        return ['id'=>$cycle['id'],'status'=>'Closed'];
    }
    if ($route === 'drawer.open') {
        $opening = money($body,'opening');
        if (scalar('SELECT id FROM drawers WHERE branch_id=? AND closed_at IS NULL',[$branch])) fail('This branch already has an open drawer.',409);
        run('INSERT IGNORE INTO cycles(branch_id,business_date) VALUES (?,?)',[$branch,date('Y-m-d')]);
        $cycle = one('SELECT * FROM cycles WHERE branch_id=? AND business_date=? FOR UPDATE',[$branch,date('Y-m-d')]);
        if ($cycle['closed_at']) fail('The business day has closed.',409);
        return ['id'=>insert('INSERT INTO drawers(branch_id,user_id,cycle_id,opening) VALUES (?,?,?,?)',[$branch,$user['id'],$cycle['id'],$opening])];
    }
    if ($route === 'drawer.close') {
        $drawer = one('SELECT * FROM drawers WHERE branch_id=? AND closed_at IS NULL FOR UPDATE',[$branch]);
        if (!$drawer) fail('There is no open drawer.',409);
        if ($user['role']==='cashier' && $drawer['user_id'] !== $user['id']) fail('This drawer belongs to another cashier.',403);
        $counted = money($body,'counted');
        $expected = drawerExpected($drawer);
        $notes = str($body,'notes',500,$counted !== $expected);
        run('UPDATE drawers SET counted=?,expected=?,notes=?,closed_at=NOW() WHERE id=?',[$counted,$expected,$notes,$drawer['id']]);
        return ['id'=>$drawer['id'],'counted'=>$counted,'expected'=>$expected,'variance'=>$counted-$expected];
    }
    allow($user,...MANAGERS);
    $drawer = openDrawer($user,$branch);
    $amount = money($body,'amount',1) * (choice($body,'direction',['In','Out']) === 'In' ? 1 : -1);
    cash($user,$drawer,$amount,$amount > 0 ? 'Cash In' : 'Cash Out',str($body,'reason',100));
    return ['id'=>(int) db()->lastInsertId(),'amount'=>$amount];
}
function saveCustomer(int $branch,array $body): array {
    $values = [str($body,'name',120),str($body,'phone',40),str($body,'email',150,false),str($body,'notes',500,false)];
    if ($values[2] && !filter_var($values[2],FILTER_VALIDATE_EMAIL)) fail('Invalid email address.');
    if (empty($body['id'])) return ['id'=>insert('INSERT INTO customers(branch_id,name,phone,email,notes) VALUES (?,?,?,?,?)',[$branch,...$values])];
    $id = customerAt($body['id'],$branch);
    run('UPDATE customers SET name=?,phone=?,email=?,notes=? WHERE id=?',[...$values,$id]);
    return ['id'=>$id];
}
function inventoryWrite(string $route,array $user,int $branch,array $body): array {
    if ($route === 'product.save') {
        $id = empty($body['id']) ? null : integer($body['id'],'Product');
        $existing = $id ? one('SELECT * FROM products WHERE id=? FOR UPDATE',[$id]) : null;
        if ($id && !$existing) fail('Product not found.',404);
        $category = choice($body,'category',['Phones','Accessories','Repair Parts','Services']);
        $serialized = $existing ? $existing['serialized'] : ($category === 'Phones' || !empty($body['serialized']));
        if ($existing && ($existing['category'] === 'Services') !== ($category === 'Services')) fail('The stock policy cannot be changed after creating a product.');
        if ($serialized && $category === 'Services') fail('A service cannot be serialized.');
        if ($category === 'Phones' && !$serialized) fail('Phones must use serialized stock.');
        $values = [str($body,'sku',60),str($body,'barcode',60,false) ?: null,str($body,'name',150),str($body,'brand',80,false),$category,
            money($body,'cost'),money($body,'price'),integer($body['reorder_level'] ?? 0,'Reorder level',0),(int) $serialized];
        if ($id) run('UPDATE products SET sku=?,barcode=?,name=?,brand=?,category=?,cost=?,price=?,reorder_level=?,serialized=? WHERE id=?',[...$values,$id]);
        else $id = insert('INSERT INTO products(sku,barcode,name,brand,category,cost,price,reorder_level,serialized) VALUES (?,?,?,?,?,?,?,?,?)',$values);
        if ($category !== 'Services') run('INSERT IGNORE INTO stock(branch_id,product_id,qty) VALUES (?,?,0)',[$branch,$id]);
        return ['id'=>$id];
    }
    if ($route === 'unit.release') {
        $id = integer($body['id'] ?? null,'Device');
        $unit = one("SELECT * FROM units WHERE id=? AND branch_id=? AND state='Inspection' FOR UPDATE",[$id,$branch]);
        if (!$unit) fail('Device is not awaiting inspection.',409);
        $reason = str($body,'reason',100);
        run("UPDATE units SET state='Available' WHERE id=?",[$id]);
        stockMove($user,$branch,$unit['product_id'],1,'Inspection Release',$unit['code'] . ' ' . mb_substr($reason,0,30));
        return ['id'=>$id,'state'=>'Available'];
    }
    $product = one('SELECT * FROM products WHERE id=?',[integer($body['product_id'] ?? null,'Product')]);
    if (!$product || $product['category'] === 'Services') fail('Choose a stock product.');
    if ($route === 'unit.receive') {
        if (!$product['serialized']) fail('This product uses quantity-based stock.');
        $code = str($body,'code',60);
        $id = createUnit($product['id'],$branch,$body);
        stockMove($user,$branch,$product['id'],1,'Device Receiving',$code);
        return ['id'=>$id];
    }
    if ($product['serialized']) fail('Receive or transfer individual device units.');
    $delta = integer($body['qty'] ?? null,'Quantity',1,100000) * (choice($body,'direction',['In','Out']) === 'In' ? 1 : -1);
    stockMove($user,$branch,$product['id'],$delta,'Stock Adjustment',str($body,'reason',100));
    return ['id'=>$product['id'],'amount'=>$delta];
}
function createUnit(int $product,int $branch,array $body): int {
    return insert('INSERT INTO units(product_id,branch_id,code,imei,grade) VALUES (?,?,?,?,?)',[
        $product,$branch,str($body,'code',60),str($body,'imei',60,false) ?: null,choice($body,'grade',['New','Used','Refurbished'])
    ]);
}
function repairWrite(string $route,array $user,int $branch,array $body): array {
    if ($route === 'repair.create') {
        allow($user,...SELLERS);
        $tech = empty($body['technician_id']) ? null : integer($body['technician_id'],'Technician');
        if ($tech && !scalar("SELECT id FROM users WHERE id=? AND branch_id=? AND role='technician' AND active=1",[$tech,$branch])) fail('Choose a technician from this branch.');
        $id = insert('INSERT INTO repairs(branch_id,customer_id,technician_id,device,serial,issue,accessories,notes,estimate,due_date) VALUES (?,?,?,?,?,?,?,?,?,?)',[
            $branch,customerAt($body['customer_id'] ?? null,$branch),$tech,str($body,'device',120),str($body,'serial',60,false),str($body,'issue',500),
            str($body,'accessories',200,false),str($body,'notes',500,false),money($body,'estimate'),day($body,'due_date')
        ]);
        return ['id'=>$id,'status'=>'Received'];
    }
    allow($user,'owner','manager','technician','cashier');
    $id = integer($body['id'] ?? null,'Repair');
    $job = one('SELECT * FROM repairs WHERE id=? AND branch_id=? FOR UPDATE',[$id,$branch]);
    if (!$job) fail('Repair not found.',404);
    $next = str($body,'status');
    if ($user['role']==='technician' && ($job['technician_id'] !== $user['id'] || in_array($next,['Delivered','Cancelled'],true))) fail('Repair action denied.',403);
    if ($user['role']==='cashier' && $next!=='Delivered') fail('Cashiers can mark ready jobs delivered.',403);
    if (!in_array($next,REPAIR_TRANSITIONS[$job['status']] ?? [],true)) fail('This repair status transition is unavailable.',409);
    run('UPDATE repairs SET status=? WHERE id=?',[$next,$id]);
    return ['id'=>$id,'status'=>$next,'previous'=>$job['status']];
}
function purchaseWrite(string $route,array $user,int $branch,array $body): array {
    allow($user,...STOCK_ROLES);
    if ($route === 'supplier.create') return ['id'=>insert('INSERT INTO suppliers(name,phone) VALUES (?,?)',[str($body,'name',120),str($body,'phone',40,false)])];
    if ($route === 'purchase.pay') {
        allow($user,...MANAGERS);
        $drawer = openDrawer($user,$branch);
        $id = integer($body['id'] ?? null,'Purchase');
        $purchase = one('SELECT * FROM purchases WHERE id=? AND branch_id=? FOR UPDATE',[$id,$branch]);
        if (!$purchase) fail('Purchase not found.',404);
        $amount = money($body,'amount',1);
        if ($amount > $purchase['balance']) fail('Amount exceeds the supplier balance.');
        cash($user,$drawer,-$amount,'Supplier Payment',ref('PO',$id));
        run('INSERT INTO supplier_payments(purchase_id,drawer_id,user_id,amount) VALUES (?,?,?,?)',[$id,$drawer['id'],$user['id'],$amount]);
        run('UPDATE purchases SET balance=balance-? WHERE id=?',[$amount,$id]);
        return ['id'=>$id,'amount'=>$amount];
    }
    $product = one('SELECT * FROM products WHERE id=?',[integer($body['product_id'] ?? null,'Product')]);
    if (!$product || $product['category']==='Services') fail('Choose a stock product.');
    $qty = integer($body['qty'] ?? null,'Quantity',1,$product['serialized'] ? 1 : 10000);
    $cost = money($body,'unit_cost');
    $id = insert('INSERT INTO purchases(branch_id,supplier_id,product_id,qty,unit_cost,balance,invoice) VALUES (?,?,?,?,?,?,?)',[
        $branch,integer($body['supplier_id'] ?? null,'Supplier'),$product['id'],$qty,$cost,$qty*$cost,str($body,'invoice',80)
    ]);
    if ($product['serialized']) createUnit($product['id'],$branch,$body);
    stockMove($user,$branch,$product['id'],$qty,'Purchase Receiving',ref('PO',$id));
    return ['id'=>$id];
}
function transferWrite(string $route,array $user,int $branch,array $body): array {
    allow($user,...STOCK_ROLES);
    if ($route === 'transfer.request') {
        $to = integer($body['to_branch'] ?? null,'Destination');
        if ($to === $branch) fail('Select a different destination branch.');
        $product = one('SELECT * FROM products WHERE id=?',[integer($body['product_id'] ?? null,'Product')]);
        if (!$product || $product['category']==='Services') fail('Choose a stock product.');
        $qty = integer($body['qty'] ?? null,'Quantity',1,$product['serialized'] ? 1 : 10000);
        $unit = $product['serialized'] ? integer($body['unit_id'] ?? null,'Device unit') : null;
        if ($unit && !scalar("SELECT id FROM units WHERE id=? AND branch_id=? AND product_id=? AND state='Available'",[$unit,$branch,$product['id']])) fail('Device is not available at the source.');
        return ['id'=>insert('INSERT INTO transfers(from_branch,to_branch,product_id,qty,unit_id) VALUES (?,?,?,?,?)',[$branch,$to,$product['id'],$qty,$unit])];
    }
    $id = integer($body['id'] ?? null,'Transfer');
    $state = choice($body,'status',['Dispatched','Received','Rejected']);
    $transfer = one('SELECT * FROM transfers WHERE id=? FOR UPDATE',[$id]);
    if (!$transfer) fail('Transfer not found.',404);
    if ($state === 'Received') {
        if ($branch !== $transfer['to_branch'] || $transfer['status']!=='Dispatched') fail('Only the destination may receive dispatched stock.',409);
        if ($transfer['unit_id'] && run("UPDATE units SET state='Available',branch_id=? WHERE id=? AND branch_id=? AND state='In Transit'",
            [$branch,$transfer['unit_id'],$transfer['from_branch']])->rowCount() !== 1) fail('Device is no longer in transit.',409);
        stockMove($user,$branch,$transfer['product_id'],$transfer['qty'],'Transfer Receipt',ref('ST',$id));
    } else {
        allow($user,...MANAGERS);
        if ($branch !== $transfer['from_branch'] || $transfer['status']!=='Requested') fail('Only the source may approve a requested transfer.',409);
        if ($state === 'Dispatched') {
            if ($transfer['unit_id'] && run("UPDATE units SET state='In Transit' WHERE id=? AND branch_id=? AND state='Available'",[$transfer['unit_id'],$branch])->rowCount() !== 1) fail('Device no longer available.',409);
            stockMove($user,$branch,$transfer['product_id'],-$transfer['qty'],'Transfer Dispatch',ref('ST',$id));
        }
    }
    run('UPDATE transfers SET status=? WHERE id=?',[$state,$id]);
    return ['id'=>$id,'status'=>$state];
}
function adminWrite(string $route,array $body): array {
    if ($route === 'settings.save') {
        $tax = integer($body['tax_bps'] ?? null,'Tax',0,10000);
        $width = choice($body,'paper_width',['58','80']);
        run('UPDATE settings SET shop_name=?,tax_bps=?,paper_width=? WHERE id=1',[str($body,'shop_name',100),$tax,$width]);
        return ['id'=>1,'tax_bps'=>$tax,'paper_width'=>$width];
    }
    $role = choice($body,'role',['manager','cashier','technician','stock']);
    $branch = integer($body['branch_id'] ?? null,'Branch');
    $name = str($body,'name',100);
    $email = strtolower(str($body,'email',150));
    if (!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Invalid email address.');
    $password = accountPassword($body,empty($body['id']));
    if (!empty($body['id'])) {
        $id = integer($body['id'],'Staff member');
        if (!scalar("SELECT id FROM users WHERE id=? AND role!='owner'",[$id])) fail('Staff member not found.',404);
        run("UPDATE users SET branch_id=?,name=?,email=?,role=?,active=? WHERE id=? AND role!='owner'",
            [$branch,$name,$email,$role,!empty($body['active']) ? 1 : 0,$id]);
        if ($password) run('UPDATE users SET password_hash=? WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$id]);
    } else {
        $id = insert('INSERT INTO users(branch_id,name,email,role,password_hash) VALUES (?,?,?,?,?)',[$branch,$name,$email,$role,password_hash($password,PASSWORD_DEFAULT)]);
    }
    return ['id'=>$id];
}
