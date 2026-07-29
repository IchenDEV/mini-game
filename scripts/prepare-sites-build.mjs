import { access, copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const clientEntry = resolve(root, "dist", "client", "index.html");
const workerSource = resolve(root, "worker", "static-site-worker.js");
const workerDirectory = resolve(root, "dist", "server");
const workerEntry = resolve(workerDirectory, "index.js");

await access(clientEntry);
await access(workerSource);
await mkdir(workerDirectory, { recursive: true });
await copyFile(workerSource, workerEntry);
