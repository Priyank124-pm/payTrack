const pool = require('./pool');

const schema = `
-- Users / Profiles
CREATE TABLE IF NOT EXISTS users (
  id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(180) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('super_admin','sub_admin','project_manager','coordinator') NOT NULL DEFAULT 'project_manager',
  manager_id  CHAR(36)     DEFAULT NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id                    CHAR(36)       PRIMARY KEY DEFAULT (UUID()),
  name                  VARCHAR(200)   NOT NULL,
  client                VARCHAR(200)   NOT NULL,
  type                  ENUM('Monthly','Hourly','Milestone') NOT NULL DEFAULT 'Monthly',
  portal                VARCHAR(60)    NOT NULL DEFAULT 'Direct',
  manager_id            CHAR(36)       NOT NULL,
  coordinator_id        CHAR(36)       DEFAULT NULL,
  target_payment        DECIMAL(14,2)  DEFAULT 0.00,
  status                ENUM('active','completed','on_hold') NOT NULL DEFAULT 'active',
  all_payments_received TINYINT(1)     NOT NULL DEFAULT 0,
  created_at            DATETIME       DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_projects_manager      FOREIGN KEY (manager_id)     REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_coordinator  FOREIGN KEY (coordinator_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Milestones (monthly payment entries)
CREATE TABLE IF NOT EXISTS milestones (
  id          CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
  project_id  CHAR(36)      NOT NULL,
  month       TINYINT       NOT NULL COMMENT '1-12',
  year        SMALLINT      NOT NULL,
  label       VARCHAR(200)  NOT NULL,
  amount      DECIMAL(14,2) DEFAULT 0.00,
  target_date DATE          DEFAULT NULL,
  achieved    DECIMAL(14,2) DEFAULT 0.00,
  status      ENUM('Pending','Partial','Paid','Overdue') NOT NULL DEFAULT 'Pending',
  created_by  CHAR(36)      DEFAULT NULL,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_milestones_project    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_milestones_created_by FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL,
  INDEX idx_milestones_project (project_id),
  INDEX idx_milestones_month_year (month, year)
);

-- Change Requests
CREATE TABLE IF NOT EXISTS change_requests (
  id          CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
  project_id  CHAR(36)      NOT NULL,
  title       VARCHAR(200)  NOT NULL,
  amount      DECIMAL(14,2) DEFAULT 0.00,
  description TEXT          DEFAULT NULL,
  status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_by  CHAR(36)      DEFAULT NULL,
  reviewed_by CHAR(36)      DEFAULT NULL,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_cr_project     FOREIGN KEY (project_id)  REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_created_by  FOREIGN KEY (created_by)  REFERENCES users(id)    ON DELETE SET NULL,
  CONSTRAINT fk_cr_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id)    ON DELETE SET NULL,
  INDEX idx_cr_project (project_id),
  INDEX idx_cr_status  (status)
);
`;

async function initDB() {
  const conn = await pool.getConnection();
  try {
    // Run each statement individually
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await conn.query(stmt);
    }

    // Migrations — safe to re-run; errors are ignored when column/constraint already exists
    const migrate = async (sql) => {
      try { await conn.query(sql); } catch (e) { /* already applied */ }
    };
    await migrate(`ALTER TABLE projects ADD COLUMN coordinator_id CHAR(36) DEFAULT NULL`);
    await migrate(`ALTER TABLE projects ADD CONSTRAINT fk_projects_coordinator FOREIGN KEY (coordinator_id) REFERENCES users(id) ON DELETE SET NULL`);

    console.log('✅  Database schema initialised');
  } catch (err) {
    console.error('❌  Schema init error:', err.message);
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = initDB;
