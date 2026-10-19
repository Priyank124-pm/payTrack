const express = require('express');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const multer  = require('multer');
const pool    = require('../db/pool');
const { authenticate, isAdmin: adminOnly } = require('../middleware/auth');
const { requirePage, ADMIN_ROLES } = require('../services/access');
const { logActivity }  = require('../services/logger');
const { notify, notifyMany } = require('../services/notifyService');

const router = express.Router();
router.use(authenticate, requirePage('boards'));

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'boards');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).slice(0, 12)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Review', 'Done'];
const isAdmin = u => ADMIN_ROLES.includes(u.role);
const dateOrNull = v => (v ? String(v).slice(0, 10) : null);
const fail = (res, err) => { console.error(err); res.status(500).json({ error: 'Server error' }); };

async function isMember(user, boardId) {
  if (user.sees_all) return true;
  const [r] = await pool.query('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?', [boardId, user.id]);
  return r.length > 0;
}

// Loads a task and verifies the user may touch its board
async function loadTask(req, res) {
  const [rows] = await pool.query('SELECT * FROM board_tasks WHERE id = ?', [req.params.taskId]);
  if (!rows.length) { res.status(404).json({ error: 'Task not found' }); return null; }
  if (!(await isMember(req.user, rows[0].board_id))) { res.status(403).json({ error: 'Access denied' }); return null; }
  return rows[0];
}

async function setMembers(boardId, ids) {
  await pool.query('DELETE FROM board_members WHERE board_id = ?', [boardId]);
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (unique.length) {
    await pool.query('INSERT INTO board_members (board_id, user_id) VALUES ?', [unique.map(u => [boardId, u])]);
  }
}

async function taskWithMeta(id) {
  const [rows] = await pool.query(
    `SELECT t.*, u.name AS assigned_to_name,
            (SELECT COUNT(*) FROM board_task_comments c WHERE c.task_id = t.id)    AS comment_count,
            (SELECT COUNT(*) FROM board_task_attachments a WHERE a.task_id = t.id) AS attachment_count
     FROM board_tasks t LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = ?`, [id]);
  return rows[0];
}

