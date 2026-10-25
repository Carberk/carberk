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
       OR jsonb_object_length(publication->'measurement'->'expiresAt') <> 2
       OR jsonb_object_length(publication->'measurement'->'createdAt') <> 2 THEN
      RAISE EXCEPTION 'listing_publication_measurement_shape';
    END IF;
  END IF;
  RETURN parsed;
END $$;

-- Publication uploads also reserve both reverse-adopter absence slots. Existing
-- adopter rows are explicit publication rows; these hashes cover absent uniques.
ALTER FUNCTION public.diagnostic_source_lock_keys(jsonb,jsonb) RENAME TO diagnostic_source_lock_keys_before_listing_publication;
CREATE FUNCTION public.diagnostic_source_lock_keys(scope jsonb,c jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; upload_id text; key jsonb;
BEGIN
 result:=public.diagnostic_source_lock_keys_before_listing_publication(scope,c);
 IF c->>'operation'='listing_create' AND c->'intent'->'publication' ? 'uploadIds' THEN
  FOR upload_id IN SELECT jsonb_array_elements_text(c->'intent'->'publication'->'uploadIds') LOOP
   key:=jsonb_build_object('avatarUploadId',upload_id);
   result:=result||jsonb_build_array(jsonb_build_object('namespace',897100,'key',hashtext(jsonb_build_array('unique',jsonb_build_array('avatarUploadId'),key)::text)));
   key:=jsonb_build_object('uploadId',upload_id);
   result:=result||jsonb_build_array(jsonb_build_object('namespace',898107,'key',hashtext(jsonb_build_array('unique',jsonb_build_array('uploadId'),key)::text)));
  END LOOP;
 END IF;
 RETURN (SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'namespace')::int,(x->>'key')::int),'[]') FROM (SELECT DISTINCT value x FROM jsonb_array_elements(result)) d);
END $$;
