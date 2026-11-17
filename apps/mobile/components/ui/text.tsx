import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Platform, Text as RNText, type Role } from 'react-native';

import { fontFaceClass } from '@/lib/font';
import { maxFontScaleFor, TextScaleContext } from '@/lib/font-scale';
import { cn } from '@/lib/utils';

const textVariants = cva(
  cn(
    'font-sans text-body text-foreground',
    Platform.select({
      web: 'select-text',
    })
  ),
  {
    variants: {
      variant: {
        default: '',
        h1: cn(
          'font-heading text-display font-bold',
          Platform.select({ web: 'scroll-m-20 text-balance' })
        ),
        h2: cn(
          'font-heading text-title font-semibold',
          Platform.select({ web: 'scroll-m-20 first:mt-0' })
        ),
        h3: cn('font-heading text-headline font-semibold', Platform.select({ web: 'scroll-m-20' })),
        h4: cn('font-heading text-subhead font-semibold', Platform.select({ web: 'scroll-m-20' })),
        p: 'leading-relaxed',
        blockquote: 'border-l-2 border-border pl-3 italic text-muted-foreground',
        code: cn(
          'relative rounded-sm bg-secondary px-1.5 py-1 font-mono text-footnote font-medium'
        ),
        lead: 'text-subhead text-muted-foreground',
        large: 'text-subhead font-semibold',
        small: 'text-callout font-medium',
        muted: 'text-muted-foreground text-callout',
        label: 'text-callout font-medium text-foreground',
        caption: 'text-caption font-medium text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  blockquote: Platform.select({ web: 'blockquote' as Role }),
  code: Platform.select({ web: 'code' as Role }),
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: '1',
  h2: '2',
  h3: '3',
  h4: '4',
};

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> &
  TextVariantProps & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const controlScale = React.useContext(TextScaleContext);
  const Component = asChild ? Slot : RNText;
  const merged = cn(textVariants({ variant }), textClass, className);

  const face = fontFaceClass(merged);
  return (
    <Component
      className={face ? cn(merged, face) : merged}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}


      maxFontSizeMultiplier={controlScale ?? maxFontScaleFor(merged)}
      {...props}
    />
  );
}

export { Text, TextClassContext };
