import {config} from 'dotenv';
import Redis from 'ioredis-mock';


config({
  path: process.cwd() + '/.env',
});

config({
  path: process.cwd() + '/.env.test',
});


jest.mock("ioredis", () => {
  return {
    default: Redis,
  }
});

afterEach(async() => {
  if (!process.env.REDIS_URL) {
    fail("Redis URL is not set")
  }
  await new Redis(process.env.REDIS_URL).flushall();
});
