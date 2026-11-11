<?php
/**
 * Namecheap / Shared Hosting Database Configuration
 *
 * Copy this file to `api/config.php` on your hosting server and update with
 * the MySQL database details created in Namecheap cPanel -> MySQL Databases.
 */
return [
    'DB_DRIVER' => 'mysql',
    'DB_HOST' => 'localhost',
    'DB_PORT' => '3306',
    'DB_NAME' => 'cpaneluser_zeedat_pos',
    'DB_USER' => 'cpaneluser_zeedat_user',
    'DB_PASSWORD' => 'CHANGE_THIS_PASSWORD',

    // Keep '0' for a clean production database (only Owner login & 3 default branches are created).
    // Change to '1' only if you want sample products seeded on first run.
    'SEED_DEMO' => '0',
];
