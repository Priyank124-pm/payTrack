const express = require('express');
const pool    = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const { logActivity }  = require('../services/logger');

const router = express.Router();
router.use(authenticate);

const ADMIN_ROLES = ['super_admin', 'sub_admin'];
const isAdmin = u => ADMIN_ROLES.includes(u.role);
const isPM    = u => u.role === 'project_manager';

// ── visibility check ─────────────────────────────────────────────
async function canSeeTask(user, task) {
  if (isAdmin(user)) return true;
  if (task.assigned_to === user.id || task.assigned_by === user.id) return true;
  if (isPM(user)) {
    // also see tasks assigned to their coordinators
    const [coords] = await pool.query('SELECT id FROM users WHERE manager_id = ?', [user.id]);
    return coords.some(c => c.id === task.assigned_to);
  }
  return false;
}

// ── GET /api/tasks ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT * FROM tasks';
    const params = [];
    const wheres = [];

    if (isAdmin(req.user)) {
      // see all
    } else if (isPM(req.user)) {
      const [coords] = await pool.query('SELECT id FROM users WHERE manager_id = ?', [req.user.id]);
      const coordIds = coords.map(c => c.id);
      const ids = [req.user.id, ...coordIds];
      wheres.push(`(assigned_to IN (${ids.map(()=>'?').join(',')}) OR assigned_by = ?)`);
      params.push(...ids, req.user.id);
    } else {
      wheres.push('assigned_to = ?');
      params.push(req.user.id);
    }

    if (req.query.status) { wheres.push('status = ?'); params.push(req.query.status); }
    if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
    sql += ' ORDER BY created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/tasks ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { title, description, assigned_to } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!assigned_to)   return res.status(400).json({ error: 'assigned_to is required' });

  try {
    const [targets] = await pool.query('SELECT id, name, role, manager_id FROM users WHERE id = ?', [assigned_to]);
    if (!targets.length) return res.status(400).json({ error: 'Assigned user not found' });
    const target = targets[0];

    // PM can only assign to their own coordinators
    if (isPM(req.user) && target.manager_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only assign tasks to your own coordinators' });
    }
    // Coordinator cannot create tasks
    if (req.user.role === 'coordinator') {
      return res.status(403).json({ error: 'Coordinators cannot create tasks' });
    }

    await pool.query(
      `INSERT INTO tasks (id, title, description, assigned_to, assigned_to_name, assigned_to_role, assigned_by, assigned_by_name)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), description || null, target.id, target.name, target.role, req.user.id, req.user.name]
    );
    const [rows] = await pool.query('SELECT * FROM tasks WHERE assigned_by = ? ORDER BY created_at DESC LIMIT 1', [req.user.id]);
    await logActivity({ user: req.user, action: 'create', entity: 'task', entityId: rows[0].id, detail: `Created task '${title}' → ${target.name}` });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/tasks/:id ─────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const [tasks] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!tasks.length) return res.status(404).json({ error: 'Task not found' });
    const task = tasks[0];
    if (!(await canSeeTask(req.user, task))) return res.status(403).json({ error: 'Access denied' });
    if (req.user.role === 'coordinator') return res.status(403).json({ error: 'Access denied' });

    const { title, description } = req.body;
    const fields = [], values = [];
    if (title !== undefined)       { fields.push('title = ?');       values.push(title.trim()); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description || null); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    await pool.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, [...values, req.params.id]);
    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/tasks/:id/complete ────────────────────────────────
router.patch('/:id/complete', async (req, res) => {
  try {
    const [tasks] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!tasks.length) return res.status(404).json({ error: 'Task not found' });
    const task = tasks[0];
    if (!(await canSeeTask(req.user, task))) return res.status(403).json({ error: 'Access denied' });

    // Only admin or PM can complete
    if (!isAdmin(req.user) && !isPM(req.user)) {
      return res.status(403).json({ error: 'Only admins and project managers can complete tasks' });
    }

    const { note } = req.body;
    await pool.query(
      `UPDATE tasks SET status='completed', completion_note=?, completed_by=?, completed_by_name=?, completed_at=NOW() WHERE id=?`,
      [note || null, req.user.id, req.user.name, req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    await logActivity({ user: req.user, action: 'update', entity: 'task', entityId: req.params.id, detail: `Completed task '${task.title}'` });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /api/tasks/:id/reopen ──────────────────────────────────
router.patch('/:id/reopen', async (req, res) => {
  try {
    const [tasks] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!tasks.length) return res.status(404).json({ error: 'Task not found' });
    if (!isAdmin(req.user) && !isPM(req.user)) return res.status(403).json({ error: 'Access denied' });

    await pool.query(`UPDATE tasks SET status='open', completion_note=NULL, completed_by=NULL, completed_by_name=NULL, completed_at=NULL WHERE id=?`, [req.params.id]);
    const [rows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/tasks/:id ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [tasks] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!tasks.length) return res.status(404).json({ error: 'Task not found' });
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only admins can delete tasks' });

    await pool.query('DELETE FROM task_comments WHERE task_id = ?', [req.params.id]);
    await pool.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    await logActivity({ user: req.user, action: 'delete', entity: 'task', entityId: req.params.id, detail: `Deleted task '${tasks[0].title}'` });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/tasks/:id/comments ──────────────────────────────────
router.get('/:id/comments', async (req, res) => {
  try {
    const [tasks] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!tasks.length) return res.status(404).json({ error: 'Task not found' });
    if (!(await canSeeTask(req.user, tasks[0]))) return res.status(403).json({ error: 'Access denied' });

    const [rows] = await pool.query('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/tasks/:id/comments ─────────────────────────────────
router.post('/:id/comments', async (req, res) => {
  try {
    const [tasks] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!tasks.length) return res.status(404).json({ error: 'Task not found' });
    if (!(await canSeeTask(req.user, tasks[0]))) return res.status(403).json({ error: 'Access denied' });

    const { comment } = req.body;
    if (!comment?.trim()) return res.status(400).json({ error: 'Comment is required' });

    await pool.query(
      `INSERT INTO task_comments (id, task_id, user_id, user_name, user_role, comment) VALUES (UUID(), ?, ?, ?, ?, ?)`,
      [req.params.id, req.user.id, req.user.name, req.user.role, comment.trim()]
    );
    const [rows] = await pool.query('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.status(201).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
