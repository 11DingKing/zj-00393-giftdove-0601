const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "..", "data", "national_gift.db");

let db;

function getDb() {
  if (!db) {
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

const STATUS_DRAFT = "方案中";
const STATUS_PENDING_REVIEW = "待审核";
const STATUS_IN_PRODUCTION = "制作中";
const STATUS_PENDING_DELIVERY = "待交付";
const STATUS_DELIVERED = "已交付";
const STATUS_ARCHIVED = "归档";

const STATUS_LIST = [
  STATUS_DRAFT,
  STATUS_PENDING_REVIEW,
  STATUS_IN_PRODUCTION,
  STATUS_PENDING_DELIVERY,
  STATUS_DELIVERED,
  STATUS_ARCHIVED,
];

const REVIEW_LEVELS = ["brand", "foreign_affairs", "craft"];
const REVIEW_LEVEL_NAMES = {
  brand: "品牌审核",
  foreign_affairs: "外事审核",
  craft: "工艺审核",
};

const CRAFT_TYPES = ["漆画", "云母", "金箔", "铭牌刻字"];

const CHANGE_TYPES = [
  "diplomatic_occasion",
  "delivery_date",
  "chinese_elements",
  "recipient_culture_elements",
  "theme_symbolism",
  "other",
];
const CHANGE_TYPE_NAMES = {
  diplomatic_occasion: "受赠场合变更",
  delivery_date: "交付时间调整",
  chinese_elements: "中华文化元素调整",
  recipient_culture_elements: "受赠方文化元素调整",
  theme_symbolism: "主题寓意调整",
  other: "其他变更",
};
const CHANGE_STATUS = ["pending", "approved", "implemented", "cancelled"];
const CHANGE_STATUS_NAMES = {
  pending: "待审批",
  approved: "审批通过",
  implemented: "已执行",
  cancelled: "已取消",
};

function initSchema() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS national_gifts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      recipient_country TEXT NOT NULL,
      recipient_institution TEXT,
      diplomatic_occasion TEXT NOT NULL,
      delivery_date TEXT,
      body_color TEXT NOT NULL,
      chinese_elements TEXT NOT NULL,
      recipient_culture_elements TEXT NOT NULL,
      theme_symbolism TEXT,
      status TEXT NOT NULL DEFAULT '${STATUS_DRAFT}',
      current_review_level TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      production_start_date TEXT,
      production_end_date TEXT,
      archived_at TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gift_id TEXT NOT NULL,
      review_level TEXT NOT NULL,
      action TEXT NOT NULL,
      reviewer TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (gift_id) REFERENCES national_gifts(id)
    );

    CREATE TABLE IF NOT EXISTS craft_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gift_id TEXT NOT NULL,
      craft_type TEXT NOT NULL,
      craftsman TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (gift_id) REFERENCES national_gifts(id)
    );

    CREATE TABLE IF NOT EXISTS memorial_archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gift_id TEXT NOT NULL UNIQUE,
      recipient_country TEXT NOT NULL,
      year INTEGER NOT NULL,
      theme_symbolism TEXT,
      diplomatic_occasion TEXT,
      body_color TEXT,
      chinese_elements TEXT,
      recipient_culture_elements TEXT,
      delivery_date TEXT,
      archive_date TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      notes TEXT,
      change_count INTEGER NOT NULL DEFAULT 0,
      symbolism_history TEXT,
      FOREIGN KEY (gift_id) REFERENCES national_gifts(id)
    );

    CREATE TABLE IF NOT EXISTS occasion_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gift_id TEXT NOT NULL,
      change_type TEXT NOT NULL,
      change_status TEXT NOT NULL DEFAULT 'pending',
      initiator TEXT,
      approver TEXT,
      old_diplomatic_occasion TEXT,
      old_delivery_date TEXT,
      old_chinese_elements TEXT,
      old_recipient_culture_elements TEXT,
      old_theme_symbolism TEXT,
      new_diplomatic_occasion TEXT,
      new_delivery_date TEXT,
      new_chinese_elements TEXT,
      new_recipient_culture_elements TEXT,
      new_theme_symbolism TEXT,
      symbolism_before TEXT,
      symbolism_after TEXT,
      craft_diff_description TEXT,
      delivery_risk TEXT,
      extra_delay_days INTEGER DEFAULT 0,
      reason TEXT,
      approve_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      approved_at TEXT,
      implemented_at TEXT,
      FOREIGN KEY (gift_id) REFERENCES national_gifts(id)
    );

    CREATE TABLE IF NOT EXISTS craft_reset_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_id INTEGER NOT NULL,
      gift_id TEXT NOT NULL,
      craft_type TEXT NOT NULL,
      craftsman TEXT,
      was_completed INTEGER NOT NULL DEFAULT 0,
      reset_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (change_id) REFERENCES occasion_changes(id),
      FOREIGN KEY (gift_id) REFERENCES national_gifts(id)
    );

    CREATE INDEX IF NOT EXISTS idx_gifts_status ON national_gifts(status);
    CREATE INDEX IF NOT EXISTS idx_gifts_country ON national_gifts(recipient_country);
    CREATE INDEX IF NOT EXISTS idx_gifts_created ON national_gifts(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_gift ON audit_logs(gift_id);
    CREATE INDEX IF NOT EXISTS idx_craft_gift ON craft_items(gift_id);
    CREATE INDEX IF NOT EXISTS idx_archive_country ON memorial_archives(recipient_country);
    CREATE INDEX IF NOT EXISTS idx_archive_year ON memorial_archives(year);
    CREATE INDEX IF NOT EXISTS idx_archive_theme ON memorial_archives(theme_symbolism);
    CREATE INDEX IF NOT EXISTS idx_change_gift ON occasion_changes(gift_id);
    CREATE INDEX IF NOT EXISTS idx_change_status ON occasion_changes(change_status);
    CREATE INDEX IF NOT EXISTS idx_craftreset_change ON craft_reset_logs(change_id);
    CREATE INDEX IF NOT EXISTS idx_craftreset_gift ON craft_reset_logs(gift_id);
  `);

  const cols = d.prepare("PRAGMA table_info(national_gifts)").all();
  const colNames = cols.map((c) => c.name);
  if (!colNames.includes("original_delivery_date")) {
    d.exec(`ALTER TABLE national_gifts ADD COLUMN original_delivery_date TEXT`);
  }
  if (!colNames.includes("has_occasion_change")) {
    d.exec(
      `ALTER TABLE national_gifts ADD COLUMN has_occasion_change INTEGER NOT NULL DEFAULT 0`,
    );
  }
  const archiveCols = d.prepare("PRAGMA table_info(memorial_archives)").all();
  const archiveColNames = archiveCols.map((c) => c.name);
  if (!archiveColNames.includes("change_count")) {
    d.exec(
      `ALTER TABLE memorial_archives ADD COLUMN change_count INTEGER NOT NULL DEFAULT 0`,
    );
  }
  if (!archiveColNames.includes("symbolism_history")) {
    d.exec(`ALTER TABLE memorial_archives ADD COLUMN symbolism_history TEXT`);
  }
}

module.exports = {
  getDb,
  initSchema,
  STATUS_DRAFT,
  STATUS_PENDING_REVIEW,
  STATUS_IN_PRODUCTION,
  STATUS_PENDING_DELIVERY,
  STATUS_DELIVERED,
  STATUS_ARCHIVED,
  STATUS_LIST,
  REVIEW_LEVELS,
  REVIEW_LEVEL_NAMES,
  CRAFT_TYPES,
  CHANGE_TYPES,
  CHANGE_TYPE_NAMES,
  CHANGE_STATUS,
  CHANGE_STATUS_NAMES,
};
