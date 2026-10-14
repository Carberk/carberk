# Hi-Fi — Mobile Edit Listing (Wizard Edit Mode)

> **Listing video target, 2026-10-14.** [Listing video UI](mobile-listing-video.md) defines the approved tester-only addition to this screen under #886. It changes optional video only; historical photo behavior below is not evidence of shipped video support.

> Issue: #124 — apply wizard design handoff to app shell, auth, and listing wizard  
> Maps to: `apps/mobile/app/listings/[id]/edit.tsx`  
> Derived from wireframe: `docs/prd/ui/wireframes/mobile-listings-id-edit.md`  
> Design archive source: `screens/01-vin.html`, `screens/02-photos.html`, `screens/03-vehicle.html`, `screens/04-specs.html`, `screens/05-price.html`, `screens/06-location.html`, `screens/07-description.html`, `screens/08-review.html`, `screens/09-discard.html`

> **2026-10-08 chrome note (founder-approved).** The footer below is superseded. Back is only the header's chevron on a step opened from the section list. The bottom holds one full-width action (Done on a step, Save changes on the section list) on the page background, below the scrolling content and above the system inset, with no bar, border or panel behind it. The footer `Back` button and footer border in this document no longer apply.

==============================================
HIGH-FIDELITY DESIGN — Mobile Edit Listing
Platform: mobile
Mode: light + dark
==============================================

## Purpose

Reuse the 8-step wizard for editing an already-published listing while protecting post-publish identity fields. All wizard chrome (header, progress, footer) adapts to edit mode.

## Layout

```text
┌────────────────────────────────────────────┐
│ safe-top                                   │
│ [<] Edit listing                    [•••]  │
│ Saved                                      │
│ [====================================]     │
├────────────────────────────────────────────┤
│                                            │
│ Vehicle                                   │
│                                            │
│ [ Toyota                         locked ]  │
│ [ Camry                          locked ]  │
│ [ XV70                           locked ]  │
│ [ 2018                           locked ]  │
│ This field cannot be changed after         │
│ publishing.                                │
│                                            │
│ Photos                                     │
│ […photo grid…]                             │
│                                            │
│ … (remaining steps same as create) …       │
│                                            │
├────────────────────────────────────────────┤
│ [Back]                       [Save changes]│
└────────────────────────────────────────────┘
```

## Token map

### Backgrounds + surfaces
- Root: `bg-background`
- Header: `bg-background border-b border-border`
- Wizard body: `bg-background`
- Footer: `bg-background border-t border-border`
- Locked row: `bg-neutral-100/50 dark:bg-neutral-800/50` (subtle tint) + `opacity-60`
- Locked badge/icon area: transparent
- Progress track: `bg-neutral-200`
- Progress fill: `bg-black dark:bg-white`
- Save status saved: `text-success-500`
- Save status error: `text-destructive`

### Borders + dividers
- Header bottom: `border-b border-border`
- Footer top: `border-t border-border`
- Locked row border: same as picker row (`border-[1.5px] border-border`)
- Review card: `border border-border rounded-xl`
- Review row separator: `border-b border-border`

### Typography
- Header title (edit): `font-display`, `text-lg font-bold text-foreground`
- Step label / edit mode label: `text-sm font-medium text-neutral-500`
- Save status: `text-sm font-medium`
- Step title: `font-display`, `text-2xl font-bold text-foreground`
- Locked helper: `text-sm text-neutral-400`
- Footer CTA (Save changes): `text-base font-medium text-white dark:text-black`
- Review row label: `text-sm font-medium text-neutral-500`
- Review row value: `text-base text-foreground`
- Review row issue: `text-destructive`
- Publish blocker: `text-sm font-medium text-destructive`

### Spacing
- Header: `px-5 pt-safe pb-3`
- Header top row: `flex-row items-center justify-between mb-2`
- Header meta row: `flex-row items-center justify-between mb-2`
- Progress: `h-1 bg-neutral-200 rounded-full overflow-hidden`
- Body: `px-5 pt-6 pb-6 gap-5 flex-1`
- Footer: `px-5 py-3 pb-safe flex-row gap-3`
- Footer button: `flex-1 h-[52px] rounded-full`
- Locked row: `h-[52px] px-3.5`

### Radius
- Buttons: `rounded-full`
- Inputs/picker rows: `rounded-lg` (8px)
- Review card: `rounded-xl` (12px)
- Dialog: `rounded-2xl` (16px)
- Overflow sheet: `rounded-t-2xl` (16px top)

### Icons
- Back: `ChevronLeft`, 22×22, `text-foreground`
- Overflow: `MoreVertical`, 22×22, `text-foreground`
- Lock: `Lock`, 16×16, `text-neutral-400`
- Chevron (review rows): `ChevronRight`, 18×18, `text-neutral-400`
- Save spinner: custom animated `View`

