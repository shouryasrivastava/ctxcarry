import fs from "node:fs";
import path from "node:path";
import { ctxcarryPath } from "./paths.js";
import { readState } from "./store.js";

interface JsonRpcRequest {
  id?: string | number;
  method?: string;
  params?: any;
}

export async function serveMcp(): Promise<void> {
  process.stdin.setEncoding("utf8");
  let buffer = "";
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) handleLine(line);
    }
  });
  process.stdin.on("end", () => {
    process.exit(0);
  });
}

function handleLine(line: string): void {
  try {
    const request = JSON.parse(line) as JsonRpcRequest;
    respond(request.id, dispatch(request));
  } catch (error) {
    respond(null, null, error instanceof Error ? error.message : String(error));
  }
}

function dispatch(request: JsonRpcRequest): any {
  if (request.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "ctxcarry", version: "0.3.0" },
      capabilities: { tools: {} }
    };
  }
  if (request.method === "tools/list") {
    return {
      tools: [
        { name: "get_current_task", description: "Return current ctxcarry task state.", inputSchema: { type: "object", properties: {} } },
        { name: "get_latest_ctxcarry", description: "Return latest ctxcarry markdown.", inputSchema: { type: "object", properties: { agent: { type: "string" } } } },
        { name: "get_relevant_session_events", description: "Return recent session events.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
        { name: "expand_session_artifact", description: "Read a raw archived session artifact.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
        { name: "summarize_latest_failure", description: "Return the latest active failure.", inputSchema: { type: "object", properties: {} } }
      ]
    };
  }
  if (request.method === "tools/call") {
    return callTool(request.params?.name, request.params?.arguments ?? {});
  }
  return {};
}

function callTool(name: string, args: any): any {
  const state = readState();
  if (name === "get_current_task") {
    return toolText(JSON.stringify(state.working, null, 2));
  }
  if (name === "get_latest_ctxcarry") {
    const agent = typeof args.agent === "string" ? args.agent : "codex";
    const file = ctxcarryPath("ctxcarrys", `${agent}.md`);
    return toolText(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "");
  }
  if (name === "get_relevant_session_events") {
    const limit = typeof args.limit === "number" ? args.limit : 20;
    const events = readJsonl(ctxcarryPath("events.jsonl")).slice(-limit);
    return toolText(JSON.stringify(events, null, 2));
  }
  if (name === "expand_session_artifact") {
    const requestedPath = String(args.path ?? "");
    const safeRoot = ctxcarryPath("sessions");
    const absolute = path.resolve(requestedPath);
    if (!absolute.startsWith(path.resolve(safeRoot))) {
      throw new Error("Artifact path must be inside .ctxcarry/sessions.");
    }
    return toolText(fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "");
  }
  if (name === "summarize_latest_failure") {
    return toolText(state.working.failures.at(-1)?.content ?? "No active failure recorded.");
  }
  throw new Error(`Unknown tool: ${name}`);
}

function readJsonl(file: string): any[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function toolText(text: string): any {
  return { content: [{ type: "text", text }] };
}

function respond(id: JsonRpcRequest["id"] | null | undefined, result: any, error?: string): void {
  process.stdout.write(`${JSON.stringify(error ? { jsonrpc: "2.0", id, error: { code: -32000, message: error } } : { jsonrpc: "2.0", id, result })}\n`);
}
