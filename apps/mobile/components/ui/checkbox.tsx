import { Check } from "lucide-react-native";
import * as CheckboxPrimitive from "@rn-primitives/checkbox";

import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

type CheckboxPrimitiveProps = React.ComponentProps<
  typeof CheckboxPrimitive.Root
>;

interface CheckboxProps
  extends Omit<CheckboxPrimitiveProps, "onCheckedChange"> {
  onCheckedChange?: CheckboxPrimitiveProps["onCheckedChange"];
}

function Checkbox({
  className,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "h-6 w-6 rounded-sm border-2 border-accent bg-card items-center justify-center active:bg-secondary disabled:opacity-50",
        props.checked && "bg-primary border-primary",
        className,
      )}
      onCheckedChange={onCheckedChange ?? (() => {})}
      {...props}>
      <CheckboxPrimitive.Indicator>
        <Icon as={Check} className="size-4 text-primary-foreground" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
