import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  ExitIcon,
  PersonIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { formatEther, type Address } from "viem";
import { swapNetwork } from "../live/swapConfig";

type LiquidityWalletMenuProps = {
  account: Address;
  chainId: number;
  eth?: bigint;
  busy: boolean;
  onRefresh: () => void;
  onDisconnect: () => void;
};

export function LiquidityWalletMenu({
  account,
  chainId,
  eth,
  busy,
  onRefresh,
  onDisconnect,
}: LiquidityWalletMenuProps) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const shortAddress = `${account.slice(0, 6)}…${account.slice(-4)}`;
  const correctChain = chainId === swapNetwork.chainId;
  const exactBalance = eth === undefined ? undefined : formatEther(eth);
  const balance =
    eth === undefined
      ? "—"
      : eth > 0n && eth < 1_000_000_000_000n
        ? "<0.000001"
        : Number(exactBalance).toLocaleString(undefined, { maximumFractionDigits: 6 });
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        menu.current?.open &&
        event.target instanceof Node &&
        !menu.current.contains(event.target)
      )
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !menu.current?.open) return;
      event.preventDefault();
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };
  return (
    <details
      className="liquidity-wallet-menu"
      ref={menu}
      onToggle={(event) => {
        if (!event.currentTarget.open) setCopyState("idle");
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          event.currentTarget.open = false;
      }}
    >
      <summary aria-label={`Wallet ${shortAddress}`}>
        <PersonIcon className="wallet-menu-trigger-icon" aria-hidden="true" />
        <span>{shortAddress}</span>
        <ChevronDownIcon className="wallet-menu-chevron" aria-hidden="true" />
      </summary>
      <div className="wallet-menu-panel" role="region" aria-label="Connected wallet">
        <div className="wallet-menu-heading">
          <span className="wallet-menu-avatar">
            <PersonIcon aria-hidden="true" />
          </span>
          <div>
            <strong>Wallet</strong>
            <span className="wallet-menu-connection">
              <span aria-hidden="true" />
              Connected
            </span>
          </div>
          <span className={`wallet-menu-network ${correctChain ? "" : "is-warning"}`}>
            {correctChain ? "Sepolia" : "Wrong network"}
          </span>
        </div>
        <div className="wallet-menu-address-row">
          <code className="wallet-menu-address">
            {account.slice(0, 22)}
            <wbr />
            {account.slice(22)}
          </code>
          <button
            type="button"
            className={`wallet-menu-copy ${copyState === "copied" ? "is-copied" : ""}`}
            aria-label="Copy wallet address"
            title={copyState === "copied" ? "Address copied" : "Copy address"}
            onClick={() => void copy()}
          >
            {copyState === "copied" ? (
              <CheckIcon aria-hidden="true" />
            ) : (
              <CopyIcon aria-hidden="true" />
            )}
          </button>
        </div>
        <p
          className={`wallet-menu-copy-status ${copyState === "error" ? "is-error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {copyState === "copied"
            ? "Address copied"
            : copyState === "error"
              ? "Couldn’t copy. Select the address to copy it manually."
              : ""}
        </p>
        <div className="wallet-menu-balance">
          <span>Network fee balance</span>
          <div title={exactBalance === undefined ? undefined : `${exactBalance} ETH`}>
            <strong>{balance}</strong>
            <span>ETH</span>
          </div>
        </div>
        <div className="wallet-menu-actions">
          <button type="button" disabled={busy} onClick={onRefresh}>
            <ReloadIcon aria-hidden="true" />
            <span>Refresh balances</span>
          </button>
          <button
            type="button"
            className="wallet-menu-disconnect"
            disabled={busy}
            onClick={onDisconnect}
          >
            <ExitIcon aria-hidden="true" />
            <span>Disconnect wallet</span>
          </button>
        </div>
      </div>
    </details>
  );
}
