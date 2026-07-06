# CLAUDE.md

## Project

Junoswap — multi-chain DeFi aggregator (swap, bridge, LP, launchpad). Live at junoswap.trade.

## Directory map

app/            Next.js App Router pages + server actions
components/     React components by feature
hooks/          Custom hooks — all blockchain interactions live here
services/       Pure business logic (no React)
store/          Zustand stores
lib/            Config & utilities
types/          TypeScript type definitions by domain
contracts/      Foundry Solidity project (BondingCurveJunoswap bonding curve) — git submodule

## Key conventions

- Runtime: **bun only** — never use npm, yarn, or pnpm. Lockfile is `bun.lock`.
- Tests: test business logic, not framework behavior — skip tautologies, passthroughs, exact duplicates, and trivial defaults.
- Comments: comment only genuinely complex or non-obvious code

## Notes

- **kub mainnet/testnet RPC** (`rpc.bitkubchain.io`) is NOT a full archive node. Historical `eth_call` reads fail with "missing trie node".
