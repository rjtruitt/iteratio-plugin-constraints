# iteratio-plugin-constraints

Resource constraints plugin for iteratio.

## Install

```
npm install iteratio-plugin-constraints
```

## What It Does

Enforces budget limits, token limits, and time limits on agent execution. Lets you cap how much an agent can spend or how long it can run before being stopped. Useful for preventing runaway costs in production.

## Usage

```typescript
import { AgentLoop } from 'iteratio';
import { ConstraintsPlugin } from 'iteratio-plugin-constraints';

const loop = AgentLoop.builder()
  .withLLM(llm)
  .withPlugin(new ConstraintsPlugin({
    maxTokens: 100000,
    maxCostUsd: 5.00,
    maxDurationMs: 300000
  }))
  .build();
```

## License

MIT
