import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createConstraintsPlugin, ConstraintsPlugin } from '../ConstraintsPlugin';

describe('ConstraintsPlugin', () => {
  let plugin: ConstraintsPlugin;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('token budget enforcement', () => {
    it('should stop when hard token budget is exceeded', async () => {
      plugin = createConstraintsPlugin({
        tokenBudget: { max: 1000, type: 'hard' },
      });

      // Simulate using 600 tokens on first turn
      await plugin.afterTurn({
        turnNumber: 1,
        tokenUsage: { input: 400, output: 200 },
        startTime: Date.now() - 1000,
      });

      // Simulate using 500 more tokens (total 1100 > 1000)
      const decision = await plugin.afterTurn({
        turnNumber: 2,
        tokenUsage: { input: 300, output: 200 },
        startTime: Date.now() - 500,
      });

      expect(decision.action).toBe('stop');
      expect(decision.constraint).toMatch(/token/i);
    });

    it('should warn when soft token budget is exceeded', async () => {
      plugin = createConstraintsPlugin({
        tokenBudget: { max: 1000, type: 'soft' },
      });

      await plugin.afterTurn({
        turnNumber: 1,
        tokenUsage: { input: 600, output: 500 },
        startTime: Date.now(),
      });

      const decision = await plugin.afterTurn({
        turnNumber: 2,
        tokenUsage: { input: 100, output: 50 },
        startTime: Date.now(),
      });

      expect(decision.action).toBe('warn');
    });

    it('should continue when within budget', async () => {
      plugin = createConstraintsPlugin({
        tokenBudget: { max: 10000, type: 'hard' },
      });

      const decision = await plugin.afterTurn({
        turnNumber: 1,
        tokenUsage: { input: 100, output: 50 },
        startTime: Date.now(),
      });

      expect(decision.action).toBe('continue');
    });
  });

  describe('turn budget', () => {
    it('should stop after max turns (hard limit)', async () => {
      plugin = createConstraintsPlugin({
        turnBudget: { max: 3, type: 'hard' },
      });

      await plugin.afterTurn({ turnNumber: 1, tokenUsage: { input: 10, output: 5 }, startTime: Date.now() });
      await plugin.afterTurn({ turnNumber: 2, tokenUsage: { input: 10, output: 5 }, startTime: Date.now() });

      const decision = await plugin.beforeTurn({
        turnNumber: 3,
        tokenUsage: { input: 0, output: 0 },
        startTime: Date.now(),
      });

      expect(decision.action).toBe('stop');
      expect(decision.constraint).toMatch(/turn/i);
    });

    it('should warn at soft turn limit', async () => {
      plugin = createConstraintsPlugin({
        turnBudget: { max: 3, type: 'soft' },
      });

      await plugin.afterTurn({ turnNumber: 1, tokenUsage: { input: 10, output: 5 }, startTime: Date.now() });
      await plugin.afterTurn({ turnNumber: 2, tokenUsage: { input: 10, output: 5 }, startTime: Date.now() });
      await plugin.afterTurn({ turnNumber: 3, tokenUsage: { input: 10, output: 5 }, startTime: Date.now() });

      const decision = await plugin.beforeTurn({
        turnNumber: 4,
        tokenUsage: { input: 0, output: 0 },
        startTime: Date.now(),
      });

      expect(decision.action).toBe('warn');
    });
  });

  describe('cost limit', () => {
    it('should stop when cost threshold is hit (hard)', async () => {
      plugin = createConstraintsPlugin({
        costLimit: { max: 1.00, currency: 'USD', type: 'hard' },
      });

      await plugin.afterTurn({
        turnNumber: 1,
        tokenUsage: { input: 1000, output: 500 },
        cost: 0.80,
        startTime: Date.now(),
      });

      const decision = await plugin.afterTurn({
        turnNumber: 2,
        tokenUsage: { input: 500, output: 200 },
        cost: 0.30,
        startTime: Date.now(),
      });

      expect(decision.action).toBe('stop');
      expect(decision.constraint).toMatch(/cost/i);
    });

    it('should continue when within cost limit', async () => {
      plugin = createConstraintsPlugin({
        costLimit: { max: 5.00, currency: 'USD', type: 'hard' },
      });

      const decision = await plugin.afterTurn({
        turnNumber: 1,
        tokenUsage: { input: 100, output: 50 },
        cost: 0.01,
        startTime: Date.now(),
      });

      expect(decision.action).toBe('continue');
    });
  });

  describe('time limit', () => {
    it('should stop when max wall-clock time exceeded (hard)', async () => {
      plugin = createConstraintsPlugin({
        timeLimit: { max: 60000, type: 'hard' }, // 1 minute
      });
      await plugin.initialize({});

      // Simulate time passing
      vi.advanceTimersByTime(61000);

      const decision = await plugin.beforeTurn({
        turnNumber: 5,
        tokenUsage: { input: 0, output: 0 },
        startTime: Date.now(),
      });

      expect(decision.action).toBe('stop');
      expect(decision.constraint).toMatch(/time/i);
    });

    it('should warn at soft time limit', async () => {
      plugin = createConstraintsPlugin({
        timeLimit: { max: 60000, type: 'soft' },
      });
      await plugin.initialize({});

      vi.advanceTimersByTime(61000);

      const decision = await plugin.beforeTurn({
        turnNumber: 5,
        tokenUsage: { input: 0, output: 0 },
        startTime: Date.now(),
      });

      expect(decision.action).toBe('warn');
    });

    it('should continue when within time limit', async () => {
      plugin = createConstraintsPlugin({
        timeLimit: { max: 60000, type: 'hard' },
      });
      await plugin.initialize({});

      vi.advanceTimersByTime(30000);

      const decision = await plugin.beforeTurn({
        turnNumber: 2,
        tokenUsage: { input: 0, output: 0 },
        startTime: Date.now(),
      });

      expect(decision.action).toBe('continue');
    });
  });

  describe('soft vs hard limits', () => {
    it('should return "warn" for soft limit violations', async () => {
      plugin = createConstraintsPlugin({
        tokenBudget: { max: 100, type: 'soft' },
      });

      const decision = await plugin.afterTurn({
        turnNumber: 1,
        tokenUsage: { input: 80, output: 50 },
        startTime: Date.now(),
      });

      expect(decision.action).toBe('warn');
      expect(decision.reason).toBeDefined();
    });

    it('should return "stop" for hard limit violations', async () => {
      plugin = createConstraintsPlugin({
        tokenBudget: { max: 100, type: 'hard' },
      });

      const decision = await plugin.afterTurn({
        turnNumber: 1,
        tokenUsage: { input: 80, output: 50 },
        startTime: Date.now(),
      });

      expect(decision.action).toBe('stop');
    });
  });

  describe('usage reporting', () => {
    it('should track total token usage', async () => {
      plugin = createConstraintsPlugin({ tokenBudget: { max: 10000, type: 'hard' } });

      await plugin.afterTurn({ turnNumber: 1, tokenUsage: { input: 100, output: 50 }, startTime: Date.now() });
      await plugin.afterTurn({ turnNumber: 2, tokenUsage: { input: 200, output: 100 }, startTime: Date.now() });

      const usage = plugin.getUsage();
      expect(usage.totalTokens).toBe(450);
      expect(usage.totalTurns).toBe(2);
    });
  });
});
