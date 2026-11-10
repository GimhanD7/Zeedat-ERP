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
install -m 644 "$release/dist/index.html" "$web_root/index.html.$release_id.tmp"
printf "<?php require '%s/.zeedat/current/deploy/hosted-api.php';\n" "$home" > "$web_root/api/index.php.$release_id.tmp"

ln -s "$release" "$private_dir/current.$release_id"
mv -Tf "$private_dir/current.$release_id" "$private_dir/current"
mv -f "$web_root/api/index.php.$release_id.tmp" "$web_root/api/index.php"
mv -f "$web_root/index.html.$release_id.tmp" "$web_root/index.html"
