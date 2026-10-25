-- R7b finite listing_create publication contract. This wrapper only validates
-- the closed caller plan; existing source parsing/effect wrappers remain next.
ALTER FUNCTION public.diagnostic_source_parse(jsonb) RENAME TO diagnostic_source_parse_before_listing_publication;
CREATE FUNCTION public.diagnostic_source_parse(c jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE parsed jsonb; publication jsonb; ids jsonb; expires jsonb;
BEGIN
  parsed:=public.diagnostic_source_parse_before_listing_publication(c);
  IF parsed->>'operation' <> 'listing_create' THEN RETURN parsed; END IF;
  publication:=parsed->'intent'->'publication';
  IF publication IS NULL THEN RAISE EXCEPTION 'listing_publication_intent_missing'; END IF;
  IF jsonb_typeof(publication->'draftId') <> 'string'
     OR jsonb_typeof(publication->'auditId') <> 'string'
     OR jsonb_typeof(publication->'photoIds') <> 'array'
     OR jsonb_typeof(publication->'uploadIds') <> 'array' THEN
    RAISE EXCEPTION 'listing_publication_intent_shape';
  END IF;
  IF jsonb_array_length(publication->'photoIds') < 3 OR jsonb_array_length(publication->'photoIds') > 20
     OR jsonb_array_length(publication->'photoIds') <> jsonb_array_length(publication->'uploadIds') THEN
    RAISE EXCEPTION 'listing_publication_photo_count';
  END IF;
  IF publication ? 'measurement' THEN
    IF jsonb_typeof(publication->'measurement'->'eventIds') <> 'array'
       OR jsonb_array_length(publication->'measurement'->'eventIds') <> 2
       OR publication->'measurement'->>'environment' NOT IN ('test','staging','production')
       OR jsonb_object_length(publication->'measurement'->'expiresAt') <> 2 THEN
      RAISE EXCEPTION 'listing_publication_measurement_shape';
    END IF;
  END IF;
  RETURN parsed;
END $$;
