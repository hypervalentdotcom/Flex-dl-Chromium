import test from "node:test";
import assert from "node:assert/strict";
import {
  getActiveTabUrl,
  isHttpPageUrl,
} from "../extension/current-tab.mjs";

test("recognizes downloadable page URLs", () => {
  assert.equal(isHttpPageUrl("https://example.com/video"), true);
  assert.equal(isHttpPageUrl("http://example.com/video"), true);
  assert.equal(isHttpPageUrl("chrome://extensions"), false);
  assert.equal(isHttpPageUrl("not a URL"), false);
});

test("reads the current active tab URL", async () => {
  let query = null;
  const url = await getActiveTabUrl({
    async query(options) {
      query = options;
      return [{ url: "https://www.youtube.com/watch?v=example" }];
    },
  });

  assert.deepEqual(query, { active: true, currentWindow: true });
  assert.equal(url, "https://www.youtube.com/watch?v=example");
});

test("uses a pending URL and ignores browser pages", async () => {
  assert.equal(
    await getActiveTabUrl({
      async query() {
        return [{ pendingUrl: "https://example.com/loading" }];
      },
    }),
    "https://example.com/loading",
  );
  assert.equal(
    await getActiveTabUrl({
      async query() {
        return [{ url: "chrome://extensions" }];
      },
    }),
    "",
  );
});

test("handles an unavailable tabs API", async () => {
  assert.equal(await getActiveTabUrl(null), "");
});
