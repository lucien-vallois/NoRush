import { useOutletContext } from "react-router";

export function useDemoReadOnly(): boolean {
  return useOutletContext<{ demoReadOnly: boolean }>().demoReadOnly;
}
