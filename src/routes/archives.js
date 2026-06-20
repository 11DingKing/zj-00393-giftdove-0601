const express = require("express");
const router = express.Router();
const {
  searchArchives,
  getArchiveByGiftId,
} = require("../models/memorialArchive");

router.get("/", (req, res) => {
  const filters = {
    recipient_country: req.query.country,
    year: req.query.year,
    theme_symbolism: req.query.theme,
    keyword: req.query.keyword,
  };
  const archives = searchArchives(filters);
  res.json({ success: true, data: archives });
});

router.get("/gift/:giftId", (req, res) => {
  const archive = getArchiveByGiftId(req.params.giftId);
  if (!archive)
    return res.status(404).json({ success: false, message: "纪念档案不存在" });
  res.json({ success: true, data: archive });
});

module.exports = router;
