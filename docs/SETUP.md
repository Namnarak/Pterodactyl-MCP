# Setup

This guide shows the common MCP client configuration for `@namkrub/pterodactyl-mcp`.

## Requirements

- Node.js 20 or newer.
- A Pterodactyl Panel URL.
- At least one API key:
  - Client API key (`ptlc_...`) for account/server tools.
  - Application API key (`ptla_...`) for admin tools.

## Client-Only Mode

Use this when you only need tools for servers your Pterodactyl account can access.

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

Legacy environment variable names are also supported:

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

## Admin-Only Mode

Use this when you want Application API tools for panel-wide administration.

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

## Dual-Key Mode

Use this when you want both admin tools and client account/server tools.

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

## Config File Locations

Common MCP config locations:

- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, or the equivalent app config directory on Linux/Windows.
- Codex CLI: `~/.codex/config.toml`.
- Cursor and compatible clients: project or user MCP JSON settings, depending on the client version.

For TOML-based clients such as Codex:

```toml
[mcp_servers.pterodactyl]
command = "npx"
args = ["-y", "@namkrub/pterodactyl-mcp"]
startup_timeout_sec = 90

[mcp_servers.pterodactyl.env]
PTERODACTYL_URL = "https://panel.example.com"
PTERODACTYL_CLIENT_KEY = "ptlc_xxxxxxxxxxxxx"
```

## Cloudflare Worker Deployment

The npm package is designed for stdio MCP clients. If you deploy behind Cloudflare Worker or another HTTP transport, keep secrets in Worker environment variables and bridge HTTP requests to the MCP server process or an equivalent MCP transport adapter.

Use the same environment names:

- `PTERODACTYL_URL`
- `PTERODACTYL_CLIENT_KEY`
- `PTERODACTYL_APP_KEY`
- `PTERODACTYL_ALLOW_INSECURE`

## Troubleshooting

### `invalid character 'C' looking for beginning of value`

The client expected JSONL but received `Content-Length` framed output. This package sends JSONL and accepts both JSONL and `Content-Length` input.

### `context deadline exceeded` or long `initializing`

Check that:

- The package name is reachable with `npm view @namkrub/pterodactyl-mcp version`.
- `PTERODACTYL_URL` is reachable from the machine running the MCP client.
- The API key is valid and belongs to the mode you configured.
- The MCP client startup timeout is at least 60-90 seconds when using `npx` for the first run.

### Client-only mode starts but admin tools are missing

That is expected. Add `PTERODACTYL_APP_KEY` to enable admin tools.

### Admin-only mode starts but file/console/power tools are missing

That is expected. Add `PTERODACTYL_CLIENT_KEY` to enable client tools.
