import { useLocalSearchParams } from "expo-router";

import { PublicOffer } from "../../src/vehicle-history/PublicOffer";

export default function VehicleHistoryScreen() {
  const { listingId } = useLocalSearchParams<{ listingId?: string }>();
  return <PublicOffer listingId={typeof listingId === "string" ? listingId : undefined} />;
}
