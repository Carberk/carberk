import {
  AlertTriangle,
  Bell,
  Camera,
  Car,
  Heart,
  Plus,
  Search,
  type LucideIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";












type IllustrationName =
  | "favorites"
  | "messages"
  | "sell"
  | "search"
  | "listings"
  | "notifications"
  | "error";


function Line({ className }: { className?: string }) {
  return <View className={cn("h-2 rounded-full bg-accent", className)} />;
}


function CardShape({
  className,
  icon = Car,
  children,
}: {
  className?: string;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <View
      className={cn(
        "absolute w-32 gap-2.5 rounded-2xl border-hairline border-border bg-card p-2.5 shadow-raised",
        className,
      )}
    >
      <View className="h-20 items-center justify-center rounded-lg bg-secondary">
        <Icon as={icon} className="size-8 text-muted-foreground" strokeWidth={1.5} />
      </View>
      <Line className="w-16 bg-foreground/80" />
      <Line className="mb-1 w-24" />
      {children}
    </View>
  );
}


function BackCard({ className }: { className?: string }) {
  return (
    <View
      className={cn("absolute h-36 w-32 rounded-2xl bg-secondary", className)}
    />
  );
}


function Accent({
  icon,
  className,
  tone = "brand",
  filled = false,
}: {
  icon: LucideIcon;
  className?: string;
  tone?: "brand" | "ink" | "alert";
  filled?: boolean;
}) {
  return (
    <View
      className={cn(
        "absolute size-12 items-center justify-center rounded-full border-2 border-background shadow-raised",
        tone === "brand" && "bg-primary",
        tone === "ink" && "bg-foreground",
        tone === "alert" && "bg-destructive",
        className,
      )}
    >
      <Icon
        as={icon}
        className={cn(
          "size-6",
          tone === "brand" && "text-primary-foreground",
          tone === "ink" && "text-background",
          tone === "alert" && "text-destructive-foreground",
          filled && tone === "brand" && "fill-primary-foreground",
        )}
        strokeWidth={2.2}
      />
    </View>
  );
}

function Bubble({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <View className={cn("absolute gap-2 rounded-3xl px-4 py-3.5", className)}>
      {children}
    </View>
  );
}

const COMPOSITION: Record<IllustrationName, ReactNode> = {
  favorites: (
    <>
      <BackCard className="left-6 top-3 -rotate-[8deg]" />
      <CardShape className="left-16 top-1 rotate-[4deg]" />
      <Accent icon={Heart} filled className="right-5 top-0" />
    </>
  ),
  messages: (
    <>
      <Bubble className="left-3 top-2 w-36 rounded-bl-sm bg-secondary">
        <Line className="w-24" />
        <Line className="w-16" />
      </Bubble>
      <Bubble className="right-3 top-[68px] w-40 rounded-br-sm bg-primary">
        <Line className="w-28 bg-primary-foreground/90" />
        <Line className="w-20 bg-primary-foreground/60" />
      </Bubble>
      <Bubble className="left-3 top-[134px] w-24 rounded-bl-sm bg-secondary">
        <Line className="w-12" />
      </Bubble>
    </>
  ),
  sell: (
    <>
      <BackCard className="left-7 top-3 -rotate-[7deg]" />
      <CardShape icon={Camera} className="left-16 top-1 rotate-[3deg]" />
      <Accent icon={Plus} className="bottom-1 right-5" />
    </>
  ),
  search: (
    <>
      <BackCard className="left-6 top-3 -rotate-[8deg]" />
      <CardShape className="left-16 top-1 rotate-[4deg]" />
      <Accent icon={Search} tone="ink" className="bottom-2 right-5" />
    </>
  ),
  listings: (
    <>
      <BackCard className="left-7 top-3 -rotate-[7deg]" />
      <CardShape className="left-16 top-1 rotate-[3deg]" />
      <Accent icon={Plus} className="bottom-1 right-5" />
    </>
  ),
  notifications: (
    <>
      <BackCard className="left-6 top-3 -rotate-[8deg]" />
      <CardShape className="left-16 top-1 rotate-[4deg]" />
      <Accent icon={Bell} filled className="right-5 top-0" />
    </>
  ),
  error: (
    <>
      <BackCard className="left-6 top-3 -rotate-[8deg]" />
      <CardShape className="left-16 top-1 rotate-[4deg]" />
      <Accent icon={AlertTriangle} tone="alert" className="right-5 top-0" />
    </>
  ),
};

function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID={`illustration-${name}`}
      className={cn("h-44 w-60", className)}
    >
      {COMPOSITION[name]}
    </View>
  );
}

export { Illustration };
export type { IllustrationName };
