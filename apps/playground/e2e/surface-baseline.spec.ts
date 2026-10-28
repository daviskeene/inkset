import { expect, test as base, type Page } from "@playwright/test";

export type SurfaceOptions = { mode: "baseline" | "parts" };
const test = base.extend<SurfaceOptions>({ mode: ["baseline", { option: true }] });

type Metrics = {
  frames: number;
  overlapFrames: number;
  maxOverlapPx: number;
  maxAnchorDisplacementPx: number;
  anchorDisplacementPx: number;
  controlReplacements: number;
  lifetimes: Record<string, { mounts: number; unmounts: number }>;
};
const metrics = async (page: Page): Promise<Metrics> =>
  JSON.parse(await page.getByTestId("metrics").innerText());
const reset = async (page: Page) => {
  await page.getByRole("button", { name: "Reset measurements", exact: true }).click();
  await expect.poll(async () => (await metrics(page)).frames).toBeGreaterThan(5);
};
const unchanged = async (page: Page) => {
  const result = await metrics(page);
  expect(result.controlReplacements).toBe(0);
  for (const count of Object.values(result.lifetimes))
    expect(count).toEqual({ mounts: 0, unmounts: 0 });
};
const delayed = async (page: Page, button: string, status: string) => {
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.getByRole("textbox", { name: "Your name", exact: true }).focus();
  await expect(page.getByTestId("status")).toContainText(status);
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toBeFocused();
};

test.beforeEach(async ({ page, mode }) => {
  await page.goto(`/surface-baseline?mode=${mode}`);
  await expect(page.getByRole("heading", { name: "Choose an allocation" })).toBeVisible();
  await expect(page.locator('[data-inkset-part="tail"] .inkset-root p').first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  // Let asynchronous Inkset initialization finish before measuring changes.
  await expect(page.locator('[data-inkset-part="intro"] .inkset-root')).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await reset(page);
});

test("stream, model patch, part insertion and reorder preserve controls and edited state", async ({
  page,
}) => {
  const name = page.getByRole("textbox", { name: "Your name", exact: true });
  const slider = page.getByRole("slider", { name: "Allocation" });
  const originalName = await name.elementHandle();
  const originalSlider = await slider.elementHandle();
  await name.fill("User-owned name");
  await slider.focus();
  await slider.press("End");
  await expect(slider).toHaveValue("100");
  await page.getByRole("button", { name: "Start stream", exact: true }).click();
  await delayed(page, "Patch in 600 ms", "Patch applied");
  await expect(page.getByTestId("model-note")).toHaveText("Model note 1");
  await delayed(page, "Insert/remove in 600 ms", "Insert/remove applied");
  await expect(page.locator('[data-inkset-part="inserted"]')).toBeVisible();
  await delayed(page, "Insert/remove in 600 ms", "Insert/remove applied");
  await expect(page.locator('[data-inkset-part="inserted"]')).toHaveCount(0);
  await delayed(page, "Reorder in 600 ms", "Reorder applied");
  await expect(page.locator("[data-inkset-part]").last()).toHaveAttribute(
    "data-inkset-part",
    "comparison",
  );
  await expect(page.getByTestId("status")).toContainText("Stream idle");
  await expect(name).toHaveValue("User-owned name");
  await expect(slider).toHaveValue("100");
  await unchanged(page);
  expect(
    await originalName?.evaluate(
      (element) => element === document.querySelector('[data-control="name"]'),
    ),
  ).toBe(true);
  expect(
    await originalSlider?.evaluate(
      (element) => element === document.querySelector('[data-control="amount"]'),
    ),
  ).toBe(true);
  await test.info().attach("lifetime-metrics", {
    body: JSON.stringify(await metrics(page)),
    contentType: "application/json",
  });
});

test("untouched defaults update, then user edits win on later snapshots", async ({ page }) => {
  await delayed(page, "Patch in 600 ms", "Patch applied");
  await expect(page.getByRole("textbox", { name: "Your name", exact: true })).toHaveValue(
    "Model replacement",
  );
  const slider = page.getByRole("slider", { name: "Allocation" });
  await expect(slider).toHaveValue("10");
  await slider.press("End");
  await delayed(page, "Patch in 600 ms", "Patch applied");
  await expect(slider).toHaveValue("100");
  await expect(page.getByTestId("model-note")).toHaveText("Model note 2");
  await unchanged(page);
});

test("animated expansion and width round-trips never overlap neighboring segments", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Expand details", exact: true }).click();
  await delayed(page, "Resize in 600 ms", "Resize applied");
  await expect(page.getByTestId("scroll")).toHaveCSS("width", "360px");
  await delayed(page, "Resize in 600 ms", "Resize applied");
  await expect(page.getByTestId("scroll")).toHaveCSS("width", "760px");
  await page.getByRole("button", { name: "Collapse details", exact: true }).click();
  await expect
    .poll(async () =>
      page
        .locator('[id="surface-details"]')
        .evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeLessThan(1);
  const result = await metrics(page);
  expect(result.overlapFrames).toBe(0);
  expect(result.maxOverlapPx).toBe(0);
  await unchanged(page);
  await test
    .info()
    .attach("expansion-metrics", { body: JSON.stringify(result), contentType: "application/json" });
});

test("surface stays outside Markdown accessibility and clipping wrappers", async ({
  page,
  browserName,
}) => {
  await page.getByRole("checkbox", { name: "Markdown reveal" }).check();
  await page.getByRole("button", { name: "Start stream", exact: true }).click();
  await expect(page.locator('[data-inkset-part="tail"] .inkset-root')).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  const ancestors = await page.getByTestId("surface").evaluate((surface) => {
    const result: string[] = [];
    for (let element: Element | null = surface; element; element = element.parentElement) {
      if (
        element.getAttribute("aria-hidden") === "true" ||
        element.getAttribute("role") === "log" ||
        element.hasAttribute("aria-live") ||
        element.hasAttribute("inert")
      )
        result.push(element.outerHTML.slice(0, 180));
    }
    return result;
  });
  expect(ancestors).toEqual([]);
  await page.getByRole("textbox", { name: "Your name", exact: true }).focus();
  // Safari's default keyboard navigation skips some controls; Option-Tab
  // explicitly traverses all controls without changing OS preferences.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.getByRole("slider", { name: "Allocation" })).toBeFocused();
  await page.getByRole("button", { name: "Toggle fixed menu", exact: true }).click();
  const menu = page.getByTestId("fixed-menu");
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box?.y).toBeCloseTo(16, 0);
  const hit = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + 10, rect.y + 10));
  });
  expect(hit).toBe(true);
});

