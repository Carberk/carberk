import { createContext, useContext, useState, type PropsWithChildren } from "react";
import { Pressable, View, Text, type PressableProps } from "react-native";

// Test shells model visibility and selection only. Portals, animation, native
// measurement, focus management and dismissal gestures need a device.
const MenuContext = createContext({ open: false, setOpen: (_open: boolean) => {} });
export function Menu({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  return <MenuContext.Provider value={{ open, setOpen }}>{children}</MenuContext.Provider>;
}
export function MenuTrigger({ children }: PropsWithChildren) {
  const { open, setOpen } = useContext(MenuContext);
  return <Pressable onPress={() => setOpen(!open)}>{children}</Pressable>;
}
export function MenuContent({ children }: PropsWithChildren) {
  return useContext(MenuContext).open ? <View>{children}</View> : null;
}
export const MenuItem = Pressable;
export function Overlay({ open, children }: PropsWithChildren<{ open?: boolean }>) {
  return open ? <View>{children}</View> : null;
}
export const Container = View;

export const TextContainer = Text;

type CheckboxShellProps = PressableProps & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

// Stands in for `@/components/ui/checkbox`, whose primitive cannot load in Node.
// Like the primitive it exposes `checked` as the checkbox accessibility state and
// reports the toggled value through `onCheckedChange` on press, then calls the
// caller's `onPress`; a disabled shell does neither. It draws no box.
export function CheckboxShell({ checked = false, onCheckedChange, onPress, disabled, ...props }: CheckboxShellProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      {...props}
      disabled={disabled}
      accessibilityState={{ checked, disabled: disabled ?? undefined }}
      onPress={(event) => {
        if (disabled) return;
        onCheckedChange?.(!checked);
        onPress?.(event);
      }}
    />
  );
}
