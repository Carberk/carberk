import {
  GlassContainer,
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { cssInterop, useColorScheme } from "nativewind";
import type { RefObject } from "react";
import { View, type ViewProps } from "react-native";

import { useReduceTransparency } from "@/lib/motion";
import { cn } from "@/lib/utils";

cssInterop(GlassView, { className: "style" });
cssInterop(GlassContainer, { className: "style" });
cssInterop(BlurView, { className: "style" });


const ANDROID_BLUR_INTENSITY = 60;







const LIQUID_GLASS = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();







const GLASS_GROUP_SPACING = 4;






function useSystemGlass() {
  const reduceTransparency = useReduceTransparency();
  return LIQUID_GLASS && !reduceTransparency;
}

type GlassSurfaceProps = ViewProps & {
  className?: string;




  materialClassName?: string;

  interactive?: boolean;




  blurTarget?: RefObject<View | null>;
};























function GlassSurface({
  className,
  materialClassName,
  interactive = false,
  blurTarget,
  children,
  ...props
}: GlassSurfaceProps) {
  const reduceTransparency = useReduceTransparency();
  const { colorScheme } = useColorScheme();

  if (LIQUID_GLASS && !reduceTransparency) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={colorScheme === "dark" ? "dark" : "light"}
        isInteractive={interactive}
        className={cn("overflow-hidden", className)}
        {...props}
      >
        <View pointerEvents="none" className="absolute inset-0 bg-glass/glass-tint" />
        {children}
      </GlassView>
    );
  }

  if (blurTarget && !reduceTransparency) {
    return (
      <BlurView
        blurTarget={blurTarget}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={ANDROID_BLUR_INTENSITY}
        tint={colorScheme === "dark" ? "dark" : "light"}
        className={cn(
          "overflow-hidden border-hairline border-glass-edge/70 dark:border-glass-edge/10",
          className,
        )}
        {...props}
      >
        <View pointerEvents="none" className="absolute inset-0 bg-glass/glass-tint" />
        {children}
      </BlurView>
    );
  }

  return (
    <View
      className={cn(
        "border-hairline shadow-floating",
        reduceTransparency
          ? "border-border bg-card"
          : "border-glass-edge/70 bg-glass/glass dark:border-glass-edge/10",
        materialClassName,
        className,
      )}
      {...props}
    >
      {children}
    </View>
  );
}

type GlassGroupProps = ViewProps & { className?: string };







function GlassGroup(props: GlassGroupProps) {
  const systemGlass = useSystemGlass();
  return systemGlass ? (
    <GlassContainer spacing={GLASS_GROUP_SPACING} {...props} />
  ) : (
    <View {...props} />
  );
}

export { GlassGroup, GlassSurface, useSystemGlass };
export type { GlassGroupProps, GlassSurfaceProps };
