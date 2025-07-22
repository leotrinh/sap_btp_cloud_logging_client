// Global test setup
global.console = {
  ...console,
  // Mock console methods in tests
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};
  
// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.BTP_APPLICATION_NAME = 'test-app';
process.env.BTP_SUBACCOUNT_ID = 'test-subaccount';