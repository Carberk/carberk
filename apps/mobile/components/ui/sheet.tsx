import * as DialogPrimitive from '@rn-primitives/dialog';
import * as React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View, useWindowDimensions, type ViewProps } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

import { easing, useReduceMotion } from '@/lib/motion';
import { withFontFace } from '@/lib/font';
import { cn } from '@/lib/utils';
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view';

const SHEET_ENTER_MS = 300;
const SHEET_EXIT_MS = 220;
const SHEET_FADE_MS = 150;

const Sheet = DialogPrimitive.Root;

const SheetTrigger = DialogPrimitive.Trigger;

const SheetClose = DialogPrimitive.Close;

const SheetPortal = DialogPrimitive.Portal;

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function SheetOverlay({
  className,
  children,
  closeOnBackdropPress,
  avoidKeyboard = false,
  progress,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Overlay>, 'asChild'> & {
  children?: React.ReactNode;
  closeOnBackdropPress?: boolean;
  /** Opt-in for sheets with fields; the full portal viewport owns keyboard avoidance. */
  avoidKeyboard?: boolean;
  progress: SharedValue<number>;
}) {
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <FullWindowOverlay>
      <DialogPrimitive.Overlay
        className={cn(
          'absolute bottom-0 left-0 right-0 top-0 items-stretch justify-end',
          Platform.select({
            web: 'animate-in fade-in-0 fixed cursor-default bg-scrim/50 [&>*]:cursor-auto',
          }),
          className
        )}
        {...props}
        asChild={Platform.OS !== 'web'}>
        <NativeOnlyAnimatedView collapsable={false}>
          {Platform.OS !== 'web' ? (
            <Animated.View pointerEvents="none" className="absolute inset-0 bg-scrim/50" style={scrimStyle} />
          ) : null}
          <KeyboardAvoidingView enabled={avoidKeyboard} behavior="padding" className="w-full flex-1 justify-end">
            {/* The overlay is `asChild`, so its press lands on an Animated.View that ignores it.
                Opt-in: this backdrop sits behind the content and closes the sheet on a tap outside.
                Sheets that hold typed input leave it off, so a stray tap cannot discard a draft. */}
            {Platform.OS === 'web' || !closeOnBackdropPress ? null : (
              <DialogPrimitive.Close asChild>
                <Pressable
                  testID="sheet-backdrop"
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  className="absolute bottom-0 left-0 right-0 top-0"
                />
              </DialogPrimitive.Close>
            )}
            <>{children}</>
          </KeyboardAvoidingView>
        </NativeOnlyAnimatedView>
      </DialogPrimitive.Overlay>
    </FullWindowOverlay>
  );
}

function SheetContent({
  className,
  portalHost,
  children,
  compact,
  closeOnBackdropPress,
  avoidKeyboard = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  portalHost?: string;
  compact?: boolean;
  closeOnBackdropPress?: boolean;
  /** Opt-in for sheets with fields; the full portal viewport owns keyboard avoidance. */
  avoidKeyboard?: boolean;
}) {
  const { open } = DialogPrimitive.useRootContext();
  const reducedMotion = useReduceMotion();
  const { height } = useWindowDimensions();
  const [present, setPresent] = React.useState(open);
  const progress = useSharedValue(0);
  // Parents may clear a picker step or selected photo as soon as they close.
  // Preserve its committed contents and measured layout until the exit finishes.
  const exitingContent = React.useRef({ children, style: props.style });
  React.useLayoutEffect(() => {
    if (open) exitingContent.current = { children, style: props.style };
  }, [open, children, props.style]);
  const panelStyle = useAnimatedStyle(() => reducedMotion
    ? { opacity: progress.value }
    : { transform: [{ translateY: (1 - progress.value) * height }] });

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const duration = reducedMotion ? SHEET_FADE_MS : open ? SHEET_ENTER_MS : SHEET_EXIT_MS;
    if (open) setPresent(true);
    // Updating this same value reverses an interrupted transition from its current position.
    progress.value = withTiming(open ? 1 : 0, {
      duration,
      easing: open ? easing.enter : easing.exit,
      reduceMotion: reducedMotion ? ReduceMotion.Never : ReduceMotion.System,
    });
    if (open) return;
    const timer = setTimeout(() => setPresent(false), duration);
    return () => clearTimeout(timer);
  }, [open, reducedMotion, progress]);

  const native = Platform.OS !== 'web';
  if (native && !open && !present) return null;

  return (
    <SheetPortal hostName={portalHost} forceMount={native ? true : undefined}>
      <SheetOverlay
        forceMount={native ? true : undefined}
        pointerEvents={open ? 'auto' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        closeOnBackdropPress={closeOnBackdropPress}
        avoidKeyboard={avoidKeyboard}
        progress={progress}>
        <DialogPrimitive.Content
          className={cn(
            'z-50 w-full max-w-none self-stretch flex-col gap-4 overflow-hidden rounded-t-3xl bg-popover p-5 shadow-overlay',
            avoidKeyboard ? 'max-h-full min-h-0 shrink' : compact ? 'max-h-[70%]' : 'max-h-[85%]',
            Platform.select({ web: 'animate-in fade-in-0 slide-in-from-bottom-10 duration-300' }),
            className
          )}
          onStartShouldSetResponder={() => false}
          {...props}
          style={native && !open ? exitingContent.current.style : props.style}
          forceMount={native ? true : props.forceMount}
          asChild={native}>
          <NativeOnlyAnimatedView
            collapsable={false}
            style={panelStyle}>
            <View className={cn("min-h-0 w-full flex-col gap-4", compact ? "" : "flex-1", avoidKeyboard && "shrink")}>
              <View className="mx-auto h-1 w-9 rounded-full bg-accent" />
              <>{native && !open ? exitingContent.current.children : children}</>
            </View>
          </NativeOnlyAnimatedView>
        </DialogPrimitive.Content>
      </SheetOverlay>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: ViewProps) {
  return (
    <View className={cn('flex-col gap-2', className)} {...props} />
  );
}

function SheetFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn('flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      // The primitive draws its own Text, so the face is picked here: without
      // it the weight class selects no bundled face and the title draws medium.
      className={withFontFace(cn('font-heading text-headline font-semibold text-foreground', className))}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-muted-foreground text-callout', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
