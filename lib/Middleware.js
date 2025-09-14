const { v4: uuidv4 } = require('uuid');

/**
 * @param {import('./CloudLoggingService')} logger
 * @param {import('../types').MiddlewareOptions} [options]
 * @returns {import('express').RequestHandler}
 */
function createMiddleware(logger, options = {}) {
  return (req, res, next) => {
    const startTime = Date.now();
    const correlationIdHeader = options.correlationIdHeader || 'x-correlation-id';

    if (!req.get(correlationIdHeader)) {
      req.headers[correlationIdHeader] = uuidv4();
    }

    logger.info('Incoming request', {
      req: req, // Pass the whole req object for formatting
    });

    const originalEnd = res.end;
    // LEO-FIX: Use apply and ignore the type override, as it's too complex to model.
    // @ts-ignore
    res.end = function (...args) {
      const duration = Date.now() - startTime;
      logger.info('Request completed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        correlationId: req.get(correlationIdHeader),
      });

      // @ts-ignore
      originalEnd.apply(this, args);
    };

    next();
  };
}

module.exports = createMiddleware;