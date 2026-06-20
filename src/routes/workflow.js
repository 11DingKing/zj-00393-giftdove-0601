const express = require("express");
const router = express.Router();
const { getGiftById, updateGiftStatus } = require("../models/nationalGift");
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

router.post("/:id/submit", (req, res) => {
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  if (gift.status !== STATUS_DRAFT) {
    return res
      .status(400)
      .json({
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
    "提交审核",
  );

  res.json({
    success: true,
    data: updated,
    message: "已提交审核，进入品牌审核阶段",
  });
});

router.post("/:id/approve", (req, res) => {
  const { reviewer } = req.body;
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  if (gift.status !== STATUS_PENDING_REVIEW) {
    return res
      .status(400)
      .json({
        success: false,
        message: `当前状态为"${gift.status}"，仅"${STATUS_PENDING_REVIEW}"可审批`,
      });
  }

  const currentLevel = gift.current_review_level;
  if (!currentLevel || !REVIEW_LEVELS.includes(currentLevel)) {
    return res.status(400).json({ success: false, message: "审核级别异常" });
  }

  addAuditLog(
    req.params.id,
    currentLevel,
    "approve",
    reviewer,
    `${REVIEW_LEVEL_NAMES[currentLevel]}通过`,
  );

  const currentIdx = REVIEW_LEVELS.indexOf(currentLevel);

  if (currentIdx === REVIEW_LEVELS.length - 1) {
    const updated = updateGiftStatus(req.params.id, STATUS_IN_PRODUCTION, {
      current_review_level: null,
      production_start_date: new Date().toISOString().slice(0, 10),
    });
    return res.json({
      success: true,
      data: updated,
      message: "全部审核通过，已进入制作中",
    });
  }

  const nextLevel = REVIEW_LEVELS[currentIdx + 1];
  const updated = updateGiftStatus(req.params.id, STATUS_PENDING_REVIEW, {
    current_review_level: nextLevel,
  });
  res.json({
    success: true,
    data: updated,
    message: `${REVIEW_LEVEL_NAMES[currentLevel]}通过，进入${REVIEW_LEVEL_NAMES[nextLevel]}`,
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
    return res
      .status(400)
      .json({
        success: false,
        message: `当前状态为"${gift.status}"，仅"${STATUS_PENDING_REVIEW}"可驳回`,
      });
  }

  const currentLevel = gift.current_review_level;
  addAuditLog(req.params.id, currentLevel, "reject", reviewer, reason);

  const updated = updateGiftStatus(req.params.id, STATUS_DRAFT, {
    current_review_level: null,
  });
  res.json({
    success: true,
    data: updated,
    message: `已被${REVIEW_LEVEL_NAMES[currentLevel]}驳回，回到方案修改中`,
  });
});

router.post("/:id/ready-delivery", (req, res) => {
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  if (gift.status !== STATUS_IN_PRODUCTION) {
    return res
      .status(400)
      .json({
        success: false,
        message: `当前状态为"${gift.status}"，仅"${STATUS_IN_PRODUCTION}"可转为待交付`,
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
    return res
      .status(400)
      .json({
        success: false,
        message: `当前状态为"${gift.status}"，仅"${STATUS_PENDING_DELIVERY}"可确认交付`,
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
    return res
      .status(400)
      .json({
        success: false,
        message: `当前状态为"${gift.status}"，仅"${STATUS_DELIVERED}"可归档`,
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
