import { describe, expect, it } from "vitest";
import { parseCommentCommand } from "@/lib/content/class-comments";

describe("class comment commands", () => {
  it("posts with the named emoji and strips the command", () => {
    expect(parseCommentCommand("I think this devotional taught me about patience, Post Comment with smiley emoji.")).toEqual({
      text: "I think this devotional taught me about patience", emoji: "😊", post: true,
    });
    expect(parseCommentCommand("God is with us post comment with a heart")).toEqual({ text: "God is with us", emoji: "❤️", post: true });
    expect(parseCommentCommand("I will pray for my grandma. Post comment with praying hands emoji")).toMatchObject({ emoji: "🙏", post: true });
    expect(parseCommentCommand("Be kind first, post")).toEqual({ text: "Be kind first", emoji: null, post: true });
  });
  it("leaves ordinary text alone, including 'post' in the middle of a sentence", () => {
    expect(parseCommentCommand("I saw a post office")).toMatchObject({ post: false });
    expect(parseCommentCommand("  waiting   is hard  ")).toEqual({ text: "waiting is hard", emoji: null, post: false });
  });
  it("posts without an emoji when the emoji is unknown", () => {
    expect(parseCommentCommand("Hello, post comment with dinosaur emoji")).toEqual({ text: "Hello", emoji: null, post: true });
  });
});
