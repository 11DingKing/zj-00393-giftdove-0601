const express = require("express");
const cors = require("cors");
const { initSchema } = require("./models/db");
const seed = require("./seed");

const giftsRouter = require("./routes/gifts");
const workflowRouter = require("./routes/workflow");
const craftsRouter = require("./routes/crafts");
const archivesRouter = require("./routes/archives");
const statisticsRouter = require("./routes/statistics");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

initSchema();
seed();

app.use("/api/gifts", giftsRouter);
app.use("/api/gifts", workflowRouter);
app.use("/api/crafts", craftsRouter);
app.use("/api/archives", archivesRouter);
app.use("/api/statistics", statisticsRouter);

app.get("/api/status-list", (req, res) => {
  const {
    STATUS_LIST,
    REVIEW_LEVELS,
    REVIEW_LEVEL_NAMES,
    CRAFT_TYPES,
  } = require("./models/db");
  res.json({
    success: true,
    data: {
      statuses: STATUS_LIST,
      review_levels: REVIEW_LEVELS.map((l) => ({
        key: l,
        name: REVIEW_LEVEL_NAMES[l],
      })),
      craft_types: CRAFT_TYPES,
    },
  });
});

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "服务器内部错误" });
});

app.listen(PORT, () => {
  console.log(`🚲 飞鸽国礼车管理系统已启动 → http://localhost:${PORT}`);
  console.log(`📋 API 文档：`);
  console.log(
    `   GET    /api/gifts              - 列表（?status=&country=&year=&keyword=）`,
  );
  console.log(
    `   GET    /api/gifts/:id           - 详情（含审核日志+工艺清单+档案）`,
  );
  console.log(`   POST   /api/gifts               - 创建`);
  console.log(`   PUT    /api/gifts/:id           - 修改`);
  console.log(`   DELETE /api/gifts/:id           - 删除`);
  console.log(`   POST   /api/gifts/:id/submit    - 提交审核`);
  console.log(`   POST   /api/gifts/:id/approve   - 审核通过`);
  console.log(`   POST   /api/gifts/:id/reject    - 驳回（需 reason）`);
  console.log(`   POST   /api/gifts/:id/ready-delivery - 转待交付`);
  console.log(`   POST   /api/gifts/:id/deliver   - 确认交付`);
  console.log(`   POST   /api/gifts/:id/archive   - 归档`);
  console.log(`   GET    /api/gifts/:id/logs      - 审核日志`);
  console.log(`   GET    /api/crafts/:giftId      - 工艺清单`);
  console.log(`   POST   /api/crafts/:giftId      - 添加工艺项`);
  console.log(`   PUT    /api/crafts/:itemId/complete - 完成工艺项`);
  console.log(`   DELETE /api/crafts/:itemId      - 删除工艺项`);
  console.log(`   GET    /api/crafts/:giftId/progress - 工艺进度`);
  console.log(
    `   GET    /api/archives            - 检索档案（?country=&year=&theme=&keyword=）`,
  );
  console.log(`   GET    /api/archives/gift/:giftId - 按国礼查档案`);
  console.log(`   GET    /api/statistics/overview - 总览`);
  console.log(
    `   GET    /api/statistics/production-cycle - 制作周期（?year=）`,
  );
  console.log(
    `   GET    /api/statistics/yearly-count - 年度统计（?start_year=&end_year=）`,
  );
  console.log(`   GET    /api/status-list         - 状态/审核/工艺枚举`);
});
