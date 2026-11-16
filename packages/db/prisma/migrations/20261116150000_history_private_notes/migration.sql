CREATE TABLE "vehicle_history_private_notes" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "assignmentVersion" INTEGER NOT NULL,
    "clientNoteId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_history_private_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_history_private_notes_sequence_key"
    ON "vehicle_history_private_notes"("sequence");
CREATE UNIQUE INDEX "vehicle_history_private_notes_requestId_authorId_clientNoteId_key"
    ON "vehicle_history_private_notes"("requestId", "authorId", "clientNoteId");
CREATE INDEX "vehicle_history_private_notes_requestId_sequence_idx"
    ON "vehicle_history_private_notes"("requestId", "sequence");

ALTER TABLE "vehicle_history_private_notes" ADD CONSTRAINT "vehicle_history_private_notes_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "vehicle_history_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vehicle_history_private_notes" ADD CONSTRAINT "vehicle_history_private_notes_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
