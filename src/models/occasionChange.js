const {
  getDb,
  CHANGE_TYPES,
  CHANGE_STATUS,
  CHANGE_TYPE_NAMES,
  CHANGE_STATUS_NAMES,
  STATUS_IN_PRODUCTION,
  STATUS_PENDING_REVIEW,
  REVIEW_LEVELS,
} = require("./db");
const { getGiftById, updateGift, updateGiftStatus } = require("./nationalGift");
const { addAuditLog } = require("./auditLog");

function createChangeRequest(giftId, data) {
  const db = getDb();
  const gift = getGiftById(giftId);
  if (!gift) throw new Error("国礼车不存在");
  if (
    gift.status !== STATUS_IN_PRODUCTION &&
    gift.status !== STATUS_PENDING_REVIEW
  ) {
    throw new Error(
      `当前状态"${gift.status}"不允许发起变更，仅制作中或待审核可发起`,
    );
  }
  if (!CHANGE_TYPES.includes(data.change_type)) {
    throw new Error(`变更类型无效，允许值：${CHANGE_TYPES.join("、")}`);
  }

  const stmt = db.prepare(`
    INSERT INTO occasion_changes (
      gift_id, change_type, initiator,
      old_diplomatic_occasion, old_delivery_date,
      old_chinese_elements, old_recipient_culture_elements, old_theme_symbolism,
      new_diplomatic_occasion, new_delivery_date,
      new_chinese_elements, new_recipient_culture_elements, new_theme_symbolism,
      symbolism_before, symbolism_after, craft_diff_description,
      delivery_risk, extra_delay_days, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    giftId,
    data.change_type,
    data.initiator || null,
    gift.diplomatic_occasion,
    gift.delivery_date,
    gift.chinese_elements,
    gift.recipient_culture_elements,
    gift.theme_symbolism,
    data.new_diplomatic_occasion || gift.diplomatic_occasion,
    data.new_delivery_date || gift.delivery_date,
    data.new_chinese_elements || gift.chinese_elements,
    data.new_recipient_culture_elements || gift.recipient_culture_elements,
    data.new_theme_symbolism || gift.theme_symbolism,
    data.symbolism_before || null,
    data.symbolism_after || null,
    data.craft_diff_description || null,
    data.delivery_risk || null,
    data.extra_delay_days || 0,
    data.reason || null,
  );

  const change = getChangeById(result.lastInsertRowid);
  addAuditLog(
    giftId,
    "foreign_affairs",
    "change_request",
    data.initiator || "系统",
    `发起${CHANGE_TYPE_NAMES[data.change_type]}：${data.reason || "无详细说明"}`,
  );

  return change;
}

function getChangeById(id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM occasion_changes WHERE id = ?").get(id);
  if (!row) return null;
  return enrichChange(row);
}

function enrichChange(row) {
  return {
    ...row,
    change_type_name: CHANGE_TYPE_NAMES[row.change_type] || row.change_type,
    change_status_name:
      CHANGE_STATUS_NAMES[row.change_status] || row.change_status,
    reset_logs: getCraftResetLogsByChangeId(row.id),
  };
}

function listChangesByGiftId(giftId) {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM occasion_changes WHERE gift_id = ? ORDER BY created_at DESC",
    )
    .all(giftId);
  return rows.map(enrichChange);
}

function listAllChanges(filters = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];
  if (filters.gift_id) {
    conditions.push("gift_id = ?");
    params.push(filters.gift_id);
  }
  if (filters.change_type && CHANGE_TYPES.includes(filters.change_type)) {
    conditions.push("change_type = ?");
    params.push(filters.change_type);
  }
  if (filters.change_status && CHANGE_STATUS.includes(filters.change_status)) {
    conditions.push("change_status = ?");
    params.push(filters.change_status);
  }
  if (filters.year) {
    conditions.push("strftime('%Y', created_at) = ?");
    params.push(filters.year);
  }
  const where =
    conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const rows = db
    .prepare(`SELECT * FROM occasion_changes ${where} ORDER BY created_at DESC`)
    .all(...params);
  return rows.map(enrichChange);
}

function approveChange(id, approver, approveReason) {
  const db = getDb();
  const change = getChangeById(id);
  if (!change) throw new Error("变更单不存在");
  if (change.change_status !== "pending") {
    throw new Error(`当前状态"${change.change_status_name}"不可审批`);
  }
  db.prepare(
    `
    UPDATE occasion_changes
    SET change_status = 'approved', approver = ?, approve_reason = ?,
        approved_at = datetime('now', 'localtime')
    WHERE id = ?
  `,
  ).run(approver || "系统", approveReason || "审批通过", id);
  addAuditLog(
    change.gift_id,
    "foreign_affairs",
    "change_approve",
    approver || "系统",
    `审批通过变更单#${id}：${approveReason || "无"}`,
  );
  return getChangeById(id);
}