// ── GET /api/boards ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const scoped = !req.user.sees_all;
    const where  = scoped ? 'WHERE b.id IN (SELECT board_id FROM board_members WHERE user_id = ?)' : '';
    const params = scoped ? [req.user.id] : [];
    const [boards] = await pool.query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM board_tasks t WHERE t.board_id = b.id) AS task_count,
              (SELECT COUNT(*) FROM board_tasks t JOIN board_columns c ON c.id = t.column_id
                 WHERE t.board_id = b.id AND c.position = (SELECT MAX(position) FROM board_columns WHERE board_id = b.id)) AS done_count
       FROM boards b ${where} ORDER BY b.created_at DESC`, params);
    const byBoard = new Map(boards.map(b => [b.id, []]));
    if (boards.length) {
      const [members] = await pool.query(
        `SELECT bm.board_id, u.id, u.name FROM board_members bm JOIN users u ON u.id = bm.user_id WHERE bm.board_id IN (?)`,
        [boards.map(b => b.id)]);
      members.forEach(m => byBoard.get(m.board_id).push({ id: m.id, name: m.name }));
    }
    res.json(boards.map(b => ({ ...b, members: byBoard.get(b.id) })));
  } catch (err) { fail(res, err); }
});

// ── POST /api/boards ─────────────────────────────────────────────
router.post('/', adminOnly, async (req, res) => {
  const { name, description, member_ids } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Board name is required' });
  try {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO boards (id, name, description, created_by) VALUES (?, ?, ?, ?)',
      [id, name.trim(), description || null, req.user.id]);
    await pool.query('INSERT INTO board_columns (id, board_id, name, position) VALUES ?',
      [DEFAULT_COLUMNS.map((n, i) => [crypto.randomUUID(), id, n, i])]);
    await setMembers(id, member_ids);
    await logActivity({ user: req.user, action: 'create', entity: 'board', entityId: id, detail: `Created board '${name.trim()}'` });
    await notifyMany((member_ids || []).filter(uid => uid !== req.user.id),
      { type: 'board_assigned', entityType: 'board', entityId: id, title: 'You were added to a board', body: `Board "${name.trim()}"` });
    res.status(201).json({ id });
  } catch (err) { fail(res, err); }
});

// ── PATCH /api/boards/:id ────────────────────────────────────────
router.patch('/:id', adminOnly, async (req, res) => {
  const { name, description, member_ids } = req.body;
  try {
    const [b] = await pool.query('SELECT * FROM boards WHERE id = ?', [req.params.id]);
    if (!b.length) return res.status(404).json({ error: 'Board not found' });
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Board name is required' });
    await pool.query('UPDATE boards SET name = ?, description = ? WHERE id = ?',
      [name !== undefined ? name.trim() : b[0].name, description !== undefined ? (description || null) : b[0].description, req.params.id]);
    if (member_ids !== undefined) {
      const [old] = await pool.query('SELECT user_id FROM board_members WHERE board_id = ?', [req.params.id]);
      await setMembers(req.params.id, member_ids);
      const had = new Set(old.map(o => o.user_id));
      await notifyMany(member_ids.filter(uid => !had.has(uid) && uid !== req.user.id),
        { type: 'board_assigned', entityType: 'board', entityId: req.params.id, title: 'You were added to a board', body: `Board "${b[0].name}"` });
      // Tasks assigned to someone who is no longer a member become unassigned
      const keep = member_ids.length ? member_ids : [''];
      await pool.query(`UPDATE board_tasks SET assigned_to = NULL WHERE board_id = ? AND assigned_to IS NOT NULL AND assigned_to NOT IN (${keep.map(() => '?').join(',')})`, [req.params.id, ...keep]);
    }
    await logActivity({ user: req.user, action: 'update', entity: 'board', entityId: req.params.id, detail: `Updated board '${b[0].name}'` });
    res.json({ message: 'Board updated' });
  } catch (err) { fail(res, err); }
});

// ── DELETE /api/boards/:id ───────────────────────────────────────
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const [b] = await pool.query('SELECT name FROM boards WHERE id = ?', [req.params.id]);
    if (!b.length) return res.status(404).json({ error: 'Board not found' });
    const [files] = await pool.query(
      `SELECT a.stored_name FROM board_task_attachments a JOIN board_tasks t ON t.id = a.task_id WHERE t.board_id = ?`, [req.params.id]);
    await pool.query('DELETE FROM boards WHERE id = ?', [req.params.id]);
    files.forEach(f => fs.unlink(path.join(UPLOAD_DIR, f.stored_name), () => {}));
    await logActivity({ user: req.user, action: 'delete', entity: 'board', entityId: req.params.id, detail: `Deleted board '${b[0].name}'` });
    res.json({ message: 'Board deleted' });
  } catch (err) { fail(res, err); }
});

// ── GET /api/boards/:id  (board + columns + tasks) ───────────────
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [[b], allowed] = await Promise.all([pool.query('SELECT * FROM boards WHERE id = ?', [id]), isMember(req.user, id)]);
    if (!b.length) return res.status(404).json({ error: 'Board not found' });
    if (!allowed) return res.status(403).json({ error: 'Access denied' });
    const [[columns], [members], [tasks]] = await Promise.all([
      pool.query('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position', [id]),
      pool.query(`SELECT u.id, u.name, u.role FROM board_members bm JOIN users u ON u.id = bm.user_id WHERE bm.board_id = ? ORDER BY u.name`, [id]),
      pool.query(
        `SELECT t.*, u.name AS assigned_to_name,
                (SELECT COUNT(*) FROM board_task_comments c WHERE c.task_id = t.id)    AS comment_count,
                (SELECT COUNT(*) FROM board_task_attachments a WHERE a.task_id = t.id) AS attachment_count
         FROM board_tasks t LEFT JOIN users u ON u.id = t.assigned_to
         WHERE t.board_id = ? ORDER BY t.position, t.created_at`, [id]),
    ]);
    res.json({ board: b[0], columns, members, tasks });
  } catch (err) { fail(res, err); }
});

// ── Columns (admin) ──────────────────────────────────────────────
router.post('/:id/columns', adminOnly, async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Column name is required' });
  try {
    const [m] = await pool.query('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM board_columns WHERE board_id = ?', [req.params.id]);
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO board_columns (id, board_id, name, position) VALUES (?, ?, ?, ?)', [id, req.params.id, name, m[0].pos]);
    res.status(201).json({ id, board_id: req.params.id, name, position: m[0].pos });
  } catch (err) { fail(res, err); }
});

router.patch('/columns/:colId', adminOnly, async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'Column name is required' });
  try {
    await pool.query('UPDATE board_columns SET name = ? WHERE id = ?', [name, req.params.colId]);
    res.json({ message: 'Column renamed' });
  } catch (err) { fail(res, err); }
});

router.delete('/columns/:colId', adminOnly, async (req, res) => {
  try {
    const [c] = await pool.query('SELECT board_id FROM board_columns WHERE id = ?', [req.params.colId]);
    if (!c.length) return res.status(404).json({ error: 'Column not found' });
    const [cnt] = await pool.query('SELECT COUNT(*) AS n FROM board_tasks WHERE column_id = ?', [req.params.colId]);
    if (cnt[0].n > 0) return res.status(400).json({ error: 'Move or delete the tasks in this column first' });
    const [total] = await pool.query('SELECT COUNT(*) AS n FROM board_columns WHERE board_id = ?', [c[0].board_id]);
    if (total[0].n <= 1) return res.status(400).json({ error: 'A board needs at least one column' });
    await pool.query('DELETE FROM board_columns WHERE id = ?', [req.params.colId]);
    res.json({ message: 'Column deleted' });
  } catch (err) { fail(res, err); }
});

// ── Tasks ────────────────────────────────────────────────────────
async function validateAssignee(boardId, userId) {
  if (!userId) return true;
  const [r] = await pool.query('SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?', [boardId, userId]);
  return r.length > 0;
}

router.post('/:id/tasks', async (req, res) => {
  const { title, description, column_id, assigned_to, start_date, due_date } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
  if (start_date && due_date && due_date < start_date) return res.status(400).json({ error: 'Due date cannot be before start date' });
  try {
    if (!(await isMember(req.user, req.params.id))) return res.status(403).json({ error: 'Access denied' });
    const [col] = await pool.query('SELECT id FROM board_columns WHERE id = ? AND board_id = ?', [column_id, req.params.id]);
    if (!col.length) return res.status(400).json({ error: 'Invalid column' });
    if (!(await validateAssignee(req.params.id, assigned_to))) return res.status(400).json({ error: 'Assignee must be a board member' });

    const [m] = await pool.query('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM board_tasks WHERE column_id = ?', [column_id]);
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO board_tasks (id, board_id, column_id, title, description, assigned_to, start_date, due_date, position, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, column_id, title.trim(), description || null, assigned_to || null, dateOrNull(start_date), dateOrNull(due_date), m[0].pos, req.user.id]);
    await logActivity({ user: req.user, action: 'create', entity: 'board_task', entityId: id, detail: `Created board task '${title.trim()}'` });
    if (assigned_to && assigned_to !== req.user.id) {
      await notify(assigned_to, { type: 'task_assigned', entityType: 'board', entityId: req.params.id, title: 'New task assigned to you', body: `"${title.trim()}" — assigned by ${req.user.name}` });
    }
    res.status(201).json(await taskWithMeta(id));
  } catch (err) { fail(res, err); }
});

router.patch('/tasks/:taskId', async (req, res) => {
  try {
    const task = await loadTask(req, res); if (!task) return;
    const { title, description, assigned_to, start_date, due_date, column_id, position } = req.body;

    const fields = [], values = [];
    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: 'Title is required' });
      fields.push('title = ?'); values.push(title.trim());
    }
    if (description !== undefined) { fields.push('description = ?'); values.push(description || null); }
    if (start_date !== undefined)  { fields.push('start_date = ?');  values.push(dateOrNull(start_date)); }
    if (due_date !== undefined)    { fields.push('due_date = ?');    values.push(dateOrNull(due_date)); }
    const s = start_date !== undefined ? dateOrNull(start_date) : (task.start_date && task.start_date.toISOString?.().slice(0, 10));
    const d = due_date   !== undefined ? dateOrNull(due_date)   : (task.due_date   && task.due_date.toISOString?.().slice(0, 10));
    if (s && d && d < s) return res.status(400).json({ error: 'Due date cannot be before start date' });

    if (assigned_to !== undefined) {
      if (!(await validateAssignee(task.board_id, assigned_to))) return res.status(400).json({ error: 'Assignee must be a board member' });
      fields.push('assigned_to = ?'); values.push(assigned_to || null);
    }
    if (fields.length) await pool.query(`UPDATE board_tasks SET ${fields.join(', ')} WHERE id = ?`, [...values, task.id]);

    // Move / reorder
    if (column_id !== undefined) {
      const [col] = await pool.query('SELECT id FROM board_columns WHERE id = ? AND board_id = ?', [column_id, task.board_id]);
      if (!col.length) return res.status(400).json({ error: 'Invalid column' });
      const [others] = await pool.query('SELECT id, position FROM board_tasks WHERE column_id = ? AND id <> ? ORDER BY position, created_at', [column_id, task.id]);
      const order = others.slice();
      const at = Math.min(Math.max(parseInt(position) || order.length, 0), order.length);
      order.splice(position === undefined ? order.length : at, 0, { id: task.id, position: null });
      // Write only what changed: the moved task, plus neighbours whose index shifted
      await Promise.all(order.flatMap((t, i) =>
        t.id === task.id
          ? [pool.query('UPDATE board_tasks SET column_id = ?, position = ? WHERE id = ?', [column_id, i, t.id])]
          : t.position !== i ? [pool.query('UPDATE board_tasks SET position = ? WHERE id = ?', [i, t.id])] : []));
    }

    if (assigned_to && assigned_to !== task.assigned_to && assigned_to !== req.user.id) {
      await notify(assigned_to, { type: 'task_assigned', entityType: 'board', entityId: task.board_id, title: 'Task assigned to you', body: `"${task.title}" — assigned by ${req.user.name}` });
    }
    res.json(await taskWithMeta(task.id));
  } catch (err) { fail(res, err); }
});

router.delete('/tasks/:taskId', async (req, res) => {
  try {
    const task = await loadTask(req, res); if (!task) return;
    if (!isAdmin(req.user) && task.created_by !== req.user.id) return res.status(403).json({ error: 'Only admins or the creator can delete this task' });
    const [files] = await pool.query('SELECT stored_name FROM board_task_attachments WHERE task_id = ?', [task.id]);
    await pool.query('DELETE FROM board_tasks WHERE id = ?', [task.id]);
    files.forEach(f => fs.unlink(path.join(UPLOAD_DIR, f.stored_name), () => {}));
    await logActivity({ user: req.user, action: 'delete', entity: 'board_task', entityId: task.id, detail: `Deleted board task '${task.title}'` });
    res.json({ message: 'Task deleted' });
  } catch (err) { fail(res, err); }
});

// ── Comments ─────────────────────────────────────────────────────
router.get('/tasks/:taskId/comments', async (req, res) => {
  try {
    const task = await loadTask(req, res); if (!task) return;
    const [rows] = await pool.query('SELECT * FROM board_task_comments WHERE task_id = ? ORDER BY created_at', [task.id]);
    res.json(rows);
  } catch (err) { fail(res, err); }
});

router.post('/tasks/:taskId/comments', async (req, res) => {
  try {
    const task = await loadTask(req, res); if (!task) return;
    const comment = req.body.comment?.trim();
    if (!comment) return res.status(400).json({ error: 'Comment is required' });
    await pool.query('INSERT INTO board_task_comments (id, task_id, user_id, user_name, user_role, comment) VALUES (UUID(), ?, ?, ?, ?, ?)',
      [task.id, req.user.id, req.user.name, req.user.role, comment]);
    const others = new Set([task.assigned_to, task.created_by]);
    others.delete(req.user.id);
    for (const uid of others) {
      if (uid) await notify(uid, { type: 'task_comment', entityType: 'board', entityId: task.board_id, title: 'New comment on a board task', body: `${req.user.name} commented on "${task.title}"` });
    }
    const [rows] = await pool.query('SELECT * FROM board_task_comments WHERE task_id = ? ORDER BY created_at', [task.id]);
    res.status(201).json(rows);
  } catch (err) { fail(res, err); }
});

// ── Attachments ──────────────────────────────────────────────────
router.get('/tasks/:taskId/attachments', async (req, res) => {
  try {
    const task = await loadTask(req, res); if (!task) return;
    const [rows] = await pool.query(
      'SELECT id, task_id, file_name, mime_type, size, uploader_name, created_at FROM board_task_attachments WHERE task_id = ? ORDER BY created_at', [task.id]);
    res.json(rows);
  } catch (err) { fail(res, err); }
});

router.post('/tasks/:taskId/attachments', async (req, res) => {
  // Authorise before accepting the upload so rejected requests leave no file behind
  let task;
  try { task = await loadTask(req, res); } catch (err) { return fail(res, err); }
  if (!task) return;

  upload.array('files', 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 10 MB)' : err.message });
    if (!req.files?.length) return res.status(400).json({ error: 'No file received' });
    try {
      await pool.query(
        `INSERT INTO board_task_attachments (id, task_id, file_name, stored_name, mime_type, size, uploaded_by, uploader_name) VALUES ?`,
        [req.files.map(f => [crypto.randomUUID(), task.id, Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 255), f.filename, f.mimetype, f.size, req.user.id, req.user.name])]);
      const [rows] = await pool.query(
        'SELECT id, task_id, file_name, mime_type, size, uploader_name, created_at FROM board_task_attachments WHERE task_id = ? ORDER BY created_at', [task.id]);
      res.status(201).json(rows);
    } catch (e) { fail(res, e); }
  });
});

router.get('/attachments/:attId/download', async (req, res) => {
  try {
    const [a] = await pool.query(
      `SELECT a.*, t.board_id FROM board_task_attachments a JOIN board_tasks t ON t.id = a.task_id WHERE a.id = ?`, [req.params.attId]);
    if (!a.length) return res.status(404).json({ error: 'Attachment not found' });
    if (!(await isMember(req.user, a[0].board_id))) return res.status(403).json({ error: 'Access denied' });
    res.download(path.join(UPLOAD_DIR, a[0].stored_name), a[0].file_name);
  } catch (err) { fail(res, err); }
});

router.delete('/attachments/:attId', async (req, res) => {
  try {
    const [a] = await pool.query(
      `SELECT a.*, t.board_id FROM board_task_attachments a JOIN board_tasks t ON t.id = a.task_id WHERE a.id = ?`, [req.params.attId]);
    if (!a.length) return res.status(404).json({ error: 'Attachment not found' });
    if (!(await isMember(req.user, a[0].board_id))) return res.status(403).json({ error: 'Access denied' });
    if (!isAdmin(req.user) && a[0].uploaded_by !== req.user.id) return res.status(403).json({ error: 'Only admins or the uploader can remove this file' });
    await pool.query('DELETE FROM board_task_attachments WHERE id = ?', [req.params.attId]);
    fs.unlink(path.join(UPLOAD_DIR, a[0].stored_name), () => {});
    res.json({ message: 'Attachment removed' });
  } catch (err) { fail(res, err); }
});

module.exports = router;
