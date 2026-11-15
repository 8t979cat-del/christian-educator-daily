import type { Instrumentation } from "next";

/** Server errors go to the sanitised reporter (src/lib/ops/report.ts). */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { reportError } = await import("@/lib/ops/report");
  await reportError(error, { path: request.path, method: request.method, routeType: context.routeType, routePath: context.routePath });
};
