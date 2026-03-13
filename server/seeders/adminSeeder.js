require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const initDB = require('../db/init');

async function seedAdmin() {
  const name = process.env.ADMIN_NAME || 'Super Admin';
  const email = process.env.ADMIN_EMAIL|| "admin@itechnolabs.ca";
  const password = process.env.ADMIN_PASSWORD || "Admin@123";
  const role = process.env.ADMIN_ROLE || 'super_admin';

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required to seed an admin user.');
  }

  if (!['super_admin', 'sub_admin'].includes(role)) {
    throw new Error('ADMIN_ROLE must be either "super_admin" or "sub_admin".');
  }

  await initDB();

  const [existing] = await pool.query(
    'SELECT id, email, role FROM users WHERE email = ? LIMIT 1',
    [email]
  );

  if (existing.length) {
    console.log(`Admin seed skipped: ${email} already exists as ${existing[0].role}.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (id, name, email, password, role)
     VALUES (UUID(), ?, ?, ?, ?)`,
    [name, email, hashedPassword, role]
  );

  console.log(`Admin user seeded successfully: ${email} (${role})`);
}

seedAdmin()
  .catch((error) => {
    console.error('Admin seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (_error) {
      // Ignore close failures during shutdown.
    }
  });
