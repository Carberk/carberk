import { mobileDuration } from '@auto-tm/ui/tokens';
import * as DialogPrimitive from '@rn-primitives/dialog';
import * as React from 'react';
import { Platform, Pressable, View, type ViewProps } from 'react-native';
import { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { FullWindowOverlay as RNFullWindowOverlay } from 'react-native-screens';

import { cn } from '@/lib/utils';
import { NativeOnlyAnimatedView } from '@/components/ui/native-only-animated-view';

const Sheet = DialogPrimitive.Root;

const SheetTrigger = DialogPrimitive.Trigger;

const SheetClose = DialogPrimitive.Close;

const SheetPortal = DialogPrimitive.Portal;

const FullWindowOverlay = Platform.OS === 'ios' ? RNFullWindowOverlay : React.Fragment;

function SheetOverlay({
  className,
  children,
  closeOnBackdropPress,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Overlay>, 'asChild'> & {
  children?: React.ReactNode;
  closeOnBackdropPress?: boolean;
}) {
  return (
    <FullWindowOverlay>
      <DialogPrimitive.Overlay
        className={cn(
          'absolute bottom-0 left-0 right-0 top-0 items-stretch justify-end bg-scrim/50',
          Platform.select({
            web: 'animate-in fade-in-0 fixed cursor-default [&>*]:cursor-auto',
          }),
          className
        )}
        {...props}
        asChild={Platform.OS !== 'web'}>
        <NativeOnlyAnimatedView>
          <NativeOnlyAnimatedView className="w-full flex-1 justify-end">
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
          </NativeOnlyAnimatedView>
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
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  portalHost?: string;
  compact?: boolean;
  closeOnBackdropPress?: boolean;
}) {
  return (
    <SheetPortal hostName={portalHost}>
      <SheetOverlay closeOnBackdropPress={closeOnBackdropPress}>
        <DialogPrimitive.Content
          className={cn(
            'z-50 w-full max-w-none self-stretch flex-col gap-4 overflow-hidden rounded-t-3xl bg-popover p-5 shadow-overlay',
            compact ? 'max-h-[70%]' : 'max-h-[85%]',
            Platform.select({
              web: 'animate-in fade-in-0 slide-in-from-bottom-10 duration-300',
            }),
            className
          )}
          onStartShouldSetResponder={() => false}
          {...props}>
          <NativeOnlyAnimatedView
            entering={SlideInDown.duration(mobileDuration.slow)}
            exiting={SlideOutDown.duration(mobileDuration.base)}
            className={cn("min-h-0 w-full", compact ? "" : "flex-1")}>
            <View className={cn("min-h-0 w-full flex-col gap-4", compact ? "" : "flex-1")}>
              <View className="mx-auto h-1 w-9 rounded-full bg-accent" />
              <>{children}</>
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
      className={cn('font-heading text-headline font-semibold text-foreground', className)}
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
