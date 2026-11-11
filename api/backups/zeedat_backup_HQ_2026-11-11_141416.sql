-- ============================================================
-- ZEEDAT ERP AUTOMATED DATABASE BACKUP (SQLITE)
-- Database: zeedat_local.db
-- Generated at: 2026-11-11 14:14:16 (Asia/Colombo)
-- ============================================================

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- Table: audit_log
DROP TABLE IF EXISTS "audit_log";
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  branch_id INTEGER NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);

INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (1, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:33:29');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (2, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:33:47');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (3, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:34:08');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (4, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:34:33');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (5, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:34:43');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (6, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:34:58');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (7, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:35:23');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (8, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:35:43');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (9, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:35:48');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (10, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:36:13');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (11, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:36:27');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (12, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:36:35');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (13, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:36:43');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (14, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:36:57');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (15, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:37:00');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (16, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:37:23');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (17, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:37:25');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (18, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:37:43');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (19, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:37:50');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (20, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:37:57');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (21, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:38:15');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (22, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:38:23');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (23, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:38:40');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (24, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:38:43');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (25, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:38:57');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (26, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:39:05');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (27, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:39:23');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (28, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:39:30');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (29, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:39:43');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (30, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:39:55');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (31, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:39:57');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (32, 1, NULL, 'sync.push', '[]', '2026-11-11 08:40:11');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (33, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:40:20');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (34, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:40:23');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (35, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:40:45');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (36, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:40:57');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (37, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:40:57');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (38, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:41:10');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (39, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:41:23');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (40, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:41:35');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (41, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:41:57');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (42, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:41:57');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (43, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:42:00');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (44, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:42:23');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (45, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:42:25');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (46, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:42:50');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (47, 1, NULL, 'settings.backup_sync', '{"cloud_backup_url":"https:\/\/zeedat.vortexdigitallabs.org","auto_sync":1,"interval":15}', '2026-11-11 08:42:56');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (48, 1, NULL, 'backup.save_settings', '[]', '2026-11-11 08:42:56');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (49, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:42:59');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (50, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:43:05');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (51, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:43:20');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (52, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:43:30');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (53, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:43:49');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (54, 1, NULL, 'settings.backup_sync', '{"cloud_backup_url":"https:\/\/zeedat.vortexdigitallabs.org","auto_sync":1,"interval":5}', '2026-11-11 08:43:49');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (55, 1, NULL, 'backup.save_settings', '[]', '2026-11-11 08:43:49');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (56, 1, NULL, 'sync.push', '[]', '2026-11-11 08:43:54');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (57, 1, NULL, 'sync.pull', '[]', '2026-11-11 08:43:55');
INSERT INTO "audit_log" ("id", "user_id", "branch_id", "action", "details", "created_at") VALUES (58, 1, NULL, 'sync.auto', '[]', '2026-11-11 08:44:07');

-- Table: backup_logs
DROP TABLE IF EXISTS "backup_logs";
CREATE TABLE backup_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'local_saved',
  remote_url TEXT NULL,
  error_message TEXT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "backup_logs" ("id", "branch_id", "filename", "file_size", "status", "remote_url", "error_message", "created_at") VALUES (1, NULL, 'zeedat_backup_HQ_2026-11-11_141258.sql', 39904, 'local_saved', 'https://zeedat.vortexdigitallabs.org', 'Server responded with HTTP 404: {"error":"Route not found."}', '2026-11-11 08:42:59');
