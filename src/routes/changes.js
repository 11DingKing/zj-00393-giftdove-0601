const express = require("express");
const router = express.Router();
const { getGiftById } = require("../models/nationalGift");
const {
  createChangeRequest,
  getChangeById,
  listChangesByGiftId,
  listAllChanges,
  approveChange,
  cancelChange,
  implementChange,
  detectAffectedCrafts,
} = require("../models/occasionChange");
const { listChangesByGiftId: _unused } = require("../models/occasionChange");
const { upsertArchiveDraft } = require("../models/memorialArchive");
const {
  CHANGE_TYPES,
  CHANGE_TYPE_NAMES,
  CHANGE_STATUS,
  CHANGE_STATUS_NAMES,
  CRAFT_TYPES,
} = require("../models/db");

router.post("/:giftId/changes", (req, res) => {
  const gift = getGiftById(req.params.giftId);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });

  const {
    change_type,
    initiator,
    new_diplomatic_occasion,
    new_delivery_date,
    new_chinese_elements,
    new_recipient_culture_elements,
    new_theme_symbolism,
    symbolism_before,
    symbolism_after,
    craft_diff_description,
    delivery_risk,
    extra_delay_days,
    reason,
  } = req.body;

  if (!change_type) {
    return res.status(400).json({
      success: false,
      message: `缺少必填字段 change_type，允许值：${CHANGE_TYPES.join("、")}`,
    });
  }
  if (!CHANGE_TYPES.includes(change_type)) {
    return res.status(400).json({
      success: false,
      message: `change_type 无效，允许值：${CHANGE_TYPES.join("、")}`,
    });
  }

  try {
    const change = createChangeRequest(req.params.giftId, {
      change_type,
      initiator,
      new_diplomatic_occasion,
      new_delivery_date,
      new_chinese_elements,
      new_recipient_culture_elements,
      new_theme_symbolism,
      symbolism_before,
      symbolism_after,
      craft_diff_description,
      delivery_risk,
      extra_delay_days,
      reason,
    });

    const currentGift = getGiftById(req.params.giftId);
    const allChanges = listChangesByGiftId(req.params.giftId);
    upsertArchiveDraft(req.params.giftId, currentGift, allChanges);

    res.status(201).json({
      success: true,
      data: change,
      message: "变更单已创建，待审批",
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get("/:giftId/changes", (req, res) => {
  const gift = getGiftById(req.params.giftId);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  const changes = listChangesByGiftId(req.params.giftId);
  res.json({ success: true, data: changes });
});

router.get("/changes", (req, res) => {
  const filters = {
    gift_id: req.query.gift_id,
    change_type: req.query.change_type,
    change_status: req.query.change_status,
    year: req.query.year,
  };
  const changes = listAllChanges(filters);
  res.json({ success: true, data: changes });
});

router.get("/changes/:id", (req, res) => {
  const change = getChangeById(Number(req.params.id));
  if (!change)
    return res.status(404).json({ success: false, message: "变更单不存在" });
  res.json({ success: true, data: change });
});

router.post("/changes/:id/approve", (req, res) => {
  const { approver, approve_reason } = req.body;
  try {
    const change = approveChange(
      Number(req.params.id),
      approver,
      approve_reason,
    );
    res.json({
      success: true,
      data: change,
      message: "变更单审批通过，可执行",
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post("/changes/:id/cancel", (req, res) => {
  const { operator, reason } = req.body;
  try {
    const change = cancelChange(Number(req.params.id), operator, reason);
    res.json({
      success: true,
      data: change,
      message: "变更单已取消",
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post("/changes/:id/implement", (req, res) => {
  const { operator, affected_craft_types } = req.body;
  try {
    const change = getChangeById(Number(req.params.id));
    if (!change)
      return res.status(404).json({ success: false, message: "变更单不存在" });

    let craftTypes = [];
    if (Array.isArray(affected_craft_types)) {
      const invalid = affected_craft_types.filter(
        (t) => !CRAFT_TYPES.includes(t),
      );
      if (invalid.length > 0) {
        return res.status(400).json({
          success: false,
          message: `无效工艺类型：${invalid.join("、")}，允许值：${CRAFT_TYPES.join("、")}`,
        });
      }
      craftTypes = affected_craft_types;
    }

    const result = implementChange(Number(req.params.id), operator, craftTypes);

    const refreshed = getGiftById(change.gift_id);
    const allChanges = listChangesByGiftId(change.gift_id);
    upsertArchiveDraft(change.gift_id, refreshed, allChanges);

    res.json({
      success: true,
      data: result,
      message: `变更已执行，已重置${result.reset_logs ? result.reset_logs.length : 0}项工艺并提交复审`,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post("/:giftId/changes/preview", (req, res) => {
  const gift = getGiftById(req.params.giftId);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });

  const mockChange = {
    change_type: req.body.change_type,
    old_diplomatic_occasion: gift.diplomatic_occasion,
    old_delivery_date: gift.delivery_date,
    old_chinese_elements: gift.chinese_elements,
    old_recipient_culture_elements: gift.recipient_culture_elements,
    old_theme_symbolism: gift.theme_symbolism,
    new_diplomatic_occasion:
      req.body.new_diplomatic_occasion || gift.diplomatic_occasion,
    new_delivery_date: req.body.new_delivery_date || gift.delivery_date,
    new_chinese_elements:
      req.body.new_chinese_elements || gift.chinese_elements,
    new_recipient_culture_elements:
      req.body.new_recipient_culture_elements ||
      gift.recipient_culture_elements,
    new_theme_symbolism: req.body.new_theme_symbolism || gift.theme_symbolism,
  };

  const autoAffected = detectAffectedCrafts(mockChange, gift);

  const fieldDiffs = [];
  const fieldLabels = {
    diplomatic_occasion: "受赠场合",
    delivery_date: "交付日期",
    chinese_elements: "中华文化元素",
    recipient_culture_elements: "受赠方文化元素",
    theme_symbolism: "主题寓意",
  };
  for (const key of Object.keys(fieldLabels)) {
    const oldK = `old_${key}`;
    const newK = `new_${key}`;
    if (mockChange[oldK] !== mockChange[newK]) {
      fieldDiffs.push({
        field: key,
        label: fieldLabels[key],
        old_value: mockChange[oldK],
        new_value: mockChange[newK],
      });
    }
  }

  res.json({
    success: true,
    data: {
      field_diffs: fieldDiffs,
      auto_affected_craft_types: autoAffected,
      craft_type_options: CRAFT_TYPES,
      type_name:
        CHANGE_TYPE_NAMES[req.body.change_type] || req.body.change_type,
    },
  });
});

router.get("/changes/enum/meta", (_req, res) => {
  res.json({
    success: true,
    data: {
      change_types: CHANGE_TYPES.map((k) => ({
        key: k,
        name: CHANGE_TYPE_NAMES[k],
      })),
      change_statuses: CHANGE_STATUS.map((k) => ({
        key: k,
        name: CHANGE_STATUS_NAMES[k],
      })),
      craft_types: CRAFT_TYPES,
    },
  });
});

module.exports = router;
