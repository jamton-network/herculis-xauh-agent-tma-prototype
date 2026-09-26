import { useState } from "react";
import {
  CardStackIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  FileTextIcon,
  GlobeIcon,
  PersonIcon,
} from "@radix-ui/react-icons";
import { IconTile } from "../components/IconTile";
import { AquaAttribution } from "../components/AquaAttribution";

export function Onboarding({
  onComplete,
  onCancel,
  connectedWallet,
  onConnectWallet,
}: {
  onComplete: () => void;
  onCancel: () => void;
  connectedWallet: boolean;
  onConnectWallet: () => void;
}) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      icon: <PersonIcon />,
      eyebrow: "Telegram identity",
      title: "One agent across bot and TMA",
      copy: "Explore how one account brings together a wallet, conversation, trading strategy, and purchase history. Everything in this demo is simulated.",
      details: [
        "Explore a simulated account and conversation",
        "No sign-in or Telegram connection required",
      ],
    },
    {
      icon: <CardStackIcon />,
      eyebrow: "Automatic provisioning",
      title: "One protected wallet on Ethereum",
      copy: "A protected agent wallet holds USDT for purchases, receives XAUH, and uses ETH to pay every withdrawal fee.",
      details: ["Ethereum Mainnet USDT purchases", "USDT, XAUH, and ETH in one agent wallet"],
    },
    {
      icon: <PersonIcon />,
      eyebrow: "Optional external wallet",
      title: "Connect without giving up control",
      copy: "A verified external wallet can approve USDT or ETH top-ups and receive manually confirmed ETH, USDT, or XAUH withdrawals. You may skip this step.",
      details: [
        "A secure check confirms wallet ownership",
        "Connection never exposes keys or moves funds",
      ],
    },
    {
      icon: <FileTextIcon />,
      eyebrow: "Explicit consent",
      title: "Choose a trading strategy",
      copy: "Choose one of four strategies and set the amount and safety limits. Withdrawals always remain manual.",
      details: [
        "Pause or remove the strategy at any time",
        "No promise of returns or perfect timing",
      ],
    },
  ];
  const item = steps[step];

  return (
    <main className="onboarding-screen" aria-labelledby="onboarding-heading">
      <div className="onboarding-top">
        <img src="/assets/xauh-coin.png" alt="" className="onboarding-coin" draggable={false} />
        <button type="button" className="text-button" onClick={onCancel}>
          Preview app
        </button>
      </div>
      <div className="step-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((_, index) => (
          <span key={index} className={index <= step ? "is-active" : ""} />
        ))}
      </div>
      <div className="onboarding-body">
        <IconTile tone={step === 3 || connectedWallet ? "green" : "blue"} size="large">
          {item.icon}
        </IconTile>
        <p className="eyebrow">{item.eyebrow}</p>
        <h1 id="onboarding-heading">{item.title}</h1>
        <p className="onboarding-copy">{item.copy}</p>
        {step === 3 ? <AquaAttribution /> : null}
        <ul>
          {item.details.map((detail) => (
            <li key={detail}>
              <CheckCircledIcon /> {detail}
            </li>
          ))}
        </ul>
        {step === 2 ? (
          <button
            type="button"
            className={`button ${connectedWallet ? "button--connected" : "button--secondary"} onboarding-connect`}
            onClick={onConnectWallet}
            data-testid="onboarding-connect-wallet"
          >
            {connectedWallet ? <CheckCircledIcon /> : <GlobeIcon />}
            {connectedWallet ? "External wallet verified" : "Connect Ethereum wallet"}
          </button>
        ) : null}
        {step === 3 ? (
          <label className="consent-control">
            <input type="checkbox" defaultChecked />
            <span>
              I understand this demo uses simulated balances and transactions. No real funds are
              used.
            </span>
          </label>
        ) : null}
      </div>
      <div className="onboarding-actions">
        {step > 0 ? (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setStep(step - 1)}
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          className="button button--primary"
          onClick={() => (step === steps.length - 1 ? onComplete() : setStep(step + 1))}
          data-testid="onboarding-next"
        >
          {step === steps.length - 1 ? "Start demo" : "Continue"}
          <ChevronRightIcon />
        </button>
      </div>
    </main>
  );
}
