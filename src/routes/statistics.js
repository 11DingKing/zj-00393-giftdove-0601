const express = require("express");
const router = express.Router();
const { getDb, STATUS_LIST } = require("../models/db");

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

  const cycles = records
    .map((r) => r.cycle_days)
    .filter((d) => d !== null && d >= 0);
  const avgCycle =
    cycles.length > 0
      ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length)
      : 0;
  const maxCycle = cycles.length > 0 ? Math.max(...cycles) : 0;
  const minCycle = cycles.length > 0 ? Math.min(...cycles) : 0;

  res.json({
    success: true,
    data: {
      records,
      summary: {
        total: records.length,
        avg_cycle_days: avgCycle,
        max_cycle_days: maxCycle,
        min_cycle_days: minCycle,
      },
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
