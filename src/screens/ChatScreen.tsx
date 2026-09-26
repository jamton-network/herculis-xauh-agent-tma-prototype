import { useState, useEffect, useRef } from "react";
import { ChevronRightIcon, FileTextIcon, PaperPlaneIcon } from "@radix-ui/react-icons";
import { initialMessages } from "../demo/fixtures";

export function ChatScreen({
  onOpenStrategy,
  notify,
}: {
  onOpenStrategy: () => void;
  notify: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);

  const latestMessage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > initialMessages.length)
      latestMessage.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, from: "user", text, time: "Now" },
      {
        id: `a-${Date.now()}`,
        from: "agent",
        text: "This is a simulated reply. Try editing a trading strategy or exploring the wallet flows. No message is sent to a bot or a live model.",
        time: "Now",
      },
    ]);
    setDraft("");
    notify();
  };

  return (
    <div className="chat-layout">
      <div className="app-scroll chat-scroll">
        <main className="screen-content chat-screen" aria-labelledby="chat-heading">
          <div className="screen-heading">
            <div>
              <p className="eyebrow">Demo conversation</p>
              <h1 id="chat-heading">Agent chat</h1>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Open trading strategy"
              onClick={onOpenStrategy}
            >
              <FileTextIcon />
            </button>
          </div>
          <div className="chat-date">Today</div>
          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`message message--${message.from}`}>
                {message.from === "agent" ? (
                  <img
                    className="message-avatar"
                    src="/assets/xauh-coin.png"
                    alt=""
                    draggable={false}
                  />
                ) : null}
                <div>
                  <p>{message.text}</p>
                  <time>{message.time}</time>
                </div>
              </article>
            ))}
          </div>
          <div ref={latestMessage} />
          <button type="button" className="decision-card" onClick={onOpenStrategy}>
            <FileTextIcon />
            <span>
              <strong>Latest decision</strong>
              <small>Strategy blocked</small>
            </span>
            <ChevronRightIcon />
          </button>
        </main>
      </div>
      <div className="chat-composer" data-testid="chat-composer">
        <input
          aria-label="Message the agent"
          placeholder="Ask about today’s decision"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) send();
          }}
        />
        <button
          className="send-button"
          type="button"
          aria-label="Send message"
          onClick={send}
          disabled={!draft.trim()}
          data-testid="send-message"
        >
          <PaperPlaneIcon />
        </button>
      </div>
    </div>
  );
}