function cancelChange(id, operator, reason) {
  const db = getDb();
  const change = getChangeById(id);
  if (!change) throw new Error("变更单不存在");
  if (change.change_status === "implemented") {
    throw new Error("已执行的变更不可取消");
  }
  db.prepare(
    `
    UPDATE occasion_changes
    SET change_status = 'cancelled', approver = ?, approve_reason = ?
    WHERE id = ?
  `,
  ).run(operator || "系统", reason || "取消变更", id);
  addAuditLog(
    change.gift_id,
    "foreign_affairs",
    "change_cancel",
    operator || "系统",
    `取消变更单#${id}：${reason || "无"}`,
  );
  return getChangeById(id);
}

function implementChange(id, operator, affectedCraftTypes) {
  const db = getDb();
  const change = getChangeById(id);
  if (!change) throw new Error("变更单不存在");
  if (change.change_status !== "approved") {
    throw new Error(
      `当前状态"${change.change_status_name}"不可执行，需先审批通过`,
    );
  }
  const gift = getGiftById(change.gift_id);
  if (!gift) throw new Error("关联国礼车不存在");

  const tx = db.transaction(() => {
    if (!gift.original_delivery_date && gift.delivery_date) {
      db.prepare(
        `UPDATE national_gifts SET original_delivery_date = ?, has_occasion_change = 1 WHERE id = ?`,
      ).run(gift.delivery_date, change.gift_id);
    } else {
      db.prepare(
        `UPDATE national_gifts SET has_occasion_change = 1 WHERE id = ?`,
      ).run(change.gift_id);
    }

    const updateData = {};
    if (change.new_diplomatic_occasion !== change.old_diplomatic_occasion) {
      updateData.diplomatic_occasion = change.new_diplomatic_occasion;
    }
    if (change.new_delivery_date !== change.old_delivery_date) {
      updateData.delivery_date = change.new_delivery_date;
    }
    if (change.new_chinese_elements !== change.old_chinese_elements) {
      updateData.chinese_elements = change.new_chinese_elements;
    }
    if (
      change.new_recipient_culture_elements !==
      change.old_recipient_culture_elements
    ) {
      updateData.recipient_culture_elements =
        change.new_recipient_culture_elements;
    }
    if (change.new_theme_symbolism !== change.old_theme_symbolism) {
      updateData.theme_symbolism = change.new_theme_symbolism;
    }
    updateGift(change.gift_id, updateData);

    const craftsToReset =
      affectedCraftTypes && affectedCraftTypes.length > 0
        ? affectedCraftTypes
        : detectAffectedCrafts(change, gift);

    const resetLogs = [];
    if (craftsToReset.length > 0) {
      const craftItems = db
        .prepare("SELECT * FROM craft_items WHERE gift_id = ?")
        .all(change.gift_id);
      for (const craft of craftItems) {
        if (craftsToReset.includes(craft.craft_type) && craft.completed) {
          db.prepare(
            `UPDATE craft_items SET completed = 0, completed_at = NULL WHERE id = ?`,
          ).run(craft.id);
          const logStmt = db.prepare(`
            INSERT INTO craft_reset_logs (change_id, gift_id, craft_type, craftsman, was_completed)
            VALUES (?, ?, ?, ?, 1)
          `);
          const r = logStmt.run(
            id,
            change.gift_id,
            craft.craft_type,
            craft.craftsman,
          );
          resetLogs.push({
            id: r.lastInsertRowid,
            craft_type: craft.craft_type,
            craftsman: craft.craftsman,
          });
        } else if (craftsToReset.includes(craft.craft_type)) {
          const logStmt = db.prepare(`
            INSERT INTO craft_reset_logs (change_id, gift_id, craft_type, craftsman, was_completed)
            VALUES (?, ?, ?, ?, 0)
          `);
          const r = logStmt.run(
            id,
            change.gift_id,
            craft.craft_type,
            craft.craftsman,
          );
          resetLogs.push({
            id: r.lastInsertRowid,
            craft_type: craft.craft_type,
            craftsman: craft.craftsman,
          });
        }
      }
    }

    db.prepare(
      `
      UPDATE occasion_changes
      SET change_status = 'implemented', implemented_at = datetime('now', 'localtime')
      WHERE id = ?
    `,
    ).run(id);

    addAuditLog(
      change.gift_id,
      "craft",
      "change_implement",
      operator || "系统",
      `执行变更单#${id}，重置工艺：${craftsToReset.join("、") || "无"}，设计稿需复审`,
    );

    if (gift.status === STATUS_IN_PRODUCTION) {
      updateGiftStatus(change.gift_id, STATUS_PENDING_REVIEW, {
        current_review_level: REVIEW_LEVELS[0],
      });
      addAuditLog(
        change.gift_id,
        REVIEW_LEVELS[0],
        "submit",
        operator || "系统",
        "变更执行后自动提交复审，从品牌审核开始",
      );
    }

    return resetLogs;
  });

  const logs = tx();
  const result = getChangeById(id);
  return { ...result, manual_reset_logs: logs };
}