INSERT INTO "backup_logs" ("id", "branch_id", "filename", "file_size", "status", "remote_url", "error_message", "created_at") VALUES (2, NULL, 'zeedat_backup_HQ_2026-11-11_141303.sql', 41272, 'local_saved', 'https://zeedat.vortexdigitallabs.org', 'Server responded with HTTP 404: {"error":"Route not found."}', '2026-11-11 08:43:05');
INSERT INTO "backup_logs" ("id", "branch_id", "filename", "file_size", "status", "remote_url", "error_message", "created_at") VALUES (3, NULL, 'zeedat_backup_HQ_2026-11-11_141319.sql', 42639, 'local_saved', 'https://zeedat.vortexdigitallabs.org', 'Server responded with HTTP 404: {"error":"Route not found."}', '2026-11-11 08:43:20');
INSERT INTO "backup_logs" ("id", "branch_id", "filename", "file_size", "status", "remote_url", "error_message", "created_at") VALUES (4, NULL, 'zeedat_backup_HQ_2026-11-11_141328.sql', 44006, 'local_saved', 'https://zeedat.vortexdigitallabs.org', 'Server responded with HTTP 404: {"error":"Route not found."}', '2026-11-11 08:43:30');
INSERT INTO "backup_logs" ("id", "branch_id", "filename", "file_size", "status", "remote_url", "error_message", "created_at") VALUES (5, NULL, 'zeedat_backup_HQ_2026-11-11_141347.sql', 45373, 'local_saved', 'https://zeedat.vortexdigitallabs.org', 'Server responded with HTTP 404: {"error":"Route not found."}', '2026-11-11 08:43:49');
INSERT INTO "backup_logs" ("id", "branch_id", "filename", "file_size", "status", "remote_url", "error_message", "created_at") VALUES (6, NULL, 'zeedat_backup_HQ_2026-11-11_141406.sql', 49040, 'local_saved', 'https://zeedat.vortexdigitallabs.org', 'Server responded with HTTP 404: {"error":"Route not found."}', '2026-11-11 08:44:07');

-- Table: barcode_print_logs
DROP TABLE IF EXISTS "barcode_print_logs";
CREATE TABLE barcode_print_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    branch_id INTEGER NOT NULL DEFAULT 0,
                    product_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL DEFAULT 1,
                    copies INTEGER NOT NULL DEFAULT 1,
                    price INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

-- Table: branches
DROP TABLE IF EXISTS "branches";
CREATE TABLE branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
, phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '');

INSERT INTO "branches" ("id", "name", "phone", "address") VALUES (1, 'Battaramulla Mobile', '', '');
INSERT INTO "branches" ("id", "name", "phone", "address") VALUES (2, 'Battaramulla PC', '', '');
INSERT INTO "branches" ("id", "name", "phone", "address") VALUES (3, 'Malabe', '', '');

