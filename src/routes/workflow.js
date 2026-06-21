const express = require("express");
const router = express.Router();
const {
  getGiftById,
  updateGiftStatus,
  incrementDesignVersion,
} = require("../models/nationalGift");
const {
  addAuditLog,
  getAuditLogs,
  getNextReviewLevel,
} = require("../models/auditLog");
const {
  STATUS_DRAFT,
  STATUS_PENDING_REVIEW,
  STATUS_IN_PRODUCTION,
  STATUS_PENDING_DELIVERY,
  STATUS_DELIVERED,
  STATUS_ARCHIVED,
  REVIEW_LEVELS,
  REVIEW_LEVEL_NAMES,
} = require("../models/db");
const { createArchive } = require("../models/memorialArchive");
const {
  validateCraftList,
  resetCraftsForRework,
} = require("../models/craftItem");

router.post("/:id/submit", (req, res) => {
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  if (gift.status !== STATUS_DRAFT) {
    return res.status(400).json({
      success: false,
      message: `当前状态为"${gift.status}"，仅"${STATUS_DRAFT}"可提交审核`,
    });
  }

  const updated = updateGiftStatus(req.params.id, STATUS_PENDING_REVIEW, {
    current_review_level: REVIEW_LEVELS[0],
  });
  addAuditLog(
    req.params.id,
    REVIEW_LEVELS[0],
    "submit",
    req.body.reviewer,
    `提交审核（设计稿 v${gift.design_version}）`,
    gift.design_version,
  );

  res.json({
    success: true,
    data: updated,
    message: `已提交审核，进入品牌审核阶段（设计稿 v${gift.design_version}）`,
  });
});

router.post("/:id/approve", (req, res) => {
  const { reviewer } = req.body;
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  if (gift.status !== STATUS_PENDING_REVIEW) {
    return res.status(400).json({
      success: false,
      message: `当前状态为"${gift.status}"，仅"${STATUS_PENDING_REVIEW}"可审批`,
    });
  }

  const currentLevel = gift.current_review_level;
  if (!currentLevel || !REVIEW_LEVELS.includes(currentLevel)) {
    return res.status(400).json({ success: false, message: "审核级别异常" });
  }

  const currentIdx = REVIEW_LEVELS.indexOf(currentLevel);
  const isFinalLevel = currentIdx === REVIEW_LEVELS.length - 1;

  if (isFinalLevel) {
    const craftValidation = validateCraftList(req.params.id, false);
    if (!craftValidation.valid) {
      return res.status(400).json({
        success: false,
        message: `工艺审核无法通过：${craftValidation.errors.join("；")}`,
      });
    }
  }

  addAuditLog(
    req.params.id,
    currentLevel,
    "approve",
    reviewer,
    `${REVIEW_LEVEL_NAMES[currentLevel]}通过（设计稿 v${gift.design_version}）`,
    gift.design_version,
  );

  if (isFinalLevel) {
    const updated = updateGiftStatus(req.params.id, STATUS_IN_PRODUCTION, {
      current_review_level: null,
      production_start_date: new Date().toISOString().slice(0, 10),
    });
    return res.json({
      success: true,
      data: updated,
      message: `全部审核通过，已进入制作中（设计稿 v${gift.design_version}）`,
    });
  }

  const nextLevel = REVIEW_LEVELS[currentIdx + 1];
  const updated = updateGiftStatus(req.params.id, STATUS_PENDING_REVIEW, {
    current_review_level: nextLevel,
  });
  res.json({
    success: true,
    data: updated,
    message: `${REVIEW_LEVEL_NAMES[currentLevel]}通过，进入${REVIEW_LEVEL_NAMES[nextLevel]}（设计稿 v${gift.design_version}）`,
  });
});

