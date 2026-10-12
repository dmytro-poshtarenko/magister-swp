import Transport from 'winston-transport';

const MESSAGE = Symbol.for('message');

// Sends logs to Grafana Loki through its HTTP push API, in batches once a
// second, the way the guide's example sends them to Datadog over HTTP.
export class LokiTransport extends Transport {
  #url;
  #labels;
  #batch = [];
  #timer;
  #failing = false;

  constructor({ url, labels, interval = 1000, ...options }) {
    super(options);
    this.#url = new URL('/loki/api/v1/push', url);
    this.#labels = labels;
    this.#timer = setInterval(() => this.flush(), interval);
    this.#timer.unref();
  }

  log(info, callback) {
    const time = Date.parse(info.timestamp) || Date.now();
    this.#batch.push({ level: info.level, time, line: info[MESSAGE] });
    callback();
  }

  async flush() {
    if (this.#batch.length === 0) return;
    const streams = new Map();
    for (const { level, time, line } of this.#batch.splice(0)) {
      if (!streams.has(level))
        streams.set(level, { stream: { ...this.#labels, level }, values: [] });
      // Loki wants the time in nanoseconds since the epoch, as a string.
      streams.get(level).values.push([`${time}000000`, line]);
    }
    try {
      const response = await fetch(this.#url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ streams: [...streams.values()] }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.#failing = false;
    } catch (err) {
      // An unreachable Loki must not stop the server; it is reported once
      // until a later batch gets through.
      if (!this.#failing)
        process.stderr.write(
          `Loki недоступний (${this.#url}): ${err.message}\n`,
        );
      this.#failing = true;
    }
  }

  close() {
    clearInterval(this.#timer);
    return this.flush();
  }
}
