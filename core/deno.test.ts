import * as path from "path";

import execa from "execa";
import which from "which";

import { deno } from "./deno";

test("core / deno", () => {
  expect(deno.DENO_DIR).not.toBe(undefined);
  expect(deno.DENO_DEPS_DIR).not.toBe(undefined);

  expect(deno.DENO_DEPS_DIR).toContain(deno.DENO_DIR);

  const denoPath = which.sync("deno");

  const ps = execa.sync(denoPath, ["info"]);

  const lines = ps.stdout.split("\n");
  const firstLine = lines[0];

  const [, denoDir] = /"([^"]+)"/.exec(firstLine) as string[];

  expect(deno.DENO_DIR).toEqual(path.normalize(denoDir));

  deno.isDenoCachedModule(
    path.join(deno.DENO_DIR, "https", "example.com", "/mod.ts")
  );
});

test("core / deno / getDenoDts()", () => {
  deno.enableUnstableMode(false);
  expect(deno.TYPE_FILE).toBe(path.join(deno.DENO_DIR, "lib.deno.d.ts"));
  deno.enableUnstableMode(true);
  expect(deno.TYPE_FILE).toBe(
    path.join(deno.DENO_DIR, "lib.deno.unstable.d.ts")
  );
  deno.enableUnstableMode(false);
});

test("core / deno / convertURL2Filepath()", () => {
  expect(
    deno.convertURL2Filepath(new URL("https://example.com/esm/mod.ts"))
  ).toBe(
    path.join(
      deno.DENO_DEPS_DIR,
      "https",
      "example.com",
      "8afd52da760dab7f2deda4b7453197f50421f310372c5da3f3847ffd062fa1cf"
    )
  );
});

test("core / deno / changeDenoDir()", () => {
  deno.changeDenoDir(__dirname);
  expect(deno.DENO_DIR).toBe(__dirname);
});

test("core / deno / enableUnstableMode()", () => {
  deno.enableUnstableMode(true);
  expect(deno.unstable).toBe(true);
});

test("core / deno / TYPES", () => {
  expect(deno.TYPE).not.toBe(undefined);
  deno.enableUnstableMode(true);
  expect(deno.TYPE).not.toBe(undefined);
});

test("core / deno / version", () => {
  expect(deno.version).not.toBe(undefined);
});

test("core / deno / format()", async () => {
  const formattedCode = (await deno.format(
    `const test =     "hello world"`
  )) as string;
  expect(formattedCode).toStrictEqual(`const test = "hello world";\n`);
});
