# ZEEDAT POS

A branch-scoped retail and repair application with a React frontend, a PHP JSON API, and a MySQL database. The included XAMPP MariaDB server also works for local development.

## Run on Windows with XAMPP

1. Start **MySQL** in the XAMPP Control Panel.
2. From the repository root, install the frontend and load the schema into `zeedat_pos`. The example below uses the default local XAMPP database account. PHP reads `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD` from the environment. To use another database name, update the schema's database statements and set `DB_NAME` to match.

   ```powershell
   npm.cmd ci
   Get-Content database/schema.sql -Raw | & C:/xampp/mysql/bin/mysql.exe -h 127.0.0.1 -u root
   ```

3. Set `ZEEDAT_OWNER_EMAIL` and `ZEEDAT_OWNER_PASSWORD` in the current terminal. Use a unique password of at least 12 bytes. Then create the owner and initial branches.

   ```powershell
   & C:/xampp/php/php.exe database/setup.php
   ```

   On a fresh disposable database, append `--demo` to add sample branches, stock, customers, repair jobs, sales and open owner drawers. The demo staff accounts use the supplied owner password. Setup refuses to overwrite an existing owner.

4. Build and run the app on loopback.

   ```powershell
   npm.cmd run build
   & C:/xampp/php/php.exe -S 127.0.0.1:8081 router.php
   ```

   Open [http://127.0.0.1:8081](http://127.0.0.1:8081) and sign in with the owner account. For React hot reload, leave PHP running and run `npm.cmd run dev` in another terminal.

   With XAMPP Apache and `mod_rewrite` enabled, the built app is also available under [http://localhost/Zeedat-ERP/](http://localhost/Zeedat-ERP/). Apache must allow the included `.htaccess` rules. For a deployment, serve the compiled frontend and `api/index.php` over HTTPS and keep the schema, local data and toccccccccccccccccccccccccccccccccccccccccccccccccccoling private.

## Deploy to Namecheap

See [Namecheap deployment setup](deploy/README.md) to connect GitHub Actions to a dedicated cPanel document root.

## Workflows

- Owner and branch dashboards with sales, payment, credit, stock and repair metrics.
- POS search by product, SKU, barcode or unit identifier, held bills, server-priced checkout, split tender, manager-approved credit and thermal-width browser receipts.
- Shared product catalog, branch inventory, serialized devices, adjustments, purchase receiving, cash supplier payments and stock transfers.
- Repair intake, technician worklist and logged status transitions.
- Customer profiles and invoice credit repayments.
- Drawer opening, cash movements, count reconciliation and business-day closing. This version supports one active drawer per branch.
- Invoice-linked return approval and cash-tender exchanges with a linked replacement invoice. Returned serialized devices ecnter inspection.
- Staff accounts, fixed server-enforced role permissions, shop settings and audit events.

Amounts are stored as integer minor units. The tax rate starts at zero and can be configured by the owner. Card, bank transfer and Koko are recorded with a confirmed external reference. The app has no direct payment-provider connection. Checkout and financial writes require an API connection.

Remaining blueprint work includes repair parts and labor billing, supplier advances, posted-sale voids, commission payouts, configurable approval thresholds and production rollout checks.
