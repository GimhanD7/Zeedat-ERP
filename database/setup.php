<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../api/bootstrap.php';

$email = strtolower(getenv('ZEEDAT_OWNER_EMAIL') ?: '');
$password = getenv('ZEEDAT_OWNER_PASSWORD') ?: '';
if (!filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($password)<12 || strlen($password)>72 || str_contains($password,"\0")) {
    fwrite(STDERR,"Set ZEEDAT_OWNER_EMAIL and ZEEDAT_OWNER_PASSWORD (12–72 bytes).\n");
    exit(1);
}
$demo = in_array('--demo',$argv,true);
$db = db();
$db->beginTransaction();
try {
    if (scalar("SELECT id FROM users WHERE role='owner' LIMIT 1")) throw new RuntimeException('Setup already ran. Existing data was preserved.');
    $a = insert('INSERT INTO branches(name) VALUES (?)', ['Colombo – Main']);
    $b = insert('INSERT INTO branches(name) VALUES (?)', ['Kandy']);
    $hash = password_hash($password,PASSWORD_DEFAULT);
    $owner = insert("INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,'owner')",[$demo?'Damindu Perera':'Owner',$email,$hash]);
    if ($demo) {
        $tech = insert("INSERT INTO users(branch_id,name,email,password_hash,role) VALUES (?,?,?,?,'technician')",[$a,'Kamal Silva','tech@example.test',$hash]);
        $cashier = insert("INSERT INTO users(branch_id,name,email,password_hash,role) VALUES (?,?,?,?,'cashier')",[$b,'Rashmi Jayasuriya','cashier@example.test',$hash]);
        insert("INSERT INTO users(branch_id,name,email,password_hash,role) VALUES (?,?,?,?,'manager')",[$a,'Kasun Fernando','manager@example.test',$hash]);
        $catalog = [
            ['IP15-128','iPhone 15 128GB','Apple','Phones',258000,319900,3,6],
            ['SM-A55','Samsung Galaxy A55 5G','Samsung','Phones',115000,149900,3,8],
            ['XM-N13','Redmi Note 13 128GB','Xiaomi','Phones',53000,74900,3,10],
            ['AP-PRO','AirPods Pro','Apple','Accessories',35000,49900,5,12],
            ['SAM-25W','Samsung 25W Fast Charger','Samsung','Accessories',2600,4900,10,6],
            ['USB-C-1M','USB-C Cable (1m)','Anker','Accessories',650,1950,15,42],
            ['CASE-IP15','iPhone 15 Clear Case','ZEEDAT','Accessories',1000,3990,10,28],
            ['GLASS-A55','Tempered Glass (A55)','ZEEDAT','Accessories',400,1500,10,4],
            ['SCR-IP11','iPhone 11 Screen','Apple','Repair Parts',12000,19900,3,2],
            ['BAT-IP14','iPhone 14 Battery','Apple','Repair Parts',10500,17900,3,0],
            ['SRV-SCR','Screen Replacement Labour','ZEEDAT','Services',0,6500,0,0],
        ];
        $products = [];
        foreach ($catalog as $index=>[$sku,$name,$brand,$category,$cost,$price,$reorder,$qty]) {
            $serialized = $category === 'Phones';
            $p = insert('INSERT INTO products(sku,barcode,name,brand,category,cost,price,reorder_level,serialized) VALUES (?,?,?,?,?,?,?,?,?)',[$sku,'480000000' . sprintf('%04d',$index+1),$name,$brand,$category,$cost*100,$price*100,$reorder,(int)$serialized]);
            $products[$sku] = $p;
            if ($category === 'Services') continue;
            foreach ([$a=>$qty,$b=>intdiv($qty,2)] as $branch=>$stock) {
                run('INSERT INTO stock(branch_id,product_id,qty) VALUES (?,?,?)',[$branch,$p,$stock]);
                if ($serialized) for ($j=1;$j<=$stock;$j++) {
                    run('INSERT INTO units(product_id,branch_id,code,imei) VALUES (?,?,?,?)',[$p,$branch,$sku . '-' . $branch . '-' . $j,sprintf('356%03d%03d%06d',$p,$branch,$j)]);
                }
            }
        }
        $customers = [];
        foreach ([[$a,'Nuwan Fernando','077 345 6789'],[$a,'Dilini Perera','071 812 4420'],[$a,'Kasun Jayathilake','076 556 7289'],[$b,'Sachini Hewawitharana','077 781 2345'],[$b,'Amal Perera','070 335 6811']] as [$branch,$name,$phone]) {
            $customers[] = insert('INSERT INTO customers(branch_id,name,phone) VALUES (?,?,?)',[$branch,$name,$phone]);
        }
        $statuses = ['Received','Diagnosing','Waiting for Parts','In Progress','Ready','Delivered','Diagnosing','Ready'];
        foreach ($statuses as $i=>$status) {
            run('INSERT INTO repairs(branch_id,customer_id,technician_id,device,issue,estimate,due_date,status) VALUES (?,?,?,?,?,?,?,?)',[
                $a,$customers[$i%3],$tech,['iPhone 13','Samsung Galaxy A54','iPhone 12','Redmi Note 12'][$i%4],
                ['Screen cracked after a drop','Device not powering on','Battery replacement','Intermittent charging'][$i%4],
                (12000+$i*800)*100,date('Y-m-d',strtotime(($i-3) . ' days')),$status
            ]);
        }
        $supplier = insert('INSERT INTO suppliers(name,phone) VALUES (?,?)',['D Tech Distributors','011 235 5500']);
        run('INSERT INTO purchases(branch_id,supplier_id,product_id,qty,unit_cost,balance,invoice) VALUES (?,?,?,?,?,?,?)',[$a,$supplier,$products['AP-PRO'],10,3500000,35000000,'DT-2481']);
        $accessories = ['AP-PRO','SAM-25W','USB-C-1M','CASE-IP15','GLASS-A55'];
        foreach (range(6,0) as $offset) {
            $date = date('Y-m-d',strtotime("-$offset days"));
            foreach ([$a,$b] as $branch) {
                $cycle = insert('INSERT INTO cycles(branch_id,business_date,closed_at) VALUES (?,?,?)',[$branch,$date,$offset ? "$date 18:00:00" : null]);
                $operator = $branch === $b ? $cashier : $owner;
                $drawer = insert('INSERT INTO drawers(branch_id,user_id,cycle_id,opening,created_at,closed_at) VALUES (?,?,?,?,?,?)',[$branch,$operator,$cycle,1000000,"$date 09:00:00",$offset ? "$date 18:00:00" : null]);
                for ($i=0;$i<3;$i++) {
                    $entry = $accessories[($i+$offset+$branch)%count($accessories)];
                    $item = one('SELECT * FROM products WHERE id=?',[$products[$entry]]);
                    $qty = [3,5,6,4,7,8,10][$offset] + $i;
                    $total = $qty*$item['price'];
                    $time = "$date " . (10+$i) . ':30:00';
                    $customer = $i===1 ? $customers[$branch===$a ? 0 : 3] : null;
                    $credit = $customer && $offset===0 ? intdiv($total,4) : 0;
                    $sale = insert('INSERT INTO sales(branch_id,user_id,drawer_id,customer_id,subtotal,discount,tax,total,credit,due_date,created_at)
                        VALUES (?,?,?,?,?,0,0,?,?,?,?)',[$branch,$owner,$drawer,$customer,$total,$total,$credit,$credit ? date('Y-m-d',strtotime('+14 days')) : null,$time]);
                    $line = insert('INSERT INTO sale_items(sale_id,product_id,name,qty,price,total) VALUES (?,?,?,?,?,?)',[$sale,$item['id'],$item['name'],$qty,$item['price'],$total]);
                    $method = $i===2 ? 'Card' : 'Cash';
                    run('INSERT INTO payments(sale_id,drawer_id,user_id,method,amount,reference,created_at) VALUES (?,?,?,?,?,?,?)',
                        [$sale,$drawer,$owner,$method,$total-$credit,$method==='Card' ? "DEMO-$sale" : null,$time]);
                    if ($method==='Cash') run('INSERT INTO cash_movements(drawer_id,user_id,amount,kind,reference,created_at) VALUES (?,?,?,?,?,?)',
                        [$drawer,$owner,$total-$credit,'Cash Sale',sprintf('INV-%06d',$sale),$time]);
                    if ($branch===$a && $offset===0 && $i===0) run("INSERT INTO returns_log(branch_id,sale_item_id,qty,reason,condition_note,restock,amount,method)
                        VALUES (?,?,1,'Incorrect accessory size','Unopened',1,?,'Cash')",[$branch,$line,$item['price']]);
                }
                if ($offset) {
                    $expected = 1000000+(int)scalar('SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE drawer_id=?',[$drawer]);
                    run('UPDATE drawers SET expected=?,counted=? WHERE id=?',[$expected,$expected,$drawer]);
                }
            }
        }
    }
    $db->commit();
    fwrite(STDOUT,"Owner created. Sign in with the configured email and password.\n");
} catch (Throwable $e) {
    $db->rollBack();
    fwrite(STDERR,$e->getMessage() . "\n");
    exit(1);
}
