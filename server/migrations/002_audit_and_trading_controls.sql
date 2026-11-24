-- 002_audit_and_trading_controls.sql
-- Adds server-enforced trading suspension, account lockouts, and enhanced immutable audit columns.

ALTER TABLE users ADD COLUMN IF NOT EXISTS trading_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

ALTER TABLE administrator_audit_logs ADD COLUMN IF NOT EXISTS previous_value TEXT DEFAULT '';
ALTER TABLE administrator_audit_logs ADD COLUMN IF NOT EXISTS new_value TEXT DEFAULT '';
ALTER TABLE administrator_audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT 'unknown';
ALTER TABLE administrator_audit_logs ADD COLUMN IF NOT EXISTS action_result TEXT NOT NULL DEFAULT 'success';

CREATE INDEX IF NOT EXISTS idx_cashier_tx_user_time ON cashier_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON administrator_audit_logs (created_at DESC);
