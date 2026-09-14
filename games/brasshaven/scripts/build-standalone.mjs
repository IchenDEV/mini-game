import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
let html = await readFile(new URL("dist/index.html", root), "utf8");
const script = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
const style = html.match(
  /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/,
);
if (!script || !style)
  throw new Error("Expected one bundled script and stylesheet");
const asset = (path) => new URL(`dist/${path.replace(/^\//, "")}`, root);
const [js, css, model] = await Promise.all([
  readFile(asset(script[1]), "utf8"),
  readFile(asset(style[1]), "utf8"),
  readFile(new URL("dist/mechanic.glb", root)),
]);
if (!js.includes("./mechanic.glb"))
  throw new Error("Character asset reference not found");
const embedded = js.replaceAll(
  "./mechanic.glb",
  `data:model/gltf-binary;base64,${model.toString("base64")}`,
);
html = html
  .replace(/<script id="local-file-entry">[\s\S]*?<\/script>/, "")
  .replace(
    script[0],
    () =>
      `<script type="module">${embedded.replace(/<\/script/gi, "<\\/script")}</script>`,
  )
  .replace(
    style[0],
    () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
  );
const output = new URL("Brasshaven.html", root);
await Promise.all([
  writeFile(output, html),
  writeFile(new URL("dist/Brasshaven.html", root), html),
]);
console.log(`Standalone demo: ${fileURLToPath(output)}`);
