export interface ChatMsg {
  from: "them" | "you";
  text: string;
  time?: string;
}

export function ChatMock({
  name,
  initials,
  platform,
  status = "typing a reply…",
  chip = "auto-sent",
  messages,
}: {
  name: string;
  initials: string;
  platform: string;
  status?: string;
  chip?: string;
  messages: ChatMsg[];
}) {
  return (
    <div className="chat">
      <div className="chat-head">
        <div className="chat-ava">{initials}</div>
        <div>
          <div className="chat-who">{name}</div>
          <div className="chat-meta">
            <span className="chat-live" /> active now
          </div>
        </div>
        <span className="chat-plat">{platform}</span>
      </div>
      <div className="chat-body">
        {messages.map((m, i) => (
          <div key={i} className={`bub ${m.from}`}>
            {m.text}
            {m.time && <span className="bub-time">{m.time}</span>}
          </div>
        ))}
      </div>
      <div className="chat-foot">
        <span className="pulse" /> Wingman · {status}
        <span className="chip">{chip}</span>
      </div>
    </div>
  );
}
