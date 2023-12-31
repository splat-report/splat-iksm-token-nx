import { assertStrictEquals, assertNotEquals } from "https://deno.land/std/assert/mod.ts";

import {sha256hashOf, encrypt, decrypt} from "./crypto.ts";

Deno.test("hash", async() => {
  assertStrictEquals(await sha256hashOf("Hello, world!"), "315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3");
});


Deno.test("encrypt/decrypt", async(t) => {
  await t.step("encrypt", async () => {
    const a = await encrypt('pass', new TextEncoder().encode("hello"));
    const b = await encrypt('pass', new TextEncoder().encode("hello"));
    assertNotEquals(a, b)
  });

  await t.step("decrypt", async () => {
    const a = await encrypt('pass', new TextEncoder().encode("hello"));
    const b = await decrypt('pass', a);
    assertStrictEquals(new TextDecoder().decode(b), "hello");
  });
});
