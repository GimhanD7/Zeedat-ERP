<?php
declare(strict_types=1);

date_default_timezone_set('Asia/Colombo');
ini_set('session.use_strict_mode', '1');
session_name('zeedat_session');
session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Strict']);
if (PHP_SAPI !== 'cli') session_start();

function env(string $key, string $fallback): string {
    $value = getenv($key);
    return $value === false ? $fallback : $value;
}
function db(): PDO {
    static $connection;
    if (!$connection) {
        $host = env('DB_HOST', '127.0.0.1');
        $port = env('DB_PORT', '3306');
        $name = env('DB_NAME', 'zeedat_pos');
        $connection = new PDO("mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4", env('DB_USER', 'root'), env('DB_PASSWORD', ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $connection->exec("SET time_zone = '+05:30'");
        $connection->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
    }
    return $connection;
}
class ApiError extends RuntimeException {}
function fail(string $message, int $status = 422): never { throw new ApiError($message, $status); }
function run(string $sql, array $params = []): PDOStatement {
    $statement = db()->prepare($sql);
    $statement->execute($params);
    return $statement;
}
function rows(string $sql, array $params = []): array { return run($sql, $params)->fetchAll(); }
function one(string $sql, array $params = []): ?array { return run($sql, $params)->fetch() ?: null; }
function scalar(string $sql, array $params = []): mixed { return run($sql, $params)->fetchColumn(); }
function insert(string $sql, array $params): int {
    run($sql, $params);
    return (int) db()->lastInsertId();
}
function respond(mixed $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_THROW_ON_ERROR);
    exit;
}
function currentUser(): ?array {
    if (!isset($_SESSION['user'])) return null;
    return one('SELECT id, branch_id, name, email, role FROM users WHERE id=? AND active=1', [$_SESSION['user']]);
}
function allow(array $user, string ...$roles): void {
    if (!in_array($user['role'], $roles, true)) fail('Your role cannot perform this action.', 403);
}
function branchFor(array $user, mixed $requested, bool $required = true): int {
    $branch = integer($requested ?? 0, 'Branch', 0);
    if ($user['role'] !== 'owner') {
        if ($branch && $branch !== (int) $user['branch_id']) fail('Branch access denied.', 403);
        $branch = (int) $user['branch_id'];
    }
    if (!$branch && $required) fail('Select a branch to continue.');
    if ($branch && !scalar('SELECT id FROM branches WHERE id=?', [$branch])) fail('Branch not found.', 404);
    return $branch;
}
function str(array $data, string $key, int $max = 100, bool $required = true): string {
    $value = $data[$key] ?? '';
    if (!is_string($value)) fail("Invalid $key.");
    $value = trim($value);
    if (($required && $value === '') || mb_strlen($value) > $max) fail("Invalid $key.");
    return $value;
}
function accountPassword(array $data, bool $required): string {
    $value = $data['password'] ?? '';
    if (!is_string($value) || (($value !== '' || $required) && (strlen($value) < 12 || strlen($value) > 72 || str_contains($value, "\0")))) {
        fail('Use a password between 12 and 72 bytes.');
    }
    return $value;
}
function integer(mixed $value, string $label, int $min = 1, int $max = 2147483647): int {
    if ((!is_int($value) && !is_string($value)) || filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => $min, 'max_range' => $max]]) === false) fail("Invalid $label.");
    return (int) $value;
}
function money(array $data, string $key, int $min = 0): int {
    return integer($data[$key] ?? 0, $key, $min, 99999999999);
}
function choice(array $data, string $key, array $options): string {
    $value = str($data, $key);
    if (!in_array($value, $options, true)) fail("Invalid $key.");
    return $value;
}
function day(array $data, string $key): string {
    $value = str($data, $key, 10);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) fail("Invalid $key.");
    return $value;
}
function audit(array $user, ?int $branch, string $action, array $details): void {
    run('INSERT INTO audit_log(user_id,branch_id,action,details) VALUES (?,?,?,?)', [
        $user['id'], $branch ?: null, $action, json_encode($details, JSON_THROW_ON_ERROR),
    ]);
}
function ref(string $prefix, int $id): string { return sprintf('%s-%06d', $prefix, $id); }
function stockMove(array $user, int $branch, int $product, int $delta, string $kind, string $reference): void {
    run('INSERT IGNORE INTO stock(branch_id,product_id,qty) VALUES (?,?,0)', [$branch, $product]);
    if (run('UPDATE stock SET qty=CAST(qty AS SIGNED)+? WHERE branch_id=? AND product_id=? AND CAST(qty AS SIGNED)+? >= 0',
        [$delta, $branch, $product, $delta])->rowCount() !== 1) fail('Insufficient stock.', 409);
    run('INSERT INTO stock_movements(branch_id,product_id,user_id,qty,kind,reference) VALUES (?,?,?,?,?,?)',
        [$branch, $product, $user['id'], $delta, $kind, $reference]);
}
function openDrawer(array $user, int $branch): array {
    $drawer = one('SELECT d.*, c.business_date FROM drawers d JOIN cycles c ON c.id=d.cycle_id WHERE d.branch_id=? AND d.closed_at IS NULL FOR UPDATE', [$branch]);
    if (!$drawer || $drawer['business_date'] !== date('Y-m-d')) fail('Open a cash drawer for today first.', 409);
    if ($user['role'] === 'cashier' && (int) $drawer['user_id'] !== $user['id']) fail('This drawer belongs to another cashier.', 403);
    return $drawer;
}
function drawerExpected(array $drawer): int {
    return (int) $drawer['opening'] + (int) scalar('SELECT COALESCE(SUM(amount),0) FROM cash_movements WHERE drawer_id=?', [$drawer['id']]);
}
function cash(array $user, array $drawer, int $amount, string $kind, string $reference): void {
    if (!$amount) return;
    if ($amount < 0 && drawerExpected($drawer) + $amount < 0) fail('Insufficient cash in the drawer.', 409);
    run('INSERT INTO cash_movements(drawer_id,user_id,amount,kind,reference) VALUES (?,?,?,?,?)',
        [$drawer['id'], $user['id'], $amount, $kind, $reference]);
}
function customerAt(mixed $id, int $branch): int {
    $id = integer($id, 'Customer');
    if (!scalar('SELECT id FROM customers WHERE id=? AND branch_id=?', [$id, $branch])) fail('Customer does not belong to this branch.', 404);
    return $id;
}
function requestOnce(array $user, array $body, string $action, callable $execute): mixed {
    $id = $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '';
    if (!preg_match('/^[a-zA-Z0-9-]{12,64}$/D', $id)) fail('A valid idempotency key is required.', 400);
    $hash = hash('sha256', json_encode([$action, $body], JSON_THROW_ON_ERROR));
    db()->beginTransaction();
    try {
        run('INSERT IGNORE INTO requests(user_id,request_id,fingerprint) VALUES (?,?,?)', [$user['id'], $id, $hash]);
        $request = one('SELECT fingerprint,response FROM requests WHERE user_id=? AND request_id=? FOR UPDATE', [$user['id'], $id]);
        if ($request['fingerprint'] !== $hash) fail('This request key was used with different data.', 409);
        if ($request['response'] !== null) {
            db()->commit();
            return json_decode($request['response'], true, 512, JSON_THROW_ON_ERROR);
        }
        $result = $execute();
        run('UPDATE requests SET response=? WHERE user_id=? AND request_id=?', [json_encode($result, JSON_THROW_ON_ERROR), $user['id'], $id]);
        db()->commit();
        return $result;
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        throw $e;
    }
}
