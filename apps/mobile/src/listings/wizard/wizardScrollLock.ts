import { createContext, useContext } from "react";

export const WizardScrollLock = createContext<(locked: boolean) => void>(() => undefined);

/**
 * Stops the wizard step scrolling while true, so a drag inside it (the photo
 * grid, #820) keeps its finger. Outside a wizard it does nothing.
 */
export function useWizardScrollLock() {
  return useContext(WizardScrollLock);
}
