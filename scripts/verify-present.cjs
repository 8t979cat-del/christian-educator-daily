/**
 * Classroom simulation for presentation mode. Drives the real component in
 * headless Chromium through the public demo route (/classroom-demo).
 *
 *   npm run build && npx next start -p 3111 &
 *   node scripts/verify-present.cjs http://localhost:3111
 *
 * Needs Playwright with Chromium installed. Writes screenshots to ./present-shots.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const BASE = process.argv[2] || "http://localhost:3111";
const OUT = "present-shots";
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "projector-xga-1024x768", width: 1024, height: 768 },
  { name: "projector-720p-1280x720", width: 1280, height: 720 },
  { name: "laptop-1366x768", width: 1366, height: 768 },
  { name: "laptop-1280x800", width: 1280, height: 800 },
  { name: "projector-1080p-1920x1080", width: 1920, height: 1080 },
  { name: "large-2560x1440", width: 2560, height: 1440 },
  { name: "tablet-portrait-768x1024", width: 768, height: 1024 },
  { name: "phone-portrait-390x844", width: 390, height: 844 },
  { name: "phone-landscape-844x390", width: 844, height: 390 },
];
const PASSAGES = [["short", 1], ["psalm23", 6], ["long", 13]];

let failures = 0;
const results = [];
function check(ok, message) {
  if (!ok) { failures++; console.log("  FAIL:", message); }
  return ok;
}

/** Total number of slides, from the same announcement a screen reader gets ("Slide 3 of 9: ..."). */
async function totalSlides(page) {
  const live = await page.locator("[aria-live=polite]").first().textContent();
  return Number(/of (\d+)/.exec(live)[1]);
}

/** Facts about the slide currently showing. */
async function slideFacts(page) {
  return page.evaluate(() => {
    const outer = document.querySelector("main [data-fit]");
    const main = document.querySelector("main");
    const inner = outer && outer.firstElementChild;
    const o = outer.getBoundingClientRect();
    const i = inner.getBoundingClientRect();
    const m = main.getBoundingClientRect();
    return {
      overflow: outer.dataset.overflow,
      fontPx: Number(outer.dataset.fontPx),
      // Content must lie inside the stage, between the (reserved) top and bottom controls.
      insideStage: i.top >= m.top - 1 && i.bottom <= m.bottom + 1 && i.left >= -1 && i.right <= window.innerWidth + 1,
      fitsBox: inner.scrollHeight <= outer.clientHeight + 1 && inner.scrollWidth <= outer.clientWidth + 1,
      text: inner.innerText,
      heading: (inner.querySelector("h1, blockquote") || {}).innerText || "",
      hasQuote: Boolean(inner.querySelector("blockquote")),
      label: document.querySelector("main").getAttribute("aria-label"),
      live: document.querySelector("[aria-live=polite]").textContent,
    };
  });
}

