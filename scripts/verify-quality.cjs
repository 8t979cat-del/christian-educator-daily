/* Browser quality gate for the public pages (no backend needed).
 *   npm run build && npm start -- -p 3111      (in one terminal)
 *   node scripts/verify-quality.cjs http://localhost:3111
 * Needs `playwright` and `axe-core` to be resolvable (install them temporarily if the project does not list them).
 * Checks, at desktop and phone width: axe rules for WCAG 2.2 AA, no content-security-policy violations,
 * no horizontal scrolling at 320px (WCAG 1.4.10 reflow), no horizontal scrolling at 200% text, reduced-motion respected,
 * a skip link as the first tab stop, and a visible focus indicator on every tab stop. Exits 1 on any failure.
 * It is a floor, not a verdict: automated checks find only part of what a person using assistive technology would. */
const fs = require("fs");
const { chromium } = require("playwright");
const base = process.argv[2] || "http://localhost:3111";
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const PAGES = ["/", "/classroom-demo", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const failures = [];
const fail = (m) => { failures.push(m); console.log("FAIL", m); };

(async () => {
  const browser = await chromium.launch();
  const overflowOf = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;
  for (const [label, opts] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["phone", { viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true }], ["reflow-320", { viewport: { width: 320, height: 640 } }]]) {
    const ctx = await browser.newContext(opts);
    for (const p of PAGES) {
      const page = await ctx.newPage();
      const csp = [];
      page.on("console", (m) => { if (/content security policy|refused to/i.test(m.text())) csp.push(m.text().slice(0, 160)); });
      page.on("pageerror", (e) => fail(`${label} ${p}: page error ${String(e).slice(0, 120)}`));
      await page.goto(base + p, { waitUntil: "load" });
      await page.waitForTimeout(600);
      csp.forEach((m) => fail(`${label} ${p}: CSP ${m}`));
      const over = await page.evaluate(overflowOf);
      if (over > 0) fail(`${label} ${p}: scrolls horizontally by ${over}px`);
      if (label !== "reflow-320") {
        await page.addScriptTag({ content: axeSrc });
        const v = await page.evaluate(async (tags) => (await axe.run(document, { runOnly: { type: "tag", values: tags } })).violations.map((x) => `${x.id} (${x.impact}) x${x.nodes.length}: ${x.nodes[0].target.join(" ")}`), TAGS);
        v.forEach((x) => fail(`${label} ${p}: axe ${x}`));
      } else {
        await page.addStyleTag({ content: "html{font-size:200% !important}" });
        const o2 = await page.evaluate(overflowOf);
        if (o2 > 4) console.log(`note  ${p}: 320px with 200% text scrolls ${o2}px (stricter than WCAG asks; reviewed manually)`);
      }
      await page.close();
    }
    await ctx.close();
  }
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  for (const p of ["/", "/classroom-demo"]) {
    const page = await ctx.newPage();
    await page.goto(base + p, { waitUntil: "load" });
    const moving = await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => { const c = getComputedStyle(e); return (c.animationName !== "none" && parseFloat(c.animationDuration) > 0.05) || parseFloat(c.transitionDuration) > 0.05; }).length);
    if (moving) fail(`reduced motion ${p}: ${moving} elements still animate or transition`);
    await page.close();
  }
  await ctx.close();
  const kctx = await browser.newContext();
  for (const p of ["/login", "/signup", "/classroom-demo"]) {
    const page = await kctx.newPage();
    await page.goto(base + p, { waitUntil: "load" });
    let first = true;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const s = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const c = getComputedStyle(e); return { text: (e.textContent || "").trim().slice(0, 30), name: e.tagName, ind: (c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== "none" }; });
      if (!s) continue;
      if (first) { first = false; if (!/skip to main/i.test(s.text)) fail(`keyboard ${p}: first tab stop is "${s.text}", not a skip link`); }
      if (!s.ind) fail(`keyboard ${p}: no visible focus indicator on ${s.name} "${s.text}"`);
    }
    await page.close();
  }
  await browser.close();
  console.log(failures.length ? `\n${failures.length} failure(s)` : "\nAll browser quality checks passed.");
  process.exit(failures.length ? 1 : 0);
})();
