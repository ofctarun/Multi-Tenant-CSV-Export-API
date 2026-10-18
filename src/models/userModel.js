const db = require('../config/db');

async function findByEmail(email) {
  const result = await db.query(
    'SELECT id, tenant_id, email, password_hash, role FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return result.rows[0] || null;
}

async function findById(id) {
  const result = await db.query(
    'SELECT id, tenant_id, email, password_hash, role FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  findByEmail,
  findById,
};
