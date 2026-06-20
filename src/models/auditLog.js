const { getDb, REVIEW_LEVELS, REVIEW_LEVEL_NAMES } = require("./db");

function addAuditLog(giftId, reviewLevel, action, reviewer, reason) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO audit_logs (gift_id, review_level, action, reviewer, reason)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    giftId,
    reviewLevel,
    action,
    reviewer || null,
    reason || null,
  );
  return getAuditLogs(giftId);
}

function getAuditLogs(giftId) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM audit_logs WHERE gift_id = ? ORDER BY created_at ASC",
    )
    .all(giftId);
}

function getLatestApproval(giftId) {
  const db = getDb();
  const logs = db
    .prepare(
      "SELECT * FROM audit_logs WHERE gift_id = ? AND action = 'approve' ORDER BY created_at DESC",
    )
    .all(giftId);
  return logs.length > 0 ? logs[0] : null;
}

function getNextReviewLevel(giftId) {
  const latest = getLatestApproval(giftId);
  if (!latest) return REVIEW_LEVELS[0];
  const idx = REVIEW_LEVELS.indexOf(latest.review_level);
  if (idx < REVIEW_LEVELS.length - 1) return REVIEW_LEVELS[idx + 1];
  return null;
}

function getCurrentReviewLevel(giftId) {
  const db = getDb();
  const gift = db
    .prepare("SELECT current_review_level FROM national_gifts WHERE id = ?")
    .get(giftId);
  return gift ? gift.current_review_level : null;
}

module.exports = {
  addAuditLog,
  getAuditLogs,
  getNextReviewLevel,
  getCurrentReviewLevel,
};