## Component shape

### Implementation (mobile — NativeWind v4 + RNR)

The edit route mounts the shared `WizardLayout` with `mode="edit"`. Below is the chrome spec; individual step content is identical to create mode except for locked fields.

```tsx
// WizardLayout.tsx (edit-mode chrome)
import { View } from "react-native";
import { ChevronLeft, Lock, MoreVertical } from "lucide-react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

function WizardHeader({ mode, stepLabel, saveStatus, progressPercent, onBack, onOverflow }) {
  return (
    <View className="px-5 pt-safe pb-3 bg-background border-b border-border">
      <View className="flex-row items-center justify-between mb-2">
        <Button variant="ghost" size="icon" className="w-10 h-10 rounded-full" onPress={onBack}>
          <Icon as={ChevronLeft} className="size-[22px] text-foreground" />
        </Button>
        <Text className="font-display text-lg font-bold text-foreground">
          {mode === "edit" ? "Edit listing" : "Sell car"}
        </Text>
        <Button variant="ghost" size="icon" className="w-10 h-10 rounded-full" onPress={onOverflow}>
          <Icon as={MoreVertical} className="size-[22px] text-foreground" />
        </Button>
      </View>

      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-medium text-neutral-500">
          {mode === "edit" ? "Edit mode" : stepLabel}
        </Text>
        <SaveStatusIndicator status={saveStatus} />
      </View>

      <View className="h-1 bg-neutral-200 rounded-full overflow-hidden">
        <View
          className="h-full bg-black dark:bg-white rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </View>
    </View>
  );
}

function SaveStatusIndicator({ status }) {
  if (status === "saving") {
    return (
      <View className="flex-row items-center gap-1">
        {/* spinner */}
        <Text className="text-sm font-medium text-neutral-500">Saving…</Text>
      </View>
    );
  }
  if (status === "error") {
    return <Text className="text-sm font-medium text-destructive">Could not save — Retry</Text>;
  }
  if (status === "saved") {
    return <Text className="text-sm font-medium text-success-500">Saved</Text>;
  }
  return null;
}

function WizardFooter({ mode, canContinue, onBack, onContinue, isLoading }) {
  return (
    <View className="px-5 py-3 pb-safe bg-background border-t border-border flex-row gap-3">
      <Button variant="outline" className="flex-1 h-[52px] rounded-full border-[1.5px] border-foreground" onPress={onBack}>
        <Text className="text-base font-medium text-foreground">Back</Text>
      </Button>
      <Button
        variant="default"
        className="flex-1 h-[52px] rounded-full bg-black dark:bg-white"
        disabled={!canContinue || isLoading}
        onPress={onContinue}
      >
        {isLoading ? (
          <Text className="text-base font-medium text-white dark:text-black">Saving…</Text>
        ) : (
          <Text className="text-base font-medium text-white dark:text-black">
            {mode === "edit" ? "Save changes" : "Continue"}
          </Text>
        )}
      </Button>
    </View>
  );
}
```

### Locked field row

```tsx
function LockedPickerRow({ label, value }) {
  return (
    <View className="flex-row items-center justify-between h-[52px] px-3.5 rounded-lg border-[1.5px] border-border bg-neutral-100/50 dark:bg-neutral-800/50 opacity-60">
      <Text className="text-base text-foreground">{value}</Text>
      <View className="flex-row items-center gap-1.5">
        <Icon as={Lock} className="size-4 text-neutral-400" />
        <Text className="text-[13px] text-neutral-400">Locked</Text>
      </View>
    </View>
  );
}
```

## Customization plan

| Primitive | Path | File | Details |
|---|---|---|---|
| `WizardLayout` | Custom composition | `apps/mobile/src/listings/wizard/WizardLayout.tsx` | Edit mode changes title, step label, and footer CTA. Locked fields rendered via `LockedPickerRow`. |
| `Button` (default) | Variant override at call site | `apps/mobile/src/listings/wizard/WizardLayout.tsx` | `bg-black dark:bg-white` for Continue/Save changes. |
| `Button` (outline) | Variant override at call site | `apps/mobile/src/listings/wizard/WizardLayout.tsx` | `border-[1.5px] border-foreground` for Back. |
| `Sheet` (overflow) | RNR primitive | `apps/mobile/components/ui/sheet.tsx` | Opens from bottom with `Discard draft` + `Cancel`. |
| `AlertDialog` (discard) | RNR primitive | `apps/mobile/components/ui/alert-dialog.tsx` | Confirm discard with loading + error states. |

## States

### Default
Wizard shell with edit-mode chrome. Locked fields show lock icon. Editable fields behave as in create mode.

