# High-fidelity Design - Mobile Create Listing Wizard

> **Listing video target, 2026-10-14.** [Listing video UI](mobile-listing-video.md) defines the approved tester-only addition to this screen under #886. It changes optional video only; historical photo behavior below is not evidence of shipped video support.

> **2026-05-19 closure note.** At sprint-4 closure two structural decisions diverged from this spec and are not reflected below: (1) Review is now its own step (Step 8 of 8), not an inline section at the bottom of Step 7; the header reads "Step N of 8" and progress is position-based. (2) Field errors render inline directly under each input via a `fieldErrors: Record<string,string>` map exposed on the wizard machine context, not as a global stack at the top of the step body. See [sprint-04 retro](../../sprints/sprint-04-listings-crud-retro.md) for rationale. The rest of this document remains the authoritative shape for the wizard, including the token map, motion table, and trilingual copy keys.

> **2026-10-08 chrome note (founder-approved).** The footer below is superseded. Back is only the header's chevron (top left, hidden on the first step); the close ✕ is top right. The bottom holds one full-width action (Continue, Done or Publish) on the page background, below the scrolling step and above the system inset, with no bar, border or panel behind it. The footer sketches, `Back` footer button and footer border in this document no longer apply.

Issue: GitHub #93, S4 mobile 7-step listing wizard + drafts + upload staging

Platform decision: mobile only. Create listing is a seller transaction, and Phase 1 public web does not support sell flows.

Structural baseline: `docs/prd/ui/wireframes/mobile-create-listing-wizard.md`

References:
- `docs/prd/ui/wireframes/mobile-create-listing-wizard.md`
- `docs/prd/features/32-listings.md`
- `docs/prd/flows/61-create-listing.md`
- `docs/prd/sprints/sprint-04-listings-crud.md`
- `docs/prd/sprints/sprint-04-listings-crud-pre-retro.md`
- `docs/prd/features/31-catalog.md`
- `docs/adr/0022-city-first-listing-location.md`
- `docs/prd/ui/70-design-principles.md` through `docs/prd/ui/77-accessibility.md`
- `docs/agents/nativewind-v4.md`
- `packages/ui/tokens/*.ts`
- `apps/mobile/global.css`
- `apps/mobile/tailwind.config.js`

==============================================
HIGH-FIDELITY DESIGN - Mobile Create Listing Wizard
Platform: mobile
Mode: light + dark
==============================================

## Purpose

Let a signed-in seller publish a marketplace-quality car listing in under five minutes with honest validation, server autosave, background photo staging, and no Phase 2 promises.

## Layout

```text
Sell entry
┌────────────────────────────────────────────┐
│ Sell                                       │
│ Latest draft card                          │
│ [Continue draft]                           │
│ [New listing]                              │
└────────────────────────────────────────────┘

Wizard shell
┌────────────────────────────────────────────┐
│ [Back] Sell car                     [...]  │
│ Step N of 7                    Saved       │
│ Progress                                   │
├────────────────────────────────────────────┤
│ One step form body                         │
├────────────────────────────────────────────┤
│ [Back]                            [Continue]│
└────────────────────────────────────────────┘

Step sequence
1 VIN -> 2 Photos -> 3 Vehicle -> 4 Specs -> 5 Price -> 6 Location -> 7 Review/Publish
```

The wizard is linear. There is no arbitrary stepper navigation. Review rows can deep-link only to completed steps.

## Token Map

### Backgrounds + Surfaces

- Root: `bg-background` (semantic token; resolves to the mobile light/dark background values in `apps/mobile/global.css`).
- Header/footer bars: `bg-background border-border`.
- Step body: `bg-background`.
- Draft card and review summary: `bg-card border-border`.
- Picker, discard, and menu surfaces: `bg-popover border-border shadow-lg`.
- Inline muted surfaces: `bg-muted`.
- Destructive tint: `bg-destructive/10`.
- Warning/offline tint: `bg-warning-500/10`.
- Success tint: `bg-success-500/10`.
- Info tint: `bg-info-500/10`.

### Borders + Dividers

- Screen section dividers: `border-b border-border` / `border-t border-border`.
- Form fields: RNR `Input` default `border-input`; invalid fields add `border-destructive`.
- Picker trigger rows: `border border-border rounded-md bg-card`.
- Photo tile border: `border border-border`; failed tile adds `border-destructive`.
- Focus ring: RNR default `focus-visible:ring-2 focus-visible:ring-ring`.

