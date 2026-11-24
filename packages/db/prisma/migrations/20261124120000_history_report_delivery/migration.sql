ALTER TABLE history_report_artifacts
    ADD COLUMN "deliveredAt" TIMESTAMPTZ(3),
    ADD COLUMN "deliveredBy" TEXT,
    ADD COLUMN "deliveredAssignmentVersion" INTEGER,
    ADD CONSTRAINT history_report_delivery_audit_check CHECK (
        ("deliveredAt" IS NULL AND "deliveredBy" IS NULL AND "deliveredAssignmentVersion" IS NULL)
        OR ("deliveredAt" IS NOT NULL AND "deliveredBy" IS NOT NULL AND "deliveredAssignmentVersion" IS NOT NULL
            AND "deliveredAssignmentVersion" > 0 AND "validatedAt" IS NOT NULL AND "deliveredAt" >= "validatedAt")
    );

CREATE UNIQUE INDEX history_report_one_delivery_per_order
    ON history_report_artifacts ("requestId", "orderId") WHERE "deliveredAt" IS NOT NULL;
