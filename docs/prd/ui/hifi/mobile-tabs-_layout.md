# Hi-Fi — Mobile Tab Bar Layout

> Issue: #124 — apply wizard design handoff to app shell, auth, and listing wizard  
> Maps to: `apps/mobile/app/(tabs)/_layout.tsx`  
> Derived from wireframe: `docs/prd/ui/wireframes/mobile-tabs-_layout.md`  
> Design archive source: `app-shell.html`

==============================================
HIGH-FIDELITY DESIGN — Mobile Tab Bar Layout
Platform: mobile
Mode: light + dark
==============================================

## Current look (issue 695)

The tab bar's look changed in issue 695; what it does is unchanged (five tabs, their order, routes, labels, test IDs, the unread badge and its refresh). The current look is specified in [78-07, Mobile rendering](../components/78-07-tabs-nav.md#mobile-rendering) and implemented in `apps/mobile/components/navigation/AutoTmTabBar.tsx`:

- A floating full capsule on the glass surface, 64 dp high, 12 dp from the side edges, with no top border. Content scrolls underneath.
- The selected tab sits in one lighter, opaque capsule that encloses its icon and its label: the full slot width, 56 dp high, 4 dp inside the bar on every side and concentric with it. Labels keep at least 8 dp from its edges in RU, TK and EN, measured in their semibold face.
- Switching tabs, the capsule stretches toward the new tab (its leading edge on the `glide` spring, its trailing edge on `settle`) and settles into it without a bounce, while the icon cross-fades from outline to filled and the label from medium to semibold.
- Under a finger a tab, and the capsule when the tab is selected, grows to 1.08 on the `snappy` spring and returns without a wobble; sliding the finger off cancels it cleanly.
- Sell is a 56 by 32 dp brand-red pill (not black or white), level with the other icons. The capsule steps aside while Sell is selected.
- Reduce Motion makes every change instant; Reduce Transparency makes the bar opaque.
- Bottom position follows the inset: partly inside a gesture handle's inset, wholly above Android three-button navigation.

The layout sketch, token list, sizes and code sample below describe the earlier flat bar and are kept as history. Where they disagree with this section, this section is current.

## Purpose

Provide the primary navigation chrome for the mobile app: five tabs with a distinctive central sell action pill. This is the single most recognizable chrome surface.

## Layout

```text
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              (tab screen content)                       │
│                                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ◐Home    ◐Favorites    ┌────┐     ◐Chat   ◐Services  │
│  Home     Favorites     │  + │     Chat    Services   │
│                         └────┘                          │
└─────────────────────────────────────────────────────────┘
```

Expanded:
- Tab bar height: `64px` + `pb-safe` (safe-area-inset-bottom).
- Top border: `border-t border-border` (1px).
- Background: `bg-background/92` with `backdrop-blur` on iOS; solid `bg-background` fallback on Android.
- Sell pill: `w-14 h-8 bg-black dark:bg-white rounded-full` with white `Plus` icon (`size-5 text-white dark:text-black`).

## Token map