### Typography

- Page title: Inter `text-2xl font-bold leading-snug text-foreground`.
- Step title: Inter `text-xl font-semibold leading-snug text-foreground`.
- Section title: Inter `text-lg font-semibold leading-snug text-foreground`.
- Field label: Inter `text-sm font-medium leading-snug text-foreground`.
- Body/input: Inter `text-base font-normal leading-normal text-foreground`.
- Helper/caption: Inter `text-sm font-normal leading-normal text-muted-foreground`.
- Badge text: Inter `text-xs font-medium leading-tight`.
- Price: Menlo/tabular `text-lg font-semibold leading-snug text-foreground`.
- VIN: Menlo `text-sm font-normal leading-normal text-foreground`.
- Error text: Inter `text-sm leading-snug text-destructive`.

### Spacing

- Screen horizontal padding: `px-4`.
- Header: `px-4 py-3`.
- Footer: `px-4 py-3`.
- Step body: `px-4 py-6 gap-6`.
- Form section gap: `gap-4`.
- Field group gap: `gap-2`.
- Card padding: `p-4`.
- Photo grid gap: `gap-3`.
- Review row vertical padding: `py-3`.

### Radius

- Cards: `rounded-lg`.
- Inputs/buttons/picker rows: `rounded-md`.
- Badges: `rounded-full`.
- Sheets: `rounded-t-2xl`.
- AlertDialog panel: `rounded-xl`.
- Photo tiles: `rounded-lg`.

### Shadows

- Main cards: no shadow, use border.
- Bottom sheets and dialogs: `shadow-lg`.
- Header/footer: no shadow, use border.
- Floating menus: `shadow-md`.

### Icons

Use RNR `Icon` with Lucide icons from `lucide-react-native`.

- Back: `ChevronLeft`, `size-5 text-foreground`.
- Overflow: `MoreVertical`, `size-5 text-foreground`.
- Picker row: `ChevronRight`, `size-5 text-muted-foreground`.
- Camera: `Camera`, `size-5`.
- Library: `Image`, `size-5`.
- Location helper: `MapPin`, `size-4 text-muted-foreground`.
- Error: `AlertCircle`, `size-5 text-destructive`.
- Offline: `WifiOff`, `size-5 text-warning-500`.
- Success: `CheckCircle`, `size-5 text-success-500`.
- Locked field: `Lock`, `size-4 text-muted-foreground`.

## Component Shape

### Implementation - Mobile, NativeWind v4 + RNR

All composite controls come from `@/components/ui/*`. Text inside RNR composites must use RNR `<Text>`.

```tsx
import { View } from "react-native";
import {
  AlertCircle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Image,
  MoreVertical,
} from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

<View className="flex-1 bg-background">
  <View className="border-b border-border px-4 py-3 gap-2">
    <View className="flex-row items-center justify-between">
      <Button variant="ghost" size="icon" accessibilityLabel={t("wizard.back")}>
        <Icon as={ChevronLeft} className="size-5 text-foreground" />
      </Button>
      <Text className="text-lg font-semibold text-foreground">{t("wizard.title")}</Text>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" accessibilityLabel={t("wizard.more")}>
            <Icon as={MoreVertical} className="size-5 text-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onPress={openDiscardDialog}>
            <Text>{t("wizard.discardDraft")}</Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-muted-foreground">{stepLabel}</Text>
      <Text className="text-sm text-muted-foreground">{saveStatusLabel}</Text>
    </View>
    <Progress value={stepProgress} />
  </View>

  <View className="flex-1 px-4 py-6 gap-6">
    <Text className="text-xl font-semibold text-foreground">{stepTitle}</Text>
    {/* Step-specific fields render here */}
  </View>

  <View className="border-t border-border px-4 py-3 flex-row gap-3">
    <Button variant="outline" className="flex-1" onPress={goBack}>
      <Text>{t("wizard.back")}</Text>
    </Button>
    <Button variant="default" className="flex-1" onPress={goNext} disabled={!canContinue}>
      <Text>{primaryCta}</Text>
    </Button>
  </View>
</View>
```

### Step-Specific Shapes

