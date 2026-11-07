const express = require('express');
const db = require('./db');

const router = express.Router();

// ---------- helpers ----------
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function paging(req) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 200);
  return { page, limit, offset: (page - 1) * limit };
}

function isId(v) { return /^\d+$/.test(v); }

async function getOne(res, sql, params, label) {
  const [rows] = await db.query(sql, params);
  if (!rows.length) return res.status(404).json({ error: `${label} not found` });
  res.json(rows[0]);
}

// ---------- index ----------
router.get('/', (req, res) => {
  res.json({
    endpoints: [
      'GET /api/classes', 'GET /api/classes/:id', 'GET /api/classes/:id/students', 'GET /api/classes/:id/ranking',
      'GET /api/subjects', 'GET /api/subjects/:id',
      'GET /api/trainers', 'GET /api/trainers/:id',
      'GET /api/students?page&limit&search&class_id&gender', 'GET /api/students/:id', 'GET /api/students/:id/scores',
      'GET /api/scores?page&limit&class_id&sub_id&t_id&student_id', 'GET /api/scores/:id',
      'GET /api/reports/subject-average'
    ]
  });
});

// ---------- classes ----------
router.get('/classes', wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT c.*, COUNT(s.id) AS total_students
     FROM class c LEFT JOIN student s ON s.class_id = c.class_id
     GROUP BY c.class_id ORDER BY c.class_id`);
  res.json({ count: rows.length, data: rows });
}));

router.get('/classes/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  await getOne(res,
    `SELECT c.*, COUNT(s.id) AS total_students
     FROM class c LEFT JOIN student s ON s.class_id = c.class_id
     WHERE c.class_id = ? GROUP BY c.class_id`, [req.params.id], 'Class');
}));

router.get('/classes/:id/students', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const [rows] = await db.query('SELECT * FROM student WHERE class_id = ? ORDER BY id', [req.params.id]);
  res.json({ count: rows.length, data: rows });
}));

// ranking of students in a class by average of final_score
router.get('/classes/:id/ranking', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const [rows] = await db.query(
    `SELECT RANK() OVER (ORDER BY AVG(sd.final_score) DESC) AS \`rank\`,
            st.id AS student_id, st.name,
            ROUND(AVG(sd.final_score), 2) AS avg_final_score
     FROM scoredetail sd JOIN student st ON st.id = sd.student_id
     WHERE sd.class_id = ?
     GROUP BY st.id, st.name
     ORDER BY \`rank\``, [req.params.id]);
  res.json({ count: rows.length, data: rows });
}));

// ---------- subjects ----------
router.get('/subjects', wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM subject ORDER BY sub_id');
  res.json({ count: rows.length, data: rows });
}));

router.get('/subjects/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  await getOne(res, 'SELECT * FROM subject WHERE sub_id = ?', [req.params.id], 'Subject');
}));

// ---------- trainers ----------
router.get('/trainers', wrap(async (req, res) => {
  const [rows] = await db.query('SELECT * FROM trainer ORDER BY t_id');
  res.json({ count: rows.length, data: rows });
}));

router.get('/trainers/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  await getOne(res, 'SELECT * FROM trainer WHERE t_id = ?', [req.params.id], 'Trainer');
}));

// ---------- students ----------
router.get('/students', wrap(async (req, res) => {
  const { page, limit, offset } = paging(req);
  const where = [];
  const params = [];

  if (req.query.search) { where.push('s.name LIKE ?'); params.push(`%${req.query.search}%`); }
  if (req.query.class_id) { where.push('s.class_id = ?'); params.push(req.query.class_id); }
  if (req.query.gender) {
    if (!['M', 'F'].includes(req.query.gender)) return res.status(400).json({ error: 'gender must be M or F' });
    where.push('s.gender = ?'); params.push(req.query.gender);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM student s ${w}`, params);
  const [rows] = await db.query(
    `SELECT s.*, c.class_name FROM student s
     JOIN class c ON c.class_id = s.class_id
     ${w} ORDER BY s.id LIMIT ? OFFSET ?`, [...params, limit, offset]);

  res.json({ page, limit, total, total_pages: Math.ceil(total / limit), data: rows });
}));

router.get('/students/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  await getOne(res,
    `SELECT s.*, c.class_name FROM student s
     JOIN class c ON c.class_id = s.class_id WHERE s.id = ?`, [req.params.id], 'Student');
}));

router.get('/students/:id/scores', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const [rows] = await db.query(
    `SELECT sd.id, sub.name AS subject, t.name AS trainer,
            sd.homework, sd.minterm, sd.assignment, sd.final_score
     FROM scoredetail sd
     JOIN subject sub ON sub.sub_id = sd.sub_id
     JOIN trainer t ON t.t_id = sd.t_id
     WHERE sd.student_id = ? ORDER BY sd.sub_id`, [req.params.id]);
  const avg = rows.length ? +(rows.reduce((a, r) => a + Number(r.final_score), 0) / rows.length).toFixed(2) : null;
  res.json({ count: rows.length, average_final_score: avg, data: rows });
}));

// ---------- scores ----------
router.get('/scores', wrap(async (req, res) => {
  const { page, limit, offset } = paging(req);
  const filters = { class_id: 'sd.class_id', sub_id: 'sd.sub_id', t_id: 'sd.t_id', student_id: 'sd.student_id' };
  const where = [];
  const params = [];
  for (const [q, col] of Object.entries(filters)) {
    if (req.query[q]) { where.push(`${col} = ?`); params.push(req.query[q]); }
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM scoredetail sd ${w}`, params);
  const [rows] = await db.query(
    `SELECT sd.id, sd.student_id, st.name AS student, c.class_name,
            sub.name AS subject, t.name AS trainer,
            sd.homework, sd.minterm, sd.assignment, sd.final_score
     FROM scoredetail sd
     JOIN student st ON st.id = sd.student_id
     JOIN class c ON c.class_id = sd.class_id
     JOIN subject sub ON sub.sub_id = sd.sub_id
     JOIN trainer t ON t.t_id = sd.t_id
     ${w} ORDER BY sd.id LIMIT ? OFFSET ?`, [...params, limit, offset]);

  res.json({ page, limit, total, total_pages: Math.ceil(total / limit), data: rows });
}));

router.get('/scores/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  await getOne(res,
    `SELECT sd.*, st.name AS student, c.class_name, sub.name AS subject, t.name AS trainer
     FROM scoredetail sd
     JOIN student st ON st.id = sd.student_id
     JOIN class c ON c.class_id = sd.class_id
     JOIN subject sub ON sub.sub_id = sd.sub_id
     JOIN trainer t ON t.t_id = sd.t_id
     WHERE sd.id = ?`, [req.params.id], 'Score');
}));

// ---------- reports ----------
router.get('/reports/subject-average', wrap(async (req, res) => {
  const [rows] = await db.query(
    `SELECT sub.sub_id, sub.name AS subject,
            ROUND(AVG(sd.homework),2) AS avg_homework,
            ROUND(AVG(sd.minterm),2) AS avg_minterm,
            ROUND(AVG(sd.assignment),2) AS avg_assignment,
            ROUND(AVG(sd.final_score),2) AS avg_final_score
     FROM subject sub JOIN scoredetail sd ON sd.sub_id = sub.sub_id
     GROUP BY sub.sub_id, sub.name ORDER BY sub.sub_id`);
  res.json({ count: rows.length, data: rows });
}));

module.exports = router;
