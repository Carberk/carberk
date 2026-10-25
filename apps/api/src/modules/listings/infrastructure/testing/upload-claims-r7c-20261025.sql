-- AUTHORED ONLY. Parent installs once on its disposable candidate BEFORE
-- matching activation. No DDL, trigger toggles, service or credential setup.
-- Nine independent graphs. No Sessions, Business, Listing or diagnostic rows.
DO $fixture$
DECLARE n integer; p text; label text; k text;
BEGIN
 FOR n IN 1..9 LOOP
  p:='r7c-20261025-'||n;
  FOREACH label IN ARRAY ARRAY['owner','foreign'] LOOP
   INSERT INTO public.users(id,email,"emailVerifiedAt",role,"nameNumber","avatarIndex","updatedAt")
    VALUES(p||'-'||label,p||'-'||label||'@example.invalid',CURRENT_TIMESTAMP,'buyer',1234,7,CURRENT_TIMESTAMP);
  END LOOP;
  FOREACH label IN ARRAY ARRAY['one','two','foreign'] LOOP
   k:=p||'/'||label||'/original.webp';
   INSERT INTO public.media_uploads(id,"userId",key,kind,"contentType","sizeBytes","writeProtocol","objectKeys",state)
    VALUES(p||'-'||label,p||CASE WHEN label='foreign' THEN '-foreign' ELSE '-owner' END,k,'image','image/webp',100,'conditional-v1',
      ARRAY[k,p||'/'||label||'/sm.webp',p||'/'||label||'/md.webp',p||'/'||label||'/lg.webp',p||'/'||label||'/thumb.webp'],'AVAILABLE');
  END LOOP;
 END LOOP;
END $fixture$;
-- Static FK/check/unique audit: both User endpoints precede uploads; upload key
-- and User email are unique per graph. Exactly five object keys include key.
-- AVAILABLE needs no token/deadline/target. Cleanup's uploadId is its PK and has
-- NO physical FK. No Session refreshTokenHash fixture can collide. No live
-- adopter, immutable report, diagnostic pin, or video relation is introduced.
