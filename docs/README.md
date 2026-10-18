# Finbot documentation

Ledger is a multi-user expense dashboard backed by SQLite. Browser, REST v1, and MCP operations use the same per-account ownership rules.

| Document | Scope |
| --- | --- |
| [Product and dashboard](product-and-dashboard.md) | Dashboard, navigation, themes and accessibility |
| [Ledger guide](ledger-guide.md) | Entry, filters, proofs, calendar, exports and integration settings |
| [API reference](api.md) | Current REST and MCP entry points |
| [Data model](data-model.md) | User-owned SQLite data and private files |
| [Authentication](auth-and-security.md) | Bootstrap, passwords, sessions and authorization |
| [Verification](development-and-verification.md) | Tests, builds and isolated browser checks |
| [MCP specification](mcp-end-to-end.md) | Agent contracts and errors |
| [Hermes guide](hermes-agent.md) | Agent adapter workflow |

Amounts use integer IDR minor units. Inputs use local date/time converted to canonical UTC timestamps. Back up the database and private proof directory together. See the root [README](../README.md) for setup and screenshots.
