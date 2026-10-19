# Play Console submission folder

Assets and text to enter in Play Console for `com.auto_tm.ynamly`. The answers for the forms (Data safety, App content, permissions, reviewer access) are in `docs/prd/ops/88-play-console-submission.md`. Never put a reviewer or tester phone, email or code in this folder.

## What is here

| File | Console field | Requirement | State |
|---|---|---|---|
| `graphics/app-icon-512.png` | Store listing → App icon | 512 × 512 PNG, up to 1 MB | Ready |
| `graphics/feature-graphic-1024x500-en.png` (also `-ru`) | Store listing → Feature graphic | 1024 × 500 PNG or JPEG, up to 15 MB | Draft for the founder to approve |
| `text/en.txt` (default, ends with a short Turkmen paragraph), `text/ru.txt` | App name, short and full description | 30 / 80 / 4,000 characters | EN ready; RU needs a native read |
| `screenshots/phone/` | Store listing → Phone screenshots | 2 to 8 per language, PNG or JPEG, 9:16, each side 320 to 3,840 px (1080 × 1920 or larger is best) | Empty until the emulator pass |

## Screenshot rules

- No car brand logos or badges, no Share control, no real phone numbers, no tester or reviewer values.
- Suggested set of six: Home, Results, Listing detail, photo viewer, Messages, Sell wizard.
- Same set in each language the listing uses.

## Not needed

Tablet and Chromebook screenshots, a promo video and a TV banner are optional and not planned for the first release.

## Turkmen

Play Console has no Turkmen store listing language (founder check, 2026-10-08). Turkmen-language phones see the default English listing, so its description ends with a short Turkmen paragraph. The full Turkmen text and graphic are kept in `not-used-on-store/`. Do not enter Turkmen text under Turkish.
