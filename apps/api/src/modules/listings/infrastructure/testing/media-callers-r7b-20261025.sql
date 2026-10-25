-- AUTHORED ONLY. Install on the parent's disposable candidate before matching
-- activation. No DDL/guard toggles. No campaign roster, Session or byte I/O.
DO $fixture$
DECLARE p text; n integer; suffix text;
BEGIN
 INSERT INTO public.brands(id,slug,"nameRu","nameTk","nameEn","updatedAt")
 VALUES('r7b-brand','r7b-brand','R7b','R7b','R7b',CURRENT_TIMESTAMP);
 INSERT INTO public.models(id,"brandId",slug,"nameRu","nameTk","nameEn","updatedAt")
 VALUES('r7b-model','r7b-brand','r7b-model','R7b','R7b','R7b',CURRENT_TIMESTAMP);
 INSERT INTO public.regions(id,slug,"nameRu","nameTk","nameEn","updatedAt")
 VALUES('r7b-region','r7b-region','R7b','R7b','R7b',CURRENT_TIMESTAMP);
 INSERT INTO public.cities(id,"regionId",slug,"nameRu","nameTk","nameEn","updatedAt")
 VALUES('r7b-city','r7b-region','r7b-city','R7b','R7b','R7b',CURRENT_TIMESTAMP);
 FOR n IN 1..8 LOOP
  p:='r7b-20261025-'||n;
  INSERT INTO public.users(id,email,"emailVerifiedAt",role,"nameNumber","avatarIndex","updatedAt")
   VALUES(p||'-owner',p||'@example.invalid',CURRENT_TIMESTAMP,'buyer',1234,7,CURRENT_TIMESTAMP);
  FOREACH suffix IN ARRAY ARRAY['listing','other'] LOOP
   INSERT INTO public.listings(id,"sellerId",status,"brandId","modelId","cityId","priceAmount","updatedAt")
    VALUES(p||'-'||suffix,p||'-owner','active','r7b-brand','r7b-model','r7b-city',100,CURRENT_TIMESTAMP);
  END LOOP;
  IF n<=6 THEN
   INSERT INTO public.media_uploads(id,"userId",key,kind,"contentType","sizeBytes","writeProtocol","objectKeys",state,"retiredAt")
    VALUES(p||'-upload',p||'-owner',p||'/original.webp','image','image/webp',100,'conditional-v1',
     ARRAY[p||'/original.webp',p||'/sm.webp',p||'/md.webp',p||'/lg.webp',p||'/thumb.webp'],
     CASE WHEN n=3 THEN 'RETIRED' ELSE 'AVAILABLE' END,CASE WHEN n=3 THEN CURRENT_TIMESTAMP ELSE NULL END);
  END IF;
  IF n=4 THEN
   INSERT INTO public.listing_media(id,"listingId",kind,key,"sortOrder") VALUES
    (p||'-photo',p||'-listing','image',p||'/legacy-one.webp',1),
    (p||'-foreign',p||'-other','image',p||'/legacy-two.webp',2);
  END IF;
 END LOOP;
END $fixture$;
-- FK/unique audit: catalog parents precede Listings; each User email, Listing
-- ID, upload ID/key and media ID is distinct. Media fixture has null uploadId.
-- AVAILABLE carries no claim fields. RETIRED is deliberate negative setup.
-- No video, immutable diagnostic, membership, refresh hash or cleanup collision.
