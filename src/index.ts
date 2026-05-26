/** Base plugin contract shared across all iteratio plugins. */
import type { Container } from 'inversify';

export interface IPlugin {
  name: string;
  version: string;
  initialize(container: Container): Promise<void>;
  shutdown(): Promise<void>;
}

/** Configurable budget limits -- each can be soft (warning) or hard (stop). */
export interface ConstraintsConfig {
  tokenBudget?: { max: number; type: 'soft' | 'hard' };
  turnBudget?: { max: number; type: 'soft' | 'hard' };
  costLimit?: { max: number; currency: string; type: 'soft' | 'hard' };
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
 * Enforces token, turn, cost, and wall-clock time budgets on an agent loop.
 * Budgets can be "soft" (emit a warning) or "hard" (force the loop to stop).
 */
export class ConstraintsPlugin implements IPlugin {
  readonly name = 'constraints';
  readonly version = '0.1.0';

  private config: ConstraintsConfig = {};
  private totalTokens = 0;
  private totalTurns = 0;
  private totalCost = 0;
  private initTime = 0;

  /** Initialize the plugin with a dependency injection container. */
  initialize(_container: Container): Promise<void> {
    this.initTime = Date.now();
    return Promise.resolve();
  }

  /** Merge new configuration into the active config at runtime. */
  configure(config: ConstraintsConfig): void {
    Object.assign(this.config, config);
  }

  /** Evaluate pre-turn constraints (turn count, wall-clock time). */
  async beforeTurn(ctx: TurnContext): Promise<ConstraintDecision> {
    if (this.config.turnBudget) {
      if (ctx.turnNumber >= this.config.turnBudget.max) {
        if (this.config.turnBudget.type === 'hard') {
          return { action: 'stop', reason: 'Turn budget exceeded', constraint: 'turn' };
        } else {
          return { action: 'warn', reason: 'Turn budget exceeded (soft)', constraint: 'turn' };
        }
      }
    }

    if (this.config.timeLimit && this.initTime > 0) {
      const elapsed = Date.now() - this.initTime;
      if (elapsed > this.config.timeLimit.max) {
        if (this.config.timeLimit.type === 'hard') {
          return { action: 'stop', reason: 'Time limit exceeded', constraint: 'time' };
        } else {
          return { action: 'warn', reason: 'Time limit exceeded (soft)', constraint: 'time' };
        }
      }
    }

    return { action: 'continue' };
  }

  /** Evaluate post-turn constraints (token budget, cost limit). */
  async afterTurn(ctx: TurnContext): Promise<ConstraintDecision> {
    const turnTokens = ctx.tokenUsage.input + ctx.tokenUsage.output;
    this.totalTokens += turnTokens;
    this.totalTurns += 1;
    if (ctx.cost !== undefined) {
      this.totalCost += ctx.cost;
    }

    if (this.config.tokenBudget) {
      if (this.totalTokens > this.config.tokenBudget.max) {
        if (this.config.tokenBudget.type === 'hard') {
          return { action: 'stop', reason: 'Token budget exceeded', constraint: 'token' };
        } else {
          return { action: 'warn', reason: 'Token budget exceeded (soft)', constraint: 'token' };
        }
      }
    }

    if (this.config.costLimit) {
      if (this.totalCost > this.config.costLimit.max) {
        if (this.config.costLimit.type === 'hard') {
          return { action: 'stop', reason: 'Cost limit exceeded', constraint: 'cost' };
        } else {
          return { action: 'warn', reason: 'Cost limit exceeded (soft)', constraint: 'cost' };
        }
      }
    }

    return { action: 'continue' };
  }

  /** Shut down the plugin and release any resources. */
  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  /** Return a snapshot of cumulative resource usage. */
  getUsage(): UsageReport {
    return {
      totalTokens: this.totalTokens,
      totalTurns: this.totalTurns,
      totalCost: this.totalCost,
      elapsedTime: this.initTime > 0 ? Date.now() - this.initTime : 0,
    };
  }
}

/** Convenience factory -- instantiates and optionally pre-configures the plugin. */
export function createConstraintsPlugin(config?: ConstraintsConfig): ConstraintsPlugin {
  const plugin = new ConstraintsPlugin();
  if (config) {
    plugin.configure(config);
  }
  return plugin;
}
