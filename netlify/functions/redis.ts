import type {Config} from "@netlify/functions";
import {redis} from "../redis.ts";

export const config: Config = {
  method: "GET",
  path: "/redis",
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
  const times = [];
  await redis.disconnect();
  const started = Date.now();
  await redis.connect();
  times.push(Date.now() - started);
  const a = await redis.set("a", "b");
  times.push(Date.now() - started);
  const b = await redis.get("a");
  times.push(Date.now() - started);
  await redis.disconnect();
  times.push(Date.now() - started);
  return Response.json({a, b, times});
};
