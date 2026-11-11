# Hosting Zeedat ERP on Namecheap (cPanel)

## 1. Create MySQL Database in Namecheap cPanel
1. Log in to **Namecheap -> cPanel -> MySQL Databases**.
2. Create a database (example: `cpaneluser_zeedat`).
3. Create a MySQL user + strong password (example: `cpaneluser_pos`).
4. Under **Add User to Database**, add that user to the database with **All Privileges**.
5. In **cPanel -> Select PHP Version**, ensure **PHP 8.1 or 8.2** is active with `pdo_mysql`, `mbstring`, `bcmath`, and `json` enabled.

## 2. Upload & Extract Package
1. Upload `release/zeedat-namecheap-upload.zip` into `public_html/` (or your subdomain folder) via **cPanel File Manager**.
2. Click **Extract** so `.htaccess`, `dist/`, `api/`, and `database/` sit directly inside that web root folder.

## 3. Configure Database Connection
1. Open `api/` in File Manager.
2. Copy/Rename `api/config.example.php` -> `api/config.php`.
3. Edit `api/config.php` with your cPanel values:
   - `'DB_DRIVER' => 'mysql'`
   - `'DB_HOST' => 'localhost'`
   - `'DB_NAME' => 'your_cpanel_dbname'`
   - `'DB_USER' => 'your_cpanel_dbuser'`
   - `'DB_PASSWORD' => 'your_cpanel_dbpassword'`

## 4. First Visit & Login
1. Open your domain in the browser (for example `https://pos.yourdomain.com`).
2. `AutoMigrator` automatically creates all tables, columns, permissions, default branches, and the default Owner account on first load.
3. Log in with:
   - Email: `owner@zeedat.local`
   - Password: `Password1234!`
4. Immediately change the Owner password and set your **Inventory Delete Security PIN** under **Settings -> Security, PIN & Audit**.
