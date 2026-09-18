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
  archived              TINYINT(1)     NOT NULL DEFAULT 0,
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

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  user_id    CHAR(36)     DEFAULT NULL,
  user_name  VARCHAR(120) NOT NULL,
  user_role  VARCHAR(50)  NOT NULL,
  action     VARCHAR(60)  NOT NULL,
  entity     VARCHAR(60)  NOT NULL,
  entity_id  CHAR(36)     DEFAULT NULL,
  detail     TEXT         DEFAULT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_user    (user_id),
  INDEX idx_logs_created (created_at),
  INDEX idx_logs_entity  (entity)
);

-- In-App User Notifications
CREATE TABLE IF NOT EXISTS user_notifications (
  id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  user_id     CHAR(36)     NOT NULL,
  type        VARCHAR(60)  NOT NULL,
  title       VARCHAR(255) NOT NULL,
  body        TEXT         DEFAULT NULL,
  entity_type VARCHAR(60)  DEFAULT NULL,
  entity_id   CHAR(36)     DEFAULT NULL,
  is_read     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user    (user_id),
  INDEX idx_notif_unread  (user_id, is_read),
  INDEX idx_notif_created (created_at)
);

-- Password Reset Tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  user_id    CHAR(36)     NOT NULL,
  token      CHAR(64)     NOT NULL UNIQUE,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pr_token (token),
  INDEX idx_pr_user  (user_id)
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id               CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  title            VARCHAR(255) NOT NULL,
  description      TEXT         DEFAULT NULL,
  assigned_to      CHAR(36)     DEFAULT NULL,
  assigned_to_name VARCHAR(120) NOT NULL DEFAULT '',
  assigned_to_role VARCHAR(50)  NOT NULL DEFAULT '',
  assigned_by      CHAR(36)     DEFAULT NULL,
  assigned_by_name VARCHAR(120) NOT NULL DEFAULT '',
  status           ENUM('open','completed') NOT NULL DEFAULT 'open',
  completion_note  TEXT         DEFAULT NULL,
  completed_by     CHAR(36)     DEFAULT NULL,
  completed_by_name VARCHAR(120) DEFAULT NULL,
  completed_at     DATETIME     DEFAULT NULL,
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tasks_assigned (assigned_to),
  INDEX idx_tasks_status   (status)
);

-- Task Comments
CREATE TABLE IF NOT EXISTS task_comments (
  id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  task_id    CHAR(36)     NOT NULL,
  user_id    CHAR(36)     DEFAULT NULL,
  user_name  VARCHAR(120) NOT NULL,
  user_role  VARCHAR(50)  NOT NULL,
  comment    TEXT         NOT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_task_comments_task (task_id)
);

-- Milestone Comments
CREATE TABLE IF NOT EXISTS milestone_comments (
  id           CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  milestone_id CHAR(36)     NOT NULL,
  user_id      CHAR(36)     DEFAULT NULL,
  user_name    VARCHAR(120) NOT NULL,
  user_role    VARCHAR(50)  NOT NULL,
  comment      TEXT         NOT NULL,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mc_milestone FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE,
  INDEX idx_mc_milestone (milestone_id)
);

