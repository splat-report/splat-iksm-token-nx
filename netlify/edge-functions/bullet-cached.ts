import type {Config, Context} from "@netlify/functions";
import {sha256hashOf, encrypt, decrypt} from "../crypto.ts";
import {redis, withMutex} from "../redis.ts";

const LOCAL = Deno.env.get("NETLIFY_LOCAL") === "true";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const config: Config = {
  method: ["OPTIONS", "POST"],
  path: "/bullet-cached",
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


export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return withResponseCommonHeaders(new Response())
  }

  try {
    return withResponseCommonHeaders(await handleRequest(req, context));
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


async function handleRequest(req: Request, context: Context) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");

  const {sessionToken} = await req.json() as RequestBody;
  if (!sessionToken) {
    return createErrorResponse("sessionToken is missing");
  }
  try {
    const bulletToken = await getToken(sessionToken, sessionId, context);
    return Response.json(bulletToken);
  } catch (err) {
    return createErrorResponse(['' + err]);
  }
}

async function makeCacheKey(sessionId: string, sessionToken: string) {
  const version = 'v1-' + Deno.version.deno;

  if (!sessionId || sessionId.length < 36) {
    throw new Error("sessionId is missing or too short");
  }
  const hash = await sha256hashOf(sessionId + sessionToken);
  return `iksm-token:bullet:${version}:${hash}`;
}

async function getToken(sessionToken: string, sessionId: string | null, context: Context): Promise<BulletToken> {
  if (!sessionId) {
    return await fetchBullet(sessionToken, context);
  }

  const cacheKey = await makeCacheKey(sessionId, sessionToken);
  const lockKey = cacheKey + ':lock';

  const v = await redis.getBuffer(cacheKey);
  if (v) {
    const data = await decrypt(sessionToken, v);
    return JSON.parse(textDecoder.decode(data));
  }

  return await withMutex(lockKey, async () => {
    const v = await redis.getBuffer(cacheKey);
    if (v) {
      const data = await decrypt(sessionToken, v);
      return JSON.parse(textDecoder.decode(data));
    }

    const bulletToken = await fetchBullet(sessionToken, context);
    const data = await encrypt(sessionToken, textEncoder.encode(JSON.stringify(bulletToken)));
    const buf = Buffer.from(data);
    await redis.setBuffer(cacheKey, buf, "EX", 3600);

    return bulletToken;
  });
}


async function fetchBullet(sessionToken: string, context: Context) {
  const url = context.site.url;
  if (!url) {
    throw new Error("Could not get site url");
  }

  const bulletUrl = url + "/bullet";
  const res = await fetch(bulletUrl, {
    method: "POST",
    body: JSON.stringify({sessionToken}),
  });

  if (res.ok) {
    return await res.json() as BulletToken;
  }
  throw new Error("Could not get bullet token: " + res.statusText);
}
