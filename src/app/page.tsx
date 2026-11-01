
"use client";

import { useEffect, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nexus-chat-history");
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      console.error("Could not load saved chats");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      localStorage.setItem(
        "nexus-chat-history",
        JSON.stringify(messages)
      );
    }
  }, [messages, ready]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const conversation: Message[] = [
      ...messages,
      { role: "user", content: text },
    ];

    setMessages([
      ...conversation,
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
      });

      if (!response.ok || !response.body) {
        throw new Error("NEXUS connection failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        setMessages((old) => {
          const updated = [...old];
          const last = updated[updated.length - 1];

          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + chunk,
            };
          }

          return updated;
        });
      }

      const remaining = decoder.decode();
      if (remaining) {
        setMessages((old) => {
          const updated = [...old];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + remaining,
            };
          }
          return updated;
        });
      }

      reader.releaseLock();
    } catch (error) {
      setMessages((old) => {
        const updated = [...old];
        const last = updated[updated.length - 1];

        if (last?.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content:
              error instanceof Error
                ? error.message
                : "Something went wrong.",
          };
        }

        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    if (loading) return;
    setMessages([]);
    localStorage.removeItem("nexus-chat-history");
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-white flex flex-col">
      <header className="h-16 border-b border-white/10 flex items-center px-6">
        <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center font-bold">
          N
        </div>

        <div className="ml-3">
          <h1 className="font-semibold">NEXUS AI</h1>
          <p className="text-xs text-zinc-500">
            Your personal AI assistant
          </p>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <span className="text-xs text-green-400">
            ● LOCAL MODE
          </span>
          <button
            onClick={clearChat}
            disabled={loading || messages.length === 0}
            className="text-xs text-zinc-400 hover:text-white disabled:opacity-30"
          >
            Clear chat
          </button>
        </div>
      </header>

      <section className="flex-1 w-full max-w-3xl mx-auto px-5 py-10">
        {!ready ? (
          <p className="text-center text-zinc-500">
            Loading memory...
          </p>
        ) : messages.length === 0 ? (
          <div className="text-center mt-24">
            <div className="text-5xl mb-6">✦</div>
            <h2 className="text-4xl font-semibold mb-3">
              Welcome to NEXUS
            </h2>
            <p className="text-zinc-400">
              Your ideas. Your assistant. Your own AI space.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-3 whitespace-pre-wrap break-words ${
                    message.role === "user"
                      ? "bg-violet-600"
                      : "bg-zinc-800"
                  }`}
                >
                  {message.content ||
                    (loading && index === messages.length - 1
                      ? "NEXUS is thinking..."
                      : "")}
                  {loading &&
                    index === messages.length - 1 &&
                    message.role === "assistant" &&
                    message.content !== "" && (
                      <span className="animate-pulse">▋</span>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="w-full max-w-3xl mx-auto px-5 pb-8">
        <div className="flex gap-3 bg-zinc-900 border border-white/10 rounded-2xl p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Message NEXUS..."
            className="flex-1 bg-transparent outline-none px-2 text-sm"
            disabled={!ready || loading}
          />

          <button
            onClick={sendMessage}
            disabled={!ready || loading || !input.trim()}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl px-5 py-2 text-sm"
          >
            {loading ? "..." : "Send ↑"}
          </button>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-3">
          NEXUS AI · Powered by your local model
        </p>
      </footer>
    </main>
  );
}
