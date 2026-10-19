import { cva, type VariantProps } from 'class-variance-authority';
import { Platform } from 'react-native';

import { PressableScale, type PressableScaleProps } from '@/components/ui/pressable-scale';
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * Buttons have weight: 52 dp by default, 56 dp for the main action of a
 * screen, a 20 dp radius, and a filled surface in every variant but `ghost`
 * and `link`. The secondary button is a tonal fill, not an outline. Icon
 * buttons are 44 dp circles. See docs/prd/ui/components/78-01-button.md.
 *
 * A disabled button keeps its shape on the tonal surface with quiet text; it
 * is never dimmed with opacity, so its label stays readable.
 */
const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-2 rounded-xl border border-transparent shadow-none',
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    })
  ),
  {
    variants: {
      variant: {
        default: cn(
          'bg-foreground active:bg-foreground/85 disabled:bg-muted disabled:border disabled:border-border',
          Platform.select({ web: 'hover:bg-foreground/90' })
        ),
        brand: cn(
          'bg-primary active:bg-brand-600 disabled:bg-muted disabled:border disabled:border-border disabled:shadow-none',
          Platform.select({ web: 'hover:bg-primary/90' })
        ),
        destructive: cn(
          'bg-destructive active:bg-destructive/85 disabled:bg-muted disabled:border disabled:border-border disabled:shadow-none',
          Platform.select({
            web: 'hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
          })
        ),
        outline: cn(
          'border-border bg-card active:bg-secondary disabled:bg-muted disabled:border disabled:border-border',
          Platform.select({
            web: 'hover:bg-muted',
          })
        ),
        secondary: cn(
          'bg-secondary active:bg-accent disabled:bg-muted disabled:border disabled:border-border',
          Platform.select({ web: 'hover:bg-muted/80' })
        ),
        ghost: cn(
          'active:bg-secondary disabled:bg-muted disabled:border disabled:border-border',
          Platform.select({ web: 'hover:bg-muted dark:hover:bg-muted/70' })
        ),
        link: 'disabled:text-muted-foreground',
      },
      size: {
        default: cn('h-control-md px-5', Platform.select({ web: 'has-[>svg]:px-3' })),
        sm: cn('h-control-sm gap-1.5 rounded-lg px-4', Platform.select({ web: 'has-[>svg]:px-2.5' })),
        lg: cn('h-control-lg px-6', Platform.select({ web: 'has-[>svg]:px-4' })),
        pill: 'h-control-lg rounded-full px-6',
        icon: 'h-11 w-11 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const buttonTextVariants = cva(
  cn(
    'text-foreground text-body font-medium',
    Platform.select({ web: 'pointer-events-none transition-colors' })
  ),
  {
    variants: {
      variant: {
        default: 'text-background font-semibold disabled:text-muted-foreground',
        brand: 'text-primary-foreground font-semibold disabled:text-muted-foreground',
        destructive: 'text-destructive-foreground font-semibold disabled:text-muted-foreground',
        outline: cn(
          'text-foreground group-active:text-foreground disabled:text-muted-foreground',
          Platform.select({ web: 'group-hover:text-foreground' })
        ),
        secondary: 'text-foreground disabled:text-muted-foreground',
        ghost: 'text-foreground group-active:text-foreground disabled:text-muted-foreground',
        link: cn(
          'text-info-600 group-active:underline disabled:text-muted-foreground dark:text-info-400',
          Platform.select({ web: 'underline-offset-4 hover:underline group-hover:underline' })
        ),
      },
      size: {
        default: '',
        sm: 'text-callout',
        lg: '',
        pill: '',
        icon: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonProps = PressableScaleProps & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <PressableScale
        className={cn(buttonVariants({ variant, size }), className)}
        role="button"
        feedback={variant === 'link' ? 'none' : 'control'}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
