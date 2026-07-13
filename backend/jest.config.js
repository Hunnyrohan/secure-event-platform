'use strict';

module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/config/migrate.js'],
  coverageThreshold: {
    global: { statements: 40, branches: 25, functions: 40, lines: 40 },
  },
};
