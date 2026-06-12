/**
 * Next.js bootstrap hook — dipanggil sekali saat server start.
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPoller } = await import("./lib/poller");
    startPoller();
  }
}
