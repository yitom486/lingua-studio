import { describe, expect, it } from 'bun:test';
import { getLogLevel, logger, setLogLevel } from '../index.js';

function captureConsole() {
  const calls: { method: string; args: unknown[] }[] = [];
  const originals = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  console.debug = (...args: unknown[]) => {
    calls.push({ method: 'debug', args });
  };
  console.info = (...args: unknown[]) => {
    calls.push({ method: 'info', args });
  };
  console.warn = (...args: unknown[]) => {
    calls.push({ method: 'warn', args });
  };
  console.error = (...args: unknown[]) => {
    calls.push({ method: 'error', args });
  };
  return {
    calls,
    restore: () => {
      console.debug = originals.debug;
      console.info = originals.info;
      console.warn = originals.warn;
      console.error = originals.error;
      setLogLevel('warn');
    },
  };
}

describe('logger level gate', () => {
  it('defaults to warn: debug/info silent, warn/error pass through', () => {
    const { calls, restore } = captureConsole();
    try {
      expect(getLogLevel()).toBe('warn');
      logger.debug('d', { a: 1 });
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(calls.map((c) => c.method)).toEqual(['warn', 'error']);
      expect(calls[0]?.args).toEqual(['w']);
    } finally {
      restore();
    }
  });

  it('setLogLevel(debug) opens all levels', () => {
    const { calls, restore } = captureConsole();
    try {
      setLogLevel('debug');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');
      expect(calls.map((c) => c.method)).toEqual(['debug', 'info', 'warn', 'error']);
    } finally {
      restore();
    }
  });

  it('setLogLevel(error) only lets errors through', () => {
    const { calls, restore } = captureConsole();
    try {
      setLogLevel('error');
      logger.debug('d');
      logger.warn('w');
      logger.error('e');
      expect(calls.map((c) => c.method)).toEqual(['error']);
    } finally {
      restore();
    }
  });
});
