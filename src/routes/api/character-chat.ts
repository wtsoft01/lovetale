import { createFileRoute } from "@tanstack/react-router";

// Demo build: character chat is not powered by any LLM here.
export const Route = createFileRoute("/api/character-chat")({
  server: {
    handlers: {
      POST: async () =>
        new Response(
          JSON.stringify({ error: "데모 모드에서는 AI 채팅이 비활성화되어 있어요." }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
    },
  },
});