-- Table: cash_movements
DROP TABLE IF EXISTS "cash_movements";
CREATE TABLE cash_movements (
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

-- Table: cloud_sync_queue
DROP TABLE IF EXISTS "cloud_sync_queue";
CREATE TABLE cloud_sync_queue (
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

-- Table: customers
DROP TABLE IF EXISTS "customers";
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, sync_uuid TEXT NULL,
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Table: cycles
DROP TABLE IF EXISTS "cycles";
CREATE TABLE cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  closed_at TEXT NULL,
  UNIQUE(branch_id, business_date),
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);

-- Table: drafts
DROP TABLE IF EXISTS "drafts";
CREATE TABLE drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Table: drawers
DROP TABLE IF EXISTS "drawers";
CREATE TABLE drawers (
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

-- Table: exchanges
DROP TABLE IF EXISTS "exchanges";
CREATE TABLE exchanges (
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

-- Table: payments
DROP TABLE IF EXISTS "payments";
CREATE TABLE payments (
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

-- Table: products
DROP TABLE IF EXISTS "products";
CREATE TABLE products (
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
  synced INTEGER NOT NULL DEFAULT 1
, active INTEGER NOT NULL DEFAULT 1, commission_type TEXT NOT NULL DEFAULT 'fixed', commission_value INTEGER NOT NULL DEFAULT 0, sync_uuid TEXT NULL);

-- Table: purchases
DROP TABLE IF EXISTS "purchases";
CREATE TABLE purchases (
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

-- Table: repairs
DROP TABLE IF EXISTS "repairs";
CREATE TABLE repairs (
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
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Received',
  synced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, sync_uuid TEXT NULL,
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(technician_id) REFERENCES users(id)
);

-- Table: requests
DROP TABLE IF EXISTS "requests";
CREATE TABLE requests (
  user_id INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response TEXT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, request_id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '4491d5d5104955c015f3f3566f523a03', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:33:29');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'c8b440d1bf6a9d9e9b185924cf0b3657', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:33:47');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '525613e64a4927ff7e3ed9d4391a0800', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:34:08');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'ff9c978fdea47f03acd0b4a88fcc4c1c', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:34:33');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'b820e9676409974029bd6c47ac54f7a4', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:34:43');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '615da1360d1f799f3587c970ace674ec', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:34:58');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'f44a217f6d1bb205eefd942b7b1035fb', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:35:23');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'd229ff5aa08e65ed62a74adaee0f1fcc', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:35:43');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '985cc09e35ce689e2754c5cda18d9c3c', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:35:48');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'f1ebb53d0cbd2320ba19eff2eaee86b5', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:36:13');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'ade0bef253f1922204311f8ca87b38ca', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:36:27');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'f616f5de94f067911fdecbbfffc2442c', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:36:35');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '40557b8b10e25df86d5ae02e620d5c88', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:36:43');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '0e39ac60f7f1430e7599ccd2ffddfaf3', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:36:57');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '88e22f78471801dd28a4bf116b9e0241', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:37:00');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '9fdb3132aceb48d922d9ccda2fb5b17f', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:37:23');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'a0e173d0c2dee9946b4d04ac8ecb4982', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:37:25');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '3e87d556c812ca77aac81458ba9f95d8', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:37:43');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '957ee61064cbd2976ecdb6a69ed5619b', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:37:50');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '798d8f8985328aa3c162f5c329569871', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:37:57');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'dd48acd7aad0f7a61fd8b18b5002e8dc', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:38:15');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'fc8429aaef410de5048404622206b5ba', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:38:23');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '29c26012df03d0e09acc1c918a1ea10a', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:38:40');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'd396622ceb67bbf57673d4253d594923', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:38:43');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '023266e21f93620a7fe80de88e2eb657', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:38:57');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '44dede0ce515e7f2f1632882bd4dba49', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:39:05');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '13d650204139c6995a674a53e66a1e2a', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:39:23');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '47b816c8e1765b89fb886b72cca01444', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:39:30');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'e333c636c9e07265825f10535d48609b', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:39:43');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '116102ab9a36c67b7e5b5a455466fde9', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:39:55');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '83ba0ac515e3324ae8783c462f79e692', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:39:57');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '651f5cfde7deef86be26d404ac4ddde4', '4750f2ae4c31bc6cf66b70a66021bcdcb9fee9622f884890a85ed1bddc8c64ca', '{"success":false,"error":"Central cloud URL is not configured in settings."}', '2026-11-11 08:40:11');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'ddcacf0191726a2a3b145081e55fe1f9', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:40:20');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'ea66423b1a7d497e9edcaa428b3ecbeb', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:40:23');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '3702a381ebeb944467bf865ff92c362e', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:40:45');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '10e00a1315d5a3fafce7cbd60929be6e', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:40:57');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'ba10ab0fb5699fa0e3aa8a22941ab6a8', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:40:57');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '88958a2ebfe03aa609a62ff9a05061b5', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:41:10');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '4eba643b1a5f3002cad48c0b6cc45513', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:41:23');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '4eb80c759c12a67e6f3089ca8679975c', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:41:35');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '0f9bdc52bc580642f6815ac28890026b', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:41:57');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'bb088832ace81e97f42c7b12109aba64', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:41:57');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '41b1974e94f8612b9af141025fdaf2e2', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:42:00');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'a61e547ef95f71e61e6d43c3170e5e57', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:42:23');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'aa8d5012024dbeaee22e7672a3a2cbdb', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:42:25');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '0fa5433d8649c425a6be14e288fdeb43', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":false,"reason":"not_configured"}', '2026-11-11 08:42:50');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'f686123016c4409d88cc5433d263ff6e', 'f4725b2a1c914016f9e3bb137437bf660424097e480802bde691a533516fc47f', '{"driver":"sqlite","is_online":true,"cloud_backup_url":"https:\/\/zeedat.vortexdigitallabs.org","cloud_api_key":"","auto_sync_enabled":true,"sync_interval_minutes":15,"last_synced_at":null,"last_backup":null,"total_backups_created":0,"unsynced_count":0,"pending_backups":0,"free_disk_space_mb":14935.45,"local_storage_dir":"C:\\xampp\\htdocs\\Zeedat-ERP\\api\\backups"}', '2026-11-11 08:42:56');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'd8c74d4de20ff2fc259a9a3c72873002', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":true,"is_online":true,"push":{"success":true,"synced_sales":0,"synced_customers":0,"synced_repairs":0,"synced_count":0,"message":"All local data is already up to date with the cloud."},"pull":{"success":false,"error":"HTTP 404: {\"error\":\"Route not found.\"}"},"pending_backups":{"uploaded":0},"backup":{"id":1,"filename":"zeedat_backup_HQ_2026-11-11_141258.sql","file_size":39904,"status":"local_saved","is_online":true,"remote_url":"https:\/\/zeedat.vortexdigitallabs.org","message":"Backup saved locally on this machine.","error":"Server responded with HTTP 404: {\"error\":\"Route not found.\"}","created_at":"2026-11-11 14:12:59"}}', '2026-11-11 08:42:59');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '7b320094f3e0eeaeaea6ac5413a68fb1', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":true,"is_online":true,"push":{"success":true,"synced_sales":0,"synced_customers":0,"synced_repairs":0,"synced_count":0,"message":"All local data is already up to date with the cloud."},"pull":{"success":false,"error":"HTTP 404: {\"error\":\"Route not found.\"}"},"pending_backups":{"uploaded":0},"backup":{"id":2,"filename":"zeedat_backup_HQ_2026-11-11_141303.sql","file_size":41272,"status":"local_saved","is_online":true,"remote_url":"https:\/\/zeedat.vortexdigitallabs.org","message":"Backup saved locally on this machine.","error":"Server responded with HTTP 404: {\"error\":\"Route not found.\"}","created_at":"2026-11-11 14:13:05"}}', '2026-11-11 08:43:05');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '50d33024620b41ef00900e301f8fecbc', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":true,"is_online":true,"push":{"success":true,"synced_sales":0,"synced_customers":0,"synced_repairs":0,"synced_count":0,"message":"All local data is already up to date with the cloud."},"pull":{"success":false,"error":"HTTP 404: {\"error\":\"Route not found.\"}"},"pending_backups":{"uploaded":0},"backup":{"id":3,"filename":"zeedat_backup_HQ_2026-11-11_141319.sql","file_size":42639,"status":"local_saved","is_online":true,"remote_url":"https:\/\/zeedat.vortexdigitallabs.org","message":"Backup saved locally on this machine.","error":"Server responded with HTTP 404: {\"error\":\"Route not found.\"}","created_at":"2026-11-11 14:13:20"}}', '2026-11-11 08:43:20');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '270acc5ac82ddb5fc76d5365ddfaf815', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":true,"is_online":true,"push":{"success":true,"synced_sales":0,"synced_customers":0,"synced_repairs":0,"synced_count":0,"message":"All local data is already up to date with the cloud."},"pull":{"success":false,"error":"HTTP 404: {\"error\":\"Route not found.\"}"},"pending_backups":{"uploaded":0},"backup":{"id":4,"filename":"zeedat_backup_HQ_2026-11-11_141328.sql","file_size":44006,"status":"local_saved","is_online":true,"remote_url":"https:\/\/zeedat.vortexdigitallabs.org","message":"Backup saved locally on this machine.","error":"Server responded with HTTP 404: {\"error\":\"Route not found.\"}","created_at":"2026-11-11 14:13:30"}}', '2026-11-11 08:43:30');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'c0840ca777fae93c5c5a7fb7697dcf4a', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":true,"is_online":true,"push":{"success":true,"synced_sales":0,"synced_customers":0,"synced_repairs":0,"synced_count":0,"message":"All local data is already up to date with the cloud."},"pull":{"success":false,"error":"HTTP 404: {\"error\":\"Route not found.\"}"},"pending_backups":{"uploaded":0},"backup":{"id":5,"filename":"zeedat_backup_HQ_2026-11-11_141347.sql","file_size":45373,"status":"local_saved","is_online":true,"remote_url":"https:\/\/zeedat.vortexdigitallabs.org","message":"Backup saved locally on this machine.","error":"Server responded with HTTP 404: {\"error\":\"Route not found.\"}","created_at":"2026-11-11 14:13:49"}}', '2026-11-11 08:43:49');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'e39ae1456aa6bfe0c3e00114a479ef31', 'f4725b2a1c914016f9e3bb137437bf660424097e480802bde691a533516fc47f', '{"driver":"sqlite","is_online":true,"cloud_backup_url":"https:\/\/zeedat.vortexdigitallabs.org","cloud_api_key":"","auto_sync_enabled":true,"sync_interval_minutes":5,"last_synced_at":null,"last_backup":{"id":5,"branch_id":null,"filename":"zeedat_backup_HQ_2026-11-11_141347.sql","file_size":45373,"status":"local_saved","remote_url":"https:\/\/zeedat.vortexdigitallabs.org","error_message":"Server responded with HTTP 404: {\"error\":\"Route not found.\"}","created_at":"2026-11-11 08:43:49"},"total_backups_created":5,"unsynced_count":0,"pending_backups":5,"free_disk_space_mb":14940.8,"local_storage_dir":"C:\\xampp\\htdocs\\Zeedat-ERP\\api\\backups"}', '2026-11-11 08:43:49');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, 'b0c0dbbbe83bb43e9925d221fad43c65', '4750f2ae4c31bc6cf66b70a66021bcdcb9fee9622f884890a85ed1bddc8c64ca', '{"success":true,"synced_sales":0,"synced_customers":0,"synced_repairs":0,"synced_count":0,"message":"All local data is already up to date with the cloud."}', '2026-11-11 08:43:54');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '6456aaeeef91c8e1f50257ec917006ec', 'b39a0e3ed7f439d4ca3d5eec3574a02564cca89b1c9773e41c2497a7258cea1b', '{"success":false,"error":"HTTP 404: {\"error\":\"Route not found.\"}"}', '2026-11-11 08:43:55');
