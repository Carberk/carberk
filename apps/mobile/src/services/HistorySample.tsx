import { useState } from "react";
import { View } from "react-native";

import { discoveryCopy } from "./discoveryCopy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/** Owned educational fixture, with no licensed provider material or branding. */
export function HistorySample({ locale }: { locale: string }) {
 const c = discoveryCopy(locale), [expanded, setExpanded] = useState(false);
 return <View className="gap-2"><Button variant="outline" accessibilityRole="button" accessibilityLabel={c.sample} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}><Text>{c.sample}</Text></Button>{expanded ? <View className="gap-2 rounded-xl border border-border p-4"><Text className="font-semibold">{c.sampleDisclosure}</Text><Text>{c.sampleVehicle}</Text><Text>{c.sampleMileage}</Text><Text>{c.sampleDate}</Text><Text>{c.sampleCaveat}</Text></View> : null}</View>;
}
