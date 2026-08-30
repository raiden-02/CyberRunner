import { isDatabaseEnabled } from "../db/pool.js";
import {
  liveAgentGate,
  startDesignJob,
  validateDesignJobStart,
  type DesignJobDeps,
} from "./design-jobs.js";
import type { ForgeQuotaStore } from "./forge-quota.js";
import {
  resolveLiveForgePolicy,
  type LiveAccessMode,
  type LiveForgePolicy,
} from "./live-forge-policy.js";
import type { ArenaForgeProvider } from "./provider.js";

export type AdmitDesignResult =
  | { ok: true; status: 202; jobId: string }
  | { ok: false; status: 400 | 401 | 403 | 409 | 429 | 503; error: string };

export type AdmitLiveDesignContext = {
  userId?: string;
  quota?: ForgeQuotaStore | null;
  deps?: DesignJobDeps;
  env?: NodeJS.ProcessEnv;
  policy?: LiveForgePolicy;
  databaseAvailable?: boolean;
};

let admitTail: Promise<void> = Promise.resolve();

export function resetLiveAdmission(): void {
  admitTail = Promise.resolve();
}

function runSerializedAdmit<T>(fn: () => Promise<T>): Promise<T> {
  const next = admitTail.then(fn, fn);
  admitTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function policyFromCtx(ctx: AdmitLiveDesignContext): LiveForgePolicy {
  if (ctx.policy) return ctx.policy;
  return resolveLiveForgePolicy(ctx.env ?? process.env, {
    databaseAvailable: ctx.databaseAvailable ?? isDatabaseEnabled(),
  });
}

export async function admitLiveDesign(
  input: { brief?: unknown; mapId?: unknown },
  ctx: AdmitLiveDesignContext,
): Promise<AdmitDesignResult> {
  if (ctx.deps?.isLiveAvailable) {
    if (!ctx.deps.isLiveAvailable()) {
      return {
        ok: false,
        status: 403,
        error: "Live design is off on this server. Load the recorded P5 demo instead.",
      };
    }
  } else {
    const gate = liveAgentGate(ctx.env ?? process.env);
    if (!gate.ok) return gate;
  }

  const policy = policyFromCtx(ctx);

  if (policy.requiresAuth && !ctx.userId) {
    return { ok: false, status: 401, error: "Sign in to run live ArenaForge." };
  }

  if (policy.requiresQuota && !ctx.quota) {
    return {
      ok: false,
      status: 503,
      error: "Live design is unavailable. Quota storage is not configured.",
    };
  }

  return runSerializedAdmit(async () => {
    const validated = validateDesignJobStart(input, ctx.deps);
    if (!validated.ok) return validated;

    if (policy.requiresQuota && ctx.quota) {
      const consumed = await ctx.quota.tryConsume(ctx.userId!);
      if (!consumed.ok) {
        return { ok: false, status: consumed.status, error: consumed.error };
      }
    }

    return startDesignJob(input, ctx.deps);
  });
}

export type PublicLiveCapability = {
  liveAgentAvailable: boolean;
  accessMode: LiveAccessMode;
  requiresSignIn: boolean;
  remainingRunsToday?: number;
  provider?: ArenaForgeProvider;
  model?: string;
};

export function publicLiveCapability(args?: {
  liveAvailable?: boolean;
  accessMode?: LiveAccessMode;
  requiresSignIn?: boolean;
  remainingRunsToday?: number;
  provider?: ArenaForgeProvider;
  model?: string;
}): PublicLiveCapability {
  const accessMode = args?.accessMode ?? "hosted";
  const body: PublicLiveCapability = {
    liveAgentAvailable: args?.liveAvailable ?? false,
    accessMode,
    requiresSignIn: args?.requiresSignIn ?? accessMode === "hosted",
  };
  if (typeof args?.remainingRunsToday === "number") {
    body.remainingRunsToday = args.remainingRunsToday;
  }
  if (args?.provider) body.provider = args.provider;
  if (args?.model) body.model = args.model;
  return body;
}
