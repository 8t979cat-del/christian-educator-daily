-- Original sample content: one weekly theme, "Patience in the Classroom", with five devotionals.
--
-- STATUS: every row is created as an unreviewed DRAFT. Nothing here is published.
-- These were drafted by an AI assistant as starting material. An editor must read,
-- edit and theologically review each one, then take it through In review, Approved
-- and Scheduled before readers see it. The byline is a placeholder for that reason.
--
-- Scripture: the four KJV passages are public domain, so their text is included.
-- Friday cites the NIV, which is reference only here, so no NIV text is stored.
--
-- Safe to run more than once. Run with the service role or as the database owner.

create or replace function pg_temp.doc(paras text[]) returns jsonb language sql as $$
  select jsonb_build_object('type', 'doc', 'content', (
    select jsonb_agg(jsonb_build_object('type', 'paragraph', 'content',
             jsonb_build_array(jsonb_build_object('type', 'text', 'text', p))) order by ord)
    from unnest(paras) with ordinality as t(p, ord)))
$$;

insert into weekly_themes (title, summary, week_start, category_slug)
values (
  'Patience in the Classroom',
  'Five short devotionals on trusting slow growth, answering gently, bearing with colleagues, resting when weary, and holding hope at the end of the week.',
  '2026-11-16', 'patience')
on conflict (week_start) do nothing;

with theme as (select id from weekly_themes where week_start = '2026-11-16')
insert into devotionals (
  title, devotional_date, theme_id, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter, translation_code, scripture_text,
  reflection, prayer, discussion_question, practical_application,
  audience, grade_levels, educational_category, author_name)