### Loading
Wizard shell shows `Skeleton` while existing listing data loads:
```tsx
<View className="px-5 pt-6 gap-4">
  <Skeleton className="h-6 w-1/3 rounded" />
  <Skeleton className="h-[52px] rounded-lg" />
  <Skeleton className="h-[52px] rounded-lg" />
</View>
```

### Empty
N/A — edit mode always has data.

### Error
Save error banner in header or footer:
```tsx
<View className="mx-5 mt-2 p-3 rounded-lg bg-destructive/10 flex-row items-center gap-2">
  <Icon as={AlertCircle} className="size-4 text-destructive" />
  <Text className="text-sm font-medium text-destructive">
    Could not save. Try again.
  </Text>
</View>
```

### Offline
Save status shows "Will retry when online". Footer CTA remains enabled for local validation but save is queued.

### Discard loading
Destructive CTA in dialog shows spinner:
```tsx
<Button variant="destructive" disabled>
  <Text>Discarding…</Text>
</Button>
```

### Discard error
Dialog stays open; inline error text: "Could not discard draft. Try again."

## Motion

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Step transition | slide left/right | `base` (250ms) | `standard` |
| Progress fill | width transition | `base` (250ms) | `standard` |
| Overflow sheet | slide up from bottom | `slow` (400ms) | `decel` |
| Discard dialog | scale 0.96 → 1 + opacity | `base` (250ms) | `decel` |
| Locked row tap | opacity pulse to 1.0 then back to 0.6 | `fast` (150ms) | `standard` |

Reduced motion: instant transitions; disable sheet/dialog animations.

## Accessibility

- **Contrast ratios**: `text-foreground` on `bg-background` ≥ 21:1. `text-neutral-500` on `bg-background` ~ 5.4:1 (pass AA body). `text-neutral-400` lock icon ≥ 3:1 (pass AA for UI).
- **Tap targets**: Back/overflow 40×40 (pass). Footer buttons 52×flex-1 (pass). Locked rows 52×full-width (pass).
- **Focus-visible**: Buttons show default RNR focus ring.
- **Screen reader**: Locked row announces `"{label}, {value}, locked. This field cannot be changed after publishing."`. Overflow button `accessibilityLabel="More options"`.
- **Reading order**: Back → Title → Overflow → Step label → Save status → Progress → Step title → Fields → Footer Back → Footer Save changes.

## Trilingual copy

| Key | RU | TK | EN |
|---|---|---|---|
| `header.title.edit` | Редактировать объявление | Bildirişi redaktirläň | Edit listing |
| `header.title.create` | Продать машину | Maşyn satmak | Sell car |
| `header.editMode` | Режим редактирования | Redaktirleme tertibi | Edit mode |
| `saveStatus.saving` | Сохранение… | Ýazdyrylýar… | Saving… |
| `saveStatus.saved` | Сохранено | Ýazdyryldy | Saved |
| `saveStatus.error` | Не удалось сохранить — Повторить | Ýazdyryp bolmady — Täzeden synanyş | Could not save — Retry |
| `cta.back` | Назад | Yza | Back |
| `cta.saveChanges` | Сохранить изменения | Üýtgeşmeleri ýazdyr | Save changes |
| `cta.continue` | Продолжить | Dowam et | Continue |
| `locked.helper` | Это поле нельзя изменить после публикации. | Bu meýdan çap edilenden soň üýtgedip bolmaz. | This field cannot be changed after publishing. |
| `discard.title` | Отменить редактирование? | Redaktirlemäni ýatyr? | Cancel edit? |
| `discard.body` | Несохраненные изменения будут потеряны. | Ýazdyrylmadyk üýtgeşmeler ýitiriler. | Any unsaved changes will be lost. |
| `discard.error` | Не удалось отменить. Попробуйте снова. | Ýatyrmak bolmady. Gaýtadan synanyşyň. | Could not discard draft. Try again. |

## Implementation notes

- Edit mode title is "Edit listing" instead of "Sell car".
- Step label shows "Edit mode" instead of "Step N of 8".
- Locked fields: VIN, Brand, Model, Generation, Year. They render with `opacity-60`, a lock icon, and helper text.
- Review step CTA is "Save changes" instead of "Publish".
- Overflow menu opens a `Sheet` first, with "Discard draft" (destructive) and "Cancel".
- Discard confirmation is an `AlertDialog` with loading and error handling.
- `useEditListing` hook handles the server communication.
- All other step UI components (`Step1Vin` through `Step7DescContact`, `Step8Review`) are reused from create mode. Edit mode passes `mode="edit"` prop to toggle locked states and CTA labels.

## Design archive mapping

- `screens/08-review.html` (`?mode=edit`) → edit-mode chrome.
- `screens/02-photos.html` (`?mode=edit`) → edit-mode photo step.
- `screens/03-vehicle.html` → locked fields pattern.
- `screens/09-discard.html` → discard confirmation dialog.
- All other wizard screens → reused step components with edit-mode prop.
