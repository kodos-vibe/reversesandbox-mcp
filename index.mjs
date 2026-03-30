#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const RS_API_KEY = process.env.RS_API_KEY;
const RS_API_URL = (process.env.RS_API_URL || "https://app.reversesandbox.com").replace(/\/$/, "");

function checkApiKey() {
  if (!RS_API_KEY) {
    throw new Error(
      "RS_API_KEY environment variable is not set. Get your API key from https://app.reversesandbox.com/dashboard"
    );
  }
}

async function apiRequest(method, path, body) {
  checkApiKey();

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${RS_API_KEY}`,
      "Content-Type": "application/json",
    },
  };
  if (body) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${RS_API_URL}${path}`, opts);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 402) {
      throw new Error(
        "Insufficient balance. Add funds at https://app.reversesandbox.com/dashboard"
      );
    }
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

/**
 * Parse a 402 response to extract payment requirements.
 * The x402 protocol puts requirements in the `payment-required` header (base64 JSON).
 */
function parse402Requirements(headers) {
  const raw = headers?.get?.("payment-required");
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString());
  } catch {
    return null;
  }
}

const server = new McpServer({
  name: "reversesandbox",
  version: "0.2.0",
});

// ── pay ──────────────────────────────────────────────────────────────

server.tool(
  "pay",
  `Sign an x402 USDC payment and get a ready-to-use payment header.

WHEN TO USE: When you get a 402 Payment Required response from an x402-enabled API.

HOW TO GET THE PARAMETERS:
1. The 402 response has a "payment-required" header (base64-encoded JSON)
2. Decode it to find the "accepts" array — each entry has: payTo, amount, network, asset
3. Pick the entry matching your preferred network (polygon is recommended)
4. Pass: to = payTo, amount = the USD equivalent (amount in raw units ÷ 1e6 for USDC), network = chain name

AFTER CALLING: Retry your original request with the header:
  PAYMENT-SIGNATURE: <the payment_header value returned>

IMPORTANT:
- Header name is PAYMENT-SIGNATURE (not X-PAYMENT)
- Use the public URL for services (e.g. https://search.reversesandbox.com/web/search?q=...)
- Do NOT use localhost URLs — services are remote`,
  {
    to: z.string().describe("Recipient address (0x-prefixed, from the 402 accepts[].payTo)"),
    amount: z.string().describe('Payment amount in USD (e.g. "0.002"). For USDC: raw amount ÷ 1000000'),
    network: z.string().optional().default("polygon").describe("Chain: polygon (recommended), base, or arbitrum"),
  },
  async ({ to, amount, network }) => {
    try {
      const data = await apiRequest("POST", "/api/pay", { to, amount, network });
      const cost = data.cost_usd ?? amount;
      const balance = data.remaining_balance ?? "unknown";
      const header = data.payment_header;

      return {
        content: [
          {
            type: "text",
            text: [
              "Payment signed successfully.",
              `Cost: ${cost}`,
              `Remaining balance: ${balance}`,
              "",
              "Retry your original request with this header:",
              `PAYMENT-SIGNATURE: ${header}`,
              "",
              "Example with curl:",
              `curl -H 'PAYMENT-SIGNATURE: ${header}' <original-url>`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  }
);

// ── get_balance ──────────────────────────────────────────────────────

server.tool(
  "get_balance",
  "Check your remaining ReverseSandbox USD balance for paying x402 services.",
  {},
  async () => {
    try {
      const data = await apiRequest("GET", "/api/balance");
      const balance = data.balance ?? data.amount ?? "unknown";
      return { content: [{ type: "text", text: `Balance: ${balance}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  }
);

// ── get_usage ────────────────────────────────────────────────────────

server.tool(
  "get_usage",
  "View recent payment history showing services used, amounts paid, and timestamps.",
  {
    limit: z.number().optional().default(20).describe("Number of records to return"),
  },
  async ({ limit }) => {
    try {
      const data = await apiRequest("GET", `/api/usage?limit=${limit}`);
      const records = data.records ?? data.usage ?? data;

      if (!Array.isArray(records) || records.length === 0) {
        return { content: [{ type: "text", text: "No usage records found." }] };
      }

      const header = "Date                 | Service                          | Amount";
      const sep = "---------------------|----------------------------------|--------";
      const rows = records.map((r) => {
        const date = new Date(r.timestamp ?? r.date ?? r.created_at)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);
        const service = (r.service ?? r.description ?? r.url ?? "unknown")
          .slice(0, 32)
          .padEnd(32);
        const amount = `$${r.amount ?? r.cost ?? "?"}`;
        return `${date}  | ${service} | ${amount}`;
      });

      return {
        content: [{ type: "text", text: [header, sep, ...rows].join("\n") }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
