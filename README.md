# MCP-Compose-Proxy-Shim

A bridge that connects local LLM clients (such as Claude Desktop) to remote MCP-Compose servers running in Docker containers.

## 🚀 Overview

MCP-Compose-Proxy-Shim allows you to use containerized MCP servers with LLM clients that expect to run MCP servers locally. It acts as a transparent bridge, intercepting local MCP server calls and redirecting them to a remote MCP-Compose proxy.

**Key benefits:**

- Use Claude Desktop with MCP servers running in Docker containers
- Avoid limitations and costs of paid remote MCP servers
- Leverage all the power and flexibility of Docker-based MCP servers
- Works with filesystem, memory, weather and other MCP servers

This project is designed to integrate with [MCP-Compose](https://github.com/phildougherty/mcp-compose), a tool for running Model Context Protocol (MCP) servers in Docker containers.

## 📋 Requirements

- Node.js v14 or later
- Claude Desktop or another MCP-compatible LLM client
- MCP-Compose running with a proxy (see [MCP-Compose](https://github.com/phildougherty/mcp-compose))

## 🔧 Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/phildougherty/mcp-compose-proxy-shim.git
   cd mcp-compose-proxy-shim
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Make scripts executable:
   ```bash
   chmod +x bin/npx lib/mcp-shim.js
   ```

## 🔌 Configuration

### Claude Desktop Configuration

Since the "Import Servers" feature requires a Claude Max plan, you need to manually edit Claude's configuration file:

1. Locate Claude Desktop's configuration directory:
   - **macOS**: `~/Library/Application Support/Claude`
   - **Windows**: `%APPDATA%\Claude`
   - **Linux**: `~/.config/Claude`

2. Create or edit the MCP servers configuration file:
   - Create a file called `mcp-servers.json` in the configuration directory
   - Add the following content (adjust paths to your environment):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "/absolute/path/to/mcp-compose-proxy-shim/bin/npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/phildougherty/Documents",
        "/Users/phildougherty/Downloads"
      ]
    },
    "memory": {
      "command": "/absolute/path/to/mcp-compose-proxy-shim/bin/npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-memory"
      ]
    }
  }
}
```

3. **Important**: Restart Claude Desktop after editing the configuration file.

## 🚀 Usage

### Set Up MCP-Compose First

1. First, make sure [MCP-Compose](https://github.com/phildougherty/mcp-compose) is installed and running:

   ```bash
   cd /path/to/mcp-compose
   ./mcp-compose up
   ./mcp-compose proxy
   ```

   This starts the MCP servers in Docker containers and the proxy on port 9876.

### Environment Variables

Before running Claude Desktop, set these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_PROXY_URL` | URL of the MCP-Compose proxy | `http://localhost:9876` |
| `MCP_API_KEY` | API key for authentication | `""` |
| `MCP

### USER
replace phildougherty with my github username phildougherty

### ASSISTANT
# MCP-Compose-Proxy-Shim

A bridge that connects local LLM clients (such as Claude Desktop) to remote MCP-Compose servers running in Docker containers.

## 🚀 Overview

MCP-Compose-Proxy-Shim allows you to use containerized MCP servers with LLM clients that expect to run MCP servers locally. It acts as a transparent bridge, intercepting local MCP server calls and redirecting them to a remote MCP-Compose proxy.

**Key benefits:**

- Use Claude Desktop with MCP servers running in Docker containers
- Avoid limitations and costs of paid remote MCP servers
- Leverage all the power and flexibility of Docker-based MCP servers
- Works with filesystem, memory, weather and other MCP servers

This project is designed to integrate with [MCP-Compose](https://github.com/phildougherty/mcp-compose), a tool for running Model Context Protocol (MCP) servers in Docker containers.

## 📋 Requirements

- Node.js v14 or later
- Claude Desktop or another MCP-compatible LLM client
- MCP-Compose running with a proxy (see [MCP-Compose](https://github.com/phildougherty/mcp-compose))

## 🔧 Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/phildougherty/mcp-compose-proxy-shim.git
   cd mcp-compose-proxy-shim
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Make scripts executable:
   ```bash
   chmod +x bin/npx lib/mcp-shim.js
   ```

## 🔌 Configuration

### Claude Desktop Configuration

Since the "Import Servers" feature requires a Claude Max plan, you need to manually edit Claude's configuration file:

1. Locate Claude Desktop's configuration directory:
   - **macOS**: `~/Library/Application Support/Claude`
   - **Windows**: `%APPDATA%\Claude`
   - **Linux**: `~/.config/Claude`

2. Create or edit the MCP servers configuration file:
   - Create a file called `mcp-servers.json` in the configuration directory
   - Add the following content (adjust paths to your environment):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "/absolute/path/to/mcp-compose-proxy-shim/bin/npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/phildougherty/Documents",
        "/Users/phildougherty/Downloads"
      ]
    },
    "memory": {
      "command": "/absolute/path/to/mcp-compose-proxy-shim/bin/npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-memory"
      ]
    }
  }
}
```

3. **Important**: Restart Claude Desktop after editing the configuration file.

## 🚀 Usage

### Set Up MCP-Compose First

1. First, make sure [MCP-Compose](https://github.com/phildougherty/mcp-compose) is installed and running:

   ```bash
   cd /path/to/mcp-compose
   ./mcp-compose up
   ./mcp-compose proxy
   ```

   This starts the MCP servers in Docker containers and the proxy on port 9876.

### Environment Variables

Before running Claude Desktop, set these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_PROXY_URL` | URL of the MCP-Compose proxy | `http://localhost:9876` |
| `MCP_API_KEY` | API key for authentication | `""` |
| `MCP_DEBUG` | Enable debug output | `false` |
| `MCP_LOG_LEVEL` | Log level (trace, debug, info, warn, error) | `info` |
| `MCP_CACHE` | Enable response caching | `true` |
| `MCP_CACHE_TTL_MS` | Cache TTL in milliseconds | `300000` (5 min) |
| `MCP_MAX_RETRIES` | Maximum retry attempts | `3` |
| `MCP_LOG_FILE` | Enable logging to file | `false` |

## 🔍 How It Works

1. The `bin/npx` script intercepts calls to MCP servers that Claude would normally make locally
2. Instead of running the actual server, it starts our `lib/mcp-shim.js` script
3. The shim communicates with Claude via stdin/stdout as expected
4. Behind the scenes, it forwards all requests to your MCP-Compose proxy
5. The proxy handles the actual communication with Docker containers
6. Results flow back through the proxy to the shim and then to Claude

## 📝 Logging

Logs are written to:
- Console (stderr) when `MCP_DEBUG=true`
- File at `/tmp/mcp-shim-[server].log` when `MCP_LOG_FILE=true`

## 🔒 Security Features

- Path sanitization to prevent directory traversal
- Rate limiting to prevent abuse
- Request size limiting
- Authentication via API keys
- Secure error handling

## 📚 Related Projects

- [MCP-Compose](https://github.com/phildougherty/mcp-compose): Docker orchestration for MCP servers
- [Model Context Protocol](https://modelcontextprotocol.ai): Official MCP documentation

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a pull request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
