import { defaults} from 'jest-config';


/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  // rootDir: './',
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',

  testTimeout: 100,

  fakeTimers: {
    enableGlobally: true,
  },
  resetMocks: true,

  setupFilesAfterEnv: [
    "./setup-jest.ts"
  ],

  testMatch: [ // micromatch pattern
    "**/*.test.ts",
  ],
  testPathIgnorePatterns: [
    ...defaults.testPathIgnorePatterns,
    "/.netlify/",
  ],
};

export default config;
