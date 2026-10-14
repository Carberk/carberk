-- #871 (founder decision 2026-10-14): relisting and account restore keep a
-- Listing's first publish date. Before this change both reset "publishedAt" to
-- the moment of the relist, which moved the Listing to the top of Newest. Put
-- every Listing relisted that way back on its first publish date.
--
-- * The first publish is "createdAt". A Listing row is only created by
--   publishing: PublishListing (since S4) inserts it with "publishedAt" taken
--   before the insert, so a never-relisted Listing has "publishedAt" at or
--   before "createdAt". Neither relist path wrote an audit row the restore
--   could use (account restore writes none), and "createdAt" is never updated.
-- * A Listing whose "publishedAt" is later than its "createdAt" was relisted.
--   Seeded Listings dated before their row existed keep their date.
-- * "updatedAt" is left as it is, so the detail footer's Updated still shows
--   the relist. Status, soldAt and every other column are untouched.
-- * Idempotent: after one run no row has "publishedAt" after "createdAt".
UPDATE "listings"
SET "publishedAt" = "createdAt"
WHERE "publishedAt" > "createdAt";
