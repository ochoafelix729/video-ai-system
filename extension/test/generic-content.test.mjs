import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const contentScriptSource = await readFile(
  new URL("../dist/generic-content.js", import.meta.url),
  "utf8",
);

class FakeElement {
  constructor(ownerDocument, options = {}) {
    this.ownerDocument = ownerDocument;
    this.attributes = new Map(Object.entries(options.attributes ?? {}));
    this.bounds = options.bounds ?? { width: 640, height: 360 };
    this.display = options.display ?? "block";
    this.visibility = options.visibility ?? "visible";
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  getBoundingClientRect() {
    return this.bounds;
  }
}

class FakeVideo extends FakeElement {
  constructor(ownerDocument, options = {}) {
    super(ownerDocument, options);
    this.currentTime = options.currentTime ?? 0;
    this.duration = options.duration ?? Number.NaN;
    this.seekable = { length: options.seekableLength ?? 0 };
    this.paused = options.paused ?? true;
    this.ended = options.ended ?? false;
    this.readyState = options.readyState ?? 4;
  }
}

class FakeFrame extends FakeElement {
  constructor(ownerDocument, options = {}) {
    super(ownerDocument, options);
    this.contentDocument = options.contentDocument ?? null;
  }
}

class FakeDocument {
  constructor(title = "Blackboard Lecture") {
    this.title = title;
    this.videos = [];
    this.frames = [];
    this.defaultView = {
      getComputedStyle(element) {
        return {
          display: element.display,
          visibility: element.visibility,
        };
      },
    };
  }

  querySelectorAll(selector) {
    if (selector === "video") {
      return this.videos;
    }

    if (selector === "iframe") {
      return this.frames;
    }

    return [];
  }
}

function createHarness(document = new FakeDocument()) {
  const runtimeListeners = [];
  const context = vm.createContext({
    URL,
    HTMLMediaElement: {
      HAVE_CURRENT_DATA: 2,
    },
    chrome: {
      runtime: {
        sendMessage() {
          return Promise.resolve();
        },
        onMessage: {
          addListener(listener) {
            runtimeListeners.push(listener);
          },
        },
      },
    },
    document,
    window: {
      location: {
        href: "https://learn.example.edu/ultra/course?course_id=secret#content",
      },
    },
  });

  vm.runInContext(contentScriptSource, context);

  function sendGetVideoContext() {
    let response;
    runtimeListeners[0]({ type: "getVideoContext" }, {}, (value) => {
      response = value;
    });
    return response;
  }

  return {
    context,
    document,
    runtimeListeners,
    sendGetVideoContext,
  };
}

test("prefers a playing video over a larger paused video", () => {
  const document = new FakeDocument();
  document.videos.push(
    new FakeVideo(document, {
      bounds: { width: 960, height: 540 },
      currentTime: 10,
    }),
    new FakeVideo(document, {
      attributes: { "aria-label": "Active lecture" },
      bounds: { width: 640, height: 360 },
      currentTime: 42.5,
      duration: 600,
      paused: false,
      seekableLength: 1,
    }),
  );

  const response = createHarness(document).sendGetVideoContext();

  assert.equal(response.status, "ready");
  assert.equal(response.context.title, "Active lecture");
  assert.equal(response.context.currentTimeSeconds, 42.5);
  assert.equal(response.context.durationSeconds, 600);
  assert.equal(response.context.capabilities.seek, "available");
  assert.equal(response.context.source.platform, "generic_html5");
});

test("uses the largest visible video and excludes URL credentials from identity", () => {
  const document = new FakeDocument();
  document.videos.push(
    new FakeVideo(document, { bounds: { width: 320, height: 180 } }),
    new FakeVideo(document, { bounds: { width: 800, height: 450 } }),
    new FakeVideo(document, {
      bounds: { width: 1200, height: 675 },
      visibility: "hidden",
    }),
  );

  const response = createHarness(document).sendGetVideoContext();

  assert.equal(response.status, "ready");
  assert.equal(
    response.context.source.pageUrl,
    "https://learn.example.edu/ultra/course",
  );
  assert.equal(response.context.source.sourceId.includes("secret"), false);
  assert.equal(response.context.source.sourceId.endsWith("#video-1"), true);
});

test("finds video in an accessible same-origin frame", () => {
  const topDocument = new FakeDocument();
  const frameDocument = new FakeDocument("Embedded lecture");
  frameDocument.videos.push(new FakeVideo(frameDocument, { currentTime: 21 }));
  topDocument.frames.push(new FakeFrame(topDocument, { contentDocument: frameDocument }));

  const response = createHarness(topDocument).sendGetVideoContext();

  assert.equal(response.status, "ready");
  assert.equal(response.context.currentTimeSeconds, 21);
});

test("reports visible cross-origin embedded player hosts", () => {
  const document = new FakeDocument();
  document.frames.push(
    new FakeFrame(document, {
      attributes: { src: "https://video.provider.example/embed/123" },
      bounds: { width: 800, height: 450 },
    }),
    new FakeFrame(document, {
      attributes: { src: "https://tiny.example/widget" },
      bounds: { width: 100, height: 50 },
    }),
  );

  const response = createHarness(document).sendGetVideoContext();

  assert.equal(response.status, "embedded_player");
  assert.equal(response.providerHosts.length, 1);
  assert.equal(response.providerHosts[0], "video.provider.example");
});

test("reports no video when no media candidate exists", () => {
  const response = createHarness().sendGetVideoContext();
  assert.equal(response.status, "no_video");
});

test("does not install duplicate message listeners when reinjected", () => {
  const harness = createHarness();

  vm.runInContext(contentScriptSource, harness.context);

  assert.equal(harness.runtimeListeners.length, 1);
});
