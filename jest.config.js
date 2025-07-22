module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'lib/**/*.js',
    'index.js',
    '!lib/**/*.test.js',
    '!node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  testMatch: [
    '**/test/**/*.test.js'
  ],
  setupFilesAfterEnv: ['./test/setup.js']
};