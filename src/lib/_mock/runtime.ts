// Demo-mode shim for TanStack's createServerFn + useServerFn.
//
// In this mockup build the entire server layer is gone — every "server function"
// runs in-browser against a localStorage store. The shim preserves the call
// signature consumers already use:
//
//   const fn = useServerFn(serverFn);
//   await fn({ data: input });
//
// so we don't have to touch every component. Each *.functions.ts file imports
// `createServerFn` from this module instead of `@tanstack/react-start`, and
// every component imports `useServerFn` from here as well.

type Handler<In, Out> = (ctx: { data: In; context: any }) => Promise<Out> | Out;

type Builder<In, Out> = {
  inputValidator<NextIn>(fn: (raw: any) => NextIn): Builder<NextIn, Out>;
  middleware(_: unknown): Builder<In, Out>;
  handler<NextOut>(h: Handler<In, NextOut>): MockServerFn<In, NextOut>;
};

export type MockServerFn<In = any, Out = any> = ((arg?: { data?: In }) => Promise<Out>) & {
  __mockServerFn: true;
};

export function createServerFn(_opts?: { method?: string }): Builder<unknown, unknown> {
  let validator: ((raw: unknown) => unknown) | null = null;
  const build: Builder<any, any> = {
    inputValidator(fn) {
      validator = fn as (raw: unknown) => unknown;
      return build as any;
    },
    middleware() {
      return build as any;
    },
    handler(h) {
      const fn = async (arg?: { data?: any }) => {
        const raw = arg?.data;
        const data = validator ? validator(raw) : raw;
        return h({ data, context: {} });
      };
      (fn as any).__mockServerFn = true;
      return fn as any;
    },
  };
  return build;
}

export function useServerFn<F extends (...a: any[]) => any>(fn: F): F {
  return fn;
}
