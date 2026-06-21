const { getDb, CRAFT_TYPES } = require("./db");

function addCraftItem(giftId, craftType, craftsman, notes) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO craft_items (gift_id, craft_type, craftsman, notes)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(giftId, craftType, craftsman, notes || null);
  return db
    .prepare("SELECT * FROM craft_items WHERE id = ?")
    .get(result.lastInsertRowid);
}

function getCraftItems(giftId) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM craft_items WHERE gift_id = ? ORDER BY craft_type ASC",
    )
    .all(giftId);
}

function completeCraftItem(itemId) {
  const db = getDb();
  const item = db.prepare("SELECT * FROM craft_items WHERE id = ?").get(itemId);
  if (!item) return null;
  if (item.completed) return item;
  db.prepare(
    `
    UPDATE craft_items SET completed = 1, completed_at = datetime('now', 'localtime') WHERE id = ?
  `,
  ).run(itemId);
  return db.prepare("SELECT * FROM craft_items WHERE id = ?").get(itemId);
}

function deleteCraftItem(itemId) {
  const db = getDb();
  const item = db.prepare("SELECT * FROM craft_items WHERE id = ?").get(itemId);
  if (!item) return false;
  db.prepare("DELETE FROM craft_items WHERE id = ?").run(itemId);
  return true;
}

function areAllCraftsCompleted(giftId) {
  const db = getDb();
  const total = db
    .prepare("SELECT COUNT(*) as count FROM craft_items WHERE gift_id = ?")
    .get(giftId).count;
  if (total === 0) return false;
  const completed = db
    .prepare(
      "SELECT COUNT(*) as count FROM craft_items WHERE gift_id = ? AND completed = 1",
    )
    .get(giftId).count;
  return total === completed;
}

function validateCraftList(giftId, requireCompleted = true) {
  const db = getDb();
  const items = db
    .prepare("SELECT * FROM craft_items WHERE gift_id = ?")
    .all(giftId);

  const existingTypes = items.map((i) => i.craft_type);
  const missingTypes = CRAFT_TYPES.filter((t) => !existingTypes.includes(t));

  const incompleteItems = [];
  for (const type of CRAFT_TYPES) {
    const item = items.find((i) => i.craft_type === type);
    if (item && !item.completed) {
      incompleteItems.push(type);
    }
  }

  const hasAllTypes = missingTypes.length === 0;
  const allCompleted = hasAllTypes && incompleteItems.length === 0;

  let valid = hasAllTypes;
  if (requireCompleted) {
    valid = allCompleted;
  }

  const errors = [];
  if (missingTypes.length > 0) {
    errors.push(`缺少必要工艺项：${missingTypes.join("、")}`);
  }
  if (requireCompleted && incompleteItems.length > 0) {
    errors.push(`以下工艺尚未完成：${incompleteItems.join("、")}`);
  }

  return {
    valid,
    hasAllTypes,
    allCompleted,
    missingTypes,
    incompleteItems,
    errors,
    items,
  };
}

function resetCraftsForRework(giftId) {
  const db = getDb();
  db.prepare(
    `
    UPDATE craft_items
    SET completed = 0, completed_at = NULL
    WHERE gift_id = ? AND completed = 1
  `,
  ).run(giftId);
  return true;
}

module.exports = {
  addCraftItem,
  getCraftItems,
  completeCraftItem,
  deleteCraftItem,
  areAllCraftsCompleted,
  validateCraftList,
  resetCraftsForRework,
};
