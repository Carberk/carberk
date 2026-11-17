import { Children, Fragment, type ReactNode } from "react";
import { View } from "react-native";

import { cn } from "@/lib/utils";









type Inset = "icon" | "check" | "text";

const INSET: Record<Inset, string> = {
  icon: "ml-16",
  check: "ml-14",
  text: "ml-4",
};

function GroupedDivider({ inset = "icon" }: { inset?: Inset }) {
  return <View className={cn("h-px bg-border", INSET[inset])} />;
}


function GroupedList({
  children,
  inset = "icon",
  className,
}: {
  children: ReactNode;
  inset?: Inset;
  className?: string;
}) {
  const rows = Children.toArray(children);
  return (
    <View className={cn("mx-4 overflow-hidden rounded-2xl bg-card", className)}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? <GroupedDivider inset={inset} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}






function GroupedItem({
  index = 0,
  count = 1,
  inset = "icon",
  children,
}: {
  index?: number;
  count?: number;
  inset?: Inset;
  children: ReactNode;
}) {
  const first = index === 0;
  const last = index >= count - 1;
  return (
    <View
      className={cn(
        "mx-4 overflow-hidden bg-card",
        first && "rounded-t-2xl",
        last && "rounded-b-2xl",
      )}
    >
      {children}
      {last ? null : <GroupedDivider inset={inset} />}
    </View>
  );
}

export { GroupedDivider, GroupedItem, GroupedList };
