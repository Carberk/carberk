import { Search } from "lucide-react-native";
import * as React from "react";
import { TextInput, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { withFontFace } from "@/lib/font";
import { cn } from "@/lib/utils";

type SearchFieldProps = React.ComponentProps<typeof TextInput> &
  React.RefAttributes<TextInput> & {

    className?: string;
  };








function SearchField({ className, onFocus, onBlur, ...props }: SearchFieldProps) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View
      className={cn(
        "min-h-control-md flex-row items-center gap-2.5 rounded-lg border border-transparent bg-secondary pl-4 pr-3",
        focused && "border-foreground",
        className,
      )}
    >
      <Icon as={Search} className="size-5 text-muted-foreground" strokeWidth={2.2} />
      <TextInput
        className={withFontFace(
          "min-w-0 flex-1 self-stretch py-0 font-sans text-body leading-5 text-foreground placeholder:text-muted-foreground",
        )}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
      />
    </View>
  );
}

export { SearchField };
export type { SearchFieldProps };
