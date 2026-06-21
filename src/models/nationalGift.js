const { getDb, STATUS_DRAFT, STATUS_LIST } = require("../models/db");

function generateId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `GL-${y}${m}${d}-${seq}`;
}

function listGifts(filters = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (filters.status && STATUS_LIST.includes(filters.status)) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters.recipient_country) {
    conditions.push("recipient_country LIKE ?");
    params.push(`%${filters.recipient_country}%`);
  }
  if (filters.year) {
    conditions.push("strftime('%Y', created_at) = ?");
    params.push(filters.year);
  }
  if (filters.keyword) {
    conditions.push(
      "(title LIKE ? OR diplomatic_occasion LIKE ? OR theme_symbolism LIKE ?)",
    );
    const kw = `%${filters.keyword}%`;
    params.push(kw, kw, kw);
  }

  const where =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const gifts = db
    .prepare(`SELECT * FROM national_gifts ${where} ORDER BY created_at DESC`)
    .all(...params);
  return gifts;
}

function getGiftById(id) {
  const db = getDb();
  const gift = db.prepare("SELECT * FROM national_gifts WHERE id = ?").get(id);
  return gift;
}

function createGift(data) {
  const db = getDb();
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO national_gifts (id, title, recipient_country, recipient_institution,
      diplomatic_occasion, delivery_date, body_color, chinese_elements,
      recipient_culture_elements, theme_symbolism, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.title || "",
    data.recipient_country,
    data.recipient_institution || null,
    data.diplomatic_occasion,
    data.delivery_date || null,
    data.body_color,
    data.chinese_elements,
    data.recipient_culture_elements,
    data.theme_symbolism || null,
    STATUS_DRAFT,
    data.notes || null,
  );
  return getGiftById(id);
}

function updateGift(id, data) {
  const db = getDb();
  const existing = getGiftById(id);
  if (!existing) return null;

  const fields = [];
  const params = [];

  const updatable = [
    "title",
    "recipient_country",
    "recipient_institution",
    "diplomatic_occasion",
    "delivery_date",
    "body_color",
    "chinese_elements",
    "recipient_culture_elements",
    "theme_symbolism",
    "notes",
  ];

  for (const field of updatable) {
    if (data[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(data[field]);
    }
  }

  if (fields.length === 0) return existing;

  fields.push("updated_at = datetime('now', 'localtime')");
  params.push(id);

  db.prepare(`UPDATE national_gifts SET ${fields.join(", ")} WHERE id = ?`).run(
    ...params,
  );
  return getGiftById(id);
}

function updateGiftStatus(id, status, extraFields = {}) {
  const db = getDb();
  const fields = ["status = ?", "updated_at = datetime('now', 'localtime')"];
  const params = [status];

  for (const [key, value] of Object.entries(extraFields)) {
    fields.push(`${key} = ?`);
    params.push(value);
  }

  params.push(id);
  db.prepare(`UPDATE national_gifts SET ${fields.join(", ")} WHERE id = ?`).run(
    ...params,
  );
  return getGiftById(id);
}

function incrementDesignVersion(id) {
  const db = getDb();
  const existing = getGiftById(id);
  if (!existing) return null;
  db.prepare(
    `UPDATE national_gifts SET design_version = design_version + 1, updated_at = datetime('now', 'localtime') WHERE id = ?`,
  ).run(id);
  return getGiftById(id);
}

function deleteGift(id) {
  const db = getDb();
  const existing = getGiftById(id);
  if (!existing) return false;
  db.prepare("DELETE FROM craft_items WHERE gift_id = ?").run(id);
  db.prepare("DELETE FROM audit_logs WHERE gift_id = ?").run(id);
  db.prepare("DELETE FROM memorial_archives WHERE gift_id = ?").run(id);
  db.prepare("DELETE FROM national_gifts WHERE id = ?").run(id);
  return true;
}

module.exports = {
  listGifts,
  getGiftById,
  createGift,
  updateGift,
  updateGiftStatus,
  incrementDesignVersion,
  deleteGift,
};
