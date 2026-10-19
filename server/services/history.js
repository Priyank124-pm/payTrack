// Effective-dated project assignments (portal / PM / coordinator).
// Changing one of these records a history row with an effective date; milestones then resolve
// the value that applied to *their month*, so past months keep their old portal/PM/PC.
//
// A milestone belongs to the value in force at the END of its month: a month that finished before
// the change date keeps the old value; the month containing the change date (and later) uses the new one.
const TRACKED = { portal: 'portal', manager_id: 'manager_id', coordinator_id: 'coordinator_id' };

// SQL expression: value of `field` for project column `projectCol` as of `dateExpr`,
// falling back to `fallback` (the project's current value) when there is no history.
// Coordinator "none" is stored as '' so it doesn't fall through to the current value.
const asOf = (field, projectCol, dateExpr, fallback) =>
  `COALESCE((SELECT h.value FROM project_history h
             WHERE h.project_id = ${projectCol} AND h.field = '${field}' AND h.effective_from <= ${dateExpr}
             ORDER BY h.effective_from DESC, h.created_at DESC LIMIT 1), ${fallback})`;

const MONTH_END = (m = 'm') => `LAST_DAY(STR_TO_DATE(CONCAT(${m}.year,'-',${m}.month,'-01'),'%Y-%m-%d'))`;

// Ready-made select fragments for a milestone alias `m` joined to projects alias `p`
const resolvedCols = (m = 'm', p = 'p') => `
  ${asOf('portal',         `${p}.id`, MONTH_END(m), `${p}.portal`)}                 AS portal,
  NULLIF(${asOf('manager_id',     `${p}.id`, MONTH_END(m), `${p}.manager_id`)}, '')     AS pm_id,
  NULLIF(${asOf('coordinator_id', `${p}.id`, MONTH_END(m), `COALESCE(${p}.coordinator_id,'')`)}, '') AS pc_id`;

// Record changes made by a project update. `existing` = row before update, `body` = incoming fields.
async function recordChanges(pool, projectId, existing, body, effectiveFrom, userId) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom || '') ? effectiveFrom : new Date().toISOString().slice(0, 10);
  for (const field of Object.keys(TRACKED)) {
    if (body[field] === undefined) continue;
    const oldVal = existing[field] || '';
    const newVal = body[field] || '';
    if (oldVal === newVal) continue;
    const [has] = await pool.query('SELECT 1 FROM project_history WHERE project_id = ? AND field = ? LIMIT 1', [projectId, field]);
    if (!has.length) {
      // Baseline so months before the change keep resolving to the original value
      await pool.query(`INSERT INTO project_history (id, project_id, field, value, effective_from, changed_by)
                        VALUES (UUID(), ?, ?, ?, '1970-01-01', NULL)`, [projectId, field, oldVal]);
    }
    await pool.query('DELETE FROM project_history WHERE project_id = ? AND field = ? AND effective_from = ?', [projectId, field, date]);
    await pool.query(`INSERT INTO project_history (id, project_id, field, value, effective_from, changed_by)
                      VALUES (UUID(), ?, ?, ?, ?, ?)`, [projectId, field, newVal, date, userId || null]);
  }
}

module.exports = { asOf, MONTH_END, resolvedCols, recordChanges };
