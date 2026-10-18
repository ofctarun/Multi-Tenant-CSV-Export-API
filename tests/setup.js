const db = require('../src/config/db');

beforeAll(async () => {
  // Ensure the database is initialized and seeded before running tests
  await db.initDb();
});

afterAll(async () => {
  // Close database connections after tests complete
  await db.closeDb();
});
