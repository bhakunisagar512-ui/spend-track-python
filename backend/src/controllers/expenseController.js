const pool = require('../config/db');

const getExpenses = async (req, res) => {
  const { month, category, limit = 100, offset = 0 } = req.query;
  try {
    let query = 'SELECT * FROM expenses WHERE user_id = $1';
    const params = [req.user.id];
    let idx = 2;

    if (month) {
      query += ` AND TO_CHAR(date, 'YYYY-MM') = $${idx++}`;
      params.push(month);
    }
    if (category) {
      query += ` AND category = $${idx++}`;
      params.push(category);
    }

    query += ` ORDER BY date DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    res.json({ expenses: result.rows });
  } catch (err) {
    console.error('Get expenses error:', err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
};

const createExpense = async (req, res) => {
  const { amount, description, category, emoji, date } = req.body;
  if (!amount || !description) {
    return res.status(400).json({ error: 'Amount and description are required' });
  }
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO expenses (user_id, amount, description, category, emoji, date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, parseFloat(amount), description.trim(), category || 'Other', emoji || '📦', date || new Date()]
    );
    res.status(201).json({ expense: result.rows[0] });
  } catch (err) {
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Failed to create expense' });
  }
};

const updateExpense = async (req, res) => {
  const { id } = req.params;
  const { amount, description, category, emoji } = req.body;
  try {
    const result = await pool.query(
      `UPDATE expenses SET amount = COALESCE($1, amount), description = COALESCE($2, description),
       category = COALESCE($3, category), emoji = COALESCE($4, emoji)
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [amount, description, category, emoji, id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ expense: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update expense' });
  }
};

const deleteExpense = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
};

const getStats = async (req, res) => {
  const { month } = req.query;
  try {
    let dateFilter = '';
    const params = [req.user.id];
    if (month) {
      dateFilter = `AND TO_CHAR(date, 'YYYY-MM') = $2`;
      params.push(month);
    }

    const [totals, byCategory, daily, overview, months] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total, COUNT(DISTINCT date::date) as active_days FROM expenses WHERE user_id = $1 ${dateFilter}`, params),
      pool.query(`SELECT category, MIN(emoji) as emoji, COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM expenses WHERE user_id = $1 ${dateFilter} GROUP BY category ORDER BY total DESC`, params),
      pool.query(`SELECT TO_CHAR(date,'YYYY-MM-DD') as day, SUM(amount) as total FROM expenses WHERE user_id = $1 AND date >= NOW() - INTERVAL '14 days' GROUP BY day ORDER BY day`, [req.user.id]),
      pool.query(`SELECT COALESCE(SUM(amount),0) as this_month FROM expenses WHERE user_id = $1 AND TO_CHAR(date, 'YYYY-MM') = TO_CHAR(NOW(), 'YYYY-MM')`, [req.user.id]),
      pool.query(`SELECT DISTINCT TO_CHAR(date, 'YYYY-MM') as month FROM expenses WHERE user_id = $1 ORDER BY month DESC`, [req.user.id]),
    ]);

    res.json({
      total: parseFloat(totals.rows[0].total),
      count: parseInt(totals.rows[0].count),
      byCategory: byCategory.rows,
      daily: daily.rows,
      activeDays: parseInt(totals.rows[0].active_days),
      thisMonth: parseFloat(overview.rows[0].this_month),
      months: months.rows.map(r => r.month),
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

// Daily totals for an inclusive date range (YYYY-MM-DD), used by the trend chart
const getDaily = async (req, res) => {
  const { from, to } = req.query;
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  if (!isDay(from) || !isDay(to) || from > to) {
    return res.status(400).json({ error: 'Valid from and to dates (YYYY-MM-DD) are required' });
  }
  try {
    const result = await pool.query(
      `SELECT TO_CHAR(date,'YYYY-MM-DD') as day, SUM(amount) as total FROM expenses
       WHERE user_id = $1 AND date >= $2::date AND date < $3::date + INTERVAL '1 day'
       GROUP BY day ORDER BY day`,
      [req.user.id, from, to]
    );
    res.json({ daily: result.rows });
  } catch (err) {
    console.error('Daily stats error:', err);
    res.status(500).json({ error: 'Failed to fetch daily totals' });
  }
};

module.exports = { getExpenses, createExpense, updateExpense, deleteExpense, getStats, getDaily };
