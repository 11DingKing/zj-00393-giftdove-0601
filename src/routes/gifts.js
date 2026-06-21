const express = require("express");
const router = express.Router();
const {
  listGifts,
  getGiftById,
  createGift,
  updateGift,
  deleteGift,
} = require("../models/nationalGift");
const { getAuditLogs } = require("../models/auditLog");
const { getCraftItems } = require("../models/craftItem");
const {
  getArchiveByGiftId,
  getArchiveDraftByGiftId,
} = require("../models/memorialArchive");
const { listChangesByGiftId } = require("../models/occasionChange");

router.get("/", (req, res) => {
  const filters = {
    status: req.query.status,
    recipient_country: req.query.country,
    year: req.query.year,
    keyword: req.query.keyword,
  };
  const gifts = listGifts(filters);
  res.json({ success: true, data: gifts });
});

router.get("/:id", (req, res) => {
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });

  const auditLogs = getAuditLogs(req.params.id);
  const craftItems = getCraftItems(req.params.id);
  const archive = getArchiveByGiftId(req.params.id);
  const archiveDraft = getArchiveDraftByGiftId(req.params.id);
  const occasionChanges = listChangesByGiftId(req.params.id);

  res.json({
    success: true,
    data: {
      ...gift,
      has_occasion_change: !!gift.has_occasion_change,
      audit_logs: auditLogs,
      craft_items: craftItems,
      archive: archive,
      archive_draft: archiveDraft,
      occasion_changes: occasionChanges,
    },
  });
});

router.post("/", (req, res) => {
  const {
    recipient_country,
    diplomatic_occasion,
    body_color,
    chinese_elements,
    recipient_culture_elements,
  } = req.body;
  if (
    !recipient_country ||
    !diplomatic_occasion ||
    !body_color ||
    !chinese_elements ||
    !recipient_culture_elements
  ) {
    return res.status(400).json({
      success: false,
      message:
        "缺少必填字段：recipient_country, diplomatic_occasion, body_color, chinese_elements, recipient_culture_elements",
    });
  }
  const gift = createGift(req.body);
  res.status(201).json({ success: true, data: gift });
});

router.put("/:id", (req, res) => {
  const gift = getGiftById(req.params.id);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });

  const updated = updateGift(req.params.id, req.body);
  res.json({ success: true, data: updated });
});

router.delete("/:id", (req, res) => {
  const result = deleteGift(req.params.id);
  if (!result)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  res.json({ success: true, message: "删除成功" });
});

module.exports = router;
