export class TranslationQueue {
  constructor({ translator, onResult, onError, maxPending = 20 } = {}) {
    this.translator = translator;
    this.onResult = onResult;
    this.onError = onError;
    this.maxPending = maxPending;
    this.pending = [];
    this.running = false;
    this.drainPromise = null;
  }

  enqueue(item) {
    if (!item?.text?.trim()) return;
    if (this.pending.length >= this.maxPending) this.pending.shift();
    this.pending.push(item);
    void this.drain();
  }

  async drain() {
    if (this.running) return this.drainPromise;
    this.running = true;
    this.drainPromise = (async () => {
      while (this.pending.length > 0) {
        const item = this.pending.shift();
        try {
          const translated = await this.translator.translate(item.text, item);
          this.onResult?.({ ...item, translated });
        } catch (error) {
          this.onError?.({ item, error });
        }
      }
    })();
    try {
      await this.drainPromise;
    } finally {
      this.running = false;
      this.drainPromise = null;
    }
  }

  clear() {
    this.pending = [];
  }
}
