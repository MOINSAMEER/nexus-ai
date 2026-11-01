
import { NextResponse } from "next/server";

function getSystemPrompt() {
  return `
You are NEXUS, a helpful personal AI assistant.
Give clear, accurate and direct answers.
Be friendly and conversational.
Reply in the same language as the user.
Never reveal internal reasoning.
Current date: ${new Date().toISOString().slice(0, 10)}.
`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, mode = "cloud" } = body;

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 50
    ) {
      return NextResponse.json(
        { error: "Invalid conversation." },
        { status: 400 }
      );
    }

    const validMessages = messages
      .filter(
        (message) =>
          ["user", "assistant"].includes(message?.role) &&
          typeof message?.content === "string"
      )
      .slice(-12);

    if (validMessages.length === 0) {
      return NextResponse.json(
        { error: "No valid messages." },
        { status: 400 }
      );
    }

    const systemPrompt = getSystemPrompt();

    // LOCAL MODE: Ollama on Mac
    if (mode === "local") {
      const localResponse = await fetch(
        "http://127.0.0.1:11434/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "qwen3.5:2b",
            messages: [
              { role: "system", content: systemPrompt },
              ...validMessages,
            ],
            stream: true,
            keep_alive: "30m",
            options: {
              num_predict: 512,
            },
          }),
        }
      );

      if (!localResponse.ok || !localResponse.body) {
        return NextResponse.json(
          { error: "Could not connect to local Ollama." },
          { status: 502 }
        );
      }

      const reader = localResponse.body.getReader();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
        async start(controller) {
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();

              buffer += decoder.decode(
                value ?? new Uint8Array(),
                { stream: !done }
              );

              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim()) continue;

                const data = JSON.parse(line);

                if (data.error) {
                  throw new Error(data.error);
                }

                if (data.message?.content) {
                  controller.enqueue(
                    new TextEncoder().encode(data.message.content)
                  );
                }
              }

              if (done) break;
            }

            if (buffer.trim()) {
              const data = JSON.parse(buffer);

              if (data.message?.content) {
                controller.enqueue(
                  new TextEncoder().encode(data.message.content)
                );
              }
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
    }

    // CLOUD MODE: Gemini
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key is not configured." },
        { status: 500 }
      );
    }

    const contents = validMessages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text: message.content.slice(0, 20000),
        },
      ],
    }));

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok || !response.body) {
      const errorText = await response.text();

      console.error(
        "Gemini API error:",
        response.status,
        errorText
      );

      return NextResponse.json(
        {
          error:
            response.status === 429
              ? "Gemini free-tier limit reached. Try again later."
              : "Gemini connection failed. Check API configuration.",
        },
        { status: response.status }
      );
    }

    // Stream Gemini response to the frontend
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();

            buffer += decoder.decode(
              value ?? new Uint8Array(),
              { stream: !done }
            );

            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() || "";

            for (const event of events) {
              for (const line of event.split(/\r?\n/)) {
                if (!line.startsWith("data:")) continue;

                const payload = line.slice(5).trim();
                if (!payload || payload === "[DONE]") continue;

                const data = JSON.parse(payload);

                if (data.error) {
                  throw new Error("Gemini generation failed.");
                }

                const text = data.candidates?.[0]?.content?.parts
                  ?.map((part: { text?: string }) => part.text || "")
                  .join("");

                if (text) {
                  controller.enqueue(
                    new TextEncoder().encode(text)
                  );
                }
              }
            }

            if (done) break;
          }

          if (buffer.trim()) {
            for (const line of buffer.split(/\r?\n/)) {
              if (!line.startsWith("data:")) continue;

              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;

              const data = JSON.parse(payload);

              const text = data.candidates?.[0]?.content?.parts
                ?.map((part: { text?: string }) => part.text || "")
                .join("");

              if (text) {
                controller.enqueue(
                  new TextEncoder().encode(text)
                );
              }
            }
          }

          controller.close();
        } catch (error) {
          console.error("Gemini streaming error:", error);
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
    console.error("NEXUS API error:", error);

    return NextResponse.json(
      { error: "NEXUS encountered an unexpected error." },
      { status: 500 }
    );
  }
}
