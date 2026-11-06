import { useEffect } from "react";
import type { SwapDirection } from "./swapConfig";
import type { SwapSession } from "./swapSession";

export function useSwapQuotes(
  session: SwapSession,
  direction: SwapDirection,
  amount: string,
  slippage: string,
  paused: boolean,
  account?: string,
  chainId?: number,
  catalogVersion?: number,
) {
  useEffect(() => {
    session.invalidateQuotes();
    return () => session.invalidateQuotes();
  }, [session, direction]);
  useEffect(() => {
    if (paused) return;
    let active = true;
    let timer: number | undefined;
    const update = async () => {
      if (!active || document.hidden) return;
      await session.quote(direction, amount, slippage);
      if (active) timer = window.setTimeout(() => void update(), 15_000);
    };
    const visibility = () => {
      window.clearTimeout(timer);
      if (document.hidden) session.invalidateQuotes();
      else timer = window.setTimeout(() => void update(), 0);
    };
    timer = window.setTimeout(() => void update(), 400);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [session, direction, amount, slippage, paused, account, chainId, catalogVersion]);
}
