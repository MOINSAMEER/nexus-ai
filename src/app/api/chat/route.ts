
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "No messages provided." },
        { status: 400 }
      );
    }

    const response = await fetch(
      "http://127.0.0.1:11434/api/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen3.5:2b",
          messages: [
            {
              role: "system",
              content:
                "You are NEXUS, a fast personal AI assistant. Give direct, concise answers. Never reveal internal reasoning.",
            },
            ...messages.slice(-8),
          ],
          think: false,
          stream: true,
          keep_alive: "30m",
          options: { num_predict: 120 },
        }),
      }
    );

    if (!response.ok || !response.body) {
      throw new Error("Ollama request failed");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), {
              stream: !done,
            });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim()) continue;

              const data = JSON.parse(line);

              if (data.message?.content) {
                controller.enqueue(
                  new TextEncoder().encode(data.message.content)
                );
              }

              if (data.error) {
                throw new Error(data.error);
              }
            }

            if (done) break;
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    console.error("NEXUS streaming error:", error);

    return NextResponse.json(
      { error: "Could not connect to Ollama." },
      { status: 500 }
    );
  }
}
