const { getDb } = require("./db");

function createArchive(giftId, giftData) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM memorial_archives WHERE gift_id = ?")
    .get(giftId);
  if (existing) return existing;

  const deliveryYear = giftData.delivery_date
    ? new Date(giftData.delivery_date).getFullYear()
    : new Date().getFullYear();

  const stmt = db.prepare(`
    INSERT INTO memorial_archives (gift_id, recipient_country, year, theme_symbolism,
      diplomatic_occasion, body_color, chinese_elements, recipient_culture_elements,
      delivery_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    giftId,
    giftData.recipient_country,
    deliveryYear,
    giftData.theme_symbolism || null,
    giftData.diplomatic_occasion,
    giftData.body_color,
    giftData.chinese_elements,
    giftData.recipient_culture_elements,
    giftData.delivery_date || null,
    giftData.notes || null,
  );
  return db
    .prepare("SELECT * FROM memorial_archives WHERE gift_id = ?")
    .get(giftId);
}

function searchArchives(filters = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (filters.recipient_country) {
    conditions.push("recipient_country LIKE ?");
    params.push(`%${filters.recipient_country}%`);
  }
  if (filters.year) {
    conditions.push("year = ?");
    params.push(Number(filters.year));
  }
  if (filters.theme_symbolism) {
    conditions.push("theme_symbolism LIKE ?");
    params.push(`%${filters.theme_symbolism}%`);
  }
  if (filters.keyword) {
    conditions.push(
      "(recipient_country LIKE ? OR theme_symbolism LIKE ? OR diplomatic_occasion LIKE ? OR chinese_elements LIKE ? OR recipient_culture_elements LIKE ?)",
    );
    const kw = `%${filters.keyword}%`;
    params.push(kw, kw, kw, kw, kw);
  }

  const where =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  return db
    .prepare(
      `SELECT * FROM memorial_archives ${where} ORDER BY year DESC, archive_date DESC`,
    )
    .all(...params);
}

function getArchiveByGiftId(giftId) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM memorial_archives WHERE gift_id = ?")
    .get(giftId);
}

module.exports = {
  createArchive,
  searchArchives,
  getArchiveByGiftId,
};
