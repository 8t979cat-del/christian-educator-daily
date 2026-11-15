# Troubleshooting guide

Start with `GET /api/health` (public: ok or degraded), then Admin → Launch (switches and configuration), then the host logs (structured JSON lines).

| Symptom | Likely cause | What to do |
|---|---|---|
| Build or startup fails | Missing environment variable | Run `npm run check:env`; it names the variable |
| Site loads but nobody can sign in | Supabase URL/keys wrong, or Site URL / redirect URLs not set | Re-check section 4 of the deployment guide |
| Confirmation or reset emails never arrive | Built-in Supabase mailer limits, or SMTP not configured | Configure custom SMTP; check spam; check provider logs |
| Educator redeems code: "That code did not work" | Typo; code revoked or expired; pilot not yet started or already ended; school not marked agreed | Check Admin → Pilot: code usable? pilot active and in dates? school stage agreed or active? |
| "Too many tries" on a code | 8 failed attempts in an hour | Wait an hour; check the code with the person |
| "Exhausted" code | Used up | Create a new code (shown once) |
| Joined, but school tools are missing | Seats full (educator enrolled without a seat), or the pilot has ended | Raise the school's seat limit in Admin → Pilot |
| "…is paused right now" when posting | That feature's switch is off | Expected; see Admin → Launch |
| Cannot switch a community feature on | Readiness incomplete | Admin → Launch lists exactly what is missing (human moderator, covenant required, sign-offs) |
| Cannot switch Direct messaging on | Not available in this release, by design | None. It is refused in the database |
| Pilot dashboard shows "—" for people figures | Fewer than 5 educators enrolled; hidden for privacy | Expected until the group is large enough |
| Devotional not showing today | Not published, wrong date, or timezone | Check status and date in Admin → Devotionals and `NEXT_PUBLIC_SITE_TIMEZONE` |
| Scripture text missing | Translation not licensed for text storage, or licence unverified | Admin → Translations; the app shows the reference only |
| Presentation page blank on a projector | Browser extension or blocked fullscreen | Try another browser; check console for CSP violations |
| Checkout says "Paid plans are not open yet" | `paid_subscriptions_enabled` is off | Expected during the pilot |
| Checkout says billing is not set up | Stripe keys absent | Expected until live billing is approved |
| Stripe webhook 400 | Signature mismatch | Check `STRIPE_WEBHOOK_SECRET` belongs to this endpoint and mode |
| Webhook 500 | Temporary failure; Stripe will retry | Check logs for `billing_apply_event_failed` |
| No error reports arriving | `ERROR_REPORT_URL` unset or not https; rate cap of 20/min | Check the environment verdict on Admin → Launch |
| Retention did not run | Cron not scheduled or secret mismatch | Check cron logs; run from Admin → Audit and retention |
| Feedback form says "check what you entered" | A rating outside 1–5, a bad option, or student names | Re-enter; avoid personal names |

When reporting a fault to the developer, include: the time, the page path, what you expected, and the health result. **Do not** include passwords, access codes, prayer text, or student information.
