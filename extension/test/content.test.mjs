import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const tutorButtonId = "youtube-ai-tutor-button";
const tutorButtonContainerId = "youtube-ai-tutor-button-container";
const buttonTargetSelector =
  "ytd-watch-flexy #below ytd-watch-metadata #actions #top-level-buttons-computed";
const contentScriptSource = await readFile(new URL("../dist/content.js", import.meta.url), "utf8");

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.id = "";
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = "";
    this.type = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  append(...nodes) {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }

  remove() {
    if (this.parentElement === null) {
      return;
    }

    const index = this.parentElement.children.indexOf(this);
    if (index !== -1) {
      this.parentElement.children.splice(index, 1);
    }

    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

class FakeDocument {
  constructor() {
    this.buttonTarget = null;
    this.videoPlayer = null;
    this.listeners = new Map();
    this.roots = [];
    this.title = "Test Video - YouTube";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  dispatchEvent(type) {
    this.listeners.get(type)?.();
  }

  getElementById(id) {
    for (const root of this.roots) {
      const match = findElementById(root, id);
      if (match !== null) {
        return match;
      }
    }

    return null;
  }

  querySelector(selector) {
    if (selector === buttonTargetSelector) {
      return this.buttonTarget;
    }

    if (selector === "video.html5-main-video") {
      return this.videoPlayer;
    }

    return null;
  }
}

function findElementById(element, id) {
  if (element.id === id) {
    return element;
  }

  for (const child of element.children) {
    const match = findElementById(child, id);
    if (match !== null) {
      return match;
    }
  }

  return null;
}

function countElementsById(element, id) {
  let count = element.id === id ? 1 : 0;

  for (const child of element.children) {
    count += countElementsById(child, id);
  }

  return count;
}

function createHarness() {
  const document = new FakeDocument();
  const animationFrames = [];
  const mutationObservers = [];
  let runtimeMessageListener = null;
  const location = {
    href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  };

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observedTarget = null;
      this.options = null;
      mutationObservers.push(this);
    }

    observe(target, options) {
      this.observedTarget = target;
      this.options = options;
    }
  }

  const context = {
    URL,
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            runtimeMessageListener = listener;
          },
        },
        sendMessage() {
          return Promise.resolve();
        },
      },
    },
    document,
    MutationObserver: FakeMutationObserver,
    window: {
      location,
      requestAnimationFrame(callback) {
        animationFrames.push(callback);
        return animationFrames.length;
      },
    },
  };

  vm.runInNewContext(contentScriptSource, context);

  function flushAnimationFrames() {
    while (animationFrames.length > 0) {
      animationFrames.shift()();
    }
  }

  function notifyMutation() {
    for (const observer of mutationObservers) {
      observer.callback();
    }
  }

  function setButtonTarget(target) {
    document.buttonTarget = target;
    if (!document.roots.includes(target)) {
      document.roots.push(target);
    }
  }

  function countById(id) {
    return document.roots.reduce((count, root) => count + countElementsById(root, id), 0);
  }

  function sendRuntimeMessage(message) {
    let response;
    runtimeMessageListener(message, {}, (value) => {
      response = value;
    });
    return response;
  }

  return {
    countById,
    document,
    flushAnimationFrames,
    location,
    mutationObservers,
    notifyMutation,
    sendRuntimeMessage,
    setButtonTarget,
  };
}

test("injects once when the watch action row appears after startup", () => {
  const harness = createHarness();
  const target = new FakeElement("div");

  assert.equal(harness.mutationObservers.length, 1);
  assert.equal(harness.mutationObservers[0].observedTarget, harness.document);
  assert.equal(harness.mutationObservers[0].options.childList, true);
  assert.equal(harness.mutationObservers[0].options.subtree, true);
  assert.equal(harness.countById(tutorButtonId), 0);

  harness.setButtonTarget(target);
  harness.notifyMutation();
  harness.notifyMutation();
  harness.flushAnimationFrames();

  assert.equal(harness.countById(tutorButtonId), 1);
  assert.equal(harness.countById(tutorButtonContainerId), 1);
  assert.equal(harness.document.getElementById(tutorButtonContainerId).parentElement, target);
});

test("moves the single button container when YouTube replaces the action row", () => {
  const harness = createHarness();
  const originalTarget = new FakeElement("div");
  const replacementTarget = new FakeElement("div");

  harness.setButtonTarget(originalTarget);
  harness.notifyMutation();
  harness.flushAnimationFrames();

  const originalContainer = harness.document.getElementById(tutorButtonContainerId);
  harness.setButtonTarget(replacementTarget);
  harness.notifyMutation();
  harness.flushAnimationFrames();

  assert.equal(harness.document.getElementById(tutorButtonContainerId), originalContainer);
  assert.equal(originalContainer.parentElement, replacementTarget);
  assert.equal(harness.countById(tutorButtonId), 1);
  assert.equal(harness.countById(tutorButtonContainerId), 1);
});

test("removes the button off watch pages and restores it on return", () => {
  const harness = createHarness();
  const target = new FakeElement("div");

  harness.setButtonTarget(target);
  harness.notifyMutation();
  harness.flushAnimationFrames();
  assert.equal(harness.countById(tutorButtonId), 1);

  harness.location.href = "https://www.youtube.com/";
  harness.notifyMutation();
  harness.flushAnimationFrames();
  assert.equal(harness.countById(tutorButtonId), 0);

  harness.location.href = "https://www.youtube.com/watch?v=9bZkp7q19f0";
  harness.document.dispatchEvent("yt-navigate-finish");
  harness.flushAnimationFrames();
  assert.equal(harness.countById(tutorButtonId), 1);
  assert.equal(harness.countById(tutorButtonContainerId), 1);
});

test("returns normalized YouTube video context", () => {
  const harness = createHarness();
  harness.document.videoPlayer = {
    currentTime: 83.8,
    duration: 312,
    seekable: { length: 1 },
  };

  const response = harness.sendRuntimeMessage({ type: "getVideoContext" });

  assert.equal(response.status, "ready");
  assert.equal(response.context.source.platform, "youtube");
  assert.equal(response.context.source.sourceId, "dQw4w9WgXcQ");
  assert.equal(response.context.title, "Test Video");
  assert.equal(response.context.currentTimeSeconds, 83.8);
  assert.equal(response.context.durationSeconds, 312);
  assert.equal(response.context.capabilities.seek, "available");
  assert.equal(response.context.capabilities.transcript, "unavailable");
});
