/*
  Runs booking saves one at a time (AUDIT-045, Checklists race).

  Each change is an update function applied to the newest copy of the
  booking: the copy returned by the previous save while saves are queued,
  otherwise the screen's current booking. Two quick clicks therefore build
  on each other instead of the second undoing the first.
*/
export function createSerialBookingSaver({ getBooking, save }) {
  let chain = Promise.resolve();
  let latestSaved = null;
  let pending = 0;

  function enqueue(update) {
    pending += 1;

    const run = chain.then(async () => {
      const base = latestSaved || getBooking();
      const next = update(base);

      if (!next || next === base) {
        return base;
      }

      const saved = await save(next);
      latestSaved = saved || next;
      return latestSaved;
    });

    const settle = () => {
      pending -= 1;
      if (pending === 0) {
        // Idle again: the screen's booking prop is the newest copy.
        latestSaved = null;
      }
    };

    chain = run.then(settle, () => {
      // A failed save is not built on; later changes start from the screen.
      latestSaved = null;
      settle();
    });

    return run;
  }

  return {
    enqueue,
    isBusy: () => pending > 0,
  };
}
