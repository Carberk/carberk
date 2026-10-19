import { SafeAreaView } from "react-native-safe-area-context";

import { SearchScreen } from "../../../src/listings/search/SearchScreen";

export default function SearchRoute() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]} style={{ paddingBottom: tabBarSpace }}>
      <SearchScreen />
    </SafeAreaView>
  );
}
