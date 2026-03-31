/**
 * Next.js instrumentation hook — runs once per server process before any requests.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * The nodejs guard ensures this only runs in the Node.js runtime,
 * not in the Edge runtime where DB access is unavailable.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupBootstrap } = await import("@/lib/startup/bootstrap");
    await runStartupBootstrap();

    // Initialize scheduled jobs (non-blocking)
    import("@/lib/scheduler/scheduler")
      .then(({ initScheduler }) => initScheduler())
      .catch(err => import("@/lib/logger").then(({ logger }) => logger.error({ err }, "[instrumentation] Scheduler init failed")));
  }
}
