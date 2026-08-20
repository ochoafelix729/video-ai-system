import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const serviceWorkerSource = await readFile(
  new URL("../dist/service-worker.js", import.meta.url),
  "utf8",
);

function createHarness(options = {}) {
  let actionListener = null;
  let runtimeListener = null;
  const injectedScripts = [];
  const panelOptions = [];
  const openedPanels = [];
  const errors = [];

  const context = {
    URL,
    chrome: {
      action: {
        onClicked: {
          addListener(listener) {
            actionListener = listener;
          },
        },
      },
      runtime: {
        onMessage: {
          addListener(listener) {
            runtimeListener = listener;
          },
        },
      },
      scripting: {
        async executeScript(injection) {
          injectedScripts.push(injection);
          if (options.injectionError) {
            throw options.injectionError;
          }
        },
      },
      sidePanel: {
        async setOptions(value) {
          panelOptions.push(value);
        },
        async open(value) {
          openedPanels.push(value);
        },
      },
    },
    console: {
      error(...values) {
        errors.push(values);
      },
    },
  };

  vm.runInNewContext(serviceWorkerSource, context);

  async function clickAction(tab) {
    actionListener(tab);
    await new Promise((resolve) => setImmediate(resolve));
  }

  return {
    clickAction,
    errors,
    injectedScripts,
    openedPanels,
    panelOptions,
    runtimeListener,
  };
}

test("injects generic detector and opens panel on an HTTPS page", async () => {
  const harness = createHarness();

  await harness.clickAction({
    id: 17,
    url: "https://learn.example.edu/ultra/course",
  });

  assert.equal(harness.injectedScripts.length, 1);
  assert.equal(harness.injectedScripts[0].target.tabId, 17);
  assert.equal(harness.injectedScripts[0].files[0], "dist/generic-content.js");
  assert.equal(harness.panelOptions.length, 1);
  assert.equal(harness.panelOptions[0].tabId, 17);
  assert.equal(harness.panelOptions[0].path, "sidepanel.html");
  assert.equal(harness.panelOptions[0].enabled, true);
  assert.equal(harness.openedPanels.length, 1);
  assert.equal(harness.openedPanels[0].tabId, 17);
});

test("uses existing content script on YouTube", async () => {
  const harness = createHarness();

  await harness.clickAction({
    id: 22,
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });

  assert.equal(harness.injectedScripts.length, 0);
  assert.equal(harness.openedPanels.length, 1);
  assert.equal(harness.openedPanels[0].tabId, 22);
});

test("opens panel without injection on a restricted browser page", async () => {
  const harness = createHarness();

  await harness.clickAction({ id: 30, url: "chrome://extensions" });

  assert.equal(harness.injectedScripts.length, 0);
  assert.equal(harness.openedPanels.length, 1);
  assert.equal(harness.openedPanels[0].tabId, 30);
});

test("still opens panel when generic injection fails", async () => {
  const harness = createHarness({ injectionError: new Error("denied") });

  await harness.clickAction({ id: 41, url: "https://learn.example.edu/course" });

  assert.equal(harness.errors.length, 1);
  assert.equal(harness.openedPanels.length, 1);
  assert.equal(harness.openedPanels[0].tabId, 41);
});
