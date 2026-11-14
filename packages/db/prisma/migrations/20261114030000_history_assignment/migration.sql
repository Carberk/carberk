-- Additive synthetic prerequisite. Existing requests stay unassigned at version 0.
-- Rollback is forward-only: disable the entry/assignment routes; retain assignment
-- facts until a separately reviewed corrective migration can safely remove them.
ALTER TABLE "vehicle_history_requests"
    ADD COLUMN "assignedOperatorId" TEXT,
    ADD COLUMN "assignmentVersion" INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT "vehicle_history_assignment_version_check" CHECK (
        ("assignedOperatorId" IS NULL AND "assignmentVersion" = 0) OR
        ("assignedOperatorId" IS NOT NULL AND "assignmentVersion" > 0)
    ),
    ADD CONSTRAINT "vehicle_history_requests_assignedOperatorId_fkey"
        FOREIGN KEY ("assignedOperatorId") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
