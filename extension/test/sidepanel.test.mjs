import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const sidePanelSource = await readFile(
  new URL("../dist/sidepanel.js", import.meta.url),
  "utf8",
);

async function renderStatus(response, error = null) {
  const status = { textContent: "Loading video context…" };
  const errors = [];

  vm.runInNewContext(sidePanelSource, {
    chrome: {
      runtime: {
        onMessage: {
          addListener() {},
        },
      },
      tabs: {
        async query() {
          return [{ id: 9 }];
        },
        async sendMessage() {
          if (error !== null) {
            throw error;
          }
          return response;
        },
      },
    },
    console: {
      error(...values) {
        errors.push(values);
      },
    },
    document: {
      querySelector(selector) {
        return selector === "#video-status" ? status : null;
      },
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  return { errors, message: status.textContent };
}

test("shows ready state for normalized context", async () => {
  const result = await renderStatus({
    status: "ready",
    context: {
      title: "Biology Lecture",
      currentTimeSeconds: 125,
    },
  });

  assert.equal(result.message, "Ready for “Biology Lecture” at 2:05.");
});

test("shows no-video state", async () => {
  const result = await renderStatus({ status: "no_video" });
  assert.equal(result.message, "No supported video was found on this page.");
});

test("shows embedded provider diagnostics", async () => {
  const result = await renderStatus({
    status: "embedded_player",
    providerHosts: ["video.provider.example"],
  });

  assert.equal(
    result.message,
    "Embedded video detected (video.provider.example). A provider-specific adapter is required.",
  );
});

test("shows activation guidance when no content script responds", async () => {
  const result = await renderStatus(null, new Error("Could not establish connection"));

  assert.equal(
    result.message,
    "Click the AI Video Tutor toolbar icon on a video page to start.",
  );
  assert.equal(result.errors.length, 1);
});
