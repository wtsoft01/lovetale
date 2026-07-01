import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@/lib/_mock/runtime";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Search, Sparkles, UserCircle2 } from "lucide-react";
import { toast } from "sonner";

import {
  generateReusableCharacter,
  listReusableCharacters,
} from "@/lib/admin-characters.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/characters")({
  head: () => ({ meta: [{ title: "Characters — Studio" }] }),
  component: CharactersPage,
});

function CharactersPage() {
  const list = useServerFn(listReusableCharacters);
  const generate = useServerFn(generateReusableCharacter);
  const [q, setQ] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [storyOverview, setStoryOverview] = useState("");
  const [generated, setGenerated] = useState<any | null>(null);

  const query = useQuery({ queryKey: ["admin_characters"], queryFn: () => list() });
  const mut = useMutation({
    mutationFn: () => generate({ data: { sourceText, storyOverview } }),
    onSuccess: (card) => {
      setGenerated(card);
      toast.success("캐릭터 카드가 생성되었습니다");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (query.data ?? []).filter((character: any) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return `${character.name} ${character.role} ${character.storyTitle}`.toLowerCase().includes(needle);
  });

  return (
    <div className="space-y-4">
      <header>
        <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">Character Assets</span>
        <h1 className="mt-1 font-display text-3xl font-semibold">주인공/캐릭터 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">스토리에 적합한 캐릭터를 생성하고, 이미 만들어둔 캐릭터 카드를 다시 불러와 제작 단계에 매칭합니다.</p>
      </header>

      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <aside className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Gemini 캐릭터 카드 생성</div>
          <Label className="text-xs">스토리 개요</Label>
          <Textarea value={storyOverview} onChange={(e) => setStoryOverview(e.target.value)} rows={3} className="mt-1 text-xs" />
          <Label className="mt-3 block text-xs">원문/캐릭터 단서</Label>
          <Textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={8} className="mt-1 text-xs" placeholder="20자 이상 입력" />
          <Button disabled={mut.isPending || sourceText.length < 20} onClick={() => mut.mutate()} className="mt-3 w-full">
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 캐릭터 생성
          </Button>
          {generated && (
            <div className="mt-4 rounded-lg border border-border bg-background p-3 text-xs">
              <div className="font-medium">{generated.name} · {generated.role}</div>
              <p className="mt-1 text-muted-foreground">{generated.persona}</p>
              <p className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{generated.visualPrompt}</p>
            </div>
          )}
        </aside>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="캐릭터, 역할, 사용 콘텐츠 검색" className="pl-9" />
            </div>
            {query.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rows.map((character: any, idx: number) => (
              <article key={`${character.storyId}-${character.id}-${idx}`} className="rounded-lg border border-border bg-background p-4">
                <UserCircle2 className="mb-3 h-6 w-6 text-primary" />
                <div className="font-medium">{character.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{character.role} · {character.storyTitle}</div>
                <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{character.persona}</p>
                <p className="mt-2 line-clamp-3 font-mono text-[10px] text-muted-foreground/80">{character.visualPrompt}</p>
              </article>
            ))}
            {!query.isLoading && rows.length === 0 && <div className="col-span-full rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">캐릭터 카드가 없습니다.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}