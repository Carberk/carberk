-- AUTHORED ONLY. Parent installs once BEFORE matching guard activation in its
-- disposable candidate. No DDL, source operation, guard bypass or teardown.
-- 26 disjoint graphs use the stable test-name map (24 original expanded
-- cases plus 2 real profile cases). Backfill is now graph26; profile cases24/25.
-- No Sessions/auth tokens: no default refreshTokenHash or secret hash collision.
DO $fixture$
DECLARE n integer; i integer; a integer; protocol integer; p text; u text; k text; uid text;
BEGIN
 INSERT INTO public.brands(id,slug,"nameRu","nameTk","nameEn","updatedAt")
 VALUES('r7c-existing-brand','r7c-existing-brand','Synthetic','Synthetic','Synthetic',CURRENT_TIMESTAMP);
 INSERT INTO public.models(id,"brandId",slug,"nameRu","nameTk","nameEn","updatedAt")
 VALUES('r7c-existing-model','r7c-existing-brand','r7c-existing-model','Synthetic','Synthetic','Synthetic',CURRENT_TIMESTAMP);
 INSERT INTO public.regions(id,slug,"nameRu","nameTk","nameEn","updatedAt")
 VALUES('r7c-existing-region','r7c-existing-region','Synthetic','Synthetic','Synthetic',CURRENT_TIMESTAMP);
 INSERT INTO public.cities(id,"regionId",slug,"nameRu","nameTk","nameEn","updatedAt")
 VALUES('r7c-existing-city','r7c-existing-region','r7c-existing-city','Synthetic','Synthetic','Synthetic',CURRENT_TIMESTAMP);
 FOR n IN 1..26 LOOP
  p:='r7c-existing-20261025-'||n;
  FOREACH u IN ARRAY ARRAY['owner','stranger'] LOOP
   INSERT INTO public.users(id,email,"emailVerifiedAt",role,"nameNumber","avatarIndex","updatedAt")
   VALUES(p||'-'||u,p||'-'||u||'@example.invalid',CURRENT_TIMESTAMP,'buyer',1234,7,CURRENT_TIMESTAMP);
  END LOOP;
  FOREACH u IN ARRAY ARRAY['listing','listing-2'] LOOP
   INSERT INTO public.listings(id,"sellerId",status,"brandId","modelId","cityId","priceAmount","priceCurrency","publishedAt","updatedAt")
   VALUES(p||'-'||u,p||'-owner','active','r7c-existing-brand','r7c-existing-model','r7c-existing-city',100000,'TMT',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  END LOOP;
  FOR a IN 0..1 LOOP
   u:=CASE WHEN a=0 THEN 'owner' ELSE 'stranger' END;
   FOR protocol IN 0..1 LOOP
    FOR i IN 0..7 LOOP
     uid:=p||'-upload-'||u||'-'||CASE WHEN protocol=0 THEN 'legacy' ELSE 'conditional-v1' END||'-'||i;
     k:='pending/e8970024-0000-4000-8000-'||lpad((n*1000+a*100+protocol*10+i)::text,12,'0')||'/original.webp';
     INSERT INTO public.media_uploads(id,"userId",key,kind,"contentType","sizeBytes","writeProtocol","objectKeys",state)
     VALUES(uid,p||'-'||u,k,'image','image/webp',2048,CASE WHEN protocol=0 THEN 'legacy' ELSE 'conditional-v1' END,
      CASE WHEN protocol=0 THEN ARRAY[]::text[] ELSE ARRAY[k,replace(k,'original.webp','thumbnail.webp'),replace(k,'original.webp','list.webp'),replace(k,'original.webp','detail.webp'),replace(k,'original.webp','fullscreen.webp')] END,'AVAILABLE');
    END LOOP;
   END LOOP;
  END LOOP;
  -- Lawful legacy references before the adoption-state backfill. These are
  -- initial data, never counted as test-written production opposition.
  IF n IN (21,26) THEN
   uid:=p||'-upload-owner-legacy-'||CASE WHEN n=21 THEN '1' ELSE '0' END;
   INSERT INTO public.listing_media(id,"listingId",kind,key,"sortOrder","uploadId")
    SELECT p||'-legacy-media',p||'-listing','image',key,0,id FROM public.media_uploads WHERE id=uid;
  END IF;
  IF n=21 THEN
   UPDATE public.users SET "avatarUploadId"=p||'-upload-owner-legacy-2',
    "avatarKey"=(SELECT key FROM public.media_uploads WHERE id=p||'-upload-owner-legacy-2') WHERE id=p||'-owner';
  END IF;
 END LOOP;
END $fixture$;
-- Static audit: real owner/stranger endpoints precede uploads and Listings;
-- shared catalog endpoints precede Listings; adopter pointers follow uploads.
-- Every PK, email, upload key and reverse unique upload slot is distinct.
-- UUIDv4 pending paths match mediaCleanupPrefix; exact five conditional keys
-- match imageUploadObjectKeys ordering. Legacy arrays remain empty. AVAILABLE
-- has no token/deadline/target. No Sessions, Business or video rows are seeded.
