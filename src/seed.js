const {
  getDb,
  initSchema,
  STATUS_IN_PRODUCTION,
  STATUS_DELIVERED,
  STATUS_ARCHIVED,
  STATUS_PENDING_REVIEW,
  STATUS_PENDING_DELIVERY,
  STATUS_DRAFT,
  REVIEW_LEVELS,
} = require("./models/db");
const {
  createGift,
  updateGiftStatus,
  getGiftById,
} = require("./models/nationalGift");
const { addAuditLog } = require("./models/auditLog");
const { addCraftItem, completeCraftItem } = require("./models/craftItem");
const { createArchive } = require("./models/memorialArchive");

function seed() {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as c FROM national_gifts").get().c;
  if (count > 0) {
    console.log("数据库已有数据，跳过种子数据");
    return;
  }

  const gifts = [
    {
      title: "丝路金韵·法国",
      recipient_country: "法国",
      recipient_institution: "法国总统府",
      diplomatic_occasion: "中法建交60周年国事访问",
      delivery_date: "2024-05-06",
      body_color: "中国红",
      chinese_elements: "敦煌飞天纹样、景泰蓝工艺",
      recipient_culture_elements: "百合花饰、凡尔赛宫铁艺",
      theme_symbolism: "丝路精神·东西文明交汇",
      notes: "车架融入敦煌飞天线条，前叉饰以百合花铁艺造型",
    },
    {
      title: "和鸣·坦桑尼亚",
      recipient_country: "坦桑尼亚",
      recipient_institution: "坦桑尼亚总统府",
      diplomatic_occasion: "中非合作论坛峰会赠礼",
      delivery_date: "2023-09-04",
      body_color: "赤金",
      chinese_elements: "祥云纹、青花瓷色点缀",
      recipient_culture_elements: "马赛族珠饰图腾、乞力马扎罗山轮廓",
      theme_symbolism: "中非命运共同体",
      notes: "车身主色为赤金，泥除饰以马赛族珠饰图案",
    },
    {
      title: "樱花和风·日本",
      recipient_country: "日本",
      recipient_institution: "日本内阁府",
      diplomatic_occasion: "中日和平友好条约45周年",
      delivery_date: "2023-11-10",
      body_color: "墨黑",
      chinese_elements: "水墨山水、云龙纹",
      recipient_culture_elements: "樱花纹、和纸纹理",
      theme_symbolism: "一衣带水·世代友好",
      notes: "车架漆面为墨黑底色，侧身绘水墨山水与樱花交融画面",
    },
    {
      title: "碧海银帆·马尔代夫",
      recipient_country: "马尔代夫",
      recipient_institution: "马尔代夫总统办公室",
      diplomatic_occasion: "共建一带一路十周年",
      delivery_date: "2023-12-15",
      body_color: "海蓝",
      chinese_elements: "郑和宝船纹、海浪纹",
      recipient_culture_elements: "椰树、珊瑚、传统多尼船",
      theme_symbolism: "海上丝路·碧海同心",
      notes: "海蓝车身配银色帆船浮雕，把立处镶嵌珊瑚纹铜饰",
    },
    {
      title: "瑞雪金鹏·哈萨克斯坦",
      recipient_country: "哈萨克斯坦",
      recipient_institution: "哈萨克斯坦总统府",
      diplomatic_occasion: "中国-中亚峰会国礼",
      delivery_date: "2023-05-18",
      body_color: "雪白",
      chinese_elements: "金鹏展翅纹、如意纹",
      recipient_culture_elements: "猎鹰图腾、草原毡房纹样",
      theme_symbolism: "金鹏万里·丝路新篇",
      notes: "雪白车身配金色猎鹰浮雕，泥除绘草原毡房与如意纹",
    },
    {
      title: "丹凤朝阳·巴基斯坦",
      recipient_country: "巴基斯坦",
      recipient_institution: "巴基斯坦总理府",
      diplomatic_occasion: "中巴全天候战略合作伙伴关系深化",
      delivery_date: "2024-01-20",
      body_color: "翡翠绿",
      chinese_elements: "丹凤朝阳纹、玉石镶嵌",
      recipient_culture_elements: "新月星徽、莫卧儿花卉纹",
      theme_symbolism: "铁杆友谊·丹凤朝阳",
      notes: "翡翠绿车身配玉石铭牌，车把饰以新月星徽铜件",
    },
  ];

  for (let i = 0; i < gifts.length; i++) {
    const data = gifts[i];
    const gift = createGift(data);

    if (i < 3) {
      for (const level of REVIEW_LEVELS) {
        addAuditLog(gift.id, level, "approve", "系统种子", `${level}审核通过`);
      }
      updateGiftStatus(gift.id, STATUS_IN_PRODUCTION, {
        production_start_date: "2023-03-01",
        current_review_level: null,
      });

      const craftTypes = [
        { type: "漆画", craftsman: "张师傅" },
        { type: "云母", craftsman: "李师傅" },
        { type: "金箔", craftsman: "王师傅" },
        { type: "铭牌刻字", craftsman: "赵师傅" },
      ];

      for (const ct of craftTypes) {
        const item = addCraftItem(gift.id, ct.type, ct.craftsman);
        completeCraftItem(item.id);
      }

      if (i < 2) {
        updateGiftStatus(gift.id, STATUS_DELIVERED, {
          delivery_date: data.delivery_date,
          production_end_date: "2023-08-15",
        });

        updateGiftStatus(gift.id, STATUS_ARCHIVED, {
          archived_at: data.delivery_date,
        });

        const archived = getGiftById(gift.id);
        createArchive(gift.id, archived);
      } else if (i === 2) {
        updateGiftStatus(gift.id, STATUS_PENDING_DELIVERY, {
          production_end_date: "2023-10-20",
        });
      }
    } else if (i === 3) {
      addAuditLog(
        gift.id,
        REVIEW_LEVELS[0],
        "approve",
        "系统种子",
        "品牌审核通过",
      );
      addAuditLog(
        gift.id,
        REVIEW_LEVELS[1],
        "approve",
        "系统种子",
        "外事审核通过",
      );
      updateGiftStatus(gift.id, STATUS_PENDING_REVIEW, {
        current_review_level: REVIEW_LEVELS[2],
      });
    } else if (i === 4) {
      addAuditLog(
        gift.id,
        REVIEW_LEVELS[0],
        "reject",
        "系统种子",
        "车身配色需重新考虑文化适配性",
      );
      updateGiftStatus(gift.id, STATUS_DRAFT, { current_review_level: null });
    } else if (i === 5) {
      addAuditLog(
        gift.id,
        REVIEW_LEVELS[0],
        "approve",
        "系统种子",
        "品牌审核通过",
      );
      updateGiftStatus(gift.id, STATUS_PENDING_REVIEW, {
        current_review_level: REVIEW_LEVELS[1],
      });
    }
  }

  console.log(`已植入 ${gifts.length} 份国礼车示例数据`);
}

module.exports = seed;
