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
  `);
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
};
