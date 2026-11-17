import { GlassView } from "expo-glass-effect";
import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { useSystemGlass } from "@/components/ui/glass-surface";
import { PressableScale, type PressableScaleProps } from "@/components/ui/pressable-scale";
import { TextClassContext } from "@/components/ui/text";
import { CONTROL_MAX_FONT_SCALE, TextScaleContext } from "@/lib/font-scale";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

type GlassButtonProps = Omit<PressableScaleProps, "children" | "feedback"> & {

  tone?: "brand" | "neutral";

  className?: string;
  children: ReactNode;
};


function brandTint(scheme: "light" | "dark") {
  const [hue = 0, saturation = 0, lightness = 0] = THEME[scheme].primary.split(" ").map((part) => parseFloat(part));
  const s = saturation / 100;
  const l = lightness / 100;
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}















function GlassButton({ tone = "neutral", className, disabled, children, ...props }: GlassButtonProps) {
  const systemGlass = useSystemGlass();
  const { colorScheme } = useColorScheme();

  if (!systemGlass) {
    return (
      <Button
        variant={tone === "brand" ? "brand" : "secondary"}
        size="lg"
        disabled={disabled}
        className={cn("rounded-full shadow-floating", tone === "neutral" && "bg-card active:bg-secondary", className)}
        {...props}
      >
        {children}
      </Button>
    );
  }

  const scheme = colorScheme === "dark" ? "dark" : "light";
  const tinted = tone === "brand" && !disabled;
  return (
    <GlassView
      glassEffectStyle="regular"
      colorScheme={scheme}
      isInteractive
      tintColor={tinted ? brandTint(scheme) : undefined}
      className={cn("overflow-hidden rounded-full", className)}
    >
      { }
      {tinted ? null : <View pointerEvents="none" className="absolute inset-0 bg-glass/glass-tint" />}
      <TextClassContext.Provider
        value={cn(
          "shrink text-center text-body font-semibold",
          tinted ? "text-white" : disabled ? "text-muted-foreground" : "text-foreground",
        )}
      >
        <TextScaleContext.Provider value={CONTROL_MAX_FONT_SCALE}>
          <PressableScale
            feedback="none"
            role="button"
            disabled={disabled}
            className="min-h-control-lg flex-row items-center justify-center gap-2 px-6 py-1.5"
            {...props}
          >
            {children}
          </PressableScale>
        </TextScaleContext.Provider>
      </TextClassContext.Provider>
    </GlassView>
  );
}

export { GlassButton };
export type { GlassButtonProps };
