import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/interactive-rpg/$id")({
  component: StoryRpgRedirect,
});

function StoryRpgRedirect() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/story-rpg/$id", params: { id }, replace: true });
  }, [id, navigate]);

  return (
    <div className="grid min-h-dvh place-items-center bg-[#07050b] text-white/70">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}
