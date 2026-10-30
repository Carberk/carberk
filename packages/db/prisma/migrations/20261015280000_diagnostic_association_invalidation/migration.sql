-- Forward-only. Rollback disables public report delivery; do not restore an
-- earlier validation timestamp. No released snapshot or artifact is rewritten.
-- Listing mutations already hold the Listing row. All diagnostic association
-- readers/writers must lock Listing -> inspection order -> report in that order.
CREATE FUNCTION invalidate_diagnostic_listing_association() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."sellerId",NEW."businessId",NEW."brandId",NEW."modelId",NEW.year,upper(btrim(NEW.vin)))
    IS DISTINCT FROM
    ROW(OLD."sellerId",OLD."businessId",OLD."brandId",OLD."modelId",OLD.year,upper(btrim(OLD.vin))) THEN
  UPDATE inspection_orders
  SET "associationValidatedAt"=NULL, version=version+1
  WHERE "listingId"=NEW.id AND audience='listing_public'
    AND "erasedAt" IS NULL AND "associationValidatedAt" IS NOT NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invalidate_diagnostic_listing_association
 AFTER UPDATE OF "sellerId","businessId","brandId","modelId",year,vin ON listings
 FOR EACH ROW EXECUTE FUNCTION invalidate_diagnostic_listing_association();
