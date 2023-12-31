import {encodeHex} from "https://deno.land/std/encoding/hex.ts";
import { concat } from "https://deno.land/std/bytes/mod.ts";

const textEncoder = new TextEncoder();

export async function sha256hashOf(x: string) {
  const buf = await crypto.subtle.digest("SHA-256", textEncoder.encode(x));
  return encodeHex(buf);
}

const ALGORITHM = "AES-GCM"
const SALT_SIZE = 16; // bytes
const IV_SIZE = 16; // bytes
const TAG_LENGTH = 128; // bits

async function deriveKey(password: string, salt: Uint8Array) {
  const passwordBytes = textEncoder.encode(password);

  const passwordKey = await crypto.subtle.importKey("raw", passwordBytes, "PBKDF2", false, ["deriveKey"]);

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    {name: ALGORITHM, length: 256},
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(password: string, plaintext: Uint8Array) {

  const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));

  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    {name: ALGORITHM, iv, tagLength: TAG_LENGTH},
    key,
    plaintext,
  );

  return concat([salt, iv, new Uint8Array(ciphertext)]);
}


export async function decrypt(password: string, ciphertext: Uint8Array) {
  const salt = ciphertext.subarray(0, SALT_SIZE);
  const iv = ciphertext.subarray(SALT_SIZE, SALT_SIZE + IV_SIZE);
  const cipher = ciphertext.subarray(SALT_SIZE + IV_SIZE);

  const key = await deriveKey(password, salt);

  return await crypto.subtle.decrypt(
    {name: ALGORITHM, iv, tagLength: TAG_LENGTH},
    key,
    cipher,
  );
}
