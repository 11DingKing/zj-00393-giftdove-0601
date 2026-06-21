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

function upsertArchiveDraft(giftId, giftData, changeHistory) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM memorial_archives WHERE gift_id = ?")
    .get(giftId);

  const deliveryYear = giftData.delivery_date
    ? new Date(giftData.delivery_date).getFullYear()
    : new Date().getFullYear();

  const historyText = buildSymbolismHistory(changeHistory, existing);
  const changeCount = Array.isArray(changeHistory)
    ? changeHistory.length
    : existing
      ? existing.change_count || 0
      : 0;

  if (existing) {
    db.prepare(
      `
      UPDATE memorial_archives
      SET recipient_country = ?, year = ?, theme_symbolism = ?,
          diplomatic_occasion = ?, body_color = ?, chinese_elements = ?,
          recipient_culture_elements = ?, delivery_date = ?, notes = ?,
          change_count = ?, symbolism_history = ?
      WHERE gift_id = ?
    `,
    ).run(
      giftData.recipient_country,
      deliveryYear,
      giftData.theme_symbolism || null,
      giftData.diplomatic_occasion,
      giftData.body_color,
      giftData.chinese_elements,
      giftData.recipient_culture_elements,
      giftData.delivery_date || null,
      giftData.notes || null,
      changeCount,
      historyText,
      giftId,
    );
  } else {
    db.prepare(
      `
      INSERT INTO memorial_archives (gift_id, recipient_country, year, theme_symbolism,
        diplomatic_occasion, body_color, chinese_elements, recipient_culture_elements,
        delivery_date, notes, change_count, symbolism_history)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
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
      changeCount,
      historyText,
    );
  }
  return getArchiveByGiftId(giftId);
}

function buildSymbolismHistory(changeHistory, existing) {
  const entries = [];
  if (existing && existing.symbolism_history) {
    entries.push(existing.symbolism_history);
  }
  if (Array.isArray(changeHistory)) {
    for (const ch of changeHistory) {
      const lines = [];
      lines.push(`[${ch.created_at}] ${ch.change_type_name}`);
      if (ch.symbolism_before)
        lines.push(`  变更前寓意：${ch.symbolism_before}`);
      if (ch.symbolism_after) lines.push(`  变更后寓意：${ch.symbolism_after}`);
      if (ch.craft_diff_description)
        lines.push(`  工艺差异：${ch.craft_diff_description}`);
      if (ch.delivery_risk) lines.push(`  交付风险：${ch.delivery_risk}`);
      if (ch.extra_delay_days)
        lines.push(`  预估延期：${ch.extra_delay_days}天`);
      if (ch.reason) lines.push(`  原因：${ch.reason}`);
      if (ch.change_status === "implemented") {
        lines.push(`  状态：已执行`);
      } else if (ch.change_status === "approved") {
        lines.push(`  状态：审批通过`);
      }
      entries.push(lines.join("\n"));
    }
  }
  return entries.length > 0 ? entries.join("\n\n") : null;
}

module.exports = {
  createArchive,
  searchArchives,
  getArchiveByGiftId,
  upsertArchiveDraft,
};
