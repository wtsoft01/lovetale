import { createServerFn } from "@/lib/_mock/runtime";

type ImageResult = { storagePath: string; signedUrl: string | null };

function demoFail(): never {
  throw new Error("데모 모드에서는 AI 이미지 생성을 사용할 수 없어요.");
}

export const generateBeatImage = createServerFn({ method: "POST" })
  .inputValidator((i: any) => i as Record<string, unknown>)
  .handler(async (): Promise<ImageResult> => demoFail());

export const generateCharacterPortrait = createServerFn({ method: "POST" })
  .inputValidator((i: any) => i as Record<string, unknown>)
  .handler(async (): Promise<ImageResult> => demoFail());
