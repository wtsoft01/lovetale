import { createServerFn } from "@/lib/_mock/runtime";

export const suggestStoryFromText = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as { title?: string; text: string })
  .handler(async () => {
    throw new Error("데모 모드에서는 AI 임포트 분석이 비활성화되어 있어요.");
  });

export const createStoryFromImport = createServerFn({ method: "POST" })
  .inputValidator((input: any) => input as Record<string, unknown>)
  .handler(async (): Promise<{ id: string }> => {
    throw new Error("데모 모드에서는 임포트가 비활성화되어 있어요.");
  });

export const getStoryVersionDetail = createServerFn({ method: "GET" })
  .inputValidator((input: any) => input as { versionId: string })
  .handler(async () => null as { title: string; character_card: any; beats: any[]; created_at: string } | null);
