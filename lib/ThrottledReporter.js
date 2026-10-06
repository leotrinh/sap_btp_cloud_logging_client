'use strict';

const DEFAULT_WINDOW_MS = 60000;

/**
 * Reports a recurring failure at most once per window per distinct message.
 *
 * Silence is the costliest failure mode this package has: the console keeps
 * producing healthy-looking output while nothing reaches Cloud Logging. The
 * opposite — one line per dropped entry — is just as unusable, because an
 * outage then buries the signal it was meant to raise. One line per distinct
 * problem per minute, carrying the count of what it stands for, is the shape
 * that survives both.
 */
class ThrottledReporter {
  /**
   * @param {(message: string) => void} emit
   * @param {number} [windowMs]
   */
  constructor(emit, windowMs = DEFAULT_WINDOW_MS) {
    this.emit = emit;
    this.windowMs = windowMs;
    /** @type {Map<string, { lastAt: number, suppressed: number }>} */
    this.seen = new Map();
  }

  /**
   * @param {string} key distinct problems get distinct keys
   * @param {string} message emitted verbatim, with a suppression count appended
   */
  report(key, message) {
    const now = Date.now();
    const previous = this.seen.get(key);

    if (previous && now - previous.lastAt < this.windowMs) {
      previous.suppressed++;
      return;
    }

    const suppressed = previous ? previous.suppressed : 0;
    this.seen.set(key, { lastAt: now, suppressed: 0 });

    const tail = suppressed > 0 ? ` (${suppressed} further occurrences suppressed)` : '';
    this.emit(`${message}${tail}`);
  }
}

module.exports = { ThrottledReporter, DEFAULT_WINDOW_MS };
