import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PresentLink } from "@/components/content/devotional-actions";
import { Container } from "@/components/layout/container";
import { DevotionalView } from "@/components/content/devotional-view";
import { EditorDemo } from "@/components/marketing/editor-demo";
import type { DevotionalRecord } from "@/lib/content/types";
import { StyleguideDemos } from "@/components/marketing/styleguide-demos";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Alert, Badge, EmptyState, Skeleton, Spinner } from "@/components/ui/feedback";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { SearchInput } from "@/components/ui/search-input";
import { Eyebrow, Heading, Scripture, Text } from "@/components/ui/typography";

export const metadata: Metadata = { title: "Design system" };

const SWATCHES = [
  ["Parchment", "bg-parchment", "#F7F5F0"],
  ["Brand", "bg-brand", "#1F5A55"],
  ["Brand soft", "bg-brand-soft", "#E3EFEC"],
  ["Night", "bg-night", "#14202B"],
  ["Mint", "bg-mint", "#8FD0C6"],
  ["Ink", "bg-ink", "#1F2A37"],
  ["Danger", "bg-danger", "#B3261E"],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-10">
      <Heading level={2} size={3} className="mb-6">
        {title}
      </Heading>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <Container className="py-12">
      <Eyebrow>Design system</Eyebrow>
      <Heading level={1} size={2} className="mt-2">
        Components
      </Heading>
      <Text muted className="mt-3 max-w-prose">
        Every component here is the same one the application uses. This page exists so changes can be reviewed in
        one place.
      </Text>

      <Section title="Colour">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {SWATCHES.map(([name, className, hex]) => (
            <div key={name}>
              <div className={`${className} h-16 rounded-control border border-line`} />
              <p className="mt-2 text-sm font-semibold">{name}</p>
              <p className="text-sm text-muted">{hex}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <Heading level={1}>Heading one</Heading>
        <Heading level={2} className="mt-3">Heading two</Heading>
        <Heading level={3} className="mt-3">Heading three</Heading>
        <Text className="mt-4">Body text in the interface face. Plain language at a comfortable reading size.</Text>
        <Text muted className="mt-2">Muted supporting text, still above 4.5:1 contrast.</Text>
        <Scripture reference="Galatians 6:9" translation="KJV" className="mt-6">
          And let us not be weary in well doing: for in due season we shall reap, if we faint not.
        </Scripture>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Forms">
        <div className="grid max-w-xl gap-5">
          <TextField label="Email" type="email" hint="We use this for your daily devotional." placeholder="name@school.org" />
          <TextField label="Display name" required error="Enter the name colleagues will see." defaultValue="" />
          <SelectField
            label="Grade band"
            options={[
              { value: "k2", label: "Kindergarten to grade 2" },
              { value: "g35", label: "Grades 3 to 5" },
              { value: "g68", label: "Grades 6 to 8" },
              { value: "g912", label: "Grades 9 to 12" },
            ]}
          />
          <TextAreaField label="Prayer request" hint="Visible only to your group." />
        </div>
      </Section>

      <Section title="Cards, badges and alerts">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <Heading level={3} size={4}>Default card</Heading>
            <Text muted className="mt-2">Used for grouped content.</Text>
          </Card>
          <Card tone="soft">
            <Heading level={3} size={4}>Soft card</Heading>
            <Text muted className="mt-2">Used for gentle emphasis.</Text>
          </Card>
          <Card tone="dark">
            <Heading level={3} size={4}>Dark card</Heading>
            <Text className="mt-2 text-[#B8C4CF]">Used for classroom mode.</Text>
          </Card>
        </div>
        <div className="mt-6 flex flex-wrap gap-3"><Badge>Badge</Badge></div>
        <div className="mt-6 grid gap-3">
          <Alert title="Information">A neutral message.</Alert>
          <Alert tone="success" title="Saved">Your changes were saved.</Alert>
          <Alert tone="error" title="Something went wrong">Check the highlighted fields and try again.</Alert>
        </div>
      </Section>

      <Section title="Search, avatars and loading">
        <SearchInput action="/library" label="Search the library" placeholder="Search devotionals" />
        <div className="mt-6 flex items-center gap-4">
          <Avatar name="Grace Holloway" size="sm" />
          <Avatar name="Marcus Lee" />
          <Avatar name="Elena Ruiz" size="lg" />
          <Avatar name="Pastor" />
          <Spinner className="text-brand" />
        </div>
        <div className="mt-6 grid max-w-md gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </div>
      </Section>

      <Section title="Empty state">
        <EmptyState icon="book" title="Nothing here yet" description="Explains what will appear and why it is empty." />
      </Section>

      <Section title="Modal and notifications">
        <StyleguideDemos />
      </Section>

      <Section title="Rich-text editor">
        <EditorDemo />
      </Section>

      <Section title="Classroom mode">
        <p className="mb-4 max-w-prose text-muted">A demo of the full-screen presentation with sample content and a public-domain passage. Add <code>?p=long</code> for 1 Corinthians 13 or <code>?text=no</code> for a reference-only translation.</p>
        <PresentLink href="/classroom-demo" variant="primary" />
      </Section>

      <Section title="Devotional reader: licensing">
        <p className="mb-6 max-w-prose text-muted">
          The same devotional shown twice. A public-domain translation displays its text with attribution. A
          reference-only translation shows the reference and a link, even if text were present.
        </p>
        <div className="grid gap-12">
          <DevotionalView devotional={SAMPLE} translation={SAMPLE_KJV} theme={{ title: "Sample theme", summary: "A one-line summary of the week.", day: 2 }} />
          <DevotionalView
            devotional={{ ...SAMPLE, translation_code: "niv", scripture_text: "This text must never display." }}
            translation={SAMPLE_NIV}
            theme={{ title: "Sample theme", summary: "A one-line summary of the week.", day: 2 }}
          />
        </div>
      </Section>
    </Container>
  );
}


const para = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }] });
const SAMPLE: DevotionalRecord = {
  id: "sample", title: "Sample devotional", devotional_date: "2026-11-16", theme_id: null,
  daily_topic: "How licensing affects display", category_slug: "patience",
  scripture_reference: "Galatians 6:9", translation_code: "kjv",
  scripture_text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not.",
  reflection: para("Sample reflection text for the style guide."), prayer: para("Sample prayer."),
  discussion_question: para("Sample discussion question?"), practical_application: para("Sample practical application."),
  audience: "teachers", access_level: "free", grade_levels: ["g68", "g912"], educational_category: "classroom", author_id: null,
  author_name: "Style guide", status: "published", publish_at: null, approved_by: null, approved_at: null,
  published_at: null, updated_at: "", created_at: "",
};
const SAMPLE_KJV = { code: "kjv", name: "King James Version", license_type: "public_domain" as const, text_allowed: true, attribution: "King James Version (KJV), public domain in the United States." };
const SAMPLE_NIV = { code: "niv", name: "New International Version", license_type: "reference_only" as const, text_allowed: false, attribution: null };
