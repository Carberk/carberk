# Issue #823 native evidence: WebP-only photos on iOS

iOS simulator proof for [PR #835](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/835), run against the Railway PR backend `auto.tm-rewrite-pr-835` serving commit `c56ac5ae1e8eae9f047c07d7845953373688ed09` with a dev client. Android proof follows separately and will be added by the root session.

Screenshots are halved to 603 px wide and palette-compressed; they are otherwise unedited. The only phone number visible is the masked fixture seller (`+993 61 XX-XX-01`).

## Listing

Listing `05ca1482-af59-420e-8ff7-ec1bf25e51b2`, published from the create wizard with three photos. Each photo is stored as one WebP original and four WebP derivatives under its own `pending/<uuid>/` directory in `listing-photos`:

| Photo | Original | Thumbnail | List | Detail | Fullscreen |
|---|---|---|---|---|---|
| 4:3, `pending/eed0995a-dce1-4b50-80b7-6e7ae0cd1d14/` | 1600x1200 | 200x200 | 600x400 | 1067x800 | 1600x1200 |
| Landscape 3:2, `pending/d85cb1e5-8c9a-4b8d-bbf5-e9116c8fd5d4/` | 1800x1200 | 200x200 | 600x400 | 1200x800 | 1800x1200 |
| Portrait 2:3, `pending/6fb266b6-aab4-4944-a428-bc9ee94538b6/` | 1200x1800 | 200x200 | 600x400 | 533x800 | 1067x1600 |

Thumbnail and list are cover crops at their fixed size. Detail and fullscreen keep the original proportions, fit inside 1200x800 and 2400x1600 and are never enlarged, so they carry no padding bars. Every object answered `200 image/webp` with a `RIFF....WEBP` header; `original.jpg`, `original.jpeg`, `thumbnail.jpg` and `detail.jpg` in each directory answered 404.

| Screenshot | State |
|---|---|
| [16-photos-uploaded.png](16-photos-uploaded.png) | Wizard Photos step, all three photos uploaded |
| [24-after-publish.png](24-after-publish.png) | Listing detail right after publication |
| [25-detail-gallery-photo1-4x3.png](25-detail-gallery-photo1-4x3.png) | Detail gallery, 4:3 photo |
| [26-detail-gallery-landscape.png](26-detail-gallery-landscape.png) | Detail gallery, landscape photo |
| [30-detail-gallery-portrait.png](30-detail-gallery-portrait.png) | Detail gallery, portrait photo shown whole between neutral bands |
| [28-viewer-landscape.png](28-viewer-landscape.png) | Full-screen viewer, landscape photo |
| [29-viewer-portrait.png](29-viewer-portrait.png) | Full-screen viewer, portrait photo |

The detail gallery shows the whole photo (`contentFit="contain"`) by founder decision on 2026-10-12, recorded in [ADR-0096](../../adr/0096-webp-only-photos.md).

## Profile Photo

Profile Photo key `pending/c9d87b0f-cd03-4b29-a2f9-57ac836ca40f/original.webp` (512x512 original). Its four derivatives are WebP; every object answered `200 image/webp`, and `original.jpg`, `original.jpeg` and `thumbnail.jpg` answered 404. Screenshot: [36-profile-after-upload.png](36-profile-after-upload.png).

## Chat photo

Message `1e61458b-4f28-4a5e-90c9-66ac6d11dd0b` carries `chat-attachments/544752ba-32f6-4088-a6ad-919e78c5f2a5/5d4cec9c-cd27-44ff-994d-aa1df0c4869b/original.webp` (1080x1440), served `200 image/webp`; the `.jpg` and `.jpeg` alternatives answered 404. Chat stores only the original. Screenshots: [57-chat-sent.png](57-chat-sent.png) and, after leaving and reopening the Conversation, [59-chat-reopened.png](59-chat-reopened.png).

## Reading "ends in .webp"

The criterion that served photo URLs end in `.webp` is read as the URL path ending in `.webp`. Listing derivative URLs carry a `?v=webp-natural-1` cache-busting query after that path.
