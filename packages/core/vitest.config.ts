import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests live next to the code they cover. Listing the pattern explicitly
    // keeps Vitest away from compiled output in dist/.
    include: ['src/**/*.test.ts'],
  },
});
