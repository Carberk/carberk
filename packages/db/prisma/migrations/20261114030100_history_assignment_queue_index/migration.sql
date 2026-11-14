-- Keep the concurrent operation standalone, including for SQL-batch migration readers.
CREATE INDEX CONCURRENTLY "vehicle_history_requests_assignedOperatorId_createdAt_id_idx"
    ON "vehicle_history_requests"("assignedOperatorId", "createdAt", "id");