function detectAffectedCrafts(change, gift) {
  const affected = new Set();
  const fieldChanges = [];
  if (change.new_chinese_elements !== change.old_chinese_elements) {
    fieldChanges.push("chinese_elements");
  }
  if (
    change.new_recipient_culture_elements !==
    change.old_recipient_culture_elements
  ) {
    fieldChanges.push("recipient_culture_elements");
  }
  if (change.new_diplomatic_occasion !== change.old_diplomatic_occasion) {
    fieldChanges.push("diplomatic_occasion");
  }
  if (change.new_theme_symbolism !== change.old_theme_symbolism) {
    fieldChanges.push("theme_symbolism");
  }

  if (
    fieldChanges.includes("chinese_elements") ||
    fieldChanges.includes("recipient_culture_elements") ||
    fieldChanges.includes("theme_symbolism")
  ) {
    affected.add("漆画");
    affected.add("云母");
  }
  if (
    fieldChanges.includes("diplomatic_occasion") ||
    fieldChanges.includes("theme_symbolism")
  ) {
    affected.add("金箔");
    affected.add("铭牌刻字");
  }
  if (change.new_delivery_date !== change.old_delivery_date) {
    // 仅日期变更不影响工艺内容，但需要记录工作安排调整
    // 不自动重置工艺，由用户手工指定
  }
  return Array.from(affected);
}

function getCraftResetLogsByChangeId(changeId) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM craft_reset_logs WHERE change_id = ? ORDER BY id ASC",
    )
    .all(changeId);
}

function getChangeDelayStats(year) {
  const db = getDb();
  let query = `
    SELECT
      c.gift_id,
      g.title,
      g.recipient_country,
      g.original_delivery_date,
      g.delivery_date,
      COUNT(c.id) as change_count,
      SUM(CASE WHEN c.extra_delay_days IS NOT NULL THEN c.extra_delay_days ELSE 0 END) as total_extra_delay_days,
      MAX(c.implemented_at) as last_change_at
    FROM occasion_changes c
    JOIN national_gifts g ON c.gift_id = g.id
    WHERE c.change_status = 'implemented'
  `;
  const params = [];
  if (year) {
    query += " AND strftime('%Y', c.implemented_at) = ?";
    params.push(year);
  }
  query += `
    GROUP BY c.gift_id
    ORDER BY total_extra_delay_days DESC
  `;
  const raw = db.prepare(query).all(...params);
  for (const r of raw) {
    const types = db
      .prepare(
        `SELECT DISTINCT change_type FROM occasion_changes
         WHERE gift_id = ? AND change_status = 'implemented'`,
      )
      .all(r.gift_id);
    r.change_types = types.map((t) => t.change_type).join("、");
  }
  return raw;
}

module.exports = {
  createChangeRequest,
  getChangeById,
  listChangesByGiftId,
  listAllChanges,
  approveChange,
  cancelChange,
  implementChange,
  getCraftResetLogsByChangeId,
  getChangeDelayStats,
  detectAffectedCrafts,
};
