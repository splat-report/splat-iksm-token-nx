import {redis} from "./redis.ts";
import {withCaching } from "./cache.ts";


function makeCacheKeys(x: string) {
  const cacheKey = x;
  return {
    cacheKey,
    lockKey: cacheKey + ":lock",
  }
}

function makeDataFn<T>() {
  let resolveCalled: (x?: any) => void;
  let resolve: (x: T) => void;
  let reject: (x: any) => void;

  return {
    fn: jest.fn(() => new Promise<T>((...args) => {
      resolveCalled();
      [resolve, reject] = args;
    })),
    called: new Promise(r => {
      resolveCalled = r
    }),
    resolve(x: any) {
      if (!resolve) {
        fail("fn must be called before resolve()");
      }
      resolve(x);
    },
    reject(x: any) {
      if (!reject) {
        fail("fn must be called before reject()");
      }
      reject(x)
    },
  }
}

describe("Cache requires Redis connection", () => {
  test('redis client available (as mock)', async () => {
    expect(redis.get("NO SUCH RECORD")).resolves.toBeNull();
  });
});


describe("withCaching()", () => {
  test("must store cache", async() => {
    const dataKey = '<DATA_KEY>';
    const dataValue = "<DATA_VALUE>"

    const {cacheKey, lockKey} = makeCacheKeys(dataKey);

    const { fn, called, resolve } = makeDataFn();
    const dataPromise = withCaching(cacheKey, fn);

    await called;
    await expect(redis.get(lockKey)).resolves.toBeTruthy();
    await expect(redis.get(cacheKey)).resolves.toBeNull();

    resolve(dataValue);
    await expect(dataPromise).resolves.toBe(dataValue);

    await expect(redis.get(cacheKey)).resolves.toBeTruthy();

    const fn2 = jest.fn(() => "MUST NOT BE CALLED");
    await expect(withCaching(cacheKey, fn2)).resolves.toBe(dataValue);
    expect(fn2.mock.calls).toHaveLength(0);
  });

  test("must wait preceding calls", async() => {
    const dataKey = '<DATA_KEY>';
    const dataValue = "<DATA_VALUE>"

    const {cacheKey, lockKey} = makeCacheKeys(dataKey);

    const fn1 = makeDataFn();
    const fn2 = makeDataFn();
    const dataPromise1 = withCaching(cacheKey, fn1.fn);
    const dataPromise2 = withCaching(cacheKey, fn2.fn);

    await jest.advanceTimersByTimeAsync(1000);

    fn1.resolve(dataValue);
    await jest.runOnlyPendingTimersAsync();

    await expect(dataPromise1).resolves.toBe(dataValue);
    await expect(dataPromise2).resolves.toBe(dataValue);
    expect(fn1.fn.mock.calls).toHaveLength(1);
    expect(fn2.fn.mock.calls).toHaveLength(0);
  });
});
