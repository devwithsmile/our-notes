import { createStore } from "../../lib/store.mjs";
const store = await createStore({ file: process.argv[2] });
for (let i = 0; i < 12; i++)
  await store.update(async (state) => {
    const entry = state.rateLimits.find((r) => r.key === "counter");
    const previous = entry.count;
    await new Promise((resolve) => setTimeout(resolve, 2));
    entry.count = previous + 1;
  });
