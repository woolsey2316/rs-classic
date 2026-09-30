/** RuneScape processes the world once every 600ms (100 ticks per minute). */
export const TICK_MS = 600;

let queue = Promise.resolve();

function waitForTick() {
  const intoTick = performance.now() % TICK_MS;
  const remaining = TICK_MS - intoTick;
  const delay = remaining < 20 ? TICK_MS : remaining;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/** Run `task` on the next game tick, after any action already queued. */
export function onTick(task) {
  const run = queue.then(async () => {
    await waitForTick();
    return task();
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
