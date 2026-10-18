import { useLocalSearchParams } from "expo-router";

import { ShowroomScreen } from "../../src/business/ShowroomScreen";
export default function ShowroomRoute() {
 const { id } = useLocalSearchParams<{ id: string }>();
 return <ShowroomScreen businessId={id} />;
}
