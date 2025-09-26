# SentryFrogg MCP Server v4.2.0

## Document Profile
| Field | Value |
| --- | --- |
| Product | SentryFrogg MCP Server |
| Version | 4.2.0 |
| Runtime | Node.js ≥ 16 |
| Interfaces | Model Context Protocol (PostgreSQL · SSH · HTTP) |
| License | MIT |

## Executive Synopsis
SentryFrogg MCP Server supplies a governed command plane for MCP-compatible agents that operate data platforms, remote shells and web services. The implementation prioritises deterministic behaviour, encrypted credential storage and prescriptive workflows so that autonomous agents can execute infrastructure tasks with enterprise auditability.

## Functional Surface
| Capability | Detail |
| --- | --- |
| PostgreSQL control | Parameterised SQL, catalog discovery, CRUD helpers, mutual TLS, connection profiling. |
| SSH execution | Serial command dispatch per profile, password/key authentication, reachability diagnostics. |
| HTTP access | REST verbs with JSON payloads, health checks, programmable headers and bearer tokens. |
| Secret vault | AES-256 encrypted profiles persisted in `profiles.json` with managed key material. |
| Telemetry | Tool-level statistics via `getStats()` for integration with monitoring stacks. |

## System Components
| Component | Scope |
| --- | --- |
| `sentryfrogg_server.cjs` | MCP entry point, tool catalogue, lifecycle supervision. |
| `src/bootstrap/ServiceBootstrap.cjs` | Service registration, dependency wiring, resource cleanup. |
| `src/managers/PostgreSQLManager.cjs` | SQL execution, profile validation, TLS configuration, pool management. |
| `src/managers/SSHManager.cjs` | SSH sessions, sequential execution enforcement, profile hygiene. |
| `src/managers/APIManager.cjs` | HTTP invocation, header synthesis, response shaping. |
| `src/services/ProfileService.cjs` | Encrypted persistence and retrieval of profile objects. |
| `src/services/Security.cjs` | Key lifecycle, cryptographic primitives, payload size guards. |
| `src/services/Validation.cjs` | Canonical validation for incoming payloads. |

## MCP Tools
### `mcp_psql_manager`
| Attribute | Specification |
| --- | --- |
| Required flow | `setup_profile` → downstream action using same `profile_name`. |
| Actions | `setup_profile`, `list_profiles`, `quick_query`, `show_tables`, `describe_table`, `sample_data`, `insert_data`, `update_data`, `delete_data`, `database_info`. |
| Credentials | Either discrete fields (`host`, `port`, `username`, `password`, `database`) or `connection_url`. |
| TLS options | `ssl_mode`, `ssl_ca`, `ssl_cert`, `ssl_key`, `ssl_passphrase`, `ssl_servername`, `ssl_reject_unauthorized`; omitted values reuse stored secrets. |
| Query rules | `quick_query` injects `LIMIT 100` when absent; bind variables supplied via `params` array (`$1`, `$2`, ...). |
| Response format | JSON with `success`, `rows`, `rowCount`, `fields`, `command`; failures raise MCP internal errors. |
| Rejection triggers | Missing profile, malformed SQL, payload limits exceeded, invalid TLS configuration. |

### `mcp_ssh_manager`
| Attribute | Specification |
| --- | --- |
| Required flow | `setup_profile` (password or PEM `private_key`, optional `passphrase`) → operational action. |
| Actions | `setup_profile`, `list_profiles`, `execute`, `system_info`, `check_host`. |
| Execution model | Commands trimmed and length-limited; pipes/redirects permitted; per-profile execution is strictly sequential. |
| Outputs | JSON containing `success`, `stdout`, `stderr`, `exitCode`, `durationMs`; errors propagate as MCP internal errors. |
| Security posture | Secrets encrypted at rest; no templating—agents must supply fully qualified commands. |

### `mcp_api_client`
| Attribute | Specification |
| --- | --- |
| Actions | `get`, `post`, `put`, `delete`, `patch`, `check_api`. |
| Inputs | `url` (required), `data` (JSON body for mutating verbs), `headers` (string map), `auth_token` (prefixed into `Authorization` unless already set). |
| Behaviour | Local and private addresses allowed; HTTP status/body returned in structured JSON; transport or parsing failures emit MCP internal errors. |

## Profile Lifecycle
1. Invoke `setup_profile` to persist credentials and TLS artefacts; secrets encrypt with AES-256 using `.mcp_profiles.key` (`0600` permissions).  
2. Reference the same `profile_name` for subsequent operations; omitted sensitive fields inherit stored encrypted values.  
3. Rotate credentials by reissuing `setup_profile`; the latest payload supersedes previous entries.  
4. Audit existing profiles via `list_profiles`; responses never disclose secrets.  
5. Retire unused profiles by editing `profiles.json` under change control.

## TLS Configuration Guidance
- Prefer embedding `sslmode` directives in `connection_url`; explicit payload fields override URL parameters.  
- Keep `ssl_reject_unauthorized` at `true` unless communicating with trusted self-signed endpoints.  
- Provide `ssl_servername` whenever certificate CN/SAN mismatches the host.  
- Supply PEM blocks as single-line strings using `\n` escape sequences; leading/trailing spaces are disallowed.  
- `ssl_passphrase` must be non-empty if provided; omit otherwise.

## Installation and Operations
| Task | Command |
| --- | --- |
| Clone and install | `git clone https://github.com/yourusername/sentryfrogg-mcp.git && cd sentryfrogg-mcp && npm install` |
| Syntax check | `npm run check` |
| Launch (stdio) | `node sentryfrogg_server.cjs` |
| Update dependencies | `npm install --package-lock-only && npm audit fix --only=prod` (subject to governance) |
| Reset profile store | Remove `profiles.json` after confirming backups |

## Security & Compliance
- Encryption key lifecycle: `.mcp_profiles.key` generated on first run; override via `ENCRYPTION_KEY` for coordinated environments.  
- Secret exposure: MCP responses never include decrypted values; rotation requires explicit `setup_profile`.  
- Input governance: SQL statements, SSH commands and HTTP payloads are length-limited; oversized inputs are rejected pre-execution.  
- Audit trail: stderr logging captures timestamped events per tool to support collection by SIEM platforms.  
- Dependency governance: locked versions of `pg`, `ssh2`, `node-fetch`, `@modelcontextprotocol/sdk`; monitor advisories for patch cadence.

## Troubleshooting Matrix
| Symptom | Diagnostic Actions | Remediation |
| --- | --- | --- |
| PostgreSQL TLS failure | Inspect `ssl_mode`, `ssl_servername`, certificate chain, Postgres logs. | Update TLS materials; rerun `setup_profile`. |
| SSH command hang | Validate command length, ensure non-interactive execution, check remote prompts. | Adjust command or script; rerun `setup_profile` if credentials changed. |
| HTTP error response | Review returned status/body, verify `headers` and `auth_token`. | Correct payload; retry request. |
| Missing profile | Execute `list_profiles` to confirm presence; ensure consistent `profile_name`. | Recreate via `setup_profile`. |

## Change History Reference
Consult [CHANGELOG.md](CHANGELOG.md) for a dated record of functional and operational updates, including TLS support and renaming.

## Contribution & Support
- Submit changes through pull requests accompanied by verification evidence (`npm run check`).  
- Never commit `.mcp_profiles.key` or environment-specific secrets.  
- Use maintainer contact information in `package.json` for escalation or integration assistance.
