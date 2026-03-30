# reversesandbox-mcp

MCP server for [ReverseSandbox](https://www.reversesandbox.com) — pay for x402 services without managing crypto wallets.

ReverseSandbox lets AI agents pay for x402 pay-per-use API services (web search, scraping, screenshots) using a simple API key and USD balance. No wallets, no tokens, no bridging — just fund your account and your agent can pay for any x402-enabled service automatically.

## Quick Start

1. **Get an API key** at [reversesandbox.com/dashboard](https://app.reversesandbox.com/dashboard)
2. **Add funds** to your account balance
3. **Configure the MCP** in your AI client (see below)

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "reversesandbox": {
      "command": "npx",
      "args": ["-y", "@reverse_sandbox/mcp"],
      "env": {
        "RS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add reversesandbox -- npx -y @reverse_sandbox/mcp
```

Then set your API key as an environment variable:

```bash
export RS_API_KEY="your-api-key-here"
```

### OpenClaw

```json
{
  "mcpServers": {
    "reversesandbox": {
      "command": "npx",
      "args": ["-y", "@reverse_sandbox/mcp"],
      "env": {
        "RS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Available Tools

### `pay`

Sign an x402 payment to access a pay-per-use API service. Call this when you receive a 402 Payment Required response. Returns a payment header to include in your retry request.

**Parameters:**
- `to` (string, required) — Recipient address (0x-prefixed Ethereum address from the 402 response)
- `amount` (string, required) — Payment amount in USD (e.g. "0.002", from the 402 response)
- `network` (string, optional, default: "base") — Network name (base, polygon, arbitrum)

### `get_balance`

Check your remaining ReverseSandbox balance.

### `get_usage`

View recent payment history showing services used, amounts paid, and timestamps.

**Parameters:**
- `limit` (number, optional, default: 20) — Number of records to return

## Example Workflow

Here's how an agent uses ReverseSandbox to pay for an x402-protected search service:

1. **Agent makes a request** to an x402-enabled search API:
   ```
   GET https://api.example.com/search?q=latest+AI+news
   ```

2. **Service returns 402 Payment Required** with payment details:
   ```json
   {
     "payTo": "0xabc...123",
     "maxAmountRequired": "0.002",
     "network": "base"
   }
   ```

3. **Agent calls the `pay` tool** with the details from the 402 response:
   ```json
   {
     "to": "0xabc...123",
     "amount": "0.002",
     "network": "base"
   }
   ```

4. **Tool returns a payment header:**
   ```
   Payment signed successfully.
   Cost: $0.002
   Remaining balance: $9.998

   To complete your request, retry it with this header:
   X-PAYMENT: eyJhbGciOi...
   ```

5. **Agent retries the request** with the payment header:
   ```
   GET https://api.example.com/search?q=latest+AI+news
   X-PAYMENT: eyJhbGciOi...
   ```

6. **Service validates payment and returns results.**

## Pricing

| Service      | Cost per request |
|--------------|-----------------|
| Web Search   | $0.002          |
| Web Scrape   | $0.005          |
| Screenshot   | $0.002          |

## Environment Variables

| Variable      | Required | Default                          | Description          |
|---------------|----------|----------------------------------|----------------------|
| `RS_API_KEY`  | Yes      | —                                | Your API key         |
| `RS_API_URL`  | No       | `https://www.reversesandbox.com` | API base URL         |

## License

MIT
