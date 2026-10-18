const salesModel = require('../models/salesModel');

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(val).split('T')[0];
}

function formatCsvValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCsv(records) {
  const headers = ['id', 'amount', 'sale_date', 'client_name'];
  const rows = [headers.join(',')];

  for (const record of records) {
    const id = record.id;
    const amount = Number(record.amount).toFixed(2);
    const saleDate = formatDate(record.sale_date);
    const clientName = formatCsvValue(record.client_name);

    rows.push(`${id},${amount},${saleDate},${clientName}`);
  }

  return rows.join('\n');
}

async function exportSalesCsv(req, res, next) {
  try {
    const { tenantId, role, userId } = req.user;

    // Strict isolation: strictly ignore any tenant_id from query params or body
    let records = [];

    if (role === 'admin') {
      records = await salesModel.getSalesByTenant(tenantId);
    } else if (role === 'agent') {
      records = await salesModel.getSalesByTenantAndAgent(tenantId, userId);
    } else {
      return res.status(403).json({ error: 'Forbidden: invalid role' });
    }

    const csvContent = generateCsv(records);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sales_report.csv"');

    return res.status(200).send(csvContent);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  exportSalesCsv,
  generateCsv,
};
