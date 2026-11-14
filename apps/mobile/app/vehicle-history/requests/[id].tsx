import { useLocalSearchParams } from "expo-router";

import { RequestDetail } from "../../../src/vehicle-history/PrivateReader";

export default function HistoryRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RequestDetail id={typeof id === "string" ? id : ""} />;
}
