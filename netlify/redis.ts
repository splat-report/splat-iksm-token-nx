import Redis from 'ioredis';

const REDIS_URL = (typeof Deno !== "undefined" ? Deno.env.get("REDIS_URL") : process.env.REDIS_URL);
if (!REDIS_URL) {
  throw new Error("Redis URL is not set")
}

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 2,
  reconnectOnError: true,
  //keepAlive: 10 * 1000,
});

/*
process.on('exit', async () => {
  await redis.quit();
});
*/

export async function withMutex<T>(lockKey: string, fn: () => T | Promise<T>): Promise<T> {
  const acquired = await redis.set(lockKey, 1, "EX", 30, "NX");
  if (acquired) {
    try {
      return await fn();
    } finally {
      await redis.del(lockKey);
    }
  }

  const started = Date.now();

  while (await redis.exists(lockKey)) {
    const elapsed = Date.now() - started;
    if (elapsed > 30000) {
      throw new Error("Cannot acquire lock within 30 seconds");
    }
    await delay(200);
  }

  return fn();
}


function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
