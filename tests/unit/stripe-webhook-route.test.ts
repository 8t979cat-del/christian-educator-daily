import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

import { POST } from "@/app/api/stripe/webhook/route";

const SECRET = "whsec_route";
const event = { id: "evt_9", type: "customer.subscription.updated", created: 1, data: { object: { id: "sub_1" } } };
const raw = JSON.stringify(event);
const signed = (body: string, t = Math.floor(Date.now() / 1000), secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
const request = (body: string, signature?: string) =>
  new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: signature ? { "stripe-signature": signature } : {} });

beforeEach(() => {
  rpc.mockReset();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_1");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
});

describe("POST /api/stripe/webhook", () => {
  it("applies a correctly signed event exactly as received", async () => {
    rpc.mockResolvedValue({ data: "subscription active", error: null });
    const res = await POST(request(raw, signed(raw)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: "subscription active" });
    expect(rpc).toHaveBeenCalledWith("billing_apply_event", { p_event: event });
  });

  it("rejects a missing, wrong or tampered signature before touching the database", async () => {
    for (const req of [request(raw), request(raw, signed(raw, undefined, "whsec_wrong")), request(raw.replace("sub_1", "sub_2"), signed(raw))]) {
      expect((await POST(req)).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a replayed old request", async () => {
    expect((await POST(request(raw, signed(raw, Math.floor(Date.now() / 1000) - 3600)))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("asks Stripe to retry when the database could not apply the event, but not for a malformed one", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002", message: "Cannot match subscription" } });
    expect((await POST(request(raw, signed(raw)))).status).toBe(500);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "Malformed" } });
    expect((await POST(request(raw, signed(raw)))).status).toBe(400);
  });

  it("answers a duplicate delivery with success so Stripe stops retrying", async () => {
    rpc.mockResolvedValue({ data: "duplicate", error: null });
    const res = await POST(request(raw, signed(raw)));
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("duplicate");
  });

  it("is closed when billing is not configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await POST(request(raw, signed(raw)))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
});
