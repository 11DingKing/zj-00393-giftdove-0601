const express = require("express");
const router = express.Router();
const { getGiftById } = require("../models/nationalGift");
const {
  addCraftItem,
  getCraftItems,
  completeCraftItem,
  deleteCraftItem,
  areAllCraftsCompleted,
} = require("../models/craftItem");
const { CRAFT_TYPES } = require("../models/db");

router.get("/:giftId", (req, res) => {
  const gift = getGiftById(req.params.giftId);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });
  const items = getCraftItems(req.params.giftId);
  res.json({ success: true, data: items });
});

router.post("/:giftId", (req, res) => {
  const gift = getGiftById(req.params.giftId);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });

  const { craft_type, craftsman, notes } = req.body;
  if (!craft_type || !craftsman) {
    return res
      .status(400)
      .json({ success: false, message: "缺少必填字段：craft_type, craftsman" });
  }

  const item = addCraftItem(req.params.giftId, craft_type, craftsman, notes);
  res.status(201).json({ success: true, data: item });
});

router.put("/:itemId/complete", (req, res) => {
  const item = completeCraftItem(Number(req.params.itemId));
  if (!item)
    return res
      .status(404)
      .json({ success: false, message: "工艺项目不存在或已完成" });
  res.json({ success: true, data: item });
});

router.delete("/:itemId", (req, res) => {
  const result = deleteCraftItem(Number(req.params.itemId));
  if (!result)
    return res.status(404).json({ success: false, message: "工艺项目不存在" });
  res.json({ success: true, message: "已删除" });
});

router.get("/:giftId/progress", (req, res) => {
  const gift = getGiftById(req.params.giftId);
  if (!gift)
    return res.status(404).json({ success: false, message: "国礼车不存在" });

  const items = getCraftItems(req.params.giftId);
  const total = items.length;
  const completed = items.filter((i) => i.completed).length;
  const allDone = areAllCraftsCompleted(req.params.giftId);

  res.json({
    success: true,
    data: {
      total,
      completed,
      all_completed: allDone,
      items,
    },
  });
});

module.exports = router;