INSERT INTO "requests" ("user_id", "request_id", "fingerprint", "response", "created_at") VALUES (1, '68b086389496df321f2cc8df4a911536', 'cd6836b2535130d4218cd4fce89fdecc1971d230112e4a0ac67bbb2da8d8b859', '{"ran":true,"is_online":true,"push":{"success":true,"synced_sales":0,"synced_customers":0,"synced_repairs":0,"synced_count":0,"message":"All local data is already up to date with the cloud."},"pull":{"success":false,"error":"HTTP 404: {\"error\":\"Route not found.\"}"},"pending_backups":{"uploaded":0},"backup":{"id":6,"filename":"zeedat_backup_HQ_2026-11-11_141406.sql","file_size":49040,"status":"local_saved","is_online":true,"remote_url":"https:\/\/zeedat.vortexdigitallabs.org","message":"Backup saved locally on this machine.","error":"Server responded with HTTP 404: {\"error\":\"Route not found.\"}","created_at":"2026-11-11 14:14:07"}}', '2026-11-11 08:44:07');

-- Table: returns_log
DROP TABLE IF EXISTS "returns_log";
CREATE TABLE returns_log (
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

-- Table: role_permissions
DROP TABLE IF EXISTS "role_permissions";
CREATE TABLE role_permissions (
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY(role, permission)
);

INSERT INTO "role_permissions" ("role", "permission") VALUES ('cashier', 'customers');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('cashier', 'drawer');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('cashier', 'inventory');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('cashier', 'pos');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('cashier', 'repairs');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('cashier', 'returns');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('cashier', 'sales');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'customers');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'dashboard');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'drawer');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'inventory');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'pos');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'purchases');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'repairs');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'reports');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'returns');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'sales');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('manager', 'transfers');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'customers');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'dashboard');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'drawer');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'inventory');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'pos');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'purchases');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'repairs');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'reports');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'returns');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'sales');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'settings');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'staff');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('owner', 'transfers');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('stock', 'inventory');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('stock', 'purchases');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('stock', 'transfers');
INSERT INTO "role_permissions" ("role", "permission") VALUES ('technician', 'repairs');