- **Sell entry**: `Card`, `Button`, `Skeleton`.
- **VIN**: `Input`, `Button`.
- **Photos**: custom `PhotoGridItem` using `Badge`, `Progress`, `Button`, `Icon`.
- **Vehicle/spec/location pickers**: custom `PickerRow` opening RNR `Sheet`.
- **Condition/currency segmented controls**: `Button` group with `variant="default"` for selected and `variant="outline"` for unselected.
- **Seller terms/contact**: `Switch`.
- **Discard**: `AlertDialog`.
- **Save/publish feedback**: `Toast`.

## Customization Plan

### `PickerRow`

- Primitive: `Button` + `Sheet`.
- Path: custom composition wrapping RNR primitives.
- File: `apps/mobile/components/listings/wizard/PickerRow.tsx`.
- Props: `label`, `value`, `placeholder`, `disabled`, `required`, `error`, `helper`, `onPress`, `locked`.
- Shape: row surface uses `bg-card border-border rounded-md px-3 py-3`; right icon is `ChevronRight`; locked state uses `Lock`.

### `CatalogPickerSheet`

- Primitive: `Sheet`, `Input`, `Button`, `Skeleton`.
- Path: custom composition wrapping RNR primitives.
- File: `apps/mobile/components/listings/wizard/CatalogPickerSheet.tsx`.
- Props: `title`, `searchPlaceholder`, `items`, `selectedId`, `emptyMessage`, `onSelect`, `onSearchChange`.
- Shape: bottom sheet with search input, popular section when provided, list rows at minimum touch target height.

### `PhotoGridItem`

- Primitive: `Badge`, `Progress`, `Button`, `Icon`.
- Path: custom composition wrapping RNR primitives.
- File: `apps/mobile/components/listings/wizard/PhotoGridItem.tsx`.
- Props: `uri`, `state`, `progress`, `isCover`, `onRetry`, `onRemove`, `dragHandleProps`.
- Shape: aspect-ratio tile, cover badge top-left, progress overlay, retry/remove actions for failed state.

### `PhoneInput`

- Primitive: `Input`.
- Path: custom composition wrapping RNR primitive.
- File: `apps/mobile/components/listings/wizard/PhoneInput.tsx`.
- Props: `value`, `onChangeText`, `hasError`, `helper`.
- Shape: optional leading `+993` prefix composition if profile phone is edited in local format.

### `Textarea`

- Primitive: `Input` behavior with multiline React Native input.
- Path: custom composition wrapping input behavior.
- File: `apps/mobile/components/listings/wizard/Textarea.tsx`.
- Props: `value`, `onChangeText`, `maxLength`, `hasError`, `helper`.
- Shape: `min-h-32 rounded-md border border-input bg-card px-3 py-3 text-base text-foreground`.

### `ReviewRow`

- Primitive: `Button` with ghost styling or custom row composition.
- Path: custom composition wrapping RNR primitive.
- File: `apps/mobile/components/listings/wizard/ReviewRow.tsx`.
- Props: `label`, `value`, `status`, `onPress`.
- Shape: `py-3 border-b border-border flex-row items-center justify-between`.

No forks, base-class edits, or new design tokens are required.

## Step Specs

### Sell Entry

- Root uses `bg-background px-4 py-6`.
- Title uses `text-2xl font-bold text-foreground`.
- Latest draft card uses `Card` with `bg-card border-border p-4 gap-3`.
- Draft metadata uses `text-sm text-muted-foreground`.
- Primary CTA uses `Button variant="default"`.
- New listing CTA uses `Button variant="outline"`.

### Wizard Shell

- Header is sticky at top within route, `bg-background border-b border-border`.
- Footer is sticky at bottom, `bg-background border-t border-border`.
- Progress is RNR `Progress`, brand primary fill, muted track.
- Save status:
  - `Saved`: `text-success-500`.
  - `Saving...`: `text-muted-foreground`.
  - `Could not save - Retry`: `text-destructive`; Retry is inline `Button variant="link"`.

### Step 1 - VIN

- VIN input uses `font-mono`.
- Skip is `Button variant="outline"`.
- Continue is `Button variant="default"`.
- No camera icon, no scanner button, no decoder status.

### Step 2 - Photos

