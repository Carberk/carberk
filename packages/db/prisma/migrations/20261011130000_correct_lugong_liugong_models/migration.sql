-- Correct manufacturer ownership without dropping vehicle content. The
-- existing target model is preferred; missing targets retain the moved ID.
-- An affected SavedSearch needs an explicit meaning-preserving migration,
-- because a single-brand search cannot silently become a two-brand search.
-- Forward-only data repair: reversing merged aliases requires a new migration.
DO $$
DECLARE
  lugong_id TEXT;
  liugong_id TEXT;
  source_model RECORD;
  canonical_id TEXT;
  aliases TEXT[] := ARRAY[
    'clg4180d', 'clg4215d', 'clg6114e', 'clg6612e', 'clg6614e', 'clg6616e',
    'clg6618e', 'clg6620e', 'clg936e', 'clgb160', 'clgb230', 'clgb320'
  ];
BEGIN
  PERFORM id FROM brands WHERE slug IN ('lugong', 'liugong', 'john') ORDER BY id FOR UPDATE;
  SELECT id INTO lugong_id FROM brands WHERE slug = 'lugong';
  SELECT id INTO liugong_id FROM brands WHERE slug = 'liugong';

  IF lugong_id IS NOT NULL AND liugong_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM saved_searches s JOIN models m
      ON s.filters->>'modelId' = m.id OR (s.filters->'modelIds') ? m.id OR (
        s.filters->>'brandId' IN (lugong_id, liugong_id)
        AND coalesce(s.filters->>'modelId', '') = ''
        AND coalesce(s.filters->'modelIds', 'null'::jsonb) IN ('null'::jsonb, '[]'::jsonb)
      )
      WHERE m."brandId" = lugong_id AND m.slug = ANY(aliases)
    ) THEN
      RAISE EXCEPTION 'Affected saved search requires explicit catalog correction before this migration';
    END IF;

    FOR source_model IN
      SELECT id, slug, "nameEn" FROM models
      WHERE "brandId" = lugong_id AND slug = ANY(aliases) ORDER BY id FOR UPDATE
    LOOP
      SELECT id INTO canonical_id FROM models
      WHERE "brandId" = liugong_id AND
        regexp_replace(lower("nameEn"), '[^a-z0-9]', '', 'g') =
        regexp_replace(lower(source_model."nameEn"), '[^a-z0-9]', '', 'g')
      ORDER BY (slug = source_model.slug) DESC, id LIMIT 1 FOR UPDATE;

      IF canonical_id IS NULL THEN
        UPDATE models SET "brandId" = liugong_id, "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        WHERE id = source_model.id;
        canonical_id := source_model.id;
      END IF;

      UPDATE listings SET "brandId" = liugong_id, "modelId" = canonical_id,
        "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC' WHERE "modelId" = source_model.id;
      UPDATE generations SET "modelId" = canonical_id,
        "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC' WHERE "modelId" = source_model.id;
      UPDATE listing_drafts SET payload = jsonb_set(
        jsonb_set(payload, '{brandId}', to_jsonb(liugong_id)), '{modelId}', to_jsonb(canonical_id)
      ), "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      WHERE payload->>'modelId' = source_model.id;

      IF canonical_id <> source_model.id THEN
        DELETE FROM models WHERE id = source_model.id;
      END IF;
    END LOOP;
  END IF;

  UPDATE brands SET "nameRu" = 'John Deere', "nameTk" = 'John Deere', "nameEn" = 'John Deere',
    "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
  WHERE slug = 'john' AND ("nameRu" <> 'John Deere' OR "nameTk" <> 'John Deere' OR "nameEn" <> 'John Deere');
END $$;