test("resize during a real pointer drag retains the control and capture", async ({ page }) => {
  const slider = page.getByRole("slider", { name: "Allocation" });
  await page.getByRole("button", { name: "Resize in 600 ms", exact: true }).click();
  const box = await slider.boundingBox();
  if (!box) throw new Error("Slider has no bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await expect(slider).toHaveAttribute("data-dragging", "true");
    await expect(page.getByTestId("scroll")).toHaveCSS("width", "360px");
    await expect(slider).toHaveAttribute("data-dragging", "true");
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
    await unchanged(page);
  } finally {
    await page.mouse.up();
  }
  await expect(slider).toHaveAttribute("data-dragging", "false");
});

test("native scroll anchoring holds for streaming below and growth fully above", async ({
  page,
  browserName,
}) => {
  const anchor = page.locator('[data-inkset-part="tail"] .inkset-root p').first();
  const scroll = page.getByTestId("scroll");
  await scroll.evaluate((element) => {
    const target = element.querySelector('[data-inkset-part="tail"] .inkset-root p');
    if (target)
      element.scrollTop +=
        target.getBoundingClientRect().top - element.getBoundingClientRect().top - 60;
  });
  await reset(page);
  const before = (await anchor.boundingBox())!.y;
  await page.getByRole("button", { name: "Start stream", exact: true }).click();
  await expect(page.getByTestId("status")).toContainText("Stream idle");
  const afterStream = (await anchor.boundingBox())!.y;
  const streamMetrics = await metrics(page);
  await reset(page);
  // Insertion happens above the viewport without focusing or scrolling to the surface.
  await page.getByRole("button", { name: "Insert/remove in 600 ms", exact: true }).click();
  await expect(page.getByTestId("status")).toContainText("Insert/remove applied");
  await expect(page.locator('[data-inkset-part="inserted"] .inkset-root')).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator('[data-inkset-part="inserted"] .inkset-root p')).toHaveCount(2);
  await expect.poll(async () => (await metrics(page)).frames).toBeGreaterThan(45);
  const afterInsert = (await anchor.boundingBox())!.y;
  const insertMetrics = await metrics(page);
  // Places the surface's bottom edge relative to the top of the scroll viewport,
  // then toggles its expansion programmatically and reports how far the anchor moved.
  const toggleWithSurfaceBottomAt = async (offset: number) => {
    await scroll.evaluate((element, offset) => {
      const surface = element.querySelector('[data-inkset-part="comparison"]')!;
      element.scrollTop +=
        surface.getBoundingClientRect().bottom - element.getBoundingClientRect().top - offset;
    }, offset);
    const start = (await anchor.boundingBox())!.y;
    await reset(page);
    await page.getByRole("button", { name: "Expand/collapse in 600 ms", exact: true }).click();
    await expect(page.getByTestId("status")).toContainText("Expand/collapse applied");
    await expect.poll(async () => (await metrics(page)).frames).toBeGreaterThan(70);
    return { px: (await anchor.boundingBox())!.y - start, metrics: await metrics(page) };
  };
  const expandFullyAbove = await toggleWithSurfaceBottomAt(-40);
  await toggleWithSurfaceBottomAt(-40);
  // While any part of the surface is visible, browsers choose it as the scroll
  // anchor, so its own growth pushes the reading position down uncompensated.
  const expandEdgeVisible = await toggleWithSurfaceBottomAt(2);
  const result = {
    browserName,
    belowAnchorStreamPx: afterStream - before,
    insertAbovePx: afterInsert - afterStream,
    expandFullyAbovePx: expandFullyAbove.px,
    expandEdgeVisiblePx: expandEdgeVisible.px,
    streamMetrics,
    insertMetrics,
    expandFullyAboveMetrics: expandFullyAbove.metrics,
    expandEdgeVisibleMetrics: expandEdgeVisible.metrics,
  };
  await test.info().attach("native-scroll-anchoring", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  expect(Math.abs(result.belowAnchorStreamPx)).toBeLessThanOrEqual(1);
  // Resuming the settled tail segment must not drop its observed heights.
  expect(streamMetrics.maxAnchorDisplacementPx).toBeLessThanOrEqual(1);
  expect(Math.abs(result.insertAbovePx)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.expandFullyAbovePx)).toBeLessThanOrEqual(1);
  // Edge-visible growth is recorded, not asserted: it needs a host anchoring policy.
});

