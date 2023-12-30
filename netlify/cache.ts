import {redis} from "./redis.ts";

export async function withCaching<T>(cacheKey: string, data: () => T|Promise<T>): Promise<T> {
  const lockKey = cacheKey + ':lock'
  const v: any = await redis.get(cacheKey);
  if (v) {
    return JSON.parse(v);
  }

  const acquired = await redis.set(lockKey, 1, "EX", 30, "NX");
  if (acquired) {
    try {
      const d = await data();
      await redis.set(cacheKey, JSON.stringify(d), "EX", 600);
      return d;
    } finally {
      await redis.del(lockKey);
    }
  }

  return new Promise<T>(async (resolve, reject) => {
    const started = Date.now();
    while (Date.now() - started < 30 * 1000) {
      try {
        const v: any = await redis.get(cacheKey);
        if (v) {
          resolve(JSON.parse(v));
          return;
        }
      } catch (err) {
        reject(err);
        return;
      }

      await delay(200);
    }

    reject(new Error("Timeout"));
  });
}


async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