- Camera/Library actions are side-by-side `Button variant="outline"` with `Camera` / `Image`.
- Helper chips use `Badge variant="secondary"`.
- Photo grid is 3 columns on standard phone width with `gap-3`.
- Tile uses stable aspect ratio; no tile resize on upload state changes.
- Cover badge uses `Badge variant="default"` with text `Cover`.
- Failed state uses `border-destructive`, error label, and two compact buttons.

### Step 3 - Vehicle

- Picker rows stacked with visible labels.
- Brand required, Model required, Year required.
- Model disabled until Brand.
- Generation disabled until Model and optional after enabled.
- Empty generation sheet uses `text-muted-foreground` body and no error color.

### Step 4 - Specs

- Condition uses a two-button segmented control.
- Used is default.
- Mileage field visible and required for Used.
- New hides mileage or demotes it to optional helper; no publish block.
- Optional details are grouped under `Optional details`.

### Step 5 - Price

- Price input uses tabular/mono number presentation.
- Currency segmented control: TMT selected by default.
- Currency change clears amount and focuses price.
- Approximate TMT helper is `text-sm text-muted-foreground`.
- FX missing helper is `text-sm text-destructive`.
- Seller terms use `Switch`; helper is muted, not warning-colored.
- No negotiable toggle.

### Step 6 - Location

- Region and City use `PickerRow`; City disabled until Region.
- Area/landmark uses plain `Input`.
- Privacy helper uses `text-sm text-muted-foreground` and `MapPin` icon.
- No GPS/current-location/map/exact-address affordance.

### Step 7 - Description, Contact, Review

- Description uses `Textarea`, max length counter at bottom-right.
- Empty description is invalid on Publish.
- Phone input is prefilled from profile and editable.
- Calls and Chat use `Switch`; at least one must remain on.
- Chat helper is `text-sm text-muted-foreground`.
- Review summary uses `Card`, rows with labels and values; rows link back to completed steps.
- Publish is disabled until required data, clean media, and FX pass.

### Edit Mode

- Route title changes to `Edit listing`.
- Final CTA changes to `Save changes`.
- VIN, Brand, Model, Generation, Year rows are disabled.
- Locked rows show `Lock` icon and helper `This field cannot be changed after publishing.`

## States

### Default

Each step shows one focused task, visible label for every input, helper text below non-obvious rules, and footer navigation. Required fields are marked with a text marker, not color alone.

### Loading

- Sell entry: `Skeleton` for latest draft card.
- Wizard open: `Skeleton` rows for draft payload until loaded.
- Picker sheets: search input stays visible; list rows use `Skeleton`.
- Photo tile upload: thumbnail remains visible with `Progress` overlay.
- Publish: CTA loading state; keep form visible.
- First paint target: under the project mobile budget from `docs/prd/ui/70-design-principles.md`.

### Empty

- No drafts: no empty illustration; open/create wizard directly.
- No photos: show Camera/Library actions and helper text, not an empty-state card.
- Empty picker: use simple sheet text, for example `No generations for this model yet.`
- Empty optional fields: show placeholders like `Not specified`.

### Error

- Field validation: inline under field with `text-destructive`.
- Save error: header status `Could not save - Retry`; keep user on the same step.
- Upload error: per-thumbnail failed state with Retry and Remove.
- FX missing: inline helper under currency; final Publish disabled.
- Publish server error: inline banner above footer plus Retry.
- Destructive discard error: keep `AlertDialog` open.

### Offline

- No offline draft promise.
- Header shows warning status if server autosave cannot complete.
- Photo upload states can show `Waiting for network`.
- User can continue editing the mounted step, but step transition that requires server save stays blocked until retry succeeds.

## Motion

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Button press | scale + opacity feedback | `fast` | `standard` |
| Switch toggle | native/RNR thumb slide | `fast` | `standard` |
| Step transition | native route/content cross-fade or horizontal slide | `base` | `standard` |
| Sheet open | slide up + scrim fade | `slow` | `decel` |
| Sheet close | slide down + scrim fade | `slow` | `accel` |
| AlertDialog open | fade + small scale | `slow` | `decel` |
| Toast | slide down + fade | `base` | `decel` then `accel` |
| Upload progress | progress value interpolation | `fast` | `standard` |
| Failed photo retry success | badge/status fade | `base` | `standard` |
| Publish success | toast only; no confetti required | `base` | `decel` |

Reduced motion:
- Sheets/dialogs become fade-only.
- Step transition becomes instant.
- Skeleton shimmer becomes static placeholders.
- Upload progress value may jump instead of animate.

