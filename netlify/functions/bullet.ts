import type {Config} from "@netlify/functions";
import {addUserAgent, ErrorResponse} from "nxapi";
import CoralApi from "nxapi/coral";
import SplatNet3Api from "nxapi/splatnet3";
import {sha256hashOf} from "../crypt.ts";
import {redis, withMutex} from "../redis.ts";
import {createCipheriv, createDecipheriv, scrypt, randomBytes} from "node:crypto";

const LOCAL = process.env.NETLIFY_LOCAL === "true";

addUserAgent("splat-iksm-token-nx");

export const config: Config = {
  method: ["OPTIONS", "POST"],
  path: "/bullet",
};
type RequestBody = {
  sessionToken?: string;
};

type BulletToken = {
  bullet: string;
  language: string;
  country: string;
  version: string;
};


export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return withResponseCommonHeaders(new Response())
  }

  try {
    return withResponseCommonHeaders(await handleRequest(req));
  } catch (err) {
    errorLogIfLocal(err);
    return withResponseCommonHeaders(createErrorResponse('' + err));
  }
}

function withResponseCommonHeaders(res: Response) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "OPTIONS,POST",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "3600",
  };

  for (const [name, value] of Object.entries(headers)) {
    res.headers.set(name, value);
  }
  return res;
}


function createErrorResponse(reason: any, opts = {status: 400}) {
  const body = {errors: [reason]};
  return Response.json(body, {status: opts.status ?? 400});
}

function errorLogIfLocal(err: any) {
  if (LOCAL) {
    console.error(err);
  }
}


async function handleRequest(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");

  const {sessionToken} = await req.json() as RequestBody;
  if (!sessionToken) {
    return createErrorResponse("sessionToken is missing");
  }
  try {
    const bulletToken = await getToken(sessionToken, sessionId);
    return Response.json(bulletToken);
  } catch (err) {
    if (err instanceof ErrorResponse) {
      return createErrorResponse([err.message, err.data], {status: err.response.status});
    }
    return createErrorResponse(['' + err]);
  }
}

function makeCacheKey(sessionId: string, sessionToken: string) {
  const version = 'v1-' + process.version;

  if (!sessionId || sessionId.length < 36) {
    throw new Error("sessionId is missing or too short");
  }
  const x = sessionId + sessionToken;
  return `iksm-token:bullet:${version}:${sha256hashOf(x)}`;
}

async function getToken(sessionToken: string, sessionId?: string | null): Promise<BulletToken> {
  if (!sessionId) {
    return await login(sessionToken);
  }

  const cacheKey = makeCacheKey(sessionId, sessionToken);
  const lockKey = cacheKey + ':lock';

  const v = await redis.getBuffer(cacheKey);
  if (v) {
    const data = await decrypt(sessionToken, v);
    return JSON.parse(data.toString('utf8'));
  }

  return await withMutex(lockKey, async () => {
    const v = await redis.getBuffer(cacheKey);
    if (v) {
      const data = await decrypt(sessionToken, v);
      return JSON.parse(data.toString('utf8'));
    }

    const bulletToken = await login(sessionToken);
    const data = await encrypt(sessionToken, Buffer.from(JSON.stringify(bulletToken), 'utf8'));
    await redis.setBuffer(cacheKey, data, "EX", 3600);

    return bulletToken;
  });
}


const ALGORITHM = "aes-256-gcm";
const SALT_SIZE = 16;
const IV_SIZE = 16;
const AUTH_SIZE = 16;


async function encrypt(sessionToken: string, plaintext: Buffer) {
  const salt = randomBytes(SALT_SIZE);

  return new Promise((resolve) => {
    scrypt(sessionToken, salt, /*256 bits*/32, (err, key) => {
      if (err) throw err;

      const iv = randomBytes(IV_SIZE);
      const cipher = createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_SIZE,
      });

      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();

      const data = Buffer.concat([salt, iv, tag, ciphertext]);
      resolve(data);
    });
  });
}


/** decipher from ciphertext */
async function decrypt(sessionToken: string, cipherData: Buffer): Promise<Buffer> {
  const salt = cipherData.subarray(0, SALT_SIZE);
  const iv = cipherData.subarray(SALT_SIZE, SALT_SIZE + IV_SIZE);
  const tag = cipherData.subarray(SALT_SIZE + IV_SIZE, SALT_SIZE + IV_SIZE + AUTH_SIZE);
  const ciphertext = cipherData.subarray(SALT_SIZE + IV_SIZE + AUTH_SIZE);

  return new Promise((resolve) => {
    scrypt(sessionToken, salt, /*256 bits*/32, (err, key) => {
      if (err) throw err;

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      resolve(plaintext);
    });
  });
}


async function login(sessionToken: string): Promise<BulletToken> {
  const {nso, data: coralAuthData} = await CoralApi.createWithSessionToken(sessionToken);

  const splat = await SplatNet3Api.loginWithCoral(nso, coralAuthData.user);
  return {
    bullet: splat.bullet_token.bulletToken,
    language: splat.bullet_token.lang,
    country: splat.country,
    version: splat.version,
  }
}
