import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";

import { Illustration, type IllustrationName } from "@/components/ui/illustration";
import { Enter } from "@/components/ui/motion";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type EmptyStateProps = ViewProps & {
  className?: string;

  illustration?: IllustrationName;
  title: string;
  hint?: string;

  children?: ReactNode;
};







function EmptyState({
  illustration,
  title,
  hint,
  children,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <View
      className={cn("flex-1 items-center justify-center px-8 pb-12 pt-6", className)}
      {...props}
    >
      <Enter className="w-full items-center">
        {illustration ? <Illustration name={illustration} className="mb-6" /> : null}
        <Text className="text-center font-heading text-headline font-semibold text-foreground">
          {title}
        </Text>
        {hint ? (
          <Text className="mt-2 text-center text-body text-muted-foreground">{hint}</Text>
        ) : null}
        {children ? <View className="mt-7 w-full gap-3">{children}</View> : null}
      </Enter>
    </View>
  );
}

export { EmptyState };
export type { EmptyStateProps };
