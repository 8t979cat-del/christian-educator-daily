import { describe, expect, it } from "vitest";
import { START_TOPICS, TOPIC_WEB } from "@/lib/content/topic-web";

describe("topic web", () => {
  it("has links for every topic it mentions, so the web never dead-ends", () => {
    for (const t of START_TOPICS) expect(TOPIC_WEB[t], t).toBeDefined();
    for (const [topic, related] of Object.entries(TOPIC_WEB)) {
      expect(related.length, topic).toBeGreaterThanOrEqual(4);
      for (const r of related) expect(TOPIC_WEB[r], `${topic} -> ${r}`).toBeDefined();
      expect(related).not.toContain(topic);
    }
  });
});
