CREATE DATABASE IF NOT EXISTS zeedat_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE zeedat_pos;

CREATE TABLE IF NOT EXISTS branches (
 id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL UNIQUE,
 phone VARCHAR(50) NOT NULL DEFAULT '', address VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS users (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NULL, name VARCHAR(100) NOT NULL,
 email VARCHAR(150) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
 role ENUM('owner','manager','cashier','technician','stock') NOT NULL,
 badge_code VARCHAR(32) NULL UNIQUE,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS customers (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NOT NULL, name VARCHAR(120) NOT NULL,
 phone VARCHAR(40) NOT NULL, email VARCHAR(150) NOT NULL DEFAULT '',
 notes VARCHAR(500) NOT NULL DEFAULT '',
 loyalty_points BIGINT UNSIGNED NOT NULL DEFAULT 0,
 wallet_balance BIGINT UNSIGNED NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS products (
 id INT AUTO_INCREMENT PRIMARY KEY, sku VARCHAR(60) NOT NULL UNIQUE,
 barcode VARCHAR(60) NULL UNIQUE, name VARCHAR(150) NOT NULL, brand VARCHAR(80) NOT NULL DEFAULT '',
 category ENUM('Phones','Accessories','Repair Parts','Services') NOT NULL,
 cost BIGINT UNSIGNED NOT NULL, price BIGINT UNSIGNED NOT NULL, reorder_level INT UNSIGNED NOT NULL DEFAULT 0,
 serialized BOOLEAN NOT NULL DEFAULT FALSE,
 active TINYINT(1) NOT NULL DEFAULT 1,
 commission_type VARCHAR(16) NOT NULL DEFAULT 'fixed',
 commission_value INT UNSIGNED NOT NULL DEFAULT 0,
 image_path VARCHAR(120) NOT NULL DEFAULT ''
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS stock (
 branch_id INT NOT NULL, product_id INT NOT NULL, qty INT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY(branch_id,product_id), FOREIGN KEY(branch_id) REFERENCES branches(id),
 FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS units (
 id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, branch_id INT NOT NULL,
 code VARCHAR(60) NOT NULL UNIQUE, imei VARCHAR(60) NULL UNIQUE,
 grade ENUM('New','Used','Refurbished') NOT NULL DEFAULT 'New',
 state ENUM('Available','Sold','Inspection','In Transit') NOT NULL DEFAULT 'Available',
 FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(branch_id) REFERENCES branches(id),
 INDEX(branch_id,product_id,state)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS cycles (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NOT NULL, business_date DATE NOT NULL,
 closed_at TIMESTAMP NULL, UNIQUE(branch_id,business_date), FOREIGN KEY(branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS drawers (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NOT NULL, user_id INT NOT NULL, cycle_id INT NOT NULL,
 opening BIGINT UNSIGNED NOT NULL, counted BIGINT UNSIGNED NULL, expected BIGINT NULL,
 notes VARCHAR(500) NOT NULL DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, closed_at TIMESTAMP NULL,
 open_branch INT GENERATED ALWAYS AS (CASE WHEN closed_at IS NULL THEN branch_id ELSE NULL END) STORED,
 UNIQUE(open_branch), FOREIGN KEY(branch_id) REFERENCES branches(id), FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(cycle_id) REFERENCES cycles(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS cash_movements (
 id INT AUTO_INCREMENT PRIMARY KEY, drawer_id INT NOT NULL, user_id INT NOT NULL,
 amount BIGINT NOT NULL, kind VARCHAR(50) NOT NULL, reference VARCHAR(100) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(drawer_id) REFERENCES drawers(id), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sales (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NOT NULL, user_id INT NOT NULL, commission_user_id INT NULL, drawer_id INT NOT NULL,
 customer_id INT NULL, subtotal BIGINT UNSIGNED NOT NULL, discount BIGINT UNSIGNED NOT NULL, discount_type VARCHAR(16) NOT NULL DEFAULT 'percent', tax BIGINT UNSIGNED NOT NULL,
 total BIGINT UNSIGNED NOT NULL, credit BIGINT UNSIGNED NOT NULL DEFAULT 0, due_date DATE NULL,
 wallet_used BIGINT UNSIGNED NOT NULL DEFAULT 0, points_earned INT UNSIGNED NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(branch_id) REFERENCES branches(id), FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(customer_id) REFERENCES customers(id), FOREIGN KEY(drawer_id) REFERENCES drawers(id),
 INDEX(branch_id,created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS sale_items (
 id INT AUTO_INCREMENT PRIMARY KEY, sale_id INT NOT NULL, product_id INT NOT NULL, unit_id INT NULL,
 name VARCHAR(150) NOT NULL, qty INT UNSIGNED NOT NULL, price BIGINT UNSIGNED NOT NULL,
 total BIGINT UNSIGNED NOT NULL, refunded_qty INT UNSIGNED NOT NULL DEFAULT 0,
 commission_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,
 FOREIGN KEY(sale_id) REFERENCES sales(id), FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(unit_id) REFERENCES units(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS payments (
 id INT AUTO_INCREMENT PRIMARY KEY, sale_id INT NOT NULL, drawer_id INT NOT NULL, user_id INT NOT NULL,
 kind ENUM('Sale','Credit') NOT NULL DEFAULT 'Sale', method ENUM('Cash','Card','Bank Transfer','Koko') NOT NULL,
 amount BIGINT UNSIGNED NOT NULL, reference VARCHAR(100) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(method,reference), FOREIGN KEY(sale_id) REFERENCES sales(id), FOREIGN KEY(drawer_id) REFERENCES drawers(id),
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS drafts (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NOT NULL, user_id INT NOT NULL, payload JSON NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(branch_id) REFERENCES branches(id), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS repairs (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NOT NULL, customer_id INT NOT NULL, technician_id INT NULL,
 device VARCHAR(120) NOT NULL, serial VARCHAR(60) NOT NULL DEFAULT '', issue VARCHAR(500) NOT NULL,
 accessories VARCHAR(200) NOT NULL DEFAULT '', notes VARCHAR(500) NOT NULL DEFAULT '', estimate BIGINT UNSIGNED NOT NULL,
 advance_paid BIGINT UNSIGNED NOT NULL DEFAULT 0, final_charge BIGINT UNSIGNED NOT NULL DEFAULT 0,
 paid_amount BIGINT UNSIGNED NOT NULL DEFAULT 0, payment_method VARCHAR(40) NOT NULL DEFAULT '',
 paid_at TIMESTAMP NULL, sms_sent TINYINT(1) NOT NULL DEFAULT 0,
 due_date DATE NOT NULL, status ENUM('Received','Diagnosing','Awaiting Approval','Waiting for Parts','In Progress','Testing','Ready','Delivered','Cancelled') NOT NULL DEFAULT 'Received',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(branch_id) REFERENCES branches(id), FOREIGN KEY(customer_id) REFERENCES customers(id),
 FOREIGN KEY(technician_id) REFERENCES users(id), INDEX(branch_id,status,due_date)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS suppliers (
 id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE, phone VARCHAR(40) NOT NULL DEFAULT ''
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS purchases (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NOT NULL, supplier_id INT NOT NULL, product_id INT NOT NULL,
 qty INT UNSIGNED NOT NULL, unit_cost BIGINT UNSIGNED NOT NULL, balance BIGINT UNSIGNED NOT NULL,
 invoice VARCHAR(80) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(branch_id,supplier_id,invoice,product_id), FOREIGN KEY(branch_id) REFERENCES branches(id),
 FOREIGN KEY(supplier_id) REFERENCES suppliers(id), FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS supplier_payments (
 id INT AUTO_INCREMENT PRIMARY KEY, purchase_id INT NOT NULL, drawer_id INT NOT NULL, user_id INT NOT NULL,
 amount BIGINT UNSIGNED NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(purchase_id) REFERENCES purchases(id), FOREIGN KEY(drawer_id) REFERENCES drawers(id), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS transfers (
 id INT AUTO_INCREMENT PRIMARY KEY, from_branch INT NOT NULL, to_branch INT NOT NULL, product_id INT NOT NULL,
 qty INT UNSIGNED NOT NULL, unit_id INT NULL, status ENUM('Requested','Dispatched','Received','Rejected') NOT NULL DEFAULT 'Requested',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(from_branch) REFERENCES branches(id),
 FOREIGN KEY(to_branch) REFERENCES branches(id), FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(unit_id) REFERENCES units(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS returns_log (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NOT NULL, sale_item_id INT NOT NULL, qty INT UNSIGNED NOT NULL,
 reason VARCHAR(500) NOT NULL, condition_note VARCHAR(100) NOT NULL, restock BOOLEAN NOT NULL DEFAULT FALSE,
 amount BIGINT UNSIGNED NOT NULL, method ENUM('Cash','Card','Bank Transfer','Koko') NOT NULL, reference VARCHAR(100) NULL,
 status ENUM('Pending','Completed','Rejected') NOT NULL DEFAULT 'Pending', processed_drawer_id INT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(branch_id) REFERENCES branches(id),
 FOREIGN KEY(sale_item_id) REFERENCES sale_items(id), FOREIGN KEY(processed_drawer_id) REFERENCES drawers(id),
 UNIQUE(method,reference)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS stock_movements (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NOT NULL, product_id INT NOT NULL, user_id INT NOT NULL,
 qty INT NOT NULL, kind VARCHAR(50) NOT NULL, reference VARCHAR(100) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(branch_id) REFERENCES branches(id),
 FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS exchanges (
 return_id INT PRIMARY KEY, product_id INT NOT NULL, unit_id INT NULL, qty INT UNSIGNED NOT NULL,
 quoted_total BIGINT UNSIGNED NOT NULL, replacement_sale_id INT NULL UNIQUE,
 FOREIGN KEY(return_id) REFERENCES returns_log(id), FOREIGN KEY(product_id) REFERENCES products(id),
 FOREIGN KEY(unit_id) REFERENCES units(id), FOREIGN KEY(replacement_sale_id) REFERENCES sales(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS settings (
 id INT PRIMARY KEY, tax_bps INT UNSIGNED NOT NULL DEFAULT 0, shop_name VARCHAR(100) NOT NULL DEFAULT 'ZEEDAT POS',
 paper_width ENUM('58','80') NOT NULL DEFAULT '80',
 shop_phone VARCHAR(50) NOT NULL DEFAULT '',
 shop_address VARCHAR(255) NOT NULL DEFAULT '',
 shop_email VARCHAR(120) NOT NULL DEFAULT '',
 receipt_footer VARCHAR(255) NOT NULL DEFAULT 'Thank you for your business! Please retain this receipt for warranty.',
 invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV-',
 auto_print TINYINT(1) NOT NULL DEFAULT 0,
 show_tax_on_receipt TINYINT(1) NOT NULL DEFAULT 1,
 label_printer_name VARCHAR(150) NOT NULL DEFAULT '',
 label_width_mm INT NOT NULL DEFAULT 50,
 label_height_mm INT NOT NULL DEFAULT 30,
 label_across INT NOT NULL DEFAULT 2,
 label_roll_mm INT NOT NULL DEFAULT 106,
 label_show_digits TINYINT(1) NOT NULL DEFAULT 1,
 delete_pin_hash VARCHAR(255) NOT NULL DEFAULT '',
 cloud_backup_url VARCHAR(255) NOT NULL DEFAULT '',
 cloud_api_key VARCHAR(255) NOT NULL DEFAULT '',
 auto_sync_enabled TINYINT(1) NOT NULL DEFAULT 1,
 sync_interval_minutes INT NOT NULL DEFAULT 15,
 last_synced_at TIMESTAMP NULL
) ENGINE=InnoDB;
INSERT IGNORE INTO settings (id) VALUES (1);
CREATE TABLE IF NOT EXISTS barcode_print_logs (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NOT NULL DEFAULT 0,
 product_id INT NOT NULL, user_id INT NOT NULL DEFAULT 1,
 copies INT NOT NULL DEFAULT 1, price BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(product_id, branch_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS backup_logs (
 id INT AUTO_INCREMENT PRIMARY KEY, branch_id INT NULL, filename VARCHAR(255) NOT NULL,
 file_size BIGINT UNSIGNED NOT NULL DEFAULT 0, status ENUM('local_saved','synced','failed') NOT NULL DEFAULT 'local_saved',
 remote_url VARCHAR(255) NULL, error_message TEXT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 INDEX(status, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS role_permissions (
 role ENUM('owner','manager','cashier','technician','stock') NOT NULL,
 permission VARCHAR(60) NOT NULL,
 PRIMARY KEY(role, permission)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS audit_log (
 id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, branch_id INT NULL, action VARCHAR(50) NOT NULL,
 details JSON NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS requests (
 user_id INT NOT NULL, request_id VARCHAR(64) NOT NULL, fingerprint CHAR(64) NOT NULL,
 response JSON NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,request_id),
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
