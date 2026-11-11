<?php
declare(strict_types=1);

namespace Zeedat\Support;

use Zeedat\Repositories\BaseRepository;

class ProductImage {
    public const MAX_BYTES = 10240; // 10 KB strict limit

    public static function uploadDir(): string {
        $root = dirname(__DIR__, 3);
        $base = $root . DIRECTORY_SEPARATOR . 'uploads';
        $dir = $base . DIRECTORY_SEPARATOR . 'products';

        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        $htaccess = $base . DIRECTORY_SEPARATOR . '.htaccess';
        if (is_dir($base) && !is_file($htaccess)) {
            @file_put_contents(
                $htaccess,
                "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n"
            );
        }

        return $dir;
    }

    public static function imageUrl(int $productId, ?string $imagePath): string {
        $clean = trim((string) $imagePath);
        if ($productId <= 0 || $clean === '') {
            return '';
        }
        return 'api/index.php?route=product.image&id=' . $productId . '&v=' . rawurlencode(basename($clean));
    }

    public static function saveFromDataUri(string $dataUri, ?string $previousFile = null): string {
        $trimmed = trim($dataUri);
        if (!preg_match('/^data:image\/(webp|jpeg|jpg|png);base64,([A-Za-z0-9+\/=\s]+)$/i', $trimmed, $m)) {
            throw new ApiError('Unsupported image format. Please upload JPG, PNG, or WebP.');
        }

        $subType = strtolower($m[1]);
        $ext = $subType === 'jpeg' || $subType === 'jpg' ? 'jpg' : $subType;
        $raw = base64_decode(preg_replace('/\s+/', '', $m[2]), true);
        if ($raw === false || strlen($raw) < 16) {
            throw new ApiError('Invalid image payload.');
        }

        // Prevent giant raw uploads (> 2 MB) before compression check
        if (strlen($raw) > 2 * 1024 * 1024) {
            throw new ApiError('Image upload is too large. Please select a smaller photo.');
        }

        $detected = self::detectImageFormat($raw);
        if ($detected === null) {
            throw new ApiError('Uploaded file is not a valid image.');
        }
        $ext = $detected;

        if (strlen($raw) > self::MAX_BYTES) {
            $compressed = self::compressWithGd($raw);
            if ($compressed === null) {
                throw new ApiError('Compressed product image must be 10 KB or smaller.');
            }
            [$raw, $ext] = $compressed;
        }

        if (strlen($raw) > self::MAX_BYTES) {
            throw new ApiError('Compressed product image exceeds the 10 KB limit.');
        }

        $dir = self::uploadDir();
        $filename = 'prod_' . bin2hex(random_bytes(8)) . '.' . $ext;
        $target = $dir . DIRECTORY_SEPARATOR . $filename;

        if (@file_put_contents($target, $raw) === false) {
            throw new ApiError('Could not save product image on server.', 500);
        }

        self::delete($previousFile);
        return $filename;
    }

    public static function delete(?string $filename): void {
        $clean = basename(trim((string) $filename));
        if ($clean === '' || $clean === '.' || $clean === '..') {
            return;
        }
        $path = self::uploadDir() . DIRECTORY_SEPARATOR . $clean;
        if (is_file($path)) {
            @unlink($path);
        }
    }

    public static function stream(int $productId): never {
        if ($productId <= 0) {
            http_response_code(404);
            exit;
        }

        $imagePath = (string) (BaseRepository::scalar('SELECT image_path FROM products WHERE id=?', [$productId]) ?: '');
        $clean = basename(trim($imagePath));
        if ($clean === '') {
            http_response_code(404);
            exit;
        }

        $fullPath = self::uploadDir() . DIRECTORY_SEPARATOR . $clean;
        if (!is_file($fullPath)) {
            http_response_code(404);
            exit;
        }

        $ext = strtolower(pathinfo($clean, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'webp' => 'image/webp',
            'png' => 'image/png',
            default => 'image/jpeg',
        };

        $etag = '"' . md5($clean . ':' . filemtime($fullPath) . ':' . filesize($fullPath)) . '"';
        if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
            header('HTTP/1.1 304 Not Modified');
            header('ETag: ' . $etag);
            exit;
        }

        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string) filesize($fullPath));
        header('Cache-Control: private, max-age=86400');
        header('ETag: ' . $etag);
        header('X-Content-Type-Options: nosniff');
        readfile($fullPath);
        exit;
    }

    private static function detectImageFormat(string $raw): ?string {
        if (str_starts_with($raw, "\xFF\xD8\xFF")) {
            return 'jpg';
        }
        if (str_starts_with($raw, "\x89PNG\r\n\x1A\n")) {
            return 'png';
        }
        if (strlen($raw) >= 12 && substr($raw, 0, 4) === 'RIFF' && substr($raw, 8, 4) === 'WEBP') {
            return 'webp';
        }
        return null;
    }

    private static function compressWithGd(string $raw): ?array {
        if (!function_exists('imagecreatefromstring')) {
            return null;
        }
        $src = @imagecreatefromstring($raw);
        if (!$src) {
            return null;
        }

        $w = imagesx($src);
        $h = imagesy($src);
        if ($w <= 0 || $h <= 0) {
            imagedestroy($src);
            return null;
        }

        $canWebp = function_exists('imagewebp');
        $sizes = [280, 220, 170, 130, 96];
        $qualities = [74, 58, 42, 28, 18];

        foreach ($sizes as $maxDim) {
            $scale = min(1.0, $maxDim / max($w, $h));
            $nw = max(1, (int) round($w * $scale));
            $nh = max(1, (int) round($h * $scale));

            $dst = imagecreatetruecolor($nw, $nh);
            $white = imagecolorallocate($dst, 255, 255, 255);
            imagefilledrectangle($dst, 0, 0, $nw, $nh, $white);
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);

            foreach ($qualities as $q) {
                if ($canWebp) {
                    ob_start();
                    @imagewebp($dst, null, $q);
                    $out = ob_get_clean();
                    if (is_string($out) && $out !== '' && strlen($out) <= self::MAX_BYTES) {
                        imagedestroy($dst);
                        imagedestroy($src);
                        return [$out, 'webp'];
                    }
                }
                if (function_exists('imagejpeg')) {
                    ob_start();
                    @imagejpeg($dst, null, $q);
                    $out = ob_get_clean();
                    if (is_string($out) && $out !== '' && strlen($out) <= self::MAX_BYTES) {
                        imagedestroy($dst);
                        imagedestroy($src);
                        return [$out, 'jpg'];
                    }
                }
            }

            imagedestroy($dst);
        }

        imagedestroy($src);
        return null;
    }
}