-- Table: sale_items
DROP TABLE IF EXISTS "sale_items";
CREATE TABLE sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  unit_id INTEGER NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL,
  total INTEGER NOT NULL,
  refunded_qty INTEGER NOT NULL DEFAULT 0, commission_amount INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(sale_id) REFERENCES sales(id),
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(unit_id) REFERENCES units(id)
);

-- Table: sales
DROP TABLE IF EXISTS "sales";
CREATE TABLE sales (
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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, sync_uuid TEXT NULL,
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(drawer_id) REFERENCES drawers(id)
);

-- Table: settings
DROP TABLE IF EXISTS "settings";
CREATE TABLE settings (
  id INTEGER PRIMARY KEY,
  tax_bps INTEGER NOT NULL DEFAULT 0,
  shop_name TEXT NOT NULL DEFAULT 'ZEEDAT POS',
  paper_width TEXT NOT NULL DEFAULT '80',
  cloud_backup_url TEXT NOT NULL DEFAULT '',
  cloud_api_key TEXT NOT NULL DEFAULT '',
  auto_sync_enabled INTEGER NOT NULL DEFAULT 1,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
  last_synced_at TEXT NULL
, shop_phone TEXT NOT NULL DEFAULT '', shop_address TEXT NOT NULL DEFAULT '', shop_email TEXT NOT NULL DEFAULT '', receipt_footer TEXT NOT NULL DEFAULT 'Thank you for your business! Please retain this receipt for warranty.', invoice_prefix TEXT NOT NULL DEFAULT 'INV-', auto_print INTEGER NOT NULL DEFAULT 1, show_tax_on_receipt INTEGER NOT NULL DEFAULT 1, label_printer_name TEXT NOT NULL DEFAULT '', label_width_mm INTEGER NOT NULL DEFAULT 50, label_height_mm INTEGER NOT NULL DEFAULT 30, label_across INTEGER NOT NULL DEFAULT 2, label_roll_mm INTEGER NOT NULL DEFAULT 106, label_show_digits INTEGER NOT NULL DEFAULT 1, delete_pin_hash TEXT NOT NULL DEFAULT '');

