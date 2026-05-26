/**
 * Standalone functional implementation of the constraints plugin.
 * Retained for backward compatibility with consumers using the factory pattern directly.
 * Prefer the class-based ConstraintsPlugin in index.ts for new code.
 */

/** Defines budget and limit thresholds for a single agent loop session. */
export interface ConstraintsPlugin {
  name: string;
  version: string;
  initialize(container: any): Promise<void>;
  configure(config: ConstraintsConfig): void;
  beforeTurn(ctx: TurnContext): Promise<ConstraintDecision>;
  afterTurn(ctx: TurnContext): Promise<ConstraintDecision>;
  getUsage(): UsageReport;
  shutdown(): Promise<void>;
}

/** Configurable budget limits -- each can be soft (warning) or hard (stop). */
export interface ConstraintsConfig {
  tokenBudget?: { max: number; type: 'soft' | 'hard' };
  turnBudget?: { max: number; type: 'soft' | 'hard' };
  costLimit?: { max: number; currency: string; type: 'soft' | 'hard' };
  /** Wall-clock time limit in milliseconds. */
  timeLimit?: { max: number; type: 'soft' | 'hard' };
}

/** Per-turn snapshot passed into constraint hooks for evaluation. */
export interface TurnContext {
  turnNumber: number;
  tokenUsage: { input: number; output: number };
  cost?: number;
  startTime: number;
}

/** The plugin's verdict after evaluating constraints against the current turn. */
export interface ConstraintDecision {
  action: 'continue' | 'warn' | 'stop';
  reason?: string;
  constraint?: string;
}

/** Cumulative resource consumption since plugin initialization. */
export interface UsageReport {
  totalTokens: number;
  totalTurns: number;
  totalCost: number;
  elapsedTime: number;
}

/**
 * Factory that returns a closure-based ConstraintsPlugin instance.
 * Useful in environments where class instantiation is undesirable.
 */
export function createConstraintsPlugin(config: ConstraintsConfig): ConstraintsPlugin {
  let totalTokens = 0;
  let totalTurns = 0;
  let totalCost = 0;
  let initTime = 0;

  return {
    name: 'constraints',
    version: '0.1.0',

    async initialize(_container: any): Promise<void> {
      initTime = Date.now();
    },

    configure(_cfg: ConstraintsConfig): void {
      Object.assign(config, _cfg);
    },

    async beforeTurn(ctx: TurnContext): Promise<ConstraintDecision> {
      if (config.turnBudget) {
        if (ctx.turnNumber >= config.turnBudget.max) {
          if (config.turnBudget.type === 'hard') {
            return { action: 'stop', reason: 'Turn budget exceeded', constraint: 'turn' };
          } else {
            return { action: 'warn', reason: 'Turn budget exceeded (soft)', constraint: 'turn' };
          }
        }
      }

      if (config.timeLimit && initTime > 0) {
        const elapsed = Date.now() - initTime;
        if (elapsed > config.timeLimit.max) {
          if (config.timeLimit.type === 'hard') {
            return { action: 'stop', reason: 'Time limit exceeded', constraint: 'time' };
          } else {
            return { action: 'warn', reason: 'Time limit exceeded (soft)', constraint: 'time' };
          }
        }
      }

      return { action: 'continue' };
    },

    async afterTurn(ctx: TurnContext): Promise<ConstraintDecision> {
      const turnTokens = ctx.tokenUsage.input + ctx.tokenUsage.output;
      totalTokens += turnTokens;
      totalTurns += 1;
      if (ctx.cost !== undefined) {
        totalCost += ctx.cost;
      }

      if (config.tokenBudget) {
        if (totalTokens > config.tokenBudget.max) {
          if (config.tokenBudget.type === 'hard') {
            return { action: 'stop', reason: 'Token budget exceeded', constraint: 'token' };
          } else {
            return { action: 'warn', reason: 'Token budget exceeded (soft)', constraint: 'token' };
          }
        }
      }

      if (config.costLimit) {
        if (totalCost > config.costLimit.max) {
          if (config.costLimit.type === 'hard') {
            return { action: 'stop', reason: 'Cost limit exceeded', constraint: 'cost' };
          } else {
            return { action: 'warn', reason: 'Cost limit exceeded (soft)', constraint: 'cost' };
          }
        }
      }

      return { action: 'continue' };
    },

    getUsage(): UsageReport {
      return {
        totalTokens,
        totalTurns,
        totalCost,
        elapsedTime: initTime > 0 ? Date.now() - initTime : 0,
      };
    },

    async shutdown(): Promise<void> {
      // no-op
    },
  };
}