-- Project Comments
CREATE TABLE IF NOT EXISTS project_comments (
  id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
  project_id CHAR(36)     NOT NULL,
  user_id    CHAR(36)     DEFAULT NULL,
  user_name  VARCHAR(120) NOT NULL,
  user_role  VARCHAR(50)  NOT NULL,
  comment    TEXT         NOT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_pc_project (project_id)
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
    await migrate(`ALTER TABLE projects ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0`);
    await migrate(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        user_id    CHAR(36)     DEFAULT NULL,
        user_name  VARCHAR(120) NOT NULL,
        user_role  VARCHAR(50)  NOT NULL,
        action     VARCHAR(60)  NOT NULL,
        entity     VARCHAR(60)  NOT NULL,
        entity_id  CHAR(36)     DEFAULT NULL,
        detail     TEXT         DEFAULT NULL,
        created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_logs_user    (user_id),
        INDEX idx_logs_created (created_at),
        INDEX idx_logs_entity  (entity)
      )
    `);

    await migrate(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        user_id     CHAR(36)     NOT NULL,
        type        VARCHAR(60)  NOT NULL,
        title       VARCHAR(255) NOT NULL,
        body        TEXT         DEFAULT NULL,
        entity_type VARCHAR(60)  DEFAULT NULL,
        entity_id   CHAR(36)     DEFAULT NULL,
        is_read     TINYINT(1)   NOT NULL DEFAULT 0,
        created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notif_user    (user_id),
        INDEX idx_notif_unread  (user_id, is_read),
        INDEX idx_notif_created (created_at)
      )
    `);
    await migrate(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        user_id    CHAR(36)     NOT NULL,
        token      CHAR(64)     NOT NULL UNIQUE,
        expires_at DATETIME     NOT NULL,
        created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pr_token (token),
        INDEX idx_pr_user  (user_id)
      )
    `);
    await migrate(`
      CREATE TABLE IF NOT EXISTS tasks (
        id               CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        title            VARCHAR(255) NOT NULL,
        description      TEXT         DEFAULT NULL,
        assigned_to      CHAR(36)     DEFAULT NULL,
        assigned_to_name VARCHAR(120) NOT NULL DEFAULT '',
        assigned_to_role VARCHAR(50)  NOT NULL DEFAULT '',
        assigned_by      CHAR(36)     DEFAULT NULL,
        assigned_by_name VARCHAR(120) NOT NULL DEFAULT '',
        status           ENUM('open','completed') NOT NULL DEFAULT 'open',
        completion_note  TEXT         DEFAULT NULL,
        completed_by     CHAR(36)     DEFAULT NULL,
        completed_by_name VARCHAR(120) DEFAULT NULL,
        completed_at     DATETIME     DEFAULT NULL,
        created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tasks_assigned (assigned_to),
        INDEX idx_tasks_status   (status)
      )
    `);
    await migrate(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        task_id    CHAR(36)     NOT NULL,
        user_id    CHAR(36)     DEFAULT NULL,
        user_name  VARCHAR(120) NOT NULL,
        user_role  VARCHAR(50)  NOT NULL,
        comment    TEXT         NOT NULL,
        created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_task_comments_task (task_id)
      )
    `);

    // Extend project status ENUM with maintenance, server, production
    await migrate(`ALTER TABLE projects MODIFY COLUMN status ENUM('active','completed','on_hold','maintenance','server','production') NOT NULL DEFAULT 'active'`);

    await migrate(`
      CREATE TABLE IF NOT EXISTS milestone_comments (
        id           CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        milestone_id CHAR(36)     NOT NULL,
        user_id      CHAR(36)     DEFAULT NULL,
        user_name    VARCHAR(120) NOT NULL,
        user_role    VARCHAR(50)  NOT NULL,
        comment      TEXT         NOT NULL,
        created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mc_milestone (milestone_id)
      )
    `);
    await migrate(`ALTER TABLE milestone_comments ADD CONSTRAINT fk_mc_milestone FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE`);

    await migrate(`
      CREATE TABLE IF NOT EXISTS project_comments (
        id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        project_id CHAR(36)     NOT NULL,
        user_id    CHAR(36)     DEFAULT NULL,
        user_name  VARCHAR(120) NOT NULL,
        user_role  VARCHAR(50)  NOT NULL,
        comment    TEXT         NOT NULL,
        created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pc_project (project_id)
      )
    `);
    await migrate(`ALTER TABLE project_comments ADD CONSTRAINT fk_pc_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`);

    // ── Server Management (deals → Stripe checkout → subscriptions → invoices) ──
    await migrate(`
      CREATE TABLE IF NOT EXISTS server_deals (
        id                          CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
        project_id                  CHAR(36)      NOT NULL,
        plan_name                   VARCHAR(200)  DEFAULT NULL,
        monthly_price               DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        setup_fee                   DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        billing_interval            ENUM('month','quarter','half_year','year') NOT NULL DEFAULT 'month',
        status                      ENUM('in_discussion','client_denied','client_agreed') NOT NULL DEFAULT 'in_discussion',
        denial_reason               TEXT          DEFAULT NULL,
        notes                       TEXT          DEFAULT NULL,
        target_date                 DATE          DEFAULT NULL,
        stripe_checkout_session_id  VARCHAR(255)  DEFAULT NULL,
        stripe_customer_id          VARCHAR(255)  DEFAULT NULL,
        created_by                  CHAR(36)      DEFAULT NULL,
        created_at                  DATETIME      DEFAULT CURRENT_TIMESTAMP,
        updated_at                  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_server_deals_project (project_id),
        INDEX idx_server_deals_status  (status)
      )
    `);
    await migrate(`ALTER TABLE server_deals ADD CONSTRAINT fk_server_deals_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`);
    await migrate(`ALTER TABLE server_deals ADD CONSTRAINT fk_server_deals_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`);

    await migrate(`
      CREATE TABLE IF NOT EXISTS server_deal_status_history (
        id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        deal_id     CHAR(36)     NOT NULL,
        from_status VARCHAR(30)  DEFAULT NULL,
        to_status   VARCHAR(30)  NOT NULL,
        reason      TEXT         DEFAULT NULL,
        changed_by  CHAR(36)     DEFAULT NULL,
        created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_deal_history_deal (deal_id)
      )
    `);
    await migrate(`ALTER TABLE server_deal_status_history ADD CONSTRAINT fk_dsh_deal FOREIGN KEY (deal_id) REFERENCES server_deals(id) ON DELETE CASCADE`);
    await migrate(`ALTER TABLE server_deal_status_history ADD CONSTRAINT fk_dsh_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL`);

    await migrate(`
      CREATE TABLE IF NOT EXISTS server_subscriptions (
        id                          CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
        deal_id                     CHAR(36)      NOT NULL UNIQUE,
        project_id                  CHAR(36)      NOT NULL,
        stripe_subscription_id      VARCHAR(255)  NOT NULL UNIQUE,
        stripe_customer_id          VARCHAR(255)  NOT NULL,
        client_email                VARCHAR(255)  DEFAULT NULL,
        status                      ENUM('active','past_due','canceled') NOT NULL DEFAULT 'active',
        monthly_price               DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        billing_interval            ENUM('month','quarter','half_year','year') NOT NULL DEFAULT 'month',
        current_period_start        DATE          DEFAULT NULL,
        current_period_end          DATE          DEFAULT NULL,
        next_invoice_date           DATE          DEFAULT NULL,
        at_risk                     TINYINT(1)    NOT NULL DEFAULT 0,
        consecutive_missed_cycles   TINYINT       NOT NULL DEFAULT 0,
        canceled_at                 DATETIME      DEFAULT NULL,
        created_at                  DATETIME      DEFAULT CURRENT_TIMESTAMP,
        updated_at                  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_subs_project (project_id),
        INDEX idx_subs_status  (status)
      )
    `);
    await migrate(`ALTER TABLE server_subscriptions ADD CONSTRAINT fk_subs_deal FOREIGN KEY (deal_id) REFERENCES server_deals(id) ON DELETE CASCADE`);
    await migrate(`ALTER TABLE server_subscriptions ADD CONSTRAINT fk_subs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`);

    await migrate(`
      CREATE TABLE IF NOT EXISTS invoices (
        id                          CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
        subscription_id             CHAR(36)      NOT NULL,
        project_id                  CHAR(36)      NOT NULL,
        invoice_number              VARCHAR(40)   NOT NULL UNIQUE,
        period_start                DATE          DEFAULT NULL,
        period_end                  DATE          DEFAULT NULL,
        due_date                    DATE          NOT NULL,
        subtotal                    DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        total                       DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        amount_paid                 DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        status                      ENUM('draft','pending','sent','paid','overdue','carried_forward','void') NOT NULL DEFAULT 'draft',
        carried_forward_to          CHAR(36)      DEFAULT NULL,
        stripe_invoice_id           VARCHAR(255)  DEFAULT NULL,
        stripe_payment_intent_id    VARCHAR(255)  DEFAULT NULL,
        stripe_hosted_invoice_url   VARCHAR(500)  DEFAULT NULL,
        paid_at                     DATETIME      DEFAULT NULL,
        sent_at                     DATETIME      DEFAULT NULL,
        created_at                  DATETIME      DEFAULT CURRENT_TIMESTAMP,
        updated_at                  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_invoices_subscription (subscription_id),
        INDEX idx_invoices_project      (project_id),
        INDEX idx_invoices_status       (status),
        INDEX idx_invoices_due_date     (due_date)
      )
    `);
    await migrate(`ALTER TABLE invoices ADD CONSTRAINT fk_invoices_subscription FOREIGN KEY (subscription_id) REFERENCES server_subscriptions(id) ON DELETE CASCADE`);
    await migrate(`ALTER TABLE invoices ADD CONSTRAINT fk_invoices_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`);
    await migrate(`ALTER TABLE invoices ADD CONSTRAINT fk_invoices_carried_forward_to FOREIGN KEY (carried_forward_to) REFERENCES invoices(id) ON DELETE SET NULL`);

    await migrate(`
      CREATE TABLE IF NOT EXISTS invoice_line_items (
        id                 CHAR(36)      PRIMARY KEY DEFAULT (UUID()),
        invoice_id         CHAR(36)      NOT NULL,
        description        VARCHAR(255)  NOT NULL,
        amount             DECIMAL(14,2) NOT NULL DEFAULT 0.00,
        source_invoice_id  CHAR(36)      DEFAULT NULL,
        is_carry_forward   TINYINT(1)    NOT NULL DEFAULT 0,
        created_at         DATETIME      DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_line_items_invoice (invoice_id)
      )
    `);
    await migrate(`ALTER TABLE invoice_line_items ADD CONSTRAINT fk_li_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE`);
    await migrate(`ALTER TABLE invoice_line_items ADD CONSTRAINT fk_li_source_invoice FOREIGN KEY (source_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL`);

    await migrate(`
      CREATE TABLE IF NOT EXISTS payment_reminders (
        id             CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        invoice_id     CHAR(36)     NOT NULL,
        reminder_type  ENUM('day_after_due','followup') NOT NULL DEFAULT 'day_after_due',
        sent_to        VARCHAR(255) NOT NULL,
        sent_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_reminders_invoice      (invoice_id),
        INDEX idx_reminders_invoice_date (invoice_id, sent_at)
      )
    `);
    await migrate(`ALTER TABLE payment_reminders ADD CONSTRAINT fk_reminders_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE`);

    // Widen billing_interval to support Quarterly / Half-Yearly plans (added after initial launch).
    await migrate(`ALTER TABLE server_deals MODIFY COLUMN billing_interval ENUM('month','quarter','half_year','year') NOT NULL DEFAULT 'month'`);
    await migrate(`ALTER TABLE server_subscriptions MODIFY COLUMN billing_interval ENUM('month','quarter','half_year','year') NOT NULL DEFAULT 'month'`);
    // Plan/price are decided once the client agrees, not at deal creation — allow deferring them.
    await migrate(`ALTER TABLE server_deals MODIFY COLUMN plan_name VARCHAR(200) DEFAULT NULL`);
    // Expected decision date + a comment thread on each deal.
    await migrate(`ALTER TABLE server_deals ADD COLUMN target_date DATE DEFAULT NULL`);
    await migrate(`
      CREATE TABLE IF NOT EXISTS server_deal_comments (
        id         CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        deal_id    CHAR(36)     NOT NULL,
        user_id    CHAR(36)     DEFAULT NULL,
        user_name  VARCHAR(120) NOT NULL,
        user_role  VARCHAR(50)  NOT NULL,
        comment    TEXT         NOT NULL,
        created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sdc_deal (deal_id)
      )
    `);
    await migrate(`ALTER TABLE server_deal_comments ADD CONSTRAINT fk_sdc_deal FOREIGN KEY (deal_id) REFERENCES server_deals(id) ON DELETE CASCADE`);

    // Soft-delete for deals (kept for audit trail, with a reason) + a reason on subscription cancellation.
    await migrate(`ALTER TABLE server_deals ADD COLUMN deleted_at DATETIME DEFAULT NULL`);
    await migrate(`ALTER TABLE server_deals ADD COLUMN deleted_reason TEXT DEFAULT NULL`);
    await migrate(`ALTER TABLE server_deals ADD COLUMN deleted_by CHAR(36) DEFAULT NULL`);
    await migrate(`ALTER TABLE server_deals ADD CONSTRAINT fk_server_deals_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL`);
    await migrate(`ALTER TABLE server_subscriptions ADD COLUMN cancel_reason TEXT DEFAULT NULL`);

    await migrate(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        id              CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
        event_type      VARCHAR(100) NOT NULL,
        processed_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── Public site: "Contact Us" / "Talk to our team" submissions ──
    await migrate(`
      CREATE TABLE IF NOT EXISTS contact_requests (
        id          CHAR(36)     PRIMARY KEY DEFAULT (UUID()),
        name        VARCHAR(150) NOT NULL,
        email       VARCHAR(255) NOT NULL,
        company     VARCHAR(150) DEFAULT NULL,
        message     TEXT         DEFAULT NULL,
        status      ENUM('new','contacted','closed') NOT NULL DEFAULT 'new',
        created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_contact_requests_status (status)
      )
    `);

    console.log('✅  Database schema initialised');
  } catch (err) {
    console.error('❌  Schema init error:', err.message);
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = initDB;