## Accessibility

- **Contrast**: `text-foreground` on `bg-background`, `text-muted-foreground` on `bg-background`, and `text-destructive` on `bg-background` meet WCAG AA per `docs/prd/ui/77-accessibility.md`. `text-success-500` is not used as small body-only signal; success status also includes text.
- **Tap targets**: icon buttons, picker rows, footer CTAs, switches, photo actions, and review rows must meet mobile minimum target size. Photo tile secondary actions can be visually compact but need padded hit areas.
- **Labels**: every input has a visible label; placeholders are never the only label.
- **Required/invalid state**: set `accessibilityState={{ disabled, invalid }}` where applicable; associate helper/error text with the field.
- **Icon-only buttons**: Back, overflow, close sheet, remove photo, retry photo all need localized `accessibilityLabel`.
- **Screen reader order**: header, save status, step title, fields, helper/error, footer.
- **Progress**: expose wizard progress as text (`Step N of 7`) because visual progress alone is insufficient.
- **Photos**: each photo tile label should include position and status, for example `Photo 1 of 8, cover, uploaded`.
- **Disabled buttons**: include visible reason near the disabled action, especially Publish.
- **Focus**: picker sheets move focus to the sheet title/search; closing returns focus to the trigger row.

## Trilingual Copy

Translations marked `[needs translation]` must be completed by localization. English is source intent, not final copy for RU/TK.

