<!-- CYTECH_README_REFRESH:START -->
<div align="center">

<a href="https://github.com/Namnarak/Pterodactyl-MCP"><img width="100%" alt="Pterodactyl MCP banner" src="https://capsule-render.vercel.app/api?type=waving&color=0:0F172A,100:2563EB&height=210&section=header&text=Pterodactyl%20MCP&fontSize=43&fontColor=ffffff&fontAlignY=36&desc=Manage%20game%20servers%20through%20MCP&descAlignY=59&descSize=16"></a>

<img alt="PROJECT: MCP Server" src="https://img.shields.io/badge/PROJECT-MCP%20Server-2563EB?style=flat-square&labelColor=0F172A"> <img alt="STACK: Node.js · TypeScript" src="https://img.shields.io/badge/STACK-Node.js%20%C2%B7%20TypeScript-2563EB?style=flat-square&labelColor=0F172A">

<p><strong>Manage game servers through MCP</strong></p>

<a href="https://github.com/Namnarak/Pterodactyl-MCP/releases">Releases</a> · <a href="https://github.com/Namnarak/Pterodactyl-MCP/issues">Issues</a> · <a href="https://github.com/Namnarak/Pterodactyl-MCP">Source</a>

</div>
<!-- CYTECH_README_REFRESH:END -->

---

