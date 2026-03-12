const express = require('express');
const pool    = require('../db/pool');
const { authenticate, getEffectiveManagerId } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /api/reports/monthly?month=&year= ─────────────────────
router.get('/monthly', async (req, res) => {
  const month = parseInt(req.query.month) || new Date().getMonth() + 1;
  const year  = parseInt(req.query.year)  || new Date().getFullYear();

  try {
    const managerId = getEffectiveManagerId(req.user);
    const params = [month, year];
    let managerFilter = '';
    if (managerId) {
      managerFilter = 'AND p.manager_id = ?';
      params.push(managerId);
    }

    // Per-PM summary
    const [pmSummary] = await pool.query(`
      SELECT
        u.id   AS pm_id,
        u.name AS pm_name,
        COUNT(DISTINCT p.id)  AS project_count,
        COUNT(m.id)           AS milestone_count,
        COALESCE(SUM(m.amount),   0) AS gross_target,
        COALESCE(SUM(m.achieved), 0) AS gross_achieved,
        SUM(CASE WHEN m.status='Paid'    THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN m.status='Partial' THEN 1 ELSE 0 END) AS partial_count,
        SUM(CASE WHEN m.status='Pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN m.status='Overdue' THEN 1 ELSE 0 END) AS overdue_count
      FROM users u
      JOIN projects p  ON p.manager_id = u.id
      LEFT JOIN milestones m ON m.project_id = p.id AND m.month = ? AND m.year = ?
      WHERE u.role = 'project_manager' ${managerFilter}
      GROUP BY u.id, u.name
      ORDER BY u.name
    `, params);

    // Per-project detail for the month
    const detailParams = [month, year];
    let detailFilter = '';
    if (managerId) {
      detailFilter = 'AND p.manager_id = ?';
      detailParams.push(managerId);
    }
    const [projectDetail] = await pool.query(`
      SELECT
        p.id, p.name, p.client, p.portal, p.type, p.target_payment,
        u.name AS manager_name,
        COALESCE(SUM(m.amount),   0) AS month_gross,
        COALESCE(SUM(m.achieved), 0) AS month_achieved,
        COUNT(m.id) AS milestone_count
      FROM projects p
      LEFT JOIN users u ON u.id = p.manager_id
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
