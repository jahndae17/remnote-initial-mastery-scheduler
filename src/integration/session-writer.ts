/** Serialize one session-storage channel and skip unchanged values. A failed
 * write rejects its caller without poisoning later writes or marking it saved. */
export function sessionWriter<T>(save: (value: T) => Promise<unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  let saved: string | undefined;
  return (value: T): Promise<void> => {
    const serialized = JSON.stringify(value);
    const write = pending.then(async () => {
      if (serialized === saved) return;
      await save(JSON.parse(serialized));
      saved = serialized;
    });
    pending = write.catch(() => {});
    return write;
  };
}
