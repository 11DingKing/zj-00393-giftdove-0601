const express = require("express");
const router = express.Router();
const { getDb, STATUS_LIST } = require("../models/db");
const { getChangeDelayStats } = require("../models/occasionChange");

router.get("/overview", (req, res) => {
  const db = getDb();
  const total = db
    .prepare("SELECT COUNT(*) as count FROM national_gifts")
    .get().count;
  const byStatus = {};
  for (const s of STATUS_LIST) {
    byStatus[s] = db
      .prepare("SELECT COUNT(*) as count FROM national_gifts WHERE status = ?")
      .get(s).count;
  }
  const byYear = db
    .prepare(
      `
    SELECT strftime('%Y', created_at) as year, COUNT(*) as count
    FROM national_gifts GROUP BY year ORDER BY year DESC
  `,
    )
    .all();
  const byCountry = db
    .prepare(
      `
    SELECT recipient_country as country, COUNT(*) as count
    FROM national_gifts GROUP BY country ORDER BY count DESC
  `,
    )
    .all();

  res.json({
    success: true,
    data: {
      total,
      by_status: byStatus,
      by_year: byYear,
      by_country: byCountry,
    },
  });
});

router.get("/production-cycle", (req, res) => {
  const db = getDb();
  const year = req.query.year;

  let query = `
    SELECT id, title, recipient_country, production_start_date, production_end_date,
      has_occasion_change, original_delivery_date, delivery_date,
      CAST(julianday(production_end_date) - julianday(production_start_date) AS INTEGER) as cycle_days
    FROM national_gifts
    WHERE production_start_date IS NOT NULL AND production_end_date IS NOT NULL
  `;
  const params = [];

  if (year) {
    query += " AND strftime('%Y', production_start_date) = ?";
    params.push(year);
  }

  query += " ORDER BY production_start_date DESC";
  const records = db.prepare(query).all(...params);

  const giftIds = records.map((r) => r.id);
  const changeInfo = {};
  if (giftIds.length > 0) {
    const placeholders = giftIds.map(() => "?").join(",");
    const changeRows = db
      .prepare(
        `
      SELECT gift_id, COUNT(*) as change_count,
        SUM(CASE WHEN extra_delay_days IS NOT NULL THEN extra_delay_days ELSE 0 END) as total_delay_days,
        GROUP_CONCAT(change_type, '、') as change_types
      FROM occasion_changes
      WHERE gift_id IN (${placeholders}) AND change_status = 'implemented'
      GROUP BY gift_id
    `,
      )
      .all(...giftIds);
    for (const cr of changeRows) {
      changeInfo[cr.gift_id] = {
        change_count: cr.change_count,
        total_delay_days: cr.total_delay_days,
        change_types: cr.change_types ? cr.change_types.split("、") : [],
      };
    }
  }

  const enrichedRecords = records.map((r) => ({
    ...r,
    has_occasion_change: !!r.has_occasion_change,
    change_info: changeInfo[r.id] || {
      change_count: 0,
      total_delay_days: 0,
      change_types: [],
    },
  }));

  const cycles = enrichedRecords
    .map((r) => r.cycle_days)
    .filter((d) => d !== null && d >= 0);
  const avgCycle =
    cycles.length > 0
      ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length)
      : 0;
  const maxCycle = cycles.length > 0 ? Math.max(...cycles) : 0;
  const minCycle = cycles.length > 0 ? Math.min(...cycles) : 0;

  const changedRecords = enrichedRecords.filter((r) => r.has_occasion_change);
  const changedCycles = changedRecords
    .map((r) => r.cycle_days)
    .filter((d) => d >= 0);
  const unchangedRecords = enrichedRecords.filter(
    (r) => !r.has_occasion_change,
  );
  const unchangedCycles = unchangedRecords
    .map((r) => r.cycle_days)
    .filter((d) => d >= 0);

  res.json({
    success: true,
    data: {
      records: enrichedRecords,
      summary: {
        total: enrichedRecords.length,
        avg_cycle_days: avgCycle,
        max_cycle_days: maxCycle,
        min_cycle_days: minCycle,
        changed_count: changedRecords.length,
        unchanged_count: unchangedRecords.length,
        avg_cycle_changed_days:
          changedCycles.length > 0
            ? Math.round(
                changedCycles.reduce((a, b) => a + b, 0) / changedCycles.length,
              )
            : 0,
        avg_cycle_unchanged_days:
          unchangedCycles.length > 0
            ? Math.round(
                unchangedCycles.reduce((a, b) => a + b, 0) /
                  unchangedCycles.length,
              )
            : 0,
      },
    },
  });
});

router.get("/change-delays", (req, res) => {
  const year = req.query.year;
  const data = getChangeDelayStats(year);
  const totalDelays = data.reduce(
    (s, d) => s + (d.total_extra_delay_days || 0),
    0,
  );
  const avgDelay = data.length > 0 ? Math.round(totalDelays / data.length) : 0;
  const maxDelay =
    data.length > 0
      ? Math.max(...data.map((d) => d.total_extra_delay_days || 0))
      : 0;
  res.json({
    success: true,
    data: {
      records: data,
      summary: {
        affected_order_count: data.length,
        total_extra_delay_days: totalDelays,
        avg_delay_per_order: avgDelay,
        max_delay_days: maxDelay,
      },
    },
  });
});

router.get("/change-overview", (req, res) => {
  const db = getDb();
  const year = req.query.year;

  let where = "";
  const params = [];
  if (year) {
    where = "WHERE strftime('%Y', created_at) = ?";
    params.push(year);
  }

  const byType = db
    .prepare(
      `
    SELECT change_type, COUNT(*) as count
    FROM occasion_changes
    ${where}
    GROUP BY change_type ORDER BY count DESC
  `,
    )
    .all(...params);

  const byStatus = db
    .prepare(
      `
    SELECT change_status, COUNT(*) as count
    FROM occasion_changes
    ${where}
    GROUP BY change_status
  `,
    )
    .all(...params);

  const total = byStatus.reduce((s, r) => s + r.count, 0);
  const implemented =
    (byStatus.find((r) => r.change_status === "implemented") || {}).count || 0;

  res.json({
    success: true,
    data: {
      total_changes: total,
      implemented_count: implemented,
      by_type: byType,
      by_status: byStatus,
    },
  });
});

router.get("/yearly-count", (req, res) => {
  const db = getDb();
  const startYear = req.query.start_year;
  const endYear = req.query.end_year;

  let query = `
    SELECT strftime('%Y', created_at) as year, COUNT(*) as count
    FROM national_gifts
  `;
  const conditions = [];
  const params = [];

  if (startYear) {
    conditions.push("strftime('%Y', created_at) >= ?");
    params.push(startYear);
  }
  if (endYear) {
    conditions.push("strftime('%Y', created_at) <= ?");
    params.push(endYear);
  }

  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
  query += " GROUP BY year ORDER BY year ASC";

  const data = db.prepare(query).all(...params);
  res.json({ success: true, data });
});

module.exports = router;
