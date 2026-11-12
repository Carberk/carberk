# Lexus ES 300h UI gallery, version 1

This operator-side pack is an input for [#1119](https://github.com/Carberk/carberk/issues/1119), delivered by [#1124](https://github.com/Carberk/carberk/issues/1124). It supplies ten useful views of a Lexus ES 300h (XZ10) second-facelift showroom vehicle photographed in Shenzhen on 2025-07-17. It is UI media: Wikimedia JPEG renditions requested at 1920px width, **not camera originals or a representative performance benchmark**. The rear-cabin view is portrait.

`photos.manifest.json` is the attribution and integrity record, in cover-first gallery order. It records each source title/page/revision, acquisition URL, author, license, useful view, transformations and measured dimensions, byte count and SHA256 of the exact bundled JPEG. The acquisition bytes are unchanged: no local resizing, re-encoding, orientation change or metadata removal was performed. Original metadata may remain. The upstream rendition is already resized by Wikimedia; no claim is made about its encoder or metadata handling.

All ten photographs are by **[Dinkun Chen](https://commons.wikimedia.org/wiki/User:Dinkun_Chen)**, from Wikimedia Commons, under **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)** ([legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode)). Each individual source page declares own work and that license. To inspect the recorded description revision, use `https://commons.wikimedia.org/w/index.php?oldid=<sourceRevisionId>`. Revision IDs refer to source-page descriptions, not an independently verified camera original.

When redistributing a photograph, retain its individual title, author, source-page and license links from the manifest, and identify actual changes. For example: “LEXUS ES 300h(XZ10) China (139).jpg — Dinkun Chen, Wikimedia Commons, CC BY-SA 4.0; Wikimedia 1920px JPEG rendition, bundled unchanged.” Retain attribution and the license notice; distribute adapted photographs under the applicable share-alike terms and identify any later resizing/re-encoding/metadata removal. Bundling does not imply photographer or dealership endorsement. This record does not clear unrelated trademark or personality rights. A future public integration must carry the per-photo credits into its distribution; this pack does not alter the existing public demo credits.

## Coherence and limits

The exterior views agree on metallic grey/taupe paint, ES 300h display plates, wheels and facelift lamps. The open rear door connects exterior paint/wheel details with tan seats and black/tan door trim. Cabin, dashboard and controls agree on upholstery, trim, steering wheel, screen/vents and selector. Rear/boot details and showroom floor, walls and furnishings connect the remaining views. Source timestamps describe a short walkaround on the same day (10:48–10:58); dates and locations are source claims. The actual ten downloaded images were visually inspected during curation and implementation.

This is a defensible photographic same-vehicle set for fictional review scenarios. No public VIN or explicit uploader statement certifies one VIN across every image; an identical second display car cannot be excluded. Do not claim VIN verification, a used vehicle's condition, an exact trim/year/spec inferred from appearance, or native readiness. Do not combine these cabin images with existing unrelated vehicle exteriors.

## Use and offline verification

Import `ES300H_GALLERY` from `scripts/ui-fixtures/manifest.ts` for the frozen scenario definition. Its key is `es300h-shenzhen-2025-07-17`, version `1`. Importing it loads only module data and performs no application filesystem, environment, database, network or device I/O. Verification is separate and explicit:

```bash
pnpm --filter @auto-tm/db gallery:verify
```

The command reads and fully decodes the local JPEGs, checks dimensions/bytes/digests and rejects duplicate source identities and actual content. A missing or incompatible file fails with a named error. Restore the committed version and retry; there is no download or silent replacement. The verifier accepts an explicit local directory and definition for callers/tests. It neither uploads nor applies data.

Treat version 1 as immutable. New bytes, provenance, ordering or views require a new version directory and explicit definition selection; retain the old version. Tests pin the full version-1 definition as well as the ordered views. Assets live outside app bundles and are not exported through the runtime DB package.

Existing local/reviewer fixture IDs, order, Users, galleries and broad demo inventory remain unchanged. This pack allocates no Listing or User identity and performs no apply/reset. Later integration owns separate additive scenarios, target/ownership guards and staging proof before any authorized production rollout. This PR does not complete the parent baseline or establish live/native readiness.