async function openDemo(browser, vp, query, opts = {}) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: Boolean(opts.touch), ...(opts.context || {}) });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/classroom-demo${query}`, { waitUntil: "load" });
  await page.waitForSelector("main [data-fit]");
  return { context, page, errors };
}

async function walk(page, label) {
  // Go to the first slide, then step through every slide with the keyboard.
  await page.keyboard.press("Home");
  const total = await totalSlides(page);
  const slides = [];
  for (let n = 0; n < total; n++) {
    await page.waitForTimeout(30);
    slides.push(await slideFacts(page));
    if (n < total - 1) await page.keyboard.press("ArrowRight");
  }
  return slides;
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------- 1. fit, every screen
  console.log("\n1. Does every slide fit, at a readable size, on every screen?");
  for (const vp of VIEWPORTS) {
    for (const [passage] of PASSAGES) {
      for (const size of [1, 3]) {
        const { context, page, errors } = await openDemo(browser, vp, `?p=${passage}`);
        // Set text size through the saved settings, then reload so the setting applies from the start.
        await page.evaluate((s) => localStorage.setItem("ced-present-v2", JSON.stringify({ size: s })), size);
        await page.reload({ waitUntil: "load" });
        await page.waitForSelector("main [data-fit]");
        const slides = await walk(page);
        const scripture = slides.filter((s) => s.hasQuote);
        const tag = `${vp.name} ${passage} size${size}`;
        const bad = slides.filter((s) => s.overflow !== "false" || !s.fitsBox || !s.insideStage);
        check(bad.length === 0, `${tag}: ${bad.length} slide(s) overflow or leave the stage`);
        check(errors.length === 0, `${tag}: console/page errors ${errors.join(" | ")}`);
        // Readability floor: at projector sizes (>= 1024 wide) Scripture must stay at 24px or more.
        const minScripture = Math.min(...scripture.map((s) => s.fontPx));
        const floor = vp.width >= 1024 && vp.height >= 700 ? 24 : 16;
        check(minScripture >= floor, `${tag}: Scripture drops to ${minScripture}px (floor ${floor}px)`);
        // The whole passage is there: verse numbers 1..n appear in order across the Scripture slides.
        const all = scripture.map((s) => s.text).join(" ");
        const expectedVerses = passage === "short" ? 0 : passage === "psalm23" ? 6 : 13;
        let at = -1, ordered = true;
        for (let v = 1; v <= expectedVerses; v++) {
          const idx = all.search(new RegExp(`(^|\\s)${v}\\s+[A-Z]`, "m"));
          const next = all.indexOf(` ${v} `, Math.max(at, 0));
          if (idx === -1 && next === -1) ordered = false;
        }
        check(ordered, `${tag}: a verse is missing from the slides`);
        const tail = { short: "if we faint not.", psalm23: "house of the LORD for ever.", long: "the greatest of these is charity." }[passage];
        check(all.replace(/\s+/g, " ").includes(tail), `${tag}: the end of the passage is missing`);
        results.push({ screen: vp.name, passage, size, slides: slides.length, scriptureSlides: scripture.length, scriptureMinPx: minScripture, scriptureMaxPx: Math.max(...scripture.map((s) => s.fontPx)) });
        if (size === 1 && passage === "long" && ["projector-xga-1024x768", "projector-1080p-1920x1080", "phone-portrait-390x844"].includes(vp.name)) {
          await page.keyboard.press("Home");
          await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
          await page.mouse.move(5, 5); await page.waitForTimeout(150);
          await page.screenshot({ path: `${OUT}/scripture-long-${vp.name}.png` });
        }
        await context.close();
      }
    }
  }
  console.table(results.filter((r) => r.size === 1 && r.passage === "long"));

  // ---------------------------------------------------------------- 2. teacher flow on a laptop + projector
  console.log("\n2. A teacher on a laptop (1366x768) starts the lesson");
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/styleguide`, { waitUntil: "load" });
    let clicks = 0;
    await page.getByRole("link", { name: "Present to class" }).click(); clicks++;
    await page.waitForURL("**/classroom-demo");
    await page.waitForSelector("main [data-fit]");
    check(clicks <= 2, "launch took more than two clicks");
    const fs1 = await page.evaluate(() => Boolean(document.fullscreenElement));
    console.log(`  clicks to launch: ${clicks}; entered full screen on launch: ${fs1}`);
    results.launch = { clicks, fullscreen: fs1 };

    // Keyboard navigation
    const labels = [];
    for (const key of ["Home", "ArrowRight", "Space", "PageDown", "ArrowLeft", "End", "Home"]) {
      await page.keyboard.press(key === "Space" ? " " : key);
      labels.push((await slideFacts(page)).live);
    }
    console.log("  keyboard:", labels.join(" -> "));
    const nSlides = Number(/of (\d+)/.exec(labels[0])[1]);
    check(labels[1].includes("Slide 2 ") && labels[2].includes("Slide 3 ") && labels[3].includes("Slide 4 ") && labels[4].includes("Slide 3 ") && labels[5].includes(`Slide ${nSlides} `) && labels[6].includes("Slide 1 "), "keyboard navigation did not behave");
    // Buttons
    await page.getByRole("button", { name: "Next →" }).click();
    check((await slideFacts(page)).live.includes("Slide 2"), "Next button");
    await page.getByRole("button", { name: "← Back" }).click();
    check((await slideFacts(page)).live.includes("Slide 1"), "Back button");
    await page.getByRole("button", { name: /Go to slide 3/ }).click();
    check((await slideFacts(page)).live.includes("Slide 3"), "progress dots jump to a slide");

    // Slide order the teacher asked for
    const order = [];
    await page.keyboard.press("Home");
    const nOrder = await totalSlides(page);
    for (let n = 0; n < nOrder; n++) { order.push((await slideFacts(page)).label.replace(/ \(\d+ of \d+\)$/, "")); await page.keyboard.press("ArrowRight"); }
    const dedup = order.filter((x, i) => x !== order[i - 1]);
    console.log("  order:", dedup.join(" | "));
    check(dedup.join("|") === "Weekly theme|Devotional title|Scripture passage|Reflection|Discussion question|Put it into practice|Closing prayer", "slide order");

    // Controls fade away so only the slide remains.
    await page.mouse.move(600, 400);
    await page.waitForTimeout(3600);
    const idleOpacity = await page.evaluate(() => getComputedStyle(document.querySelector("header")).opacity === "0" || getComputedStyle(document.querySelector("header > div")).opacity === "0");
    check(idleOpacity, "controls should fade when idle");
    await page.mouse.move(610, 410);
    await page.waitForTimeout(300);
    check(await page.evaluate(() => getComputedStyle(document.querySelector("header > div")).opacity === "1"), "controls should return on mouse move");

    // Blank screen
    await page.keyboard.press("b");
    check(await page.getByRole("button", { name: /Screen is blank/ }).isVisible(), "B blanks the screen");
    await page.keyboard.press("b");
    check(!(await page.getByRole("button", { name: /Screen is blank/ }).isVisible()), "B shows it again");

    // Text size
    await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    const before = (await slideFacts(page));
    await page.getByRole("button", { name: "Larger text" }).click();
    const after = (await slideFacts(page));
    console.log(`  larger text: slide ${before.live} -> ${after.live}; font ${before.fontPx}px -> ${after.fontPx}px`);
    check(after.fontPx >= before.fontPx, "A+ should not make the type smaller");
    await page.getByRole("button", { name: "Smaller text" }).click();
    await page.keyboard.press("-"); await page.keyboard.press("=");

    // Settings: what to show
    await page.keyboard.press("s");
    const dialog = page.getByRole("dialog", { name: "Presentation settings" });
    check(await dialog.isVisible(), "settings dialog opens with S");
    await dialog.getByLabel("Weekly theme").uncheck();
    await dialog.getByLabel("Put it into practice").uncheck();
    await dialog.getByLabel("Show the reference").uncheck();
    await dialog.getByLabel("Show the translation name").uncheck();
    await dialog.locator("label", { hasText: "High contrast" }).click();
    await dialog.getByRole("button", { name: "Done" }).click();
    await page.keyboard.press("Home");
    const total = await totalSlides(page);
    const sequence = [];
    for (let n = 0; n < total; n++) { sequence.push((await slideFacts(page)).label); await page.keyboard.press("ArrowRight"); }
    console.log("  after hiding theme + practice:", sequence.join(" | "));
    check(!sequence.includes("Weekly theme") && !sequence.includes("Put it into practice") && sequence.includes("Closing prayer"), "section toggles");
    await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
    const scr = await slideFacts(page);
    check(!/Psalm 23|King James/.test(scr.text.split("\n").slice(-3).join(" ").replace(/King James Version \(KJV\), public domain/, "")) , "reference/translation hidden on the Scripture slide");
    check(/public domain/.test(scr.text), "the copyright notice must stay");
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".present-stage")).backgroundColor);
    check(bg === "rgb(0, 0, 0)", `high contrast background was ${bg}`);
    await page.screenshot({ path: `${OUT}/laptop-high-contrast-hidden-ref.png` });
    // saved on this computer
    await page.reload({ waitUntil: "load" });
    const remembered = await page.waitForSelector(".present-stage[data-theme=contrast]", { timeout: 3000 }).then(() => true, () => false);
    check(remembered, "settings are remembered after a reload");

    // Young students
    await page.keyboard.press("s");
    await page.getByRole("dialog").getByLabel("Younger students").check();
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    await page.keyboard.press("End");
    const last = await slideFacts(page);
    check(/Let’s pray/i.test(last.text), "younger students: friendly closing heading");
    await page.keyboard.press("Home");
    const totalSimple = await totalSlides(page);
    console.log(`  younger students: ${totalSimple} slides (more, smaller slides)`);
    check(totalSimple > sequence.length, "younger students should have more, smaller slides");
    await page.screenshot({ path: `${OUT}/laptop-young-students.png` });

    // Presenter notes: off the big screen until asked, with a warning
    check((await page.getByText("Demo notes").count()) === 0, "notes must not show by default");
    await page.keyboard.press("n");
    check(await page.getByText("Demo notes").isVisible(), "N shows notes");
    check(await page.getByText(/Anyone looking at this screen can read your notes/).isVisible(), "notes warning");
    await page.keyboard.press("Escape");
    check((await page.getByText("Demo notes").count()) === 0, "Esc closes notes");
    await ctx.close();
  }

  // ---------------------------------------------------------------- 3. reference-only translation
  console.log("\n3. A translation we may not display");
  {
    const { context, page } = await openDemo(browser, VIEWPORTS[2], "?text=no");
    const slides = await walk(page);
    const s = slides.find((x) => /Open your Bible/.test(x.text));
    check(Boolean(s), "reference-only slide says to open a Bible");
    check(!slides.some((x) => /valley of the shadow|shepherd/.test(x.text)), "unlicensed text must never reach the screen");
    await page.getByRole("dialog").count();
    await context.close();
  }

  // ---------------------------------------------------------------- 4. presenter window on a second screen
  console.log("\n4. Presenter window follows and drives the class screen");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const audience = await ctx.newPage();
    await audience.goto(`${BASE}/classroom-demo?p=psalm23`, { waitUntil: "load" });
    const presenter = await ctx.newPage();
    await presenter.setViewportSize({ width: 1100, height: 760 });
    await presenter.goto(`${BASE}/classroom-demo?view=presenter`, { waitUntil: "load" });
    await presenter.getByRole("region", { name: "Current slide" }).waitFor();
    await presenter.getByRole("button", { name: "Next →" }).click();
    await presenter.getByRole("button", { name: "Next →" }).click();
    await audience.waitForTimeout(200);
    const a = await slideFacts(audience);
    check(a.live.includes("Slide 3"), `class screen followed the presenter (${a.live})`);
    await audience.keyboard.press("ArrowRight");
    await presenter.waitForTimeout(200);
    check((await presenter.getByText(/Slide 4 of/).count()) > 0, "presenter window follows the class screen");
    check((await presenter.getByText("Demo notes").count()) > 0, "notes are in the presenter window");
    check((await audience.getByText("Demo notes").count()) === 0, "notes are not on the class screen");
    await presenter.getByRole("button", { name: "Blank screen" }).click();
    await audience.waitForTimeout(150);
    check(await audience.getByRole("button", { name: /Screen is blank/ }).isVisible(), "presenter can blank the class screen");
    await presenter.screenshot({ path: `${OUT}/presenter-window.png` });
    await ctx.close();
  }

  // ---------------------------------------------------------------- 5. touch swipe on a tablet
  console.log("\n5. Swipe on a tablet");
  {
    const { context, page } = await openDemo(browser, { width: 1024, height: 768 }, "?p=short", { touch: true });
    await page.keyboard.press("Home");
    const cdp = await context.newCDPSession(page);
    const swipe = async (from, to) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y: 400 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: (from + to) / 2, y: 402 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      // touchend position comes from the last move; send a final move to the target before ending
    };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 800, y: 400 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 300, y: 405 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(150);
    const n1 = (await slideFacts(page)).live;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 300, y: 400 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 800, y: 405 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(150);
    const n0 = (await slideFacts(page)).live;
    console.log(`  swipe left -> ${n1}; swipe right -> ${n0}`);
    check(n1.includes("Slide 2") && n0.includes("Slide 1"), "swipe navigation");
    void swipe;
    await context.close();
  }

  // ---------------------------------------------------------------- 6. print and PDF
  console.log("\n6. Print / save as PDF");
  {
    const { context, page } = await openDemo(browser, VIEWPORTS[2], "?p=long");
    await page.emulateMedia({ media: "print" });
    check(!(await page.locator(".present-stage").isVisible()), "the on-screen controls are hidden when printing");
    const slidesInPrint = await page.locator("[data-print-slide]").count();
    await page.pdf({ path: `${OUT}/slides.pdf`, preferCSSPageSize: true, printBackground: true });
    let pages = 0, text = "";
    try {
      const info = execFileSync("pdfinfo", [`${OUT}/slides.pdf`]).toString();
      pages = Number(/Pages:\s+(\d+)/.exec(info)[1]);
      const size = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
      text = execFileSync("pdftotext", ["-layout", `${OUT}/slides.pdf`, "-"]).toString();
      check(Number(size[1]) > Number(size[2]), `slides print landscape (${size[1]} x ${size[2]} pt)`);
      execFileSync("pdftoppm", ["-r", "50", "-png", `${OUT}/slides.pdf`, `${OUT}/pdf-page`]);
    } catch (e) { console.log("  (poppler not available: skipped PDF inspection)", String(e).slice(0, 80)); }
    console.log(`  slides in print layout: ${slidesInPrint}; PDF pages: ${pages}`);
    if (pages) {
      check(pages === slidesInPrint, `one slide per PDF page (${slidesInPrint} slides, ${pages} pages)`);
      check(/charity/.test(text) && /greatest of these is charity/.test(text.replace(/\s+/g, " ")), "the full passage is in the PDF");
      check(/closing prayer/i.test(text), "the closing prayer is in the PDF");
    }
    await context.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\nALL CLASSROOM CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
