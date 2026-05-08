-- ============================================================
--  IT & DS Preventive Maintenance & Inventory Tracker
--  MODULE 1 — Asset & Inventory Master (Core Registry)
--  Schema Version: 1.0
--  Compatible: MySQL 8.0+
--  NOTE: Designed to be reused/extended by Modules 2–6
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- ============================================================
-- LOOKUP / REFERENCE TABLES (shared across all modules)
-- ============================================================

CREATE TABLE IF NOT EXISTS `categories` (
    `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`        VARCHAR(100) NOT NULL UNIQUE COMMENT 'Laptop, Desktop, Printer, Network, Server, UPS, etc.',
    `description` TEXT,
    `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
    `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `departments` (
    `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`        VARCHAR(150) NOT NULL UNIQUE,
    `cost_center` VARCHAR(50),
    `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
    `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sites` (
    `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`        VARCHAR(150) NOT NULL,
    `address`     TEXT,
    `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
    `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `locations` (
    `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `site_id`     INT UNSIGNED NOT NULL,
    `name`        VARCHAR(150) NOT NULL COMMENT 'Room / Floor / Rack / Storeroom',
    `description` TEXT,
    `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
    `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vendors` (
    `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`          VARCHAR(200) NOT NULL,
    `contact_name`  VARCHAR(150),
    `email`         VARCHAR(200),
    `phone`         VARCHAR(50),
    `address`       TEXT,
    `sla_notes`     TEXT,
    `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
    `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
    `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `employee_id`   VARCHAR(50) UNIQUE,
    `full_name`     VARCHAR(200) NOT NULL,
    `email`         VARCHAR(200) UNIQUE NOT NULL,
    `phone`         VARCHAR(50),
    `department_id` INT UNSIGNED,
    `role`          ENUM('admin','technician','manager','user') NOT NULL DEFAULT 'user',
    `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
    `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 1.1 SERIALIZED ASSET MASTER
-- ============================================================

CREATE TABLE IF NOT EXISTS `assets` (
    `id`                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `asset_tag`           VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. IT-2024-0001',
    `serial_number`       VARCHAR(200) UNIQUE,
    `barcode`             VARCHAR(200) UNIQUE COMMENT 'QR or barcode value',
    `category_id`         INT UNSIGNED NOT NULL,
    `make`                VARCHAR(100) COMMENT 'Brand / Manufacturer',
    `model`               VARCHAR(150),
    `cpu`                 VARCHAR(150),
    `ram`                 VARCHAR(50)  COMMENT 'e.g. 16GB DDR4',
    `storage`             VARCHAR(150) COMMENT 'e.g. 512GB SSD',
    `os`                  VARCHAR(150) COMMENT 'Operating System + version',
    `firmware_version`    VARCHAR(100),
    -- Purchase info
    `vendor_id`           INT UNSIGNED,
    `po_number`           VARCHAR(100),
    `invoice_number`      VARCHAR(100),
    `purchase_cost`       DECIMAL(12,2),
    `date_acquired`       DATE,
    -- Warranty / SLA
    `warranty_start`      DATE,
    `warranty_end`        DATE,
    `sla_tier`            VARCHAR(50)  COMMENT 'e.g. Gold, Silver, NBD',
    `support_contract_ref` VARCHAR(150),
    -- Status & assignment
    `status`              ENUM('In-Use','In-Stock','Under Repair','Retired','Disposed','Lost') NOT NULL DEFAULT 'In-Stock',
    `assigned_user_id`    INT UNSIGNED,
    `department_id`       INT UNSIGNED,
    `location_id`         INT UNSIGNED,
    `cost_center`         VARCHAR(100),
    -- Lifecycle / depreciation (used by Module 5/Finance)
    `depreciation_method` ENUM('Straight-Line','Declining Balance','None') DEFAULT 'None',
    `useful_life_years`   TINYINT UNSIGNED,
    `salvage_value`       DECIMAL(12,2),
    -- Parent/child
    `parent_asset_id`     INT UNSIGNED COMMENT 'e.g. HDD belongs to Server',
    `installed_at`        VARCHAR(200) COMMENT 'Free-text topology note',
    `connected_to`        VARCHAR(200) COMMENT 'Free-text topology note',
    -- Meta
    `notes`               TEXT,
    `is_active`           TINYINT(1) NOT NULL DEFAULT 1,
    `created_by`          INT UNSIGNED,
    `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- Foreign keys
    FOREIGN KEY (`category_id`)      REFERENCES `categories`(`id`) ON DELETE RESTRICT,
    FOREIGN KEY (`vendor_id`)        REFERENCES `vendors`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`department_id`)    REFERENCES `departments`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`location_id`)      REFERENCES `locations`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`parent_asset_id`)  REFERENCES `assets`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`created_by`)       REFERENCES `users`(`id`) ON DELETE SET NULL,
    INDEX `idx_asset_status`   (`status`),
    INDEX `idx_asset_category` (`category_id`),
    INDEX `idx_asset_location` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ASSET LIFECYCLE ACTIONS (Assign / Transfer / Retire / Dispose)
-- Reused by Module 3 (Work Orders) and Module 5 (Lifecycle)
-- ============================================================

CREATE TABLE IF NOT EXISTS `asset_lifecycle_log` (
    `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `asset_id`       INT UNSIGNED NOT NULL,
    `action_type`    ENUM('Assigned','Transferred','CheckedOut','CheckedIn','Retired','Disposed','Lost','Found','StatusChange') NOT NULL,
    `from_user_id`   INT UNSIGNED,
    `to_user_id`     INT UNSIGNED,
    `from_location_id` INT UNSIGNED,
    `to_location_id`   INT UNSIGNED,
    `from_status`    VARCHAR(50),
    `to_status`      VARCHAR(50),
    `reason`         TEXT,
    `approved_by`    INT UNSIGNED COMMENT 'User who signed off',
    `signoff_note`   TEXT,
    `performed_by`   INT UNSIGNED NOT NULL,
    `performed_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`asset_id`)         REFERENCES `assets`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`from_user_id`)     REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`to_user_id`)       REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`from_location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`to_location_id`)   REFERENCES `locations`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`approved_by`)      REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`performed_by`)     REFERENCES `users`(`id`) ON DELETE RESTRICT,
    INDEX `idx_lifecycle_asset`  (`asset_id`),
    INDEX `idx_lifecycle_action` (`action_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Asset check-out log (shared assets)
CREATE TABLE IF NOT EXISTS `asset_checkouts` (
    `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `asset_id`        INT UNSIGNED NOT NULL,
    `checked_out_by`  INT UNSIGNED NOT NULL,
    `checked_out_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `expected_return` DATETIME,
    `checked_in_at`   DATETIME,
    `checked_in_by`   INT UNSIGNED,
    `notes`           TEXT,
    FOREIGN KEY (`asset_id`)        REFERENCES `assets`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`checked_out_by`)  REFERENCES `users`(`id`) ON DELETE RESTRICT,
    FOREIGN KEY (`checked_in_by`)   REFERENCES `users`(`id`) ON DELETE SET NULL,
    INDEX `idx_checkout_asset` (`asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Asset attachments (invoices, photos, manuals, warranty PDFs)
CREATE TABLE IF NOT EXISTS `asset_attachments` (
    `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `asset_id`     INT UNSIGNED NOT NULL,
    `file_name`    VARCHAR(255) NOT NULL,
    `file_path`    VARCHAR(500) NOT NULL,
    `file_type`    VARCHAR(100) COMMENT 'MIME type',
    `file_size`    INT UNSIGNED COMMENT 'bytes',
    `label`        VARCHAR(150) COMMENT 'Invoice, Photo, Manual, Warranty, etc.',
    `uploaded_by`  INT UNSIGNED,
    `uploaded_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`asset_id`)    REFERENCES `assets`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 1.2 CONSUMABLES INVENTORY (Non-Serialized)
-- ============================================================

CREATE TABLE IF NOT EXISTS `stock_items` (
    `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `item_code`        VARCHAR(100) NOT NULL UNIQUE,
    `name`             VARCHAR(200) NOT NULL,
    `description`      TEXT,
    `category_id`      INT UNSIGNED,
    `unit_of_measure`  VARCHAR(50)  NOT NULL DEFAULT 'pcs' COMMENT 'pcs, box, ream, liter, etc.',
    `compatible_models` TEXT        COMMENT 'Comma-separated or JSON list of compatible asset models',
    `has_expiry`       TINYINT(1)  NOT NULL DEFAULT 0,
    `unit_cost`        DECIMAL(12,2),
    `is_active`        TINYINT(1)  NOT NULL DEFAULT 1,
    `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock levels per location
CREATE TABLE IF NOT EXISTS `stock_levels` (
    `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `item_id`        INT UNSIGNED NOT NULL,
    `location_id`    INT UNSIGNED NOT NULL,
    `quantity_on_hand` DECIMAL(10,3) NOT NULL DEFAULT 0,
    `min_level`      DECIMAL(10,3) NOT NULL DEFAULT 0 COMMENT 'Reorder alert threshold',
    `max_level`      DECIMAL(10,3) COMMENT 'Max stock ceiling',
    `reorder_point`  DECIMAL(10,3) COMMENT 'Trigger point for auto replenishment',
    `lead_time_days` SMALLINT UNSIGNED COMMENT 'Days to receive stock after order',
    `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_item_location` (`item_id`, `location_id`),
    FOREIGN KEY (`item_id`)     REFERENCES `stock_items`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Batch / lot tracking (optional; for batteries, toner, etc.)
CREATE TABLE IF NOT EXISTS `stock_batches` (
    `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `item_id`        INT UNSIGNED NOT NULL,
    `location_id`    INT UNSIGNED NOT NULL,
    `batch_number`   VARCHAR(100),
    `lot_number`     VARCHAR(100),
    `expiry_date`    DATE,
    `quantity`       DECIMAL(10,3) NOT NULL DEFAULT 0,
    `received_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`item_id`)     REFERENCES `stock_items`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stock transactions ledger (GRN / Issue / Transfer / Adjustment)
-- Reused by Module 3 (Parts consumption) and Module 4 (Procurement)
CREATE TABLE IF NOT EXISTS `stock_transactions` (
    `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `item_id`          INT UNSIGNED NOT NULL,
    `transaction_type` ENUM('GRN','Issue','Transfer','Adjustment','CycleCountAdj') NOT NULL,
    `quantity`         DECIMAL(10,3) NOT NULL COMMENT 'Positive = in, Negative = out',
    `from_location_id` INT UNSIGNED,
    `to_location_id`   INT UNSIGNED,
    `batch_id`         INT UNSIGNED,
    `reference_type`   VARCHAR(50)  COMMENT 'PO / WorkOrder / Adjustment / etc.',
    `reference_id`     INT UNSIGNED COMMENT 'FK to PO, WO, etc. (loose reference)',
    `reason_code`      ENUM('Normal','Damage','Loss','AuditCorrection','ProjectAllocation','Return','Other') DEFAULT 'Normal',
    `notes`            TEXT,
    `performed_by`     INT UNSIGNED NOT NULL,
    `performed_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`item_id`)          REFERENCES `stock_items`(`id`) ON DELETE RESTRICT,
    FOREIGN KEY (`from_location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`to_location_id`)   REFERENCES `locations`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`batch_id`)         REFERENCES `stock_batches`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`performed_by`)     REFERENCES `users`(`id`) ON DELETE RESTRICT,
    INDEX `idx_txn_item`      (`item_id`),
    INDEX `idx_txn_type`      (`transaction_type`),
    INDEX `idx_txn_performed` (`performed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CYCLE COUNT (Physical Inventory)
-- ============================================================

CREATE TABLE IF NOT EXISTS `cycle_count_plans` (
    `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`         VARCHAR(200) NOT NULL,
    `location_id`  INT UNSIGNED,
    `planned_date` DATE NOT NULL,
    `status`       ENUM('Draft','In Progress','Pending Approval','Approved','Cancelled') NOT NULL DEFAULT 'Draft',
    `notes`        TEXT,
    `created_by`   INT UNSIGNED,
    `approved_by`  INT UNSIGNED,
    `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`created_by`)  REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cycle_count_entries` (
    `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `plan_id`         INT UNSIGNED NOT NULL,
    `item_id`         INT UNSIGNED NOT NULL,
    `location_id`     INT UNSIGNED NOT NULL,
    `system_qty`      DECIMAL(10,3) NOT NULL COMMENT 'Qty on hand at count start',
    `counted_qty`     DECIMAL(10,3),
    `variance`        DECIMAL(10,3) GENERATED ALWAYS AS (`counted_qty` - `system_qty`) STORED,
    `variance_reason` TEXT,
    `status`          ENUM('Pending','Counted','Approved','Rejected') NOT NULL DEFAULT 'Pending',
    `counted_by`      INT UNSIGNED,
    `counted_at`      DATETIME,
    `approved_by`     INT UNSIGNED,
    `approved_at`     DATETIME,
    FOREIGN KEY (`plan_id`)     REFERENCES `cycle_count_plans`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`item_id`)     REFERENCES `stock_items`(`id`) ON DELETE RESTRICT,
    FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT,
    FOREIGN KEY (`counted_by`)  REFERENCES `users`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED DATA — Categories (used across all modules)
-- ============================================================

INSERT IGNORE INTO `categories` (`name`, `description`) VALUES
('Laptop',          'Portable computing devices'),
('Desktop',         'Stationary workstation computers'),
('Printer',         'Printing and scanning devices'),
('Network',         'Switches, routers, access points, firewalls'),
('Server',          'On-premise physical servers'),
('UPS',             'Uninterruptible power supply units'),
('Monitor',         'Display monitors and screens'),
('Peripheral',      'Keyboards, mice, webcams, etc.'),
('Storage Device',  'External drives, NAS, SAN'),
('Mobile Device',   'Smartphones and tablets'),
('Projector',       'Presentation projectors'),
('Consumable',      'Non-serialized stock items (toner, paper, batteries)');

SET FOREIGN_KEY_CHECKS = 1;
