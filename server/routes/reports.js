const express = require('express');
const pool    = require('../db/pool');
const { authenticate, getEffectiveManagerId } = require('../middleware/auth');
const { asOf } = require('../services/history');

const router = express.Router();
router.use(authenticate);

// ── GET /api/reports/monthly?month=&year= ─────────────────────
router.get('/monthly', async (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year  = parseInt(req.query.year)  || new Date().getFullYear();

  try {
    const managerId = getEffectiveManagerId(req.user);

    // Portal / PM as they were in the selected month (history-aware); month-end is the reference date.
    const asOfDate = `LAST_DAY('${year}-${String(month).padStart(2, '0')}-01')`;
    const pmExpr     = asOf('manager_id', 'p.id', asOfDate, 'p.manager_id');
    const portalExpr = asOf('portal',     'p.id', asOfDate, 'p.portal');

    // Per-PM summary
    const pmParams = [month, year];
    let pmScope = '';
    if (managerId) { pmScope = 'AND u.id = ?'; pmParams.push(managerId); }
    const [pmSummary] = await pool.query(`
      SELECT
        u.id   AS pm_id,
        u.name AS pm_name,
        (SELECT COUNT(*) FROM projects pp WHERE pp.manager_id = u.id) AS project_count,
        COUNT(x.id)           AS milestone_count,
        COALESCE(SUM(x.amount),   0) AS gross_target,
        COALESCE(SUM(x.achieved), 0) AS gross_achieved,
        SUM(CASE WHEN x.status='Paid'    THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN x.status='Partial' THEN 1 ELSE 0 END) AS partial_count,
        SUM(CASE WHEN x.status='Pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN x.status='Overdue' THEN 1 ELSE 0 END) AS overdue_count
      FROM users u
      LEFT JOIN (
        SELECT m.*, ${pmExpr} AS rpm
        FROM milestones m JOIN projects p ON p.id = m.project_id
        WHERE m.month = ? AND m.year = ?
      ) x ON x.rpm = u.id
      WHERE u.role = 'project_manager' ${pmScope}
        AND (x.id IS NOT NULL OR EXISTS (SELECT 1 FROM projects pp WHERE pp.manager_id = u.id))
      GROUP BY u.id, u.name
      ORDER BY u.name
    `, pmParams);

    // Per-project detail for the month
    const detailParams = [month, year];
    let detailFilter = '';
    if (managerId) {
      detailFilter = `AND ${pmExpr} = ?`;
      detailParams.push(managerId);
    }
    const [projectDetail] = await pool.query(`
      SELECT
        p.id, p.name, p.client, ${portalExpr} AS portal, p.type, p.target_payment,
        ${pmExpr} AS manager_id,
        (SELECT name FROM users WHERE id = ${pmExpr}) AS manager_name,
        COALESCE(SUM(m.amount),   0) AS month_gross,
        COALESCE(SUM(m.achieved), 0) AS month_achieved,
        COUNT(m.id) AS milestone_count
      FROM projects p
      LEFT JOIN milestones m ON m.project_id = p.id AND m.month = ? AND m.year = ?
      WHERE 1=1 ${detailFilter}
      GROUP BY p.id
      HAVING milestone_count > 0
      ORDER BY p.name
    `, detailParams);

    res.json({ month, year, pmSummary, projectDetail });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
