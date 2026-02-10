const { createLogger, middleware } = require('../index');

// Mock logger
const logger = createLogger();
logger.info = jest.fn();

describe('Middleware Configuration', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'GET',
      path: '/api/test',
      url: '/api/test',
      get: jest.fn(),
      headers: {}
    };
    res = {
      statusCode: 200,
      end: jest.fn(),
      on: jest.fn()
    };
    next = jest.fn();
    logger.info.mockClear();
  });

  it('should log requests when logRequests is true', () => {
    const mw = middleware(logger, { logRequests: true });
    mw(req, res, next);
    expect(logger.info).toHaveBeenCalledWith('Incoming request', expect.any(Object));
    expect(next).toHaveBeenCalled();
  });

  it('should NOT log requests when logRequests is false', () => {
    const mw = middleware(logger, { logRequests: false });
    mw(req, res, next);
    expect(logger.info).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should exclude paths', () => {
    const mw = middleware(logger, { excludePaths: ['/health'] });
    req.path = '/health';
    mw(req, res, next);
    expect(logger.info).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should exclude paths with wildcard', () => {
    const mw = middleware(logger, { excludePaths: ['/static*'] });
    req.path = '/static/image.png';
    mw(req, res, next);
    expect(logger.info).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
