import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("static hosting", () => {
  it("declares a Vercel SPA fallback and a local fallback preview", async () => {
    const vercel = JSON.parse(await readFile(join(process.cwd(), "vercel.json"), "utf8")) as { rewrites?: Array<{ source: string; destination: string }> };
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as { scripts?: Record<string, string> };
    assert.deepEqual(vercel.rewrites, [{ source: "/:path*", destination: "/" }]);
    assert.match(packageJson.scripts?.["preview:web"] ?? "", /serve -s dist/);
  });
});
