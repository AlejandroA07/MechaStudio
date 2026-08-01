import { createApiApp } from "./app";
import { D1AuthStore, D1ResourceStore } from "./d1-stores";
import { R2MediaStore } from "./r2-media-store";

interface RateLimiterBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  readonly DB: D1Database;
  readonly MEDIA: R2Bucket;
  readonly AUTH_RATE_LIMITER: RateLimiterBinding;
  readonly ENVIRONMENT: "development" | "production";
}

export default {
  fetch(request: Request, environment: Env, executionContext: ExecutionContext): Promise<Response> {
    const app = createApiApp({
      environment: environment.ENVIRONMENT,
      auth: new D1AuthStore(environment.DB),
      resources: new D1ResourceStore(environment.DB),
      media: new R2MediaStore(environment.DB, environment.MEDIA),
      rateLimit: async (key) => (await environment.AUTH_RATE_LIMITER.limit({ key })).success,
    });
    return Promise.resolve(app.fetch(request, environment, executionContext));
  },
} satisfies ExportedHandler<Env>;
