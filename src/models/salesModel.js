const db = require('../config/db');

/**
 * Fetch sales records for an admin within their tenant.
 * Strictly scoped to tenant_id from JWT.
 */
async function getSalesByTenant(tenantId) {
  const result = await db.query(
    'SELECT id, amount, sale_date, client_name FROM sales_records WHERE tenant_id = $1 ORDER BY id ASC',
    [tenantId]
  );
  return result.rows;
}

/**
 * Fetch sales records for an agent within their tenant.
 * Strictly scoped to tenant_id and agent_id from JWT.
 */
async function getSalesByTenantAndAgent(tenantId, agentId) {
  const result = await db.query(
    'SELECT id, amount, sale_date, client_name FROM sales_records WHERE tenant_id = $1 AND agent_id = $2 ORDER BY id ASC',
    [tenantId, agentId]
  );
  return result.rows;
}

module.exports = {
  getSalesByTenant,
  getSalesByTenantAndAgent,
};
