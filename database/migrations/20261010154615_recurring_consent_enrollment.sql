-- Preserve all existing enrollments and explicit pauses. No consent is inferred or upgraded.
-- This flag distinguishes new consent-managed enrollment from legacy manual scheduling.
ALTER TABLE fitquest.weekly_schedules ADD COLUMN auto_enrolled boolean NOT NULL DEFAULT false;
GRANT UPDATE(auto_enrolled) ON fitquest.weekly_schedules TO fitquest_app;
