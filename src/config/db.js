const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

let pool = null;
let isInMemory = false;
let memDb = null;

function createInMemoryPool() {
  const { newDb } = require('pg-mem');
  memDb = newDb();

  // Register common pg functions in pg-mem
  memDb.public.registerFunction({
    name: 'lower',
    args: [memDb.public.getType('text')],
    returns: memDb.public.getType('text'),
    implementation: (x) => (x ? x.toLowerCase() : x),
  });

  const initSqlPath = path.resolve(__dirname, '../../init.sql');
  const sql = fs.readFileSync(initSqlPath, 'utf8');
  memDb.public.none(sql);
  const pgAdapter = memDb.adapters.createPg();
  isInMemory = true;
  return new pgAdapter.Pool();
}

function getPool() {
  if (pool) {
    return pool;
  }

  // If in TEST environment without explicit DB_FORCE_REAL, or if DB_HOST is explicitly 'mem'
  if (process.env.DB_CLIENT === 'pg-mem' || (process.env.NODE_ENV === 'test' && !process.env.DB_FORCE_REAL)) {
    pool = createInMemoryPool();
    return pool;
  }

  // Otherwise, configure standard PostgreSQL Pool
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'sales_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgrespassword',
    connectionTimeoutMillis: 3000,
  };

  if (process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
    });
  } else {
    pool = new Pool(dbConfig);
  }

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });

  return pool;
}

async function query(text, params) {
  const activePool = getPool();
  try {
    return await activePool.query(text, params);
  } catch (err) {
    // If connecting to real DB failed and we're not yet in memory, switch to in-memory fallback
    if (!isInMemory && (err.code === 'ECONNREFUSED' || err.message.includes('Connection terminated') || err.message.includes('timeout'))) {
      console.warn('PostgreSQL unavailable. Falling back to in-memory database.');
      if (pool && typeof pool.end === 'function') {
        try { await pool.end(); } catch (_) {}
      }
      pool = createInMemoryPool();
      return await pool.query(text, params);
    }
    throw err;
  }
}

async function initDb() {
  // If in memory, tables and seeds are already loaded on creation
  if (isInMemory) {
    return;
  }

  const initSqlPath = path.resolve(__dirname, '../../init.sql');
  const sql = fs.readFileSync(initSqlPath, 'utf8');

  try {
    const res = await query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants'"
    );
    if (!res.rows || res.rows.length === 0) {
      console.log('Tables do not exist. Executing init.sql...');
      await query(sql);
      console.log('Database initialized successfully.');
    } else {
      // Check if users exist
      const userRes = await query('SELECT COUNT(*) as count FROM users');
      if (parseInt(userRes.rows[0].count, 10) === 0) {
        console.log('Database empty. Seeding data...');
        await query(sql);
      }
    }
  } catch (err) {
    console.warn('initDb error:', err.message);
  }
}

async function resetTestDb() {
  if (isInMemory && memDb) {
    const initSqlPath = path.resolve(__dirname, '../../init.sql');
    const sql = fs.readFileSync(initSqlPath, 'utf8');
    memDb.public.none(sql);
  } else {
    const initSqlPath = path.resolve(__dirname, '../../init.sql');
    const sql = fs.readFileSync(initSqlPath, 'utf8');
    await query(sql);
  }
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    isInMemory = false;
    memDb = null;
  }
}

module.exports = {
  getPool,
  query,
  initDb,
  resetTestDb,
  closeDb,
  isInMemory: () => isInMemory,
};
