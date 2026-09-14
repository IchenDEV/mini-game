import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("the hosted entry resolves assets beneath the game's deployment directory", () => {
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const base = new URL("https://example.com/mini-game/games/brasshaven/");
  const paths = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^\"]+)"/g)].map(match => match[1]);
  assert.equal(paths.length, 2);
  for (const path of paths)
    assert.ok(new URL(path, base).pathname.startsWith(base.pathname));
  const js = readFileSync(new URL(`../dist/${paths.find(path => path.endsWith(".js"))}`, import.meta.url), "utf8");
  assert.match(js, /"\.\/mechanic\.glb"/);
});

test("opening the source file routes to the self-contained demo", () => {
  const source = readFileSync(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const entry = source.match(
    /<script id="local-file-entry">([\s\S]*?)<\/script>/,
  )[1];
  let destination;
  runInNewContext(entry, {
    URL,
    location: {
      protocol: "file:",
      href: "file:///a%20folder/index.html",
      replace(url) {
        destination = url.href;
      },
    },
  });
  assert.equal(destination, "file:///a%20folder/Brasshaven.html");
  destination = undefined;
  runInNewContext(entry, {
    URL,
    location: {
      protocol: "http:",
      replace() {
        destination = true;
      },
    },
  });
  assert.equal(destination, undefined, "served pages should not redirect");
});

test("offline HTML embeds code, styles and the actual character without a redirect loop", () => {
  const html = readFileSync(
    new URL("../Brasshaven.html", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/);
  assert.doesNotMatch(html, /<link\b[^>]*\brel="stylesheet"/);
  assert.doesNotMatch(html, /id="local-file-entry"/);
  assert.match(html, /<style>[\s\S]*\.controls/);
  const data = html.match(
    /data:model\/gltf-binary;base64,([A-Za-z0-9+/=]+)/,
  )[1];
  assert.deepEqual(
    Buffer.from(data, "base64"),
    readFileSync(new URL("../public/mechanic.glb", import.meta.url)),
  );
});
