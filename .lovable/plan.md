# 목업 전환 계획

리믹스된 프로젝트의 모든 DB·서버 호출을 제거하고 브라우저 안에서만 동작하는 목 데이터로 교체합니다. 실제 가입/로그인도 가짜로 처리하며, 같은 브라우저에서 첫 번째로 가입한 계정이 자동으로 관리자가 됩니다.

## 동작 방식

- 모든 데이터는 `localStorage`에 저장 (브라우저 단위로 유지)
- 새로고침해도 데이터 유지, 다른 브라우저/시크릿 창에서는 빈 상태로 시작
- 네트워크 호출 없음 → 오프라인에서도 동작
- 첫 가입 계정 = admin, 이후 가입자는 일반 사용자

## 교체 범위

**인증 (`src/hooks/use-auth.tsx`)**
- Supabase 호출 제거, 로컬 가짜 세션으로 교체
- 이메일/비번/구글 버튼 모두 즉시 "가입 완료" 처리
- 첫 가입자에게 `admin` 역할 자동 부여

**서버 함수 (`src/lib/*.functions.ts`)**
모든 `createServerFn` 파일을 동일한 export 이름의 일반 함수로 재작성. 입력/출력 형태는 유지하되 내부는 `localStorage` + 기존 `src/lib/mock/*` 시드 데이터를 사용:
- `admin-*.functions.ts` (스토리/캐릭터/미디어/스태프/임포트/스토리 작성)
- `affection.functions.ts`, `unlocks.functions.ts`, `sessions.functions.ts`
- `marketplace.functions.ts`, `home-placements.functions.ts`
- `profile.functions.ts`, `story-builder.functions.ts`
- `llm-providers.functions.ts`, `revenue-rules.functions.ts`
- `admin.functions.ts` (역할 체크)

**서버 라우트 (`src/routes/api/*`)**
- `chat.ts`, `character-chat.ts`: 즉시 끊지 않고 "데모 모드입니다" 같은 가짜 스트림 응답 반환
- `public/bootstrap-admin.ts`: 빈 응답으로 무력화

**보호 라우트**
- `src/routes/_authenticated/route.tsx`: Supabase 대신 로컬 세션 체크

**미사용 항목**
- AI 게이트웨이 호출 (`ai-gateway.server.ts`, `llm-router.server.ts`) 호출 경로 끊기
- 미디어 업로드는 `URL.createObjectURL`로 로컬 미리보기만

## 기술 메모

- `src/integrations/supabase/client.ts` 파일은 자동생성이라 건드리지 않음, 단순히 import하지 않도록 처리
- 시드 데이터: `src/lib/mock/stories.ts`, `characters.ts`, `story-beats.ts`, `story.ts` 재활용 + 신규 mock store 1개 추가 (`src/lib/mock/store.ts`)에서 사용자별 상태(크레딧, 잠금해제, 호감도, 구매, 세션 등) 관리
- 모든 server fn → 일반 async 함수로 바뀌므로 `useServerFn` 호출부는 그대로 두고 함수 시그니처만 호환 유지 (`{ data }` 인자 그대로 받음)

## 확인

- 가입 → 첫 계정 admin 배지 노출
- 마켓플레이스/홈 카드 목 데이터 표시
- 스토리 플레이 시 호감도/잠금해제가 localStorage에 누적
- 관리자 페이지 CRUD가 로컬에서 동작

작업 분량이 크니 한 번에 적용 후 빌드·프리뷰로 확인하겠습니다.