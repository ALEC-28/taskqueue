const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.POSTGRES_HOST || 'localhost',
  port:     process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB   || 'taskqueue',
  user:     process.env.POSTGRES_USER || 'admin',
  password: process.env.POSTGRES_PASS || 'secret',
});

pool.on('error', (err) => {
  console.error('[db] unexpected error:', err.message);
});

// Convenience wrapper — always returns rows
async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

module.exports = { pool, query };
