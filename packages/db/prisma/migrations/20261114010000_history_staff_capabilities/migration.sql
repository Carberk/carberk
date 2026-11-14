-- Additive only: no account receives authority during migration.
-- PostgreSQL enum additions are retained on rollback; revoke grants instead.
ALTER TYPE "StaffPurpose" ADD VALUE 'vehicle-history-staff-management';
ALTER TYPE "StaffPurpose" ADD VALUE 'vehicle-history-payment-evidence';
