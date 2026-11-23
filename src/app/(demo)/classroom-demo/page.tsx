import type { Metadata } from "next";
import { PresentMode } from "@/components/present/present-mode";
import { PresenterView } from "@/components/present/presenter-view";
import { InlinePresenter } from "@/components/present/inline-presenter";
import { CreateStudio } from "@/components/create/create-studio";
import type { PresentContent } from "@/lib/content/present";

export const metadata: Metadata = { title: "Classroom mode demo", robots: { index: false } };

const doc = (...paragraphs: string[]) => ({
  type: "doc" as const,
  content: paragraphs.map((text) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text }] })),
});

// King James Version passages (public domain). Used to exercise short, medium and long Scripture.
const PASSAGES: Record<string, { reference: string; text: string }> = {
  short: { reference: "Galatians 6:9", text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not." },
  psalm23: {
    reference: "Psalm 23",
    text: [
      "1 The LORD is my shepherd; I shall not want.",
      "2 He maketh me to lie down in green pastures: he leadeth me beside the still waters.",
      "3 He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake.",
      "4 Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.",
      "5 Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.",
      "6 Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.",
    ].join("\n"),
  },
  long: {
    reference: "1 Corinthians 13",
    text: [
      "1 Though I speak with the tongues of men and of angels, and have not charity, I am become as sounding brass, or a tinkling cymbal.",
      "2 And though I have the gift of prophecy, and understand all mysteries, and all knowledge; and though I have all faith, so that I could remove mountains, and have not charity, I am nothing.",
      "3 And though I bestow all my goods to feed the poor, and though I give my body to be burned, and have not charity, it profiteth me nothing.",
      "4 Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up,",
      "5 Doth not behave itself unseemly, seeketh not her own, is not easily provoked, thinketh no evil;",
      "6 Rejoiceth not in iniquity, but rejoiceth in the truth;",
      "7 Beareth all things, believeth all things, hopeth all things, endureth all things.",
      "8 Charity never faileth: but whether there be prophecies, they shall fail; whether there be tongues, they shall cease; whether there be knowledge, it shall vanish away.",
      "9 For we know in part, and we prophesy in part.",
      "10 But when that which is perfect is come, then that which is in part shall be done away.",
      "11 When I was a child, I spake as a child, I understood as a child, I thought as a child: but when I became a man, I put away childish things.",
      "12 For now we see through a glass, darkly; but then face to face: now I know in part; but then shall I know even as also I am known.",
      "13 And now abideth faith, hope, charity, these three; but the greatest of these is charity.",
    ].join("\n"),
  },
};

export default async function PresentDemo({ searchParams }: { searchParams: Promise<{ p?: string; view?: string; text?: string; tools?: string }> }) {
  const { p, view, text, tools } = await searchParams;
  const passage = PASSAGES[p ?? "psalm23"] ?? PASSAGES.psalm23!;
  const referenceOnly = text === "no";
  const content: PresentContent = {
    dateLabel: "Monday, November 16, 2026",
    title: "Sample: patience when the lesson is not landing",
    topic: "Sample content for trying classroom mode",
    theme: { title: "Sample week: Patience in the Classroom", summary: "Five days on steady, gentle teaching.", dayLabel: "Day 1 of 5" },
    scripture: {
      reference: passage.reference,
      translationLabel: referenceOnly ? "New International Version (NIV)" : "King James Version (KJV)",
      text: referenceOnly ? null : passage.text,
      notice: referenceOnly ? null : "King James Version (KJV), public domain in the United States.",
    },
    reflection: doc(
      "Every teacher knows the moment: you have explained it twice, drawn it on the board, and a room full of faces still looks back at you with polite confusion. In that moment the pull is to hurry, to say it louder, to move on.",
      "Patience is not passivity. It is choosing to stay present with someone while understanding catches up. It trusts that growth, in students and in us, rarely arrives on our schedule.",
      "Today, notice the moment you want to rush. Take one slow breath, and then try the lesson again from a different angle. Often the thing that was missing was not effort but time, and a gentler way in.",
    ),
    discussion: doc("When did someone's patience with you make a real difference, and what did it feel like?"),
    practice: doc("Before you answer the next question today, pause for three slow breaths."),
    prayer: doc("Lord, give us unhurried hearts. Help us to wait well, to listen first, and to love the people in front of us as you have loved us. Amen."),
    // Sample versions for every age band, to show reading levels. With no level chosen, the standard text above is used.
    levels: {
      k2: {
        reflection: doc(
          "Sometimes learning something new takes a long time. That is okay!",
          "A shepherd takes care of his sheep. He walks slowly so every sheep can keep up. God is patient with us like that.",
        ),
        discussion_question: doc("When did someone wait for you to finish something?"),
        practical_application: doc("Today, when a friend is slow, wait kindly."),
        prayer: doc("Dear God, thank you for being patient with me. Help me be patient with my friends. Amen."),
      },
      g35: {
        reflection: doc(
          "Have you ever been stuck on a math problem while everyone else seemed to be done? It can feel like the whole class is waiting for you. A good shepherd never leaves a sheep behind. He walks at the pace of the slowest one, so the whole flock gets to the green grass and the quiet water together.",
          "God is patient with us in the same way. He does not get tired of helping us learn. When a classmate needs more time, we can be patient too, like the shepherd.",
        ),
        discussion_question: doc("Tell about a time someone was patient with you. How did it help?"),
        practical_application: doc("Today, if a classmate needs help or more time, wait kindly or offer to help instead of rushing them."),
        prayer: doc("Dear God, thank you for being patient with me every day. Help me to wait kindly and to help my friends when they are learning. Amen."),
      },
      g68: {
        reflection: doc(
          "In Psalm 23, the shepherd sets the pace for the whole flock. He leads them to green pastures and still waters, and he does not rush the ones that fall behind.",
          "Most of us know what it is like to be rushed. A group project where one person does everything because they cannot wait for the rest. A friend who finishes your sentences. Someone who sighs when you ask a question twice. It can make you feel like you are in the way.",
          "Patience is choosing to stay with someone while they catch up. It is how God treats us, and it is a way of showing that a person matters more than the clock.",
        ),
        discussion_question: doc("Is it ever right to be impatient with someone? When does patience help, and when might it get in the way?"),
        practical_application: doc("In your next group activity, let someone else finish their idea before you add yours."),
        prayer: doc("Lord, thank you that you never give up on us. When we feel rushed or ignored, remind us that we matter to you. Help us slow down and make room for the people around us. Amen."),
      },
      g912: {
        reflection: doc(
          "Psalm 23 describes a shepherd who sets the pace by the slowest of the flock: green pastures, still waters, paths walked together rather than raced.",
          "Patience here is not passivity. It is a decision to stay present with someone, or with a problem, while understanding catches up. That applies to the classmate who needs one more explanation, and to the part of yourself that is still learning.",
        ),
        discussion_question: doc("Where does our culture reward speed over patience, and what gets lost when it does?"),
        practical_application: doc("Notice one moment today when you want to rush someone. Ask one more question instead."),
        prayer: doc("Lord, slow us down enough to see the people around us. Make us patient with others and honest with ourselves. Amen."),
      },
    },
  };
  const notes = (
    <div className="rounded-control border border-[#e2ded3] bg-white p-4 text-[#111]">
      <p className="font-semibold">Demo notes</p>
      <p className="mt-1 text-sm">In the real app this is the teacher’s private notes box. Ask the group about their own experience first.</p>
    </div>
  );
  // The home page's built-in presenter, with sample content (for checking it without a database).
  // The "Write a devotional" studio, for checking its layout without an account (the AI is not connected here).
  if (view === "create") return <main className="mx-auto max-w-6xl p-6"><CreateStudio allowed configured quota={{ remaining: 7, limit: 10 }} /></main>;
  if (view === "inline") return <main className="mx-auto max-w-5xl p-6"><InlinePresenter content={{ ...content, levels: {} }} /></main>;
  if (view === "presenter") return <PresenterView devotionalId="demo" title={content.title} notesSlot={notes} />;
  return <PresentMode content={content} devotionalId="demo" title={content.title} exitHref="/" presenterHref={`/classroom-demo?view=presenter&p=${p ?? "psalm23"}`} notesSlot={notes}
    // ?tools=plus shows the Plus editing tools with a sample counter. The demo has no account: AI and saving ask you to sign in.
    tools={tools === "plus" ? { allowed: true, configured: true, devotionalId: "demo", quota: { remaining: 7, limit: 10 } } : tools === "free" ? { allowed: false, configured: false, devotionalId: "demo", quota: null } : undefined} />;
}