select * from (values
  (
    'Waiting for the harvest', '2026-11-16'::date, (select id from theme),
    'Trusting growth you cannot yet see', 'patience', 'James 5:7', 'James', 5, 'kjv',
    'Be patient therefore, brethren, unto the coming of the Lord. Behold, the husbandman waiteth for the precious fruit of the earth, and hath long patience for it, until he receive the early and latter rain.',
    pg_temp.doc(array[
      'A farmer does not shout at a field. He plants, waters and waits, trusting that growth is happening below the surface long before anything shows above it. James uses the farmer to teach patience to people who were tired of waiting for things to change.',
      'Teaching is slow farming. The student who finally understands fractions in May was being prepared by lessons in September that seemed to go nowhere. The habit of honesty you model today may not bear fruit until long after the student has left your room. Patience in the classroom is not passivity. It is faithful work joined to trust that growth is real even when it is hidden.',
      'Today you may feel pressure to see results immediately, in test scores, in behavior, in the culture of a school. Remember the farmer: do the work in front of you, and leave the timing of the harvest to God.']),
    pg_temp.doc(array['Lord of the harvest, you are never in a hurry and never late. Give me the patience of a farmer today. Help me to plant carefully, to water faithfully, and to trust you with what I cannot yet see. Keep me from measuring my students, or myself, by what shows up too soon. Amen.']),
    pg_temp.doc(array['Think of a student, or a habit of your own, that you have been working on for a long time. What small sign of growth might you have overlooked?']),
    pg_temp.doc(array['Choose one student whose progress feels slow. Write down one specific thing they did well this week and tell them. Notice how it changes the way you see the weeks ahead.']),
    'teachers', '{k2,g35,g68,g912}'::text[], 'classroom', 'Editorial draft (unreviewed)'
  ),
  (
    'The soft answer', '2026-11-17'::date, (select id from theme),
    'Gentle words under pressure', 'patience', 'Proverbs 15:1', 'Proverbs', 15, 'kjv',
    'A soft answer turneth away wrath: but grievous words stir up anger.',
    pg_temp.doc(array[
      'Every teacher knows the moment. A student answers with an edge in their voice, and something in us wants to answer with one of our own. The proverb describes what happens next: a harsh word feeds the fire, and a gentle one takes away its fuel.',
      'A soft answer is not a weak one. It takes more strength to lower your voice than to raise it. Gentleness can hold a boundary and a relationship at the same time: I hear you, and the answer is still no. It also gives a student room to step back from the edge without losing face, which is often all they needed.',
      'This is hardest on the days when we ourselves are tired. A soft answer begins before the conversation does, in the short pause where we decide what kind of presence we will be.']),
    pg_temp.doc(array['Gentle God, you have answered my own sharpness with patience again and again. Today, when I am tempted to answer sharply, slow me down. Give me words that calm rather than inflame, and a steady voice that makes room for others. Amen.']),
    pg_temp.doc(array['When a conversation with a student or a colleague becomes tense, what is one phrase you could keep ready that is both gentle and honest?']),
    pg_temp.doc(array['Pick a phrase, such as "Let us take a breath and try again" or "Tell me more about that," and use it the next time a conversation heats up. Afterward, notice what changed.']),
    'teachers', '{k2,g35,g68,g912}'::text[], 'classroom', 'Editorial draft (unreviewed)'
  ),
  (
    'Bearing with one another', '2026-11-18'::date, (select id from theme),
    'Patience with the colleagues we did not choose', 'relationships', 'Ephesians 4:2', 'Ephesians', 4, 'kjv',
    'With all lowliness and meekness, with longsuffering, forbearing one another in love;',
    pg_temp.doc(array[
      'Paul asks for an unusual list of qualities in this verse: lowliness, meekness, longsuffering and forbearance. None of them is dramatic. All of them are what working beside the same people year after year requires.',
      'A faculty room is a good place to practice them. We share schedules, limited resources and the pressure of the same deadlines, and we do not choose one another. Forbearance means putting up with habits that grate, the colleague who is always late or the one who talks too long in meetings. It does not pretend those things do not matter. It chooses love over irritation.',
      'The phrase "in love" governs the rest. We bear with others not as martyrs keeping score, but as people who also need to be borne with. Each of us has habits that others quietly tolerate.']),
    pg_temp.doc(array['Father, thank you for the colleagues you have placed around me, including the ones I find difficult. Make me patient with their weaknesses, aware of my own, and quick to extend the same grace I have been given. Amen.']),
    pg_temp.doc(array['Whose patience with you have you taken for granted? How might you thank them this week?']),
    pg_temp.doc(array['Do one concrete kindness for a colleague who tests your patience: cover a duty, share a resource, or write a short note of thanks.']),
    'all_staff', '{k2,g35,g68,g912}'::text[], 'faculty_community', 'Editorial draft (unreviewed)'
  ),
  (
    'Not weary in well doing', '2026-11-19'::date, (select id from theme),
    'Perseverance when you are tired', 'burnout-encouragement', 'Galatians 6:9', 'Galatians', 6, 'kjv',
    'And let us not be weary in well doing: for in due season we shall reap, if we faint not.',
    pg_temp.doc(array[
      'By Thursday, many of us are tired in a way that sleep alone does not fix. Paul writes to people who were doing good and growing weary of doing it.',
      'Notice that he does not call weariness a failure. He assumes it will come. The promise is that in due season there will be a harvest, not that the season will be short. Perseverance includes resting, asking for help, and setting down what is not yours to carry, so that you can keep going with what is.',
      'The good done in a classroom is rarely visible in the moment. It accumulates. Today, trust that the ordinary faithfulness of showing up, preparing and caring is not wasted.']),
    pg_temp.doc(array['God of rest and renewal, I am tired. Give me strength for what is mine to do today and wisdom to set down what is not. Remind me that nothing done in love is wasted. Amen.']),
    pg_temp.doc(array['What is one thing you are carrying that you could share, delegate or set down this week?']),
    pg_temp.doc(array['Schedule fifteen minutes of real rest before the weekend, such as a walk, a quiet cup of tea or a phone call with a friend, and protect it the way you would protect a meeting.']),
    'all_staff', '{k2,g35,g68,g912}'::text[], 'personal_renewal', 'Editorial draft (unreviewed)'
  ),
  (
    'Hope, patience and prayer', '2026-11-20'::date, (select id from theme),
    'Holding hope at the end of the week', 'perseverance', 'Romans 12:12', 'Romans', 12, 'niv', null,
    pg_temp.doc(array[
      'In this verse Paul joins three habits: a hope that rejoices, patience in difficulty, and faithfulness in prayer. They work together. Hope gives patience a reason to continue, and prayer keeps both alive.',
      'At the end of a long week it is tempting to measure everything by what went wrong. Patience in trouble does not deny the trouble. It refuses to let trouble have the last word. A lesson that fell flat, a hard conversation, a student who is still struggling: each is real, and none of them is final.',
      'Close this week by naming what you can still hope for, and bring the rest to God in prayer.']),
    pg_temp.doc(array['Faithful God, thank you for carrying me through this week. I place the unfinished things in your hands: the students I worry about, the conversations I dread, the work I did not finish. Teach me to hope, to wait, and to keep praying. Amen.']),
    pg_temp.doc(array['What is one thing from this week you can be thankful for, and one thing you want to place in God''s hands over the weekend?']),
    pg_temp.doc(array['Before you leave today, write a two-line note to yourself for Monday: one thing that went well, and one thing you will approach with fresh patience.']),
    'teachers', '{k2,g35,g68,g912}'::text[], 'personal_renewal', 'Editorial draft (unreviewed)'
  )
) as v(title, devotional_date, theme_id, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter, translation_code, scripture_text,
       reflection, prayer, discussion_question, practical_application, audience, grade_levels, educational_category, author_name)
on conflict (theme_id, devotional_date) do nothing;
