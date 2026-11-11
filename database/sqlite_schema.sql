-- ZEEDAT ERP - SQLite Local Database Schema
-- Embedded file-based database for local branch cashier PCs (No MySQL / No XAMPP needed)

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','manager','cashier','technician','stock')),
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK(category IN ('Phones','Accessories','Repair Parts','Services')),
  cost INTEGER NOT NULL,
  price INTEGER NOT NULL,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  serialized INTEGER NOT NULL DEFAULT 0,
  image_path TEXT NOT NULL DEFAULT '',
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock (
  branch_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(branch_id, product_id),
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  code TEXT NOT NULL UNIQUE,
  imei TEXT NULL UNIQUE,
  grade TEXT NOT NULL DEFAULT 'New',
  state TEXT NOT NULL DEFAULT 'Available',
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  closed_at TEXT NULL,
  UNIQUE(branch_id, business_date),
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS drawers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  cycle_id INTEGER NOT NULL,
  opening INTEGER NOT NULL,
  counted INTEGER NULL,
  expected INTEGER NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT NULL,
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(cycle_id) REFERENCES cycles(id)
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  drawer_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  reference TEXT NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(drawer_id) REFERENCES drawers(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  drawer_id INTEGER NOT NULL,
  customer_id INTEGER NULL,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL,
  tax INTEGER NOT NULL,
  total INTEGER NOT NULL,
  credit INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NULL,
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(drawer_id) REFERENCES drawers(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  unit_id INTEGER NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  total INTEGER NOT NULL,
  refunded_qty INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(sale_id) REFERENCES sales(id),
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(unit_id) REFERENCES units(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  drawer_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Sale',
  method TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reference TEXT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(sale_id) REFERENCES sales(id),
  FOREIGN KEY(drawer_id) REFERENCES drawers(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS repairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  technician_id INTEGER NULL,
  device TEXT NOT NULL,
  serial TEXT NOT NULL DEFAULT '',
  issue TEXT NOT NULL,
  accessories TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  estimate INTEGER NOT NULL,
  advance_paid INTEGER NOT NULL DEFAULT 0,
  final_charge INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT '',
  paid_at TEXT NULL,
  sms_sent INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Received',
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(technician_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  invoice TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(branch_id,supplier_id,invoice,product_id),
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL,
  drawer_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(purchase_id) REFERENCES purchases(id),
  FOREIGN KEY(drawer_id) REFERENCES drawers(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_branch INTEGER NOT NULL,
  to_branch INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  unit_id INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'Requested',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(from_branch) REFERENCES branches(id),
  FOREIGN KEY(to_branch) REFERENCES branches(id),
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(unit_id) REFERENCES units(id)
);

CREATE TABLE IF NOT EXISTS returns_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  sale_item_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  reason TEXT NOT NULL,
  condition_note TEXT NOT NULL,
  restock INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL,
  reference TEXT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  processed_drawer_id INTEGER NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(sale_item_id) REFERENCES sale_items(id),
  FOREIGN KEY(processed_drawer_id) REFERENCES drawers(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  kind TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS exchanges (
  return_id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  unit_id INTEGER NULL,
  qty INTEGER NOT NULL,
  quoted_total INTEGER NOT NULL,
  replacement_sale_id INTEGER NULL UNIQUE,
  FOREIGN KEY(return_id) REFERENCES returns_log(id),
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(unit_id) REFERENCES units(id),
  FOREIGN KEY(replacement_sale_id) REFERENCES sales(id)
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY,
  tax_bps INTEGER NOT NULL DEFAULT 0,
  shop_name TEXT NOT NULL DEFAULT 'ZEEDAT POS',
  paper_width TEXT NOT NULL DEFAULT '80',
  cloud_backup_url TEXT NOT NULL DEFAULT '',
  cloud_api_key TEXT NOT NULL DEFAULT '',
  auto_sync_enabled INTEGER NOT NULL DEFAULT 1,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
  last_synced_at TEXT NULL
);

INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY(role, permission)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS requests (
  user_id INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response TEXT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, request_id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS backup_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'local_saved',
  remote_url TEXT NULL,
  error_message TEXT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cloud_sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  uuid TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'insert',
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT NULL
);
