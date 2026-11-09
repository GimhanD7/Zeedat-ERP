<?php
declare(strict_types=1);

namespace Zeedat;

class Autoloader {
    public static function register(): void {
        spl_autoload_register(function (string $class): void {
            $prefix = 'Zeedat\\';
            $baseDir = __DIR__ . '/';

            $len = strlen($prefix);
            if (strncmp($prefix, $class, $len) !== 0) {
                return;
            }

            $relativeClass = substr($class, $len);
            $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

            if (file_exists($file)) {
                require $file;
            }
        });
    }
}
