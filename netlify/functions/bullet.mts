import type {Config, Context} from "@netlify/functions";
import {addUserAgent, ErrorResponse} from "nxapi";
import CoralApi, {CoralAuthData} from "nxapi/coral";
import SplatNet3Api from "nxapi/splatnet3";
import {create} from "domain";

const DEV = process.env.NETLIFY_LOCAL === "true";

addUserAgent("splat-iksm-token-nx");

export const config: Config = {
  method: ["OPTIONS", "POST"],
  path: "/bullet",
};
type RequestBody = {
  sessionToken?: string;
};


export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return withResponseCommonHeaders(new Response())
  }

  try {
    return withResponseCommonHeaders(await handleRequest(req));
  } catch (err) {
    errorLogIfDev(err);
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


function createErrorResponse(errors: any, opts = {status: 400}) {
  const body = {errors};
  return Response.json(body, {status: opts.status ?? 400});
}

function errorLogIfDev(err: any) {
  if (DEV) {
    console.error(err);
  }
}

async function handleRequest(req: Request) {
  const body: RequestBody = await req.json();
  const {sessionToken} = body;
  if (!sessionToken) {
    return createErrorResponse("sessionToken is missing");
  }
  try {
    const data = await login(sessionToken);
    return Response.json(data);
  } catch (err) {
    if (err instanceof ErrorResponse) {
      return createErrorResponse([err.message, err.data], {status: err.response.status});
    }
    throw err;
  }
}


async function login(sessionToken: string) {
  const {nso, data: coralAuthData} = await CoralApi.createWithSessionToken(sessionToken);

  const splat = await SplatNet3Api.loginWithCoral(nso, coralAuthData.user);
  return {
    bullet: splat.bullet_token.bulletToken,
    language: splat.bullet_token.lang,
    version: splat.version,
    country: splat.country,
  }
}
