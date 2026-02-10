const { v4: uuidv4 } = require('uuid');

/**
 * @param {import('./CloudLoggingService')} logger
 * @param {import('../types').MiddlewareOptions} [options]
 * @returns {import('express').RequestHandler}
 */
function createMiddleware(logger, options = {}) {
  const {
    correlationIdHeader = 'x-correlation-id',
    logRequests = true,
    logResponses = true,
    excludePaths = [],
  } = options;

  return (req, res, next) => {
    // Leo: Check if path should be excluded
    const shouldExclude = excludePaths.some(path => {
      if (path.endsWith('*')) {
        return req.path.startsWith(path.slice(0, -1));
      }
      return req.path === path;
    });

    if (shouldExclude) {
      return next();
    }

    const startTime = Date.now();

    // Leo: Add correlation ID if not present
    if (!req.get(correlationIdHeader)) {
      req.headers[correlationIdHeader] = uuidv4();
    }

    // Leo: Log incoming request if enabled
    if (logRequests) {
      logger.info('Incoming request', {
        req: req, // Pass the whole req object for formatting
      });
    }

    // Leo: Log response if enabled
    if (logResponses) {
      const originalEnd = res.end;
      // @ts-ignore - monkey-patching res.end for duration tracking
      res.end = function (/** @type {any} */ chunk, /** @type {any} */ encoding, /** @type {any} */ cb) {
        const duration = Date.now() - startTime;
        logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration: `${duration}ms`,
          correlationId: req.get(correlationIdHeader),
        });

        return originalEnd.call(res, chunk, encoding, cb);
      };
    }

    next();
  };
}

module.exports = createMiddleware;