INSERT INTO "settings" ("id", "tax_bps", "shop_name", "paper_width", "cloud_backup_url", "cloud_api_key", "auto_sync_enabled", "sync_interval_minutes", "last_synced_at", "shop_phone", "shop_address", "shop_email", "receipt_footer", "invoice_prefix", "auto_print", "show_tax_on_receipt", "label_printer_name", "label_width_mm", "label_height_mm", "label_across", "label_roll_mm", "label_show_digits", "delete_pin_hash") VALUES (1, 0, 'ZEEDAT POS', '80', 'https://zeedat.vortexdigitallabs.org', '', 1, 5, NULL, '011 234 5678', 'Battaramulla, Sri Lanka', 'sales@zeedat.lk', 'Thank you for your business! Please retain this receipt for warranty.', 'INV-', 1, 1, '', 50, 30, 2, 106, 1, '$2y$10$v7Gz09skOnEMEDDeuk8bpuJMAuYzDvaEc7JbwAsDEgeM5BuJQYZya');

-- Table: stock
DROP TABLE IF EXISTS "stock";
CREATE TABLE stock (
  branch_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(branch_id, product_id),
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

-- Table: stock_movements
DROP TABLE IF EXISTS "stock_movements";
CREATE TABLE stock_movements (
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

-- Table: supplier_payments
DROP TABLE IF EXISTS "supplier_payments";
CREATE TABLE supplier_payments (
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

-- Table: suppliers
DROP TABLE IF EXISTS "suppliers";
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT ''
);

-- Table: transfers
DROP TABLE IF EXISTS "transfers";
CREATE TABLE transfers (
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

-- Table: units
DROP TABLE IF EXISTS "units";
CREATE TABLE units (
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

-- Table: user_permissions
DROP TABLE IF EXISTS "user_permissions";
CREATE TABLE user_permissions (
            user_id INT NOT NULL,
            permission VARCHAR(60) NOT NULL,
            allowed TINYINT(1) NOT NULL DEFAULT 1,
            PRIMARY KEY(user_id, permission)
        );

-- Table: users
DROP TABLE IF EXISTS "users";
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','manager','cashier','technician','stock')),
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

INSERT INTO "users" ("id", "branch_id", "name", "email", "password_hash", "role", "active") VALUES (1, NULL, 'Owner', 'owner@zeedat.local', '$2y$10$JQeoLESbPBcyzPog4exr5ufAkS2e9dIpKt3fhocminIKeIGIFGmeS', 'owner', 1);
INSERT INTO "users" ("id", "branch_id", "name", "email", "password_hash", "role", "active") VALUES (2, 1, 'Kasun Fernando', 'manager.colombo@zeedat.lk', '$2y$10$z/C3L5LeNcDyMVNRVsYTru2RzRs7d0QbSWP3QGNMwRTyZvZqysd8u', 'manager', 1);
INSERT INTO "users" ("id", "branch_id", "name", "email", "password_hash", "role", "active") VALUES (3, 1, 'Dilani Silva', 'cashier.colombo@zeedat.lk', '$2y$10$z/C3L5LeNcDyMVNRVsYTru2RzRs7d0QbSWP3QGNMwRTyZvZqysd8u', 'cashier', 1);
INSERT INTO "users" ("id", "branch_id", "name", "email", "password_hash", "role", "active") VALUES (4, 1, 'Kamal Jayawardena', 'tech.colombo@zeedat.lk', '$2y$10$z/C3L5LeNcDyMVNRVsYTru2RzRs7d0QbSWP3QGNMwRTyZvZqysd8u', 'technician', 1);
INSERT INTO "users" ("id", "branch_id", "name", "email", "password_hash", "role", "active") VALUES (5, 2, 'Nimal Perera', 'manager.kandy@zeedat.lk', '$2y$10$z/C3L5LeNcDyMVNRVsYTru2RzRs7d0QbSWP3QGNMwRTyZvZqysd8u', 'manager', 1);
INSERT INTO "users" ("id", "branch_id", "name", "email", "password_hash", "role", "active") VALUES (6, 2, 'Sachini Wickrama', 'cashier.kandy@zeedat.lk', '$2y$10$z/C3L5LeNcDyMVNRVsYTru2RzRs7d0QbSWP3QGNMwRTyZvZqysd8u', 'cashier', 1);

COMMIT;
PRAGMA foreign_keys = ON;
-- Backup completed at: 2026-11-11 14:14:16
