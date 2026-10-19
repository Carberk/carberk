import { mobileDuration } from '@auto-tm/ui/tokens';
import { Portal } from '@rn-primitives/portal';
import * as React from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeOutDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_HEIGHT } from '@/components/navigation/tabBarHeight';
import { cn } from '@/lib/utils';
import { Text } from '@/components/ui/text';

type ToastVariant = 'default' | 'destructive' | 'success' | 'warning' | 'info';
/** `aboveTabBar` keeps a toast clear of the tab bar on a tab screen. */
type ToastPlacement = 'top' | 'aboveTabBar';

interface ToastAction {
  label: string;
  onPress: () => void;
}

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  placement?: ToastPlacement;
  /** Measured header height below the safe area, for a taller active screen. */
  topClearance?: number;
  /** One button on the toast, such as Undo. Pressing it also closes the toast. */
  action?: ToastAction;
}

interface ToastContextValue {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  setTopClearance: (id: string, height: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const show = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setTopClearance = React.useCallback((id: string, height: number) => {
    setToasts((prev) => prev.map((toast) =>
      toast.id === id ? { ...toast, topClearance: height } : toast
    ));
  }, []);

  const value = React.useMemo(() => ({ toasts, show, dismiss, setTopClearance }), [toasts, show, dismiss, setTopClearance]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

function ToastViewport() {
  const ctx = React.useContext(ToastContext);
  const insets = useSafeAreaInsets();
  if (!ctx) return null;

  const top = ctx.toasts.filter((toast) => toast.placement !== 'aboveTabBar');
  const aboveTabBar = ctx.toasts.filter((toast) => toast.placement === 'aboveTabBar');
  const topClearance = Math.max(64, ...top.map((toast) => toast.topClearance ?? 64));

  return (
    <Portal name="toast-viewport">
      {top.length > 0 && (
        <View
          testID="toast-viewport-top"
          // Taller callers supply their measured header height; ordinary headers retain 64 pt.
          style={{ top: insets.top + topClearance + 8 }}
          className="absolute left-0 right-0 z-[100] flex-col items-center gap-2 px-4 pointer-events-none">
          {top.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={() => ctx.dismiss(toast.id)} />
          ))}
        </View>
      )}
      {aboveTabBar.length > 0 && (
        <View
          testID="toast-viewport-above-tab-bar"
          style={{ bottom: TAB_BAR_HEIGHT + insets.bottom + 8 }}
          className="absolute left-0 right-0 z-[100] flex-col items-center gap-2 px-4 pointer-events-none">
          {aboveTabBar.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={() => ctx.dismiss(toast.id)} />
          ))}
        </View>
      )}
    </Portal>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const duration = toast.duration ?? 3000;
  const dismissRef = React.useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Each toast owns its timer, so a later toast neither restarts nor shortens it.
  React.useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  // Announced on both platforms, with no live region to read it twice: iOS has
  // no live regions, and Android may not read one that has just been mounted. Naming the action tells a screen-reader
  // user that Undo is there.
  const announcement = toast.action ? `${toast.title}. ${toast.action.label}` : toast.title;
  React.useEffect(() => {
    AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);

  const fromBottom = toast.placement === 'aboveTabBar';

  return (
    <Animated.View
      entering={(fromBottom ? FadeInDown : FadeInUp).duration(mobileDuration.base)}
      exiting={(fromBottom ? FadeOutDown : FadeOutUp).duration(mobileDuration.fast)}
      className="pointer-events-auto w-full max-w-sm">
      {/* An accessible parent groups its children on iOS, which would hide the action from VoiceOver. */}
      <Pressable onPress={onDismiss} accessible={!toast.action}>
        <View
          className={cn(
            'flex-row items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 shadow-floating',
            toast.variant === 'destructive' &&
              'border-destructive/20',
            toast.variant === 'success' && 'border-success-500/20',
            toast.variant === 'warning' && 'border-warning-500/20',
            toast.variant === 'info' && 'border-info-500/20',
            (!toast.variant || toast.variant === 'default') &&
              'border-border',
            toast.action && 'py-1'
          )}>
          <View className="flex-1">
            <Text
              className={cn(
                'text-callout font-medium',
                toast.variant === 'destructive' && 'text-destructive',
                toast.variant === 'success' && 'text-success-500',
                toast.variant === 'warning' && 'text-warning-500',
                toast.variant === 'info' && 'text-info-500',
                (!toast.variant || toast.variant === 'default') && 'text-foreground'
              )}>
              {toast.title}
            </Text>
            {toast.description ? (
              <Text
                className={cn(
                  'text-footnote mt-0.5',
                  toast.variant === 'destructive'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                )}>
                {toast.description}
              </Text>
            ) : null}
          </View>
          {toast.action ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
              onPress={() => {
                toast.action?.onPress();
                onDismiss();
              }}
              className="min-h-11 min-w-11 items-center justify-center rounded-md px-2 active:bg-secondary">
              <Text className="text-callout font-semibold text-primary">{toast.action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export { ToastProvider, useToast, ToastViewport };
export type { Toast, ToastAction, ToastPlacement, ToastVariant };
