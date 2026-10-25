-- AUTHORED ONLY. Parent installs in an isolated disposable database before
-- matched guard activation. Never run against staging. No activation/DDL here.
-- Eleven disjoint graphs, ten races plus one ordinary-key positive, each consumed once by AvatarContactPreparation.e2e.spec.
-- No diagnostic grant/proof/report pin is seeded. Existing User FK endpoints
-- precede Session, Business/member, Upload and avatar pointer records.
DO $fixture$
DECLARE n integer; p text; u text; k text; upload text;
BEGIN
 FOR n IN 1..11 LOOP
  p:='r7d-20261025-'||n;
  FOREACH u IN ARRAY ARRAY['seller','admin','foreign'] LOOP
   INSERT INTO public.users(id,email,"emailVerifiedAt",role,"nameNumber","avatarIndex","updatedAt")
    VALUES(p||'-'||u,p||'-'||u||'@example.invalid',CURRENT_TIMESTAMP,
      CASE WHEN u='admin' THEN 'admin'::"UserRole" ELSE 'buyer'::"UserRole" END,1234,7,CURRENT_TIMESTAMP);
  END LOOP;
  INSERT INTO public.sessions(id,"userId","refreshTokenHash","expiresAt","lastSeenAt")
   VALUES(p||'-session',p||'-seller',p||'-authored-not-a-credential',CURRENT_TIMESTAMP+interval '1 day',CURRENT_TIMESTAMP);
  INSERT INTO public.dealerships(id,slug,name,status,"updatedAt") VALUES(p||'-business',p,'Synthetic R7d','active',CURRENT_TIMESTAMP);
  INSERT INTO public.dealership_members(id,"userId","dealershipId",role,status)
   VALUES(p||'-member',p||'-seller',p||'-business','owner','active');
  FOREACH upload IN ARRAY ARRAY['old','new','other','foreign'] LOOP
   k:=p||'/'||upload||'/original.webp';
   INSERT INTO public.media_uploads(id,"userId",key,kind,"contentType","sizeBytes","writeProtocol","objectKeys",state,
     "claimToken","claimTargetType","claimTargetId","claimDeadline") VALUES(
     p||'-'||upload, p||CASE WHEN upload='foreign' THEN '-foreign' ELSE '-seller' END,k,'image','image/webp',100,
     'conditional-v1',ARRAY[k,p||'/'||upload||'/sm.webp',p||'/'||upload||'/md.webp',p||'/'||upload||'/lg.webp',p||'/'||upload||'/thumb.webp'],
     CASE WHEN upload='old' THEN 'ADOPTED' WHEN upload='foreign' THEN 'AVAILABLE' ELSE 'PREPARING' END,
     CASE WHEN upload IN ('new','other') THEN p||'-token-'||upload ELSE NULL END,
     'profile',p||'-seller',CASE WHEN upload IN ('new','other') THEN CURRENT_TIMESTAMP+interval '10 minutes' ELSE NULL END);
  END LOOP;
  -- Cases 5/6 exercise absence-to-present; every other case starts replacement.
  IF n NOT IN (5,6) THEN
   UPDATE public.users SET "avatarUploadId"=p||'-old',"avatarKey"=p||'/old/original.webp' WHERE id=p||'-seller';
  END IF;
 END LOOP;
END $fixture$;
-- Constraint readiness audit, not an expected-refusal statement. Parent must
-- assert fixture success and these exact rows before entering any negative test.
-- users_avatarUploadId_fkey NO ACTION; media_uploads.userId CASCADE;
-- verified_contact_phones.sellerId CASCADE; member user/business and Session User;
-- audit.actorId/report reporter/reviewer SET NULL. Cleanup has NO physical FK.
-- Image inventory is exactly 5 keys including key. PREPARING has token, deadline
-- and profile target. No video sessions/generations or immutable report pins.
