# ADR-0096: WebP-only photos

- **Status**: Accepted
- **Date**: 2026-10-11
- **Deciders**: Founder
- **Supersedes**: ADR-0008 photo formats and ADR-0088 image upload manifest count only

## Context

Listing, chat and Profile Photo upload paths currently accept JPEG and WebP. Listing processing writes four JPEG and four WebP derivatives while clients serve JPEG. Detail and fullscreen derivatives use an opaque resize canvas, so originals with other proportions acquire black bars and can shrink when the gallery switches variants.

The founder approved WebP-only photos in #817/#823 and extended #823 to complete staging verification, preserve stored identities and references during conversion, then update the matching production backend and prepare the Android EAS cloud release. The upload ownership and conditional storage protocol remain governed by ADR-0079 and ADR-0088.

## Decision

All new Listing, chat and Profile Photo uploads encode WebP on the phone and presign only `image/webp`, within the existing 2400 px long-side and 5 MB limits. Listing and Profile Photo uploads store one WebP original and four WebP derivatives, and their conditional upload manifests contain exactly these five keys. Listing clients and the API serve WebP URLs.

Thumbnail and list derivatives retain their fixed cover framing. Detail and fullscreen derivatives resize inside their maximum dimensions without enlargement, preserving the original proportions and adding no opaque padding. Conversion regenerates derivatives from originals and never trims black edges or removes vehicle pixels. Existing UI framing and native fit behavior retain their approved specifications.

Staging and production convert existing photos through a dry-run inventory, durable per-object journal, conditional object writes, compare-and-swap database updates and read-back verification before JPEG deletion. Preserve Listing, Media Upload, User and Message identities, content, ordering and ownership; update photo references in scalar fields, JSON snapshots and upload manifests. Production is never reseeded. Live rollout and the EAS cloud release follow successful staging verification and the founder's existing authorization; no local release build or store submission is included.

This supersedes only ADR-0008's JPEG-plus-WebP photo format choice and ADR-0088's original-plus-eight-variants manifest count. Their other decisions remain in force.

## Consequences

### Positive

- Each Listing photo needs five stored objects rather than nine.
- Galleries use derivatives with the original proportions, without resize canvas bars.
- Phone uploads, stored objects and served photo URLs use one format.

### Negative / accepted costs

- Installed clients that still upload JPEG need the matching mobile release before they can upload new photos.
- Existing derivatives must be regenerated and all references verified during a controlled conversion.
- JPEG deletion is irreversible without the operator's database and object backup.

### Neutral

- Video formats, brand logos, ownership claims, metadata cleaning and fixed card framing retain their existing rules.

## Alternatives considered

- Continue JPEG plus WebP. Rejected because duplicate derivatives and JPEG uploads retain the cost and inconsistent served format.
- Crop or trim the padded files. Rejected because cropping can remove vehicle content and trimming can erase black pixels in the photograph.

## References

- [Issue #823](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/823)
- [Issue #817](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/817)
- [ADR-0008](0008-media.md)
- [ADR-0088](0088-exclusive-upload-adoption-and-retirement.md)
- [Listings context](../../apps/api/src/modules/listings/CONTEXT.md)
- [Expo SDK55 image manipulation](https://docs.expo.dev/versions/v55.0.0/sdk/imagemanipulator/)
- [Sharp resize](https://sharp.pixelplumbing.com/api-resize/)