test("instant growth above a settled Markdown part is anchored at every scroll offset", async ({
  page,
}) => {
  // Chromium never anchors on absolutely positioned elements, so a settled
  // Inkset document needs an in-flow box for the browser to anchor on.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const drifts = await page.getByTestId("scroll").evaluate(async (scroller) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const surface = scroller.querySelector('[data-inkset-part="comparison"]')!;
    const toggle = surface.querySelector<HTMLButtonElement>("[aria-controls='surface-details']")!;
    const anchor = scroller.querySelector('[data-inkset-part="tail"] .inkset-root p')!;
    const result: number[] = [];
    for (let offset = -70; offset <= -10; offset += 4) {
      scroller.scrollTop +=
        surface.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top - offset;
      await frame();
      await frame();
      const start = anchor.getBoundingClientRect().top;
      // A programmatic click: no focus or scroll, like a model-driven update.
      toggle.click();
      await frame();
      await frame();
      result.push(anchor.getBoundingClientRect().top - start);
    }
    return result;
  });
  expect(drifts.filter((drift) => Math.abs(drift) > 1)).toEqual([]);
});

test("narrow viewport retains accessible controls and fits without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const name = page.getByRole("textbox", { name: "Your name", exact: true });
  await name.fill("Mobile reader");
  await page.getByRole("button", { name: "Expand details", exact: true }).click();
  await expect
    .poll(async () =>
      page.getByTestId("scroll").evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeLessThanOrEqual(1);
  await delayed(page, "Patch in 600 ms", "Patch applied");
  await expect(name).toHaveValue("Mobile reader");
  await unchanged(page);
  await page.screenshot({ path: test.info().outputPath("mobile-baseline.png"), fullPage: true });
});
