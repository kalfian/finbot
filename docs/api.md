# REST v1 and MCP

All financial endpoints require a login cookie or Bearer credential. Browser mutations use same-origin validation. Authorization, required password changes and user ownership are enforced server-side.

| Operation | Endpoint |
| --- | --- |
| Login | POST /api/auth/login with username/password |
| Change password | PUT /api/auth/password with currentPassword/newPassword |
| Logout | POST /api/auth/logout |
| List/create expenses | GET/POST /api/v1/expenses |
| Update/delete expense | PATCH/DELETE /api/v1/expenses/:id |
| List/attach proofs | GET/POST /api/v1/expenses/:id/proofs |
| Read proof bytes | GET /api/v1/expenses/:id/proofs/:proofId |
| Categories | GET/POST /api/v1/categories; PATCH/DELETE /api/v1/categories/:id |
| Budget status/limit | GET/PUT /api/v1/budget |
| Filtered PDF | GET /api/v1/reports/pdf |
| Integration tokens | /api/tokens |
| Administrator user management | /api/users |
| Streamable HTTP MCP | /mcp |

Expense GET accepts q, from and to; dates use inclusive Jakarta days. The new dashboard reads the full user-owned snapshot and derives local-calendar filters, amount/category filters, summaries and pagination in the client. Those additional dashboard filters are not REST query parameters.

Create/PATCH require positive integer amountCents, description, a user-owned category and canonical UTC date. POST optionally accepts sourceId for idempotency. Mutation responses include the affected expense and budget snapshot. Category objects include IDs and names; clients must use the signed-in user's category list rather than hardcoded defaults.

Old /api/expenses and the prototype's unversioned category-budget, recurring-plan and portability routes are absent. See the [README contract table](../README.md), [MCP specification](mcp-end-to-end.md), and [Hermes guide](hermes-agent.md) for full integration examples and error behavior.
