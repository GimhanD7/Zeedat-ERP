<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}

$destination = getenv('ZEEDAT_SQLITE_PATH');
if (!$destination || is_file($destination)) {
    exit($destination ? 0 : 1);
}

$lock = fopen($destination . '.setup.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) {
    echo "Could not lock the local database for setup.\n";
    exit(1);
}
if (is_file($destination)) {
    exit(0);
}

$temporary = $destination . '.' . bin2hex(random_bytes(8)) . '.tmp';
try {
    $source = getenv('ZEEDAT_IMPORT_SQLITE');
    $password = null;
    if ($source && is_file($source)) {
        $db = new PDO('sqlite:' . $source);
        $db->exec('PRAGMA busy_timeout=5000');
        $db->exec('VACUUM INTO ' . $db->quote($temporary));
    } else {
        $db = new PDO('sqlite:' . $temporary);
        $db->exec(file_get_contents(__DIR__ . '/../database/sqlite_schema.sql'));
        $db->exec("INSERT INTO branches(id,name) VALUES (1,'Battaramulla Mobile'),(2,'Battaramulla PC'),(3,'Malabe')");
        $password = bin2hex(random_bytes(14));
        $statement = $db->prepare("INSERT INTO users(name,email,password_hash,role) VALUES ('Owner','owner@zeedat.local',?,'owner')");
        $statement->execute([password_hash($password, PASSWORD_DEFAULT)]);
        $statement = null;
        $db->exec("UPDATE settings SET cloud_backup_url='https://zeedat.vortexdigitallabs.org', auto_sync_enabled=1 WHERE id=1");
        $db->exec('PRAGMA journal_mode=DELETE');
    }
    $db = null;
    if (!rename($temporary, $destination)) {
        throw new RuntimeException('Could not save the local database.');
    }
    if ($password !== null) {
        echo "Local owner email: owner@zeedat.local\nPassword: $password\nKeep these credentials in a safe place.\n";
    }
} catch (Throwable $error) {
    error_log($error->getMessage());
    if (is_file($temporary)) unlink($temporary);
    echo "Local database setup failed. See the ZEEDAT PHP log for details.\n";
    exit(1);
}