[![npm version](https://img.shields.io/npm/v/@namkrub/pterodactyl-mcp)](https://www.npmjs.com/package/@namkrub/pterodactyl-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-green)](https://nodejs.org/)

**A client-key friendly MCP server for Pterodactyl Panel.**

This fork is based on `@zefarie/pterodactyl-mcp` and adds compatibility changes for local AI clients:

- Three auth modes: client-only, admin-only, or dual-key
- Legacy Python-style environment aliases: `PTERO_URL` and `PTERO_KEY`
- MCP stdio compatibility for clients that send `Content-Length` framed messages
- JSONL responses for clients that parse one JSON-RPC message per line

## Features

- **Client-only mode** with `PTERODACTYL_CLIENT_KEY` for power, files, console, backups, schedules, databases, and account info
- **Admin-only mode** with `PTERODACTYL_APP_KEY` for panel-wide server, node, user, egg, nest, allocation, and mount management
- **Dual-key mode** with both keys for the full toolset
- **Read-only and destructive actions properly annotated** so your AI client can warn before dangerous operations
- **Rate limiting and retry logic built-in** with exponential backoff
- **TypeScript, fully typed** with strict mode enabled
- **Zod validation on all inputs** for robust parameter checking
- **Structured JSON responses** optimized for LLM consumption
- **Health check on startup** to verify panel connectivity

## Quick Start

```bash
npx @namkrub/pterodactyl-mcp
```

## Configuration

Set these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `PTERODACTYL_URL` | Yes | Your Pterodactyl Panel URL |
| `PTERODACTYL_CLIENT_KEY` | Yes, unless app key is set | Client API key (starts with `ptlc_`) for power/files/console tools |
| `PTERODACTYL_APP_KEY` | Optional | Application API key (starts with `ptla_`) for admin tools |
| `PTERO_URL` | Alias | Legacy alias for `PTERODACTYL_URL` |
| `PTERO_KEY` | Alias | Legacy alias for `PTERODACTYL_CLIENT_KEY` |

## Auth Modes

### Client-only

Use this for normal game-server operations scoped to the account that owns the Client API key.

Tools include power control, console commands, file management, backups, schedules, databases, subusers, logs, activity, and account info.

```json
{
  "mcpServers": {
    "pterodactyl": {
      "command": "npx",
      "args": ["-y", "@namkrub/pterodactyl-mcp"],
      "env": {
        "PTERODACTYL_URL": "https://panel.example.com",
        "PTERODACTYL_CLIENT_KEY": "ptlc_xxxxxxxxxxxxx"
      }
    }
  }
}
```

Legacy Python-style env also works for client-only mode:

```json
{
  "mcpServers": {
    "pterodactyl": {
      "command": "npx",
      "args": ["-y", "@namkrub/pterodactyl-mcp"],
      "env": {
        "PTERO_URL": "https://panel.example.com",
        "PTERO_KEY": "ptlc_xxxxxxxxxxxxx"
      }
    }
  }
}
```

### Admin-only

Use this for panel-wide administration. This requires a Pterodactyl Application API key.

Tools include listing/managing servers, users, nodes, eggs, nests, allocations, mounts, roles, and server build/startup settings.

```json
{
  "mcpServers": {
    "pterodactyl": {
      "command": "npx",
      "args": ["-y", "@namkrub/pterodactyl-mcp"],
      "env": {
        "PTERODACTYL_URL": "https://panel.example.com",
        "PTERODACTYL_APP_KEY": "ptla_xxxxxxxxxxxxx"
      }
    }
  }
}
```

### Dual-key

Use this for the full toolset.

```json
{
  "mcpServers": {
    "pterodactyl": {
      "command": "npx",
      "args": ["-y", "@namkrub/pterodactyl-mcp"],
      "env": {
        "PTERODACTYL_URL": "https://panel.example.com",
        "PTERODACTYL_APP_KEY": "ptla_xxxxxxxxxxxxx",
        "PTERODACTYL_CLIENT_KEY": "ptlc_xxxxxxxxxxxxx"
      }
    }
  }
}
```

See [docs/SETUP.md](docs/SETUP.md) for platform-specific config file locations and troubleshooting.

### Hosted Mode (Cloudflare Worker)

You can also deploy pterodactyl-mcp as a Cloudflare Worker, giving each user a unique MCP endpoint URL without running anything locally. See the [Cloudflare Worker Deployment](docs/SETUP.md#cloudflare-worker-deployment) section in the setup guide.

## Available Tools

### Server Management (Application API)

| Tool | Description | Type |
|------|-------------|------|
| `list_servers` | List all servers with ID, identifier, name, status, and limits | Read-only |
| `get_server` | Get detailed server config (limits, egg, container, allocations) | Read-only |
| `create_server` | Create a new server with egg, resources, and allocation | Destructive |
| `delete_server` | Permanently delete a server and all its data | Destructive |
| `update_server_details` | Update server name, description, owner, or external ID | Destructive |
| `update_server_build` | Update resource limits (memory, CPU, disk, swap) | Destructive |
| `update_server_startup` | Update startup command, Docker image, or egg | Destructive |
| `suspend_server` | Suspend a server (prevents users from starting it) | Destructive |
| `unsuspend_server` | Unsuspend a previously suspended server | Destructive |
| `reinstall_server` | Reinstall server egg (wipes all files) | Destructive |
| `list_server_databases` | List databases attached to a server (admin view) | Read-only |

### Power Control (Client API)

| Tool | Description | Type |
|------|-------------|------|
| `start_server` | Start a stopped server | Destructive |
| `stop_server` | Stop a running server gracefully | Destructive |
| `restart_server` | Restart a server (works running or stopped) | Destructive |
| `kill_server` | Forcefully kill a server process (data loss risk) | Destructive |
| `get_server_resources` | Get real-time CPU, memory, disk, network usage and power state | Read-only |

### Console (Client API)

| Tool | Description | Type |
|------|-------------|------|
| `send_command` | Send a console command to a running server | Destructive |

### File Management (Client API)

| Tool | Description | Type |
|------|-------------|------|
| `list_files` | List files and directories in a server's filesystem | Read-only |
| `read_file` | Read the contents of a text file | Read-only |
| `write_file` | Write content to a file (create or overwrite) | Destructive |
| `create_folder` | Create a new directory | Destructive |
| `delete_files` | Delete one or more files or folders | Destructive |
| `rename_file` | Rename or move a file/folder | Destructive |
| `compress_files` | Compress files into a .tar.gz archive | Destructive |
| `decompress_file` | Extract an archive file | Destructive |

### Backups (Client API)

| Tool | Description | Type |
|------|-------------|------|
| `list_backups` | List all backups for a server | Read-only |
| `create_backup` | Create a new server backup | Destructive |

### Startup & Config (Client API)

| Tool | Description | Type |
|------|-------------|------|
| `get_startup_variables` | Get startup command, env variables, and Docker images | Read-only |

### Schedules (Client API)

| Tool | Description | Type |
|------|-------------|------|
| `list_schedules` | List all scheduled tasks (cron jobs) for a server | Read-only |

### Databases (Client API)

| Tool | Description | Type |
|------|-------------|------|
| `list_client_databases` | List databases for a server (client view) | Read-only |

### Sub-users (Client API)

| Tool | Description | Type |
|------|-------------|------|
| `list_subusers` | List sub-users with permissions for a server | Read-only |

### Account (Client API)

| Tool | Description | Type |
|------|-------------|------|
| `get_account` | Get the current authenticated user's account info | Read-only |

### Users (Application API)

| Tool | Description | Type |
|------|-------------|------|
| `list_users` | List all user accounts on the panel | Read-only |
| `get_user` | Get detailed info for a specific user | Read-only |
| `create_user` | Create a new user account | Destructive |
| `update_user` | Update a user's details | Destructive |

### Nodes (Application API)

| Tool | Description | Type |
|------|-------------|------|
| `list_nodes` | List all infrastructure nodes | Read-only |
| `get_node` | Get detailed info for a specific node | Read-only |
| `get_node_config` | Get Wings daemon configuration for a node | Read-only |

### Panel Config (Application API)

| Tool | Description | Type |
|------|-------------|------|
| `list_eggs` | List all available server templates (eggs) | Read-only |
| `list_mounts` | List all mount points | Read-only |
| `list_roles` | List all admin roles | Read-only |

See [docs/TOOLS.md](docs/TOOLS.md) for detailed documentation on each tool, including parameters and example responses.

## Important: Server ID vs Identifier

Pterodactyl uses two different identifiers for servers:

- **`server_id`** (number) - Used by Application API (admin) tools. Example: `7`
- **`server_identifier`** (string) - Used by Client API tools (power, files, console). Example: `"a1b2c3d4"`

Call `list_servers` first to get both values. The response includes both `id` (numeric) and `identifier` (string) for each server.

## Getting API Keys

**Application API Key** (required, `ptla_`):
Admin Panel > Application API > Create New

**Client API Key** (optional, `ptlc_`):
Account > API Credentials > Create

See [docs/SETUP.md](docs/SETUP.md) for detailed instructions.

## Development

```bash
pnpm install      # Install dependencies
pnpm build        # Build the project
pnpm test         # Run unit tests
pnpm lint         # Run linter and formatter
pnpm typecheck    # Type checking
```

## Contributing

Contributions are welcome! Please make sure `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass before submitting.

## License

MIT
# Pterodactyl-MCP

---

<!-- CYTECH_STAR_HISTORY:START -->

## Star History

<a href="https://star-history.dera.page/#Namnarak/Pterodactyl-MCP&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=Namnarak/Pterodactyl-MCP&type=date&legend=top-left&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=Namnarak/Pterodactyl-MCP&type=date&legend=top-left" />
    <img alt="GitHub star history for Namnarak/Pterodactyl-MCP" src="https://star-history.dera.page/svg?repos=Namnarak/Pterodactyl-MCP&type=date&legend=top-left" width="800" />
  </picture>
</a>

<!-- CYTECH_STAR_HISTORY:END -->
