CREATE TABLE history_report_artifacts (
    id UUID NOT NULL,
    "requestId" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "intentId" UUID NOT NULL,
    "intentVersion" INTEGER NOT NULL,
    "acceptedRevision" INTEGER NOT NULL CHECK ("acceptedRevision" >= 0),
    artifact JSONB NOT NULL,
    sha256 TEXT,
    link TEXT,
    "stagedBy" TEXT NOT NULL,
    "stagedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedBy" TEXT,
    "validatedAssignmentVersion" INTEGER,
    "validatedAt" TIMESTAMPTZ(3),
    CONSTRAINT history_report_artifacts_pkey PRIMARY KEY (id),
    CONSTRAINT "history_report_artifacts_requestId_orderId_fkey"
        FOREIGN KEY ("requestId", "orderId") REFERENCES vehicle_history_orders ("requestId", id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "history_report_artifacts_requestId_intentVersion_fkey"
        FOREIGN KEY ("requestId", "intentVersion") REFERENCES history_fulfilment_events ("requestId", version) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CHECK ((artifact->>'id')::uuid = id),
    CHECK (artifact->>'format' IN ('pdf', 'link', 'both')),
    CHECK ((sha256 IS NOT NULL AND artifact ? 'pdf') = (artifact->>'format' IN ('pdf', 'both'))),
    CHECK ((sha256 IS NULL) = NOT (artifact ? 'pdf')),
    CHECK ((link IS NOT NULL) = (artifact->>'format' IN ('link', 'both'))),
    CHECK (("validatedAt" IS NULL) = ("validatedBy" IS NULL)),
    CHECK (("validatedAt" IS NULL) = ("validatedAssignmentVersion" IS NULL))
);

CREATE UNIQUE INDEX "history_report_artifacts_requestId_intentVersion_key"
    ON history_report_artifacts ("requestId", "intentVersion");
