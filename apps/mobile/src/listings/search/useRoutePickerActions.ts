import { useMemo } from "react";
import { router, useLocalSearchParams, type Href } from "expo-router";

import { createRoutePickerActions, type PickerRouter } from "./pickerActions";
import { readPickerResultsFilters, writeResultsRouteState } from "./resultsRouteState";
import { useRecentChoicesStore } from "./recentSearches";

/** expo-router's imperative router, narrowed to what the pickers use. */
export const pickerRouter: PickerRouter = {
  push: (href) => router.push(href as Href),
  dismissAll: () => router.dismissAll(),
  dismissTo: (href) => router.dismissTo(href as Href),
  canDismiss: () => router.canDismiss(),
};

/** Picker actions for the pushed Brand and Model picker screens. */
export function useRoutePickerActions() {
  const params = useLocalSearchParams<{ returnToResults?: string; resultsState?: string }>();
  const resultsState = useMemo(() => {
    const filters = readPickerResultsFilters({
      returnToResults: params.returnToResults,
      resultsState: params.resultsState,
    });
    return filters ? writeResultsRouteState(filters) : undefined;
  }, [params.returnToResults, params.resultsState]);
  const record = useRecentChoicesStore((s) => s.record);
  return useMemo(
    () =>
      createRoutePickerActions({
        router: pickerRouter,
        resultsState,
        record: (choice) => void record(choice),
      }),
    [record, resultsState],
  );
}