| Key | RU | TK | EN |
|---|---|---|---|
| `sell.title` | [needs translation] | [needs translation] | Sell |
| `sell.latestDraft` | [needs translation] | [needs translation] | Latest draft |
| `sell.continueDraft` | [needs translation] | [needs translation] | Continue draft |
| `sell.newListing` | [needs translation] | [needs translation] | New listing |
| `wizard.title.create` | [needs translation] | [needs translation] | Sell car |
| `wizard.title.edit` | [needs translation] | [needs translation] | Edit listing |
| `wizard.stepLabel` | [needs translation] | [needs translation] | Step {current} of 7 |
| `wizard.saved` | [needs translation] | [needs translation] | Saved |
| `wizard.saving` | [needs translation] | [needs translation] | Saving... |
| `wizard.saveError` | [needs translation] | [needs translation] | Could not save - Retry |
| `wizard.back` | [needs translation] | [needs translation] | Back |
| `wizard.continue` | [needs translation] | [needs translation] | Continue |
| `wizard.publish` | [needs translation] | [needs translation] | Publish |
| `wizard.saveChanges` | [needs translation] | [needs translation] | Save changes |
| `wizard.discardDraft` | [needs translation] | [needs translation] | Discard draft |
| `discard.title` | [needs translation] | [needs translation] | Discard draft? |
| `discard.body` | [needs translation] | [needs translation] | This removes your draft and staged photos for this listing. |
| `discard.cancel` | [needs translation] | [needs translation] | Cancel |
| `vin.title` | [needs translation] | [needs translation] | VIN or chassis number |
| `vin.helper` | [needs translation] | [needs translation] | Optional. You can fill details manually. |
| `vin.noCheck` | [needs translation] | [needs translation] | No checking is done in this version. |
| `vin.skip` | [needs translation] | [needs translation] | Skip |
| `photos.title` | [needs translation] | [needs translation] | Add photos |
| `photos.camera` | [needs translation] | [needs translation] | Camera |
| `photos.library` | [needs translation] | [needs translation] | Library |
| `photos.helper` | [needs translation] | [needs translation] | Photos under 5 MB upload faster. |
| `photos.cover` | [needs translation] | [needs translation] | Cover |
| `photos.coverHelper` | [needs translation] | [needs translation] | First photo is cover. Drag to reorder. |
| `photos.retry` | [needs translation] | [needs translation] | Retry |
| `photos.remove` | [needs translation] | [needs translation] | Remove |
| `photos.failed` | [needs translation] | [needs translation] | Upload failed |
| `vehicle.title` | [needs translation] | [needs translation] | Vehicle |
| `vehicle.brand` | [needs translation] | [needs translation] | Brand |
| `vehicle.model` | [needs translation] | [needs translation] | Model |
| `vehicle.generation` | [needs translation] | [needs translation] | Generation |
| `vehicle.year` | [needs translation] | [needs translation] | Year |
| `vehicle.notSpecified` | [needs translation] | [needs translation] | Not specified |
| `vehicle.noGenerations` | [needs translation] | [needs translation] | No generations for this model yet. |
| `vehicle.yearRequired` | [needs translation] | [needs translation] | Year is required. |
| `specs.title` | [needs translation] | [needs translation] | Specs |
| `specs.condition` | [needs translation] | [needs translation] | Condition |
| `specs.used` | [needs translation] | [needs translation] | Used |
| `specs.new` | [needs translation] | [needs translation] | New |
| `specs.mileage` | [needs translation] | [needs translation] | Mileage, km |
| `specs.mileageRequired` | [needs translation] | [needs translation] | Mileage is required for used cars. |
| `specs.optionalDetails` | [needs translation] | [needs translation] | Optional details |
| `price.title` | [needs translation] | [needs translation] | Price |
| `price.amount` | [needs translation] | [needs translation] | Amount |
| `price.currency` | [needs translation] | [needs translation] | Currency |
| `price.approxTmt` | [needs translation] | [needs translation] | About {amount} TMT |
| `price.fxMissing` | [needs translation] | [needs translation] | Exchange rate unavailable. Try TMT or contact support. |
| `price.sellerTerms` | [needs translation] | [needs translation] | Seller terms |
| `price.exchangePossible` | [needs translation] | [needs translation] | Exchange possible |
| `price.installmentPossible` | [needs translation] | [needs translation] | Installment possible |
| `price.fullAskingHelper` | [needs translation] | [needs translation] | Enter the full asking price. AutoTM does not finance or verify seller payment terms. |
| `location.title` | [needs translation] | [needs translation] | Car location |
| `location.region` | [needs translation] | [needs translation] | Region |
| `location.city` | [needs translation] | [needs translation] | City |
| `location.area` | [needs translation] | [needs translation] | Area / landmark |
| `location.helper` | [needs translation] | [needs translation] | Choose where the car can be inspected. Do not enter your home address. |
| `description.title` | [needs translation] | [needs translation] | Description |
| `description.helper` | [needs translation] | [needs translation] | Add condition, service history, and reason for selling. |
| `description.required` | [needs translation] | [needs translation] | Description is required. |
| `contact.title` | [needs translation] | [needs translation] | Contact |
| `contact.phone` | [needs translation] | [needs translation] | Phone |
| `contact.calls` | [needs translation] | [needs translation] | Calls |
| `contact.chat` | [needs translation] | [needs translation] | Chat |
| `contact.chatHelper` | [needs translation] | [needs translation] | Chat will become available when messaging launches. |
| `contact.required` | [needs translation] | [needs translation] | Choose calls or chat. |
| `review.title` | [needs translation] | [needs translation] | Review |
| `review.photos` | [needs translation] | [needs translation] | Photos |
| `review.car` | [needs translation] | [needs translation] | Car |
| `review.terms` | [needs translation] | [needs translation] | Terms |
| `publish.uploadPending` | [needs translation] | [needs translation] | Wait for photos to finish uploading. |
| `publish.uploadFailed` | [needs translation] | [needs translation] | Retry or remove failed photos. |
| `publish.success` | [needs translation] | [needs translation] | Listing published |
| `edit.lockedField` | [needs translation] | [needs translation] | This field cannot be changed after publishing. |

## Implementation Notes

- Required RNR installs for #93 if not already present: `button`, `input`, `text`, `icon`, `badge`, `progress`, `switch`, `sheet`, `dropdown-menu`, `alert-dialog`, `skeleton`.
- `Sheet`, `DropdownMenu`, `AlertDialog`, and `Toast` require `PortalHost` in root layout per `docs/agents/nativewind-v4.md`.
- Forms should use controlled state and Zod schemas from `@auto-tm/contracts`.
- Upload staging components should keep visual dimensions stable while progress/failure labels change.
- Images use local staged file URIs while uploading and server media keys after attach.
- Seller terms badges must be rendered on feed cards/detail when true, but they do not add buyer workflows in S4.
- Publish gate must explain disabled state near the CTA; do not leave a disabled button without a reason.
- Do not import from `@auto-tm/ui/components` in mobile.

## Open Questions

None blocking for #93 hi-fi. Localization must fill RU/TK strings before implementation freeze.
