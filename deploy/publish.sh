#!/usr/bin/env bash
set -euo pipefail

web_root=$(cd -- "$1" && pwd -P)
release_id=$2
home=$(cd -- "$HOME" && pwd -P)
[[ $home =~ ^/[a-zA-Z0-9_./-]+$ && $web_root == "$home/"* ]]
[[ $web_root != "$home/.zeedat" && $web_root != "$home/.zeedat/"* ]]
[[ $release_id =~ ^[0-9]+-[0-9]+$ ]]

private_dir="$home/.zeedat"
release="$private_dir/releases/$release_id"
test -f "$private_dir/config.php"
umask 077
mkdir -p "$private_dir/releases" "$private_dir/backups"
mkdir "$release"
tar -xzf - -C "$release"
ln -s "$private_dir/backups" "$release/api/backups"

# Check the cPanel database before switching the public site to this release.
php -r '
    require $argv[1] . "/deploy/hosted-config.php";
    require $argv[1] . "/api/src/Autoloader.php";
    Zeedat\Autoloader::register();
    Zeedat\Config\Database::getConnection()->query("SELECT id FROM users LIMIT 1");
' "$release"

umask 022
mkdir -p "$web_root/assets" "$web_root/api"
cp -R --no-preserve=mode "$release/dist/assets/." "$web_root/assets/"
patch_id=$(php -r '
    $manifest = json_decode(file_get_contents($argv[1]), true, 32, JSON_THROW_ON_ERROR);
    $id = $manifest["patch_id"] ?? "";
    if (!preg_match("/^[A-Za-z0-9][A-Za-z0-9._-]{3,79}$/D", $id)
        || !hash_equals($manifest["zip_sha256"] ?? "", hash_file("sha256", $argv[2]))) exit(1);
    echo $id;
' "$release/updates/patch-manifest.json" "$release/updates/zeedat-patch.zip")
patch_file="$web_root/assets/zeedat-patch-$patch_id.zip"
install -m 644 "$release/updates/zeedat-patch.zip" "$patch_file.$release_id.tmp"
mv -f "$patch_file.$release_id.tmp" "$patch_file"

# Keep cPanel directives and replace only the block managed by this deployer.
cache_rules="$web_root/.htaccess.$release_id.tmp"
if [[ -f "$web_root/.htaccess" ]]; then
    awk '/^# BEGIN ZEEDAT CACHE$/{skip=1;next} /^# END ZEEDAT CACHE$/{skip=0;next} !skip' "$web_root/.htaccess" > "$cache_rules"
else
    touch "$cache_rules"
fi
cat >> "$cache_rules" <<'EOF'

# BEGIN ZEEDAT CACHE
<IfModule mod_headers.c>
    <Files "index.html">
        Header always set Cache-Control "no-cache, must-revalidate"
    </Files>
</IfModule>
# END ZEEDAT CACHE
EOF
mv -f "$cache_rules" "$web_root/.htaccess"

install -m 644 "$release/dist/index.html" "$web_root/index.html.$release_id.tmp"
printf "<?php require '%s/deploy/hosted-api.php';\n" "$release" > "$web_root/api/index.php.$release_id.tmp"

ln -s "$release" "$private_dir/current.$release_id"
mv -Tf "$private_dir/current.$release_id" "$private_dir/current"
mv -f "$web_root/api/index.php.$release_id.tmp" "$web_root/api/index.php"
mv -f "$web_root/index.html.$release_id.tmp" "$web_root/index.html"
