-- Forward additive request identity only. No staged command/digest, backfill, TTL or hold.
-- Rollback closes the request routes in a later forward change; never revives disposed IDs.
CREATE TABLE diagnostic_continuity_requests (
 id TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "actorId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "sessionId" TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "orderId" TEXT NOT NULL REFERENCES inspection_orders(id) ON DELETE CASCADE ON UPDATE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('issue','consume'))
);
CREATE INDEX "diagnostic_continuity_requests_actorId_sessionId_orderId_id_idx"
 ON diagnostic_continuity_requests("actorId","sessionId","orderId",id);
ALTER TABLE diagnostic_continuity_proofs ADD COLUMN "requestId" TEXT;
CREATE UNIQUE INDEX "diagnostic_continuity_proofs_requestId_key" ON diagnostic_continuity_proofs("requestId");
ALTER TABLE diagnostic_reports ADD COLUMN "continuityRequestId" TEXT, ADD COLUMN "continuityRequestSessionId" TEXT;
CREATE UNIQUE INDEX "diagnostic_reports_continuityRequestId_key" ON diagnostic_reports("continuityRequestId");
ALTER TABLE diagnostic_reports ADD CONSTRAINT diagnostic_report_request_pair CHECK (
 ("continuityRequestId" IS NULL) = ("continuityRequestSessionId" IS NULL)
 AND ("continuityRequestId" IS NULL OR (reinspection AND "continuityProofId" IS NOT NULL)));

CREATE FUNCTION diagnostic_request_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'diagnostic_request_immutable'; END IF;
 IF NOT EXISTS (SELECT 1 FROM sessions s JOIN inspection_orders b ON b.id=NEW."orderId"
  WHERE s.id=NEW."sessionId" AND s."userId"=NEW."actorId" AND b."erasedAt" IS NULL)
 THEN RAISE EXCEPTION 'diagnostic_request_binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_request_immutable BEFORE INSERT OR UPDATE ON diagnostic_continuity_requests
 FOR EACH ROW EXECUTE FUNCTION diagnostic_request_immutable();

-- Existing proof guards protect requestId on UPDATE as part of the complete immutable row.
-- This additional INSERT check composes with them and never changes admission/ownership policy.
CREATE FUNCTION diagnostic_issued_request_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."requestId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM diagnostic_continuity_requests q
  WHERE q.id=NEW."requestId" AND q.kind='issue' AND q."actorId"=NEW."issuerId"
   AND q."sessionId"=NEW."issuerSessionId" AND q."orderId"=NEW."candidateOrderId")
 THEN RAISE EXCEPTION 'diagnostic_issued_request_binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_issued_request_binding BEFORE INSERT ON diagnostic_continuity_proofs
 FOR EACH ROW EXECUTE FUNCTION diagnostic_issued_request_binding();

CREATE FUNCTION diagnostic_consumed_request_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."continuityRequestId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM diagnostic_continuity_requests q
   WHERE q.id=NEW."continuityRequestId" AND q.kind='consume' AND q."actorId"=NEW.state->>'authorId'
    AND q."sessionId"=NEW."continuityRequestSessionId" AND q."orderId"=NEW."orderId")
  THEN RAISE EXCEPTION 'diagnostic_consumed_request_binding'; END IF;
 ELSIF ROW(NEW."continuityRequestId",NEW."continuityRequestSessionId") IS DISTINCT FROM
       ROW(OLD."continuityRequestId",OLD."continuityRequestSessionId") THEN
  RAISE EXCEPTION 'diagnostic_consumed_request_immutable';
 END IF;
 IF TG_OP='UPDATE' AND OLD."continuityRequestId" IS NOT NULL AND NEW."erasedAt" IS NULL
  AND NEW.state->>'authorId' IS NOT NULL AND
  (NEW.state->>'authorId' IS DISTINCT FROM OLD.state->>'authorId'
   OR NEW.state->>'correctionReason' IS DISTINCT FROM OLD.state->>'correctionReason') THEN
  RAISE EXCEPTION 'diagnostic_consumed_command_immutable';
 END IF;
 -- Existing erasure clears current attribution. Clear only the added personal receipt fields;
 -- no A proof FK or A re-admission, and no permission to change any historical snapshot.
 IF TG_OP='UPDATE' AND OLD."continuityRequestId" IS NOT NULL
  AND (NEW."erasedAt" IS NOT NULL OR (OLD.state->>'authorId' IS NOT NULL AND NEW.state->>'authorId' IS NULL)) THEN
  DELETE FROM diagnostic_continuity_requests WHERE id=OLD."continuityRequestId";
  NEW."continuityRequestId"=NULL; NEW."continuityRequestSessionId"=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_consumed_request_binding BEFORE INSERT OR UPDATE ON diagnostic_reports
 FOR EACH ROW EXECUTE FUNCTION diagnostic_consumed_request_binding();

-- Direct material-disposal SQL already deletes proofs. Compose at that boundary, including
-- consumed proofs, without touching diagnostic_dispose_ownership or the surviving B receipt.
CREATE FUNCTION diagnostic_request_record_deleted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='diagnostic_continuity_proofs' THEN
  DELETE FROM diagnostic_continuity_requests WHERE id=OLD."requestId";
 ELSE
  DELETE FROM diagnostic_continuity_requests WHERE id=OLD."continuityRequestId";
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER diagnostic_request_proof_deleted AFTER DELETE ON diagnostic_continuity_proofs
 FOR EACH ROW EXECUTE FUNCTION diagnostic_request_record_deleted();
CREATE TRIGGER diagnostic_request_report_deleted AFTER DELETE ON diagnostic_reports
 FOR EACH ROW EXECUTE FUNCTION diagnostic_request_record_deleted();
CREATE FUNCTION diagnostic_request_order_erased() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."erasedAt" IS NOT NULL THEN DELETE FROM diagnostic_continuity_requests WHERE "orderId"=NEW.id; END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER diagnostic_request_order_erased AFTER UPDATE OF "erasedAt" ON inspection_orders
 FOR EACH ROW EXECUTE FUNCTION diagnostic_request_order_erased();

-- Pending linkage follows its bound Session expiry, never a new timer. A bounded sweep
-- locks the complete sorted actor/order prefix before request DELETEs; no Session locks
-- or new upstream targets are acquired after that prefix. FKs handle owner deletion.
CREATE FUNCTION diagnostic_dispose_expired_requests(cutoff timestamp) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE targets TEXT[]; removed integer;
BEGIN
 SELECT array_agg(id) INTO targets FROM (SELECT q.id FROM diagnostic_continuity_requests q
  JOIN sessions s ON s.id=q."sessionId" WHERE s."expiresAt"<=cutoff ORDER BY q.id LIMIT 100) candidate;
 IF targets IS NULL THEN RETURN 0; END IF;
 PERFORM u.id FROM users u WHERE u.id IN (SELECT q."actorId" FROM diagnostic_continuity_requests q WHERE q.id=ANY(targets)) ORDER BY u.id FOR UPDATE;
 PERFORM b.id FROM inspection_orders b WHERE b.id IN (SELECT q."orderId" FROM diagnostic_continuity_requests q WHERE q.id=ANY(targets)) ORDER BY b.id FOR UPDATE;
 DELETE FROM diagnostic_continuity_requests q USING sessions s
  WHERE q.id=ANY(targets) AND s.id=q."sessionId" AND s."expiresAt"<=cutoff;
 GET DIAGNOSTICS removed=ROW_COUNT;
 RETURN removed;
END $$;