### Backgrounds + surfaces
- Tab bar bg: `bg-background/92` iOS (backdrop-blur via `expo-blur` if needed); `bg-background` Android
- Active tab: `text-foreground` (#000000 light / #FAFAF9 dark)
- Inactive tab: `text-neutral-400` (#A8A6A0) — semantic `text-muted-foreground` is too warm; use raw neutral-400 for fidelity to design archive
- Sell pill: `bg-black dark:bg-white`

### Borders + dividers
- Tab bar top border: `border-t border-border` (1px)

### Typography
- Tab label: `text-xs font-medium` (11px)
- Active label: `text-foreground`
- Inactive label: `text-neutral-400`

### Spacing
- Tab bar height: `h-16` (64px) + `pb-safe`
- Icon-to-label gap: `gap-[3px]` (3px — bracket utility; not on 4px grid but required by design)
- Sell pill: `w-14 h-8`

### Radius
- Sell pill: `rounded-full`

### Icons
- Home: `Home` Lucide, 24×24, stroke 1.5
- Favorites: `Heart` Lucide, 24×24
- Sell: `Plus` (not `PlusCircle`) inside pill, 20×20, stroke 2
- Chat: `MessageSquare` Lucide, 24×24
- Services: `LayoutGrid` Lucide, 24×24

## Component shape

### Implementation (mobile — NativeWind v4 + RNR)

```tsx
import { Tabs } from "expo-router";
import { View } from "react-native";
import {
  Heart,
  Home,
  LayoutGrid,
  MessageSquare,
  Plus,
} from "lucide-react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

function TabIcon({
  icon: LucideIcon,
  label,
  focused,
  isSell,
}: {
  icon: typeof Home;
  label: string;
  focused: boolean;
  isSell?: boolean;
}) {
  if (isSell) {
    return (
      <View className="items-center gap-[3px]">
        <View className="w-14 h-8 bg-black dark:bg-white rounded-full items-center justify-center">
          <Icon as={Plus} className="size-5 text-white dark:text-black" />
        </View>
        <Text
          className={`text-xs font-medium ${
            focused ? "text-foreground" : "text-neutral-400"
          }`}
        >
          {label}
        </Text>
      </View>
    );
  }
  return (
    <View className="items-center gap-[3px] flex-1 justify-center">
      <Icon
        as={LucideIcon}
        className={`size-6 ${focused ? "text-foreground" : "text-neutral-400"}`}
      />
      <Text
        className={`text-xs font-medium ${
          focused ? "text-foreground" : "text-neutral-400"
        }`}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 64,
          paddingBottom: 0,
          borderTopWidth: 1,
          borderTopColor: "hsl(var(--border))",
          backgroundColor: "hsl(var(--background))",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: (p) => <TabIcon icon={Home} label="Home" focused={p.focused} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          tabBarIcon: (p) => (
            <TabIcon icon={Heart} label="Favorites" focused={p.focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          tabBarIcon: (p) => (
            <TabIcon icon={Plus} label="Sell" focused={p.focused} isSell />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          tabBarIcon: (p) => (
            <TabIcon icon={MessageSquare} label="Chat" focused={p.focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          tabBarIcon: (p) => (
            <TabIcon icon={LayoutGrid} label="Services" focused={p.focused} />
          ),
        }}
      />
    </Tabs>
  );
}
```

**Note:** `tabBarStyle` uses inline styles for the few properties NativeWind cannot reach on the Expo Router `Tabs` chrome (border color via CSS var). The rest of tab chrome is rendered by custom `tabBarIcon` components.

## Customization plan

| Primitive | Path | File | Details |
|---|---|---|---|
| `Tabs` (Expo Router) | Custom composition | `apps/mobile/app/(tabs)/_layout.tsx` | Custom `tabBarIcon` for every tab; sell tab uses a black/white pill. `tabBarStyle` inline for CSS var border color. |

## States

### Default
All five tabs visible; active tab tinted `text-foreground`, inactive `text-neutral-400`. Sell pill always black/white.

### Loading
Tab bar remains visible during tab switches. Wizard overlay (sell flow) hides the tab bar via `navigation.setOptions({ tabBarStyle: { display: "none" } })`.

### Empty
N/A.

### Error
N/A at tab bar layer.

### Offline
Tab bar remains visible; offline state handled per-screen.

## Motion

| Element | Animation | Duration | Easing |
|---|---|---|---|
| Tab switch | Cross-fade + slight horizontal shift (Expo Router default) | system | system |
| Sell pill press | scale 0.96 | `fast` (150ms) | `standard` |
| Inactive → active icon | color transition | `fast` (150ms) | `standard` |

Reduced motion: disable color transitions; keep instant switches.

## Accessibility

- **Contrast ratios**: Active `text-foreground` on `bg-background` ≥ 21:1 (pass). Inactive `text-neutral-400` on `bg-background` ~ 2.9:1 — this is below WCAG AA for small text. Mitigation: inactive tabs are not critical information; they are navigation affordances with icon + label redundancy. If audit flags this, bump inactive to `text-neutral-500`.
- **Tap targets**: Each tab cell must be ≥ 44×44. The sell pill is 56×32; the surrounding touchable area must fill the tab cell.
- **Focus-visible**: N/A (touch interface).
- **Screen reader**: Each `tabBarIcon` must have `accessibilityLabel` matching the tab name. Sell tab: `"Sell listing"`.
- **Reading order**: Left-to-right: Home → Favorites → Sell → Chat → Services.

## Trilingual copy

| Key | RU | TK | EN |
|---|---|---|---|
| `tab.home` | Главная | Baş sahypa | Home |
| `tab.favorites` | Избранное | Saýlananlar | Favorites |
| `tab.sell` | Продать | Satmak | Sell |
| `tab.chat` | Сообщения | Habarlaşma | Chat |
| `tab.services` | Сервисы | Hyzmatlar | Services |

## Implementation notes

- The first tab label is changed from "Search" to "Home" to match the design archive. The route name remains `index`.
- Inactive tab color uses `text-neutral-400` instead of `text-muted-foreground` because the design archive's inactive gray (`#afafaf`) maps closer to `neutral-400` than the warm muted-foreground token.
- On Android, `backdrop-blur` is not reliably supported via NativeWind; use solid `bg-background` as fallback. iOS gets the translucent blur via `expo-blur` `BlurView` if desired, or keep solid for consistency.
- `tabBarShowLabel: false` is required because we render labels inside the custom icon component.

## Design archive mapping

- `app-shell.html` bottom tab bar → `app/(tabs)/_layout.tsx` tab bar chrome.
