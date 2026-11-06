import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { BrowserProvider, SwapSession } from "./swapSession";

type SwapContextValue = { session?: SwapSession; error?: string };
const SwapContext = createContext<SwapContextValue>({});

export function SwapProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<SwapContextValue>({});
  useEffect(() => {
    let active = true;
    void Promise.all([import("./swapConfig"), import("./swapSession")])
      .then(async ([configuration, runtime]) => {
        const config = await configuration.loadSwapConfig();
        if (!active) return;
        const provider = (window as typeof window & { ethereum?: BrowserProvider }).ethereum;
        setValue({ session: new runtime.SwapSession(config, provider, window.localStorage) });
      })
      .catch((error: unknown) => {
        if (active)
          setValue({
            error: error instanceof Error ? error.message : "Aqua configuration could not load.",
          });
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!value.session) return;
    const stop = value.session.listen();
    return stop;
  }, [value.session]);
  return <SwapContext.Provider value={value}>{children}</SwapContext.Provider>;
}

export function useAquaWallet() {
  return useContext(SwapContext);
}
