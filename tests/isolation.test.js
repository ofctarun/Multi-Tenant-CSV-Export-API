const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const db = require('../src/config/db');

// Helper to parse standard CSV text into array of row objects
function parseCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0 || !lines[0]) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle CSV quoting
    const values = [];
    let insideQuote = false;
    let currentValue = '';

    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const char = line[charIndex];
      if (char === '"') {
        if (insideQuote && line[charIndex + 1] === '"') {
          currentValue += '"';
          charIndex++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        values.push(currentValue);
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue);

    const rowObj = {};
    headers.forEach((header, index) => {
      rowObj[header] = values[index];
    });
    rows.push(rowObj);
  }

  return rows;
}

// Helper to login and extract JWT
async function loginUser(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (res.status !== 200 || !res.body.token) {
    throw new Error(`Login failed for ${email} with status ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

// Read test accounts from submission.json
const submissionConfig = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../submission.json'), 'utf8')
);

describe('Multi-Tenant CSV Export API & Isolation Tests', () => {
  beforeAll(async () => {
    await db.initDb();
  });

  afterAll(async () => {
    await db.closeDb();
  });

  describe('Requirement 8: submission.json configuration and authentication', () => {
    test('submission.json contains required test accounts schema', () => {
      expect(submissionConfig).toHaveProperty('testAccounts');
      expect(submissionConfig.testAccounts).toHaveProperty('tenantA_Admin');
      expect(submissionConfig.testAccounts).toHaveProperty('tenantA_Agent');
      expect(submissionConfig.testAccounts).toHaveProperty('tenantB_Admin');

      expect(submissionConfig.testAccounts.tenantA_Admin.email).toBe('adminA@example.com');
      expect(submissionConfig.testAccounts.tenantA_Agent.email).toBe('agentA@example.com');
      expect(submissionConfig.testAccounts.tenantB_Admin.email).toBe('adminB@example.com');
    });

    test('Seeded accounts in submission.json authenticate successfully', async () => {
      const { tenantA_Admin, tenantA_Agent, tenantB_Admin } = submissionConfig.testAccounts;

      const tokenAdminA = await loginUser(tenantA_Admin.email, tenantA_Admin.password);
      expect(typeof tokenAdminA).toBe('string');

      const tokenAgentA = await loginUser(tenantA_Agent.email, tenantA_Agent.password);
      expect(typeof tokenAgentA).toBe('string');

      const tokenAdminB = await loginUser(tenantB_Admin.email, tenantB_Admin.password);
      expect(typeof tokenAdminB).toBe('string');
    });
  });

  describe('Requirement 2: Authentication Endpoint & JWT context', () => {
    test('POST /api/auth/login returns JWT with userId, tenantId, and role', async () => {
      const { tenantA_Admin } = submissionConfig.testAccounts;
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: tenantA_Admin.email, password: tenantA_Admin.password });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');

      const decoded = jwt.decode(response.body.token);
      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('tenantId');
      expect(decoded).toHaveProperty('role');
      expect(decoded.tenantId).toBe(1);
      expect(decoded.role).toBe('admin');
    });

    test('POST /api/auth/login rejects invalid password with 401', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'adminA@example.com', password: 'wrongPassword123' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('POST /api/auth/login rejects non-existent user with 401 without leaking user enumeration', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'secret123' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });
  });

  describe('Requirement 3 & 9: Admin Export & CSV Headers', () => {
    test('Admin A exports all Tenant A records with text/csv and Content-Disposition headers', async () => {
      const { tenantA_Admin } = submissionConfig.testAccounts;
      const tokenA = await loginUser(tenantA_Admin.email, tenantA_Admin.password);

      const response = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);

      // Requirement 9: Content-Disposition attachment with .csv
      expect(response.headers['content-disposition']).toBeDefined();
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.csv');

      const records = parseCsv(response.text);
      expect(records.length).toBeGreaterThanOrEqual(3);

      // Verify headers
      const firstLine = response.text.trim().split(/\r?\n/)[0];
      expect(firstLine).toBe('id,amount,sale_date,client_name');

      // Verify contains records from multiple agents within Tenant A
      const clientNames = records.map((r) => r.client_name);
      expect(clientNames).toContain('Acme Corp');
      expect(clientNames).toContain('Globex Inc');
      expect(clientNames).toContain('Stark Industries');
    });
  });

  describe('Requirement 4: Agent RBAC Scoping', () => {
    test('Agent A only exports their own sales records, not other agents in the same tenant', async () => {
      const { tenantA_Agent } = submissionConfig.testAccounts;
      const tokenAgentA = await loginUser(tenantA_Agent.email, tenantA_Agent.password);

      const response = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', `Bearer ${tokenAgentA}`);

      expect(response.status).toBe(200);
      const records = parseCsv(response.text);

      const clientNames = records.map((r) => r.client_name);
      // agentA owns Acme Corp and Globex Inc
      expect(clientNames).toContain('Acme Corp');
      expect(clientNames).toContain('Globex Inc');

      // agentA2 owns Stark Industries; agentA must NOT see it
      expect(clientNames).not.toContain('Stark Industries');
    });
  });

  describe('Requirement 5 & 6: Functional Tenant Isolation Tests', () => {
    // Exact contract named in seed and prompt
    test('Tenant Isolation: Admin A cannot export Tenant B records', async () => {
      // 1. Arrange: Log in as Tenant A Admin to get token
      const { tenantA_Admin } = submissionConfig.testAccounts;
      const tokenA = await loginUser(tenantA_Admin.email, tenantA_Admin.password);

      // 2. Act: Request the export
      const response = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', `Bearer ${tokenA}`);

      // 3. Assert: Parse CSV and ensure NO records belong to Tenant B
      expect(response.status).toBe(200);
      const records = parseCsv(response.text);

      // Verify records only contain data known to belong to Tenant A
      const containsTenantBData = records.some((r) => r.client_name === 'Tenant B Client');
      expect(containsTenantBData).toBe(false);

      const containsTenantBData2 = records.some((r) => r.client_name === 'Wayne Enterprises');
      expect(containsTenantBData2).toBe(false);
    });

    test('Tenant Isolation: Agent A cannot export Tenant B records', async () => {
      const { tenantA_Agent } = submissionConfig.testAccounts;
      const tokenA = await loginUser(tenantA_Agent.email, tenantA_Agent.password);

      const response = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(200);
      const records = parseCsv(response.text);

      const containsTenantBData = records.some((r) => r.client_name === 'Tenant B Client');
      expect(containsTenantBData).toBe(false);
    });

    test('Tenant Isolation: IDOR prevention - ignores ?tenant_id query parameter', async () => {
      const { tenantA_Admin } = submissionConfig.testAccounts;
      const tokenA = await loginUser(tenantA_Admin.email, tenantA_Admin.password);

      // Attempting cross-tenant data access by injecting Tenant B's id in query
      const response = await request(app)
        .get('/api/reports/sales?tenant_id=2')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(200);
      const records = parseCsv(response.text);

      // Strictly Tenant A records only
      const containsTenantBData = records.some((r) => r.client_name === 'Tenant B Client');
      expect(containsTenantBData).toBe(false);

      const clientNames = records.map((r) => r.client_name);
      expect(clientNames).toContain('Acme Corp');
    });

    test('Tenant Isolation: Admin B cannot export Tenant A records', async () => {
      const { tenantB_Admin } = submissionConfig.testAccounts;
      const tokenB = await loginUser(tenantB_Admin.email, tenantB_Admin.password);

      const response = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.status).toBe(200);
      const records = parseCsv(response.text);

      // Tenant B records should be present
      const clientNames = records.map((r) => r.client_name);
      expect(clientNames).toContain('Tenant B Client');
      expect(clientNames).toContain('Wayne Enterprises');

      // Tenant A records must NOT be present
      expect(clientNames).not.toContain('Acme Corp');
      expect(clientNames).not.toContain('Globex Inc');
      expect(clientNames).not.toContain('Stark Industries');
    });
  });

  describe('Requirement 10: Error Handling & Security Edge Cases', () => {
    test('Missing Authorization header returns 401 Unauthorized', async () => {
      const response = await request(app).get('/api/reports/sales');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('Malformed JWT returns 401 Unauthorized', async () => {
      const response = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', 'Bearer invalid.corrupted.token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('Missing Bearer prefix returns 401 Unauthorized', async () => {
      const response = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', 'NotBearer token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    test('Malformed JSON in POST body returns 400 without crashing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ "email": "invalid json ...');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('No internal stack traces leaked in error responses', async () => {
      const response = await request(app).get('/api/unknown-endpoint');
      expect(response.status).toBe(404);
      expect(response.text).not.toContain('node_modules');
      expect(response.text).not.toContain('Error:');
    });
  });

  describe('Requirement 1: Database Schema & Relational Integrity', () => {
    test('tenants, users, and sales_records tables are properly seeded', async () => {
      const tenantsRes = await db.query('SELECT COUNT(*) as count FROM tenants');
      expect(parseInt(tenantsRes.rows[0].count, 10)).toBeGreaterThanOrEqual(2);

      const usersRes = await db.query('SELECT COUNT(*) as count FROM users');
      expect(parseInt(usersRes.rows[0].count, 10)).toBeGreaterThanOrEqual(5);

      const salesRes = await db.query('SELECT COUNT(*) as count FROM sales_records');
      expect(parseInt(salesRes.rows[0].count, 10)).toBeGreaterThanOrEqual(5);
    });
  });
});
