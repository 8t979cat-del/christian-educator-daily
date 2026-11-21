import type { GradeBand } from "@/lib/content/levels";
import type { Slide, Stage, ThemeId } from "@/lib/content/present";

/**
 * Messages between the class screen (the projector window) and the presenter
 * window (the teacher's laptop). The class screen is the source of truth; the
 * presenter window shows what it is told and sends commands back. Both windows
 * must be on the same device and browser: this uses BroadcastChannel, which
 * never leaves the browser.
 */
export type ClassMessage =
  | { type: "state"; index: number; total: number; current: Slide; next: Slide | null; theme: ThemeId; size: number; band: GradeBand | null; writtenBands: GradeBand[]; blank: boolean; stage: Stage }
  | { type: "empty" };

export type PresenterCommand =
  | { type: "hello" }
  | { type: "cmd"; cmd: "next" | "prev" | "first" | "last" | "blank" }
  | { type: "goto"; index: number }
  | { type: "band"; band: GradeBand };

export const channelName = (devotionalId: string) => `ed180-present:${devotionalId}`;
