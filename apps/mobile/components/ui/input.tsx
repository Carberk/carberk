import { Platform, TextInput } from 'react-native';

import { cn } from '@/lib/utils';

/**
 * A filled field on the tonal surface: it reads as a control on the page and
 * on a card without a box drawn around it. Focus draws an edge in the foreground
 * colour; an error state is the caller's `border-destructive`.
 * See docs/prd/ui/components/78-02-input.md.
 */
function Input({ className, ...props }: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'h-control-md w-full rounded-lg border border-transparent bg-secondary px-4 font-sans text-body leading-5 text-foreground shadow-none focus:border-foreground',
        props.editable === false &&
        cn(
          'opacity-50',
          Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
        ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow] md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
          ),
          native: 'placeholder:text-muted-foreground',
        }),
        className
      )}
      {...props}
    />
  );
}

export { Input };
