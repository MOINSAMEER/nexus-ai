"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type StudyAction =
  | "summary"
  | "explain"
  | "questions"
  | "mcq"
  | "ask"
  | "notes";

type UploadedDocument = {
  fileName: string;
  chunks: string[];
};

const features: {
  action: StudyAction;
  title: string;
  description: string;
  icon: string;
}[] = [
  { action: "summary", title: "Easy Summary", description: "Simplify your material", icon: "▤" },
  { action: "explain", title: "Explain Simply", description: "Understand difficult topics", icon: "✧" },
  { action: "questions", title: "Important Questions", description: "Prepare for exams", icon: "☷" },
  { action: "mcq", title: "MCQ Generator", description: "Practice with questions", icon: "✓" },
  { action: "ask", title: "Ask This PDF", description: "Ask anything about your file", icon: "⌕" },
  { action: "notes", title: "Chapter-wise Notes", description: "Organized revision notes", icon: "▥" },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"cloud" | "local">("cloud");
  const [document, setDocument] = useState<UploadedDocument | null>(null);
  const [status, setStatus] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

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
      localStorage.setItem("nexus-chat-history", JSON.stringify(messages));
    }
  }, [messages, ready]);

  async function uploadFile(file?: File) {
    if (!file) return;

    setUploading(true);
    setStatus("Reading your document...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      setDocument({
        fileName: data.fileName,
        chunks: data.chunks,
      });

      setStatus(`✓ ${data.fileName} uploaded successfully`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function runStudy(action: StudyAction) {
    if (!document || loading) return;

    if (action === "ask" && !question.trim()) {
      setStatus("Enter your question about the PDF first.");
      return;
    }

    setLoading(true);
    setStatus("NEXUS is studying your document...");

    try {
      const response = await fetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunks: document.chunks,
          action,
          question,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Study request failed.");
      }

      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          content: `## ${features.find((f) => f.action === action)?.title}\n\n${data.answer}`,
        },
      ]);

      setQuestion("");
      setStatus("✓ Done! Your study material is ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

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
        body: JSON.stringify({ messages: conversation, mode }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "NEXUS connection failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
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
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      setMessages((old) => {
        const updated = [...old];
        const last = updated[updated.length - 1];

        if (last?.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: error instanceof Error ? error.message : "Something went wrong.",
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
    <main className="min-h-screen bg-[#09090b] text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#09090b]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center font-bold text-lg">
            N
          </div>

          <div className="ml-3">
            <h1 className="font-semibold">NEXUS AI</h1>
            <p className="text-xs text-zinc-500">Personal Study Assistant</p>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "cloud" | "local")}
              disabled={loading}
              className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-xs"
            >
              <option value="cloud">☁ Cloud AI</option>
              <option value="local">◉ Local AI</option>
            </select>

            <button
              onClick={clearChat}
              disabled={loading || messages.length === 0}
              className="text-xs text-zinc-400 hover:text-white disabled:opacity-30"
            >
              Clear chat
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 py-8">
        <section className="mb-8">
          <p className="text-sm text-violet-400 mb-2">YOUR PERSONAL AI SPACE</p>
          <h2 className="text-3xl md:text-4xl font-semibold">
            Learn smarter with <span className="text-violet-400">NEXUS.</span>
          </h2>
          <p className="text-zinc-400 mt-2 text-sm">
            Upload your study material and let AI help you understand it.
          </p>
        </section>

        <section className="border border-white/10 bg-[#111114] rounded-2xl p-5 mb-6">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={(e) => uploadFile(e.target.files?.[0])}
          />

          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading || loading}
            className="w-full border border-dashed border-violet-500/40 rounded-xl p-8 text-center hover:bg-violet-500/5 transition disabled:opacity-50"
          >
            <div className="text-3xl mb-3">⇧</div>
            <h3 className="font-semibold">Upload your study material</h3>
            <p className="text-sm text-zinc-500 mt-2">PDF · DOCX · TXT · Maximum 10 MB</p>
            <p className="text-xs text-violet-400 mt-3">
              {uploading ? "Uploading..." : "Choose a file"}
            </p>
          </button>

          {document && (
            <div className="mt-4 flex items-center justify-between bg-violet-500/10 border border-violet-500/20 rounded-xl p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">📄 {document.fileName}</p>
                <p className="text-xs text-zinc-500">
                  {document.chunks.length} document chunk(s) ready
                </p>
              </div>

              <button
                onClick={() => {
                  setDocument(null);
                  setStatus("Document removed.");
                }}
                className="text-xs text-red-400 ml-3"
              >
                Remove
              </button>
            </div>
          )}

          {status && (
            <p className="text-xs text-zinc-400 mt-3">{status}</p>
          )}
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {features.map((feature) => (
            <button
              key={feature.action}
              onClick={() => runStudy(feature.action)}
              disabled={!document || loading}
              className="text-left border border-white/10 bg-[#111114] rounded-xl p-5 hover:border-violet-500/50 hover:bg-violet-500/5 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="text-violet-400 text-2xl mb-3">{feature.icon}</div>
              <h3 className="font-medium">{feature.title}</h3>
              <p className="text-xs text-zinc-500 mt-1">{feature.description}</p>
            </button>
          ))}
        </section>

        {document && (
          <section className="border border-white/10 bg-[#111114] rounded-xl p-4 mb-8">
            <h3 className="font-medium mb-3">Ask a question about your PDF</h3>
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runStudy("ask");
                }}
                placeholder="Ask anything from your document..."
                className="min-w-0 flex-1 bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-sm outline-none focus:border-violet-500"
              />
              <button
                onClick={() => runStudy("ask")}
                disabled={loading || !question.trim()}
                className="bg-violet-600 rounded-lg px-4 text-sm disabled:opacity-40"
              >
                Ask
              </button>
            </div>
          </section>
        )}

        <section className="border-t border-white/10 pt-8">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-lg">Chat with NEXUS</h3>
              <p className="text-xs text-zinc-500">Your personal AI conversation</p>
            </div>
            <span className="text-xs text-green-400">
              ● {mode === "cloud" ? "CLOUD AI" : "LOCAL AI"}
            </span>
          </div>

          {!ready ? (
            <p className="text-zinc-500 text-sm">Loading conversations...</p>
          ) : (
            <div className="space-y-4 mb-5">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-words ${
                      message.role === "user"
                        ? "bg-violet-600"
                        : "bg-zinc-800 border border-white/5"
                    }`}
                  >
                    {message.content ||
                      (loading && index === messages.length - 1
                        ? "NEXUS is thinking..."
                        : "")}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 bg-zinc-900 border border-white/10 rounded-xl p-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              placeholder="Message NEXUS..."
              disabled={!ready || loading}
              className="min-w-0 flex-1 bg-transparent outline-none px-3 text-sm"
            />

            <button
              onClick={sendMessage}
              disabled={!ready || loading || !input.trim()}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-lg px-5 py-2 text-sm"
            >
              {loading ? "..." : "Send ↑"}
            </button>
          </div>
        </section>

        <footer className="text-center text-xs text-zinc-600 pt-8">
          NEXUS AI · Your ideas. Your assistant. Your own AI space.
        </footer>
      </div>
    </main>
  );
}
