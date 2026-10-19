import { mobileSpring } from '@auto-tm/ui/tokens';
import * as ProgressPrimitive from '@rn-primitives/progress';
import { Platform, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';

import { cn } from '@/lib/utils';

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
}) {
  return (
    <ProgressPrimitive.Root
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-accent', className)}
      {...props}>
      <Indicator value={value} className={indicatorClassName} />
    </ProgressPrimitive.Root>
  );
}

export { Progress };

const Indicator = Platform.select({
  web: WebIndicator,
  native: NativeIndicator,
  default: NullIndicator,
});

type IndicatorProps = {
  value: number | undefined | null;
  className?: string;
};

function WebIndicator({ value, className }: IndicatorProps) {
  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View
      className={cn('h-full w-full flex-1 bg-foreground transition-all', className)}
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}>
      <ProgressPrimitive.Indicator className={cn('h-full w-full', className)} />
    </View>
  );
}

function NativeIndicator({ value, className }: IndicatorProps) {
  const progress = useDerivedValue(() => value ?? 0);

  // The fill is as wide as the track and slides in from the left, so progress
  // animates a transform on the UI thread instead of a width (which is layout).
  const filled = useDerivedValue(() =>
    withSpring(interpolate(progress.value, [0, 100], [1, 100], Extrapolation.CLAMP), {
      ...mobileSpring.settle,
      overshootClamping: true,
    })
  );

  const indicator = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: `${filled.value - 100}%` }],
    };
  }, [value]);

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <ProgressPrimitive.Indicator asChild>
      <Animated.View
        style={indicator}
        className={cn('bg-foreground h-full w-full rounded-full', className)}
      />
    </ProgressPrimitive.Indicator>
  );
}

function NullIndicator(_props: IndicatorProps) {
  return null;
}
