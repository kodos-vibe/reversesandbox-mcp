#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const RS_API_KEY = process.env.RS_API_KEY;
const RS_API_URL = (process.env.RS_API_URL || "https://www.reversesandbox.com").replace(/\/$/, "");

function checkApiKey() {
  if (!RS_API_KEY) {
    throw new Error(
      "RS_API_KEY environment variable is not set. Get your API key from https://www.reversesandbox.com/dashboard"
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
        "Insufficient balance. Add funds at https://www.reversesandbox.com/dashboard"
      );
    }
    throw new Error(`API error ${res.status}: ${text || res.statusText}`);
  }

  return res.json();
}

const server = new McpServer({
  name: "reversesandbox",
  version: "0.1.0",
});

server.tool(
  "pay",
  "Sign an x402 payment to access a pay-per-use API service. Call this when you receive a 402 Payment Required response. Extract the payment recipient (payTo/address), amount (maxAmountRequired), and network from the 402 response body, then call this tool. Returns a payment header to include in your retry request.",
  {
    to: z.string().describe("Recipient address (0x-prefixed Ethereum address, from the 402 response)"),
    amount: z.string().describe('Payment amount in USD (e.g. "0.002", from the 402 response)'),
    network: z.string().optional().default("base").describe("Network name (base, polygon, arbitrum)"),
  },
  async ({ to, amount, network }) => {
    try {
      const data = await apiRequest("POST", "/api/pay", { to, amount, network });
      const cost = data.cost ?? amount;
      const balance = data.balance ?? "unknown";
      const header = data.header;

      return {
        content: [
          {
            type: "text",
            text: `Payment signed successfully.\nCost: $${cost}\nRemaining balance: $${balance}\n\nTo complete your request, retry it with this header:\nX-PAYMENT: ${header}\n\nExample:\ncurl -H 'X-PAYMENT: ${header}' <original-url>`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  }
);

server.tool(
  "get_balance",
  "Check your remaining ReverseSandbox balance. Returns the available balance for paying x402 services.",
  {},
  async () => {
    try {
      const data = await apiRequest("GET", "/api/balance");
      const balance = data.balance ?? data.amount ?? "unknown";
      return { content: [{ type: "text", text: `Balance: $${balance}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  }
);

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
        const date = new Date(r.timestamp ?? r.date ?? r.created_at).toISOString().replace("T", " ").slice(0, 19);
        const service = (r.service ?? r.description ?? r.url ?? "unknown").slice(0, 32).padEnd(32);
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