router.post("/:id/reject", (req, res) => {
  const { reviewer, reason } = req.body;
  if (!reason) {
    return res
      .status(400)
      .json({ success: false, message: "驳回必须填写原因" });
  }

  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  if (gift.status !== STATUS_PENDING_REVIEW) {
    return res.status(400).json({
      success: false,
      message: `当前状态为"${gift.status}"，仅"${STATUS_PENDING_REVIEW}"可驳回`,
    });
  }

  const currentLevel = gift.current_review_level;
  const oldVersion = gift.design_version;
  const newVersion = oldVersion + 1;

  addAuditLog(
    req.params.id,
    currentLevel,
    "reject",
    reviewer,
    reason,
    oldVersion,
  );

  incrementDesignVersion(req.params.id);
  resetCraftsForRework(req.params.id);

  addAuditLog(
    req.params.id,
    currentLevel,
    "rework",
    reviewer,
    `驳回重做：设计稿从 v${oldVersion} 升级为 v${newVersion}，所有工艺完成状态已重置，需重新校验工艺清单`,
    newVersion,
  );

  const updated = updateGiftStatus(req.params.id, STATUS_DRAFT, {
    current_review_level: null,
    production_start_date: null,
    production_end_date: null,
  });

  res.json({
    success: true,
    data: updated,
    message: `已被${REVIEW_LEVEL_NAMES[currentLevel]}驳回，设计稿升级为 v${newVersion}，回到方案修改中，所有工艺需重新完成并校验`,
  });
});

router.post("/:id/ready-delivery", (req, res) => {
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  if (gift.status !== STATUS_IN_PRODUCTION) {
    return res.status(400).json({
      success: false,
      message: `当前状态为"${gift.status}"，仅"${STATUS_IN_PRODUCTION}"可转为待交付`,
    });
  }

  const craftValidation = validateCraftList(req.params.id, true);
  if (!craftValidation.valid) {
    return res.status(400).json({
      success: false,
      message: `无法转入待交付：${craftValidation.errors.join("；")}`,
    });
  }

  const updated = updateGiftStatus(req.params.id, STATUS_PENDING_DELIVERY, {
    production_end_date: new Date().toISOString().slice(0, 10),
  });
  res.json({ success: true, data: updated, message: "已标记为待交付" });
});

router.post("/:id/deliver", (req, res) => {
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  if (gift.status !== STATUS_PENDING_DELIVERY) {
    return res.status(400).json({
      success: false,
      message: `当前状态为"${gift.status}"，仅"${STATUS_PENDING_DELIVERY}"可确认交付`,
    });
  }

  const craftValidation = validateCraftList(req.params.id, true);
  if (!craftValidation.valid) {
    return res.status(400).json({
      success: false,
      message: `无法确认交付：${craftValidation.errors.join("；")}`,
    });
  }

  const updated = updateGiftStatus(req.params.id, STATUS_DELIVERED, {
    delivery_date:
      req.body.delivery_date || new Date().toISOString().slice(0, 10),
  });
  res.json({ success: true, data: updated, message: "已确认交付" });
});

router.post("/:id/archive", (req, res) => {
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  if (gift.status !== STATUS_DELIVERED) {
    return res.status(400).json({
      success: false,
      message: `当前状态为"${gift.status}"，仅"${STATUS_DELIVERED}"可归档`,
    });
  }

  const craftValidation = validateCraftList(req.params.id, true);
  if (!craftValidation.valid) {
    return res.status(400).json({
      success: false,
      message: `无法归档：${craftValidation.errors.join("；")}`,
    });
  }

  const updated = updateGiftStatus(req.params.id, STATUS_ARCHIVED, {
    archived_at: new Date().toISOString().slice(0, 10),
  });

  const refreshed = getGiftById(req.params.id);
  createArchive(req.params.id, refreshed);

  res.json({ success: true, data: updated, message: "已归档，纪念档案已生成" });
});

router.get("/:id/logs", (req, res) => {
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  const logs = getAuditLogs(req.params.id);
  res.json({ success: true, data: logs });
});

module.exports = router;
