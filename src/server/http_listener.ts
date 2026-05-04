import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

export interface HttpHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

const MCP_PATH = "/mcp";

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) return undefined;
  return JSON.parse(raw);
}

function writeJsonRpcError(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

export async function startHttpServer(
  buildServer: () => Promise<McpServer>,
  cfg: { host: string; port: number },
): Promise<HttpHandle> {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${cfg.host}:${cfg.port}`}`);
      if (url.pathname !== MCP_PATH) {
        res.statusCode = 404;
        res.setHeader("content-type", "text/plain");
        res.end(`Not found. MCP endpoint is ${MCP_PATH}.\n`);
        return;
      }

      const sessionId = req.headers["mcp-session-id"];
      const sessionIdStr = typeof sessionId === "string" ? sessionId : Array.isArray(sessionId) ? sessionId[0] : undefined;

      if (req.method === "POST") {
        const body = await readJsonBody(req);

        let transport: StreamableHTTPServerTransport;
        if (sessionIdStr !== undefined && transports.has(sessionIdStr)) {
          transport = transports.get(sessionIdStr)!;
        } else if (sessionIdStr === undefined && isInitializeRequest(body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid: string) => {
              transports.set(sid, transport);
            },
          });
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid !== undefined) transports.delete(sid);
          };
          const mcpServer = await buildServer();
          await mcpServer.connect(transport);
        } else if (sessionIdStr !== undefined) {
          // Session id provided but unknown to this process (typical after a
          // server restart). Spec-canonical signal: 404 Not Found. Well-behaved
          // clients should drop the stale session and reinitialize.
          writeJsonRpcError(res, 404, "Session not found; reinitialize");
          return;
        } else {
          writeJsonRpcError(res, 400, "Bad Request: missing session id and body is not an initialize request");
          return;
        }

        await transport.handleRequest(req, res, body);
        return;
      }

      // GET (SSE stream) or DELETE (terminate session) — both require an existing session.
      if (sessionIdStr !== undefined && transports.has(sessionIdStr)) {
        await transports.get(sessionIdStr)!.handleRequest(req, res);
        return;
      }
      if (sessionIdStr !== undefined) {
        writeJsonRpcError(res, 404, "Session not found; reinitialize");
        return;
      }
      writeJsonRpcError(res, 400, "Bad Request: missing session id");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[twinery-mcp-poc] http request error: ${message}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain");
        res.end("Internal server error\n");
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      httpServer.removeListener("error", onError);
      if (err.code === "EADDRINUSE") {
        console.error(
          `[twinery-mcp-poc] port ${cfg.port} is already in use. Pass --port to choose another port.`,
        );
        process.exit(1);
      }
      reject(err);
    };
    httpServer.once("error", onError);
    httpServer.listen(cfg.port, cfg.host, () => {
      httpServer.removeListener("error", onError);
      resolve();
    });
  });

  const address = httpServer.address() as AddressInfo | null;
  const resolvedPort = address?.port ?? cfg.port;
  const url = `http://${cfg.host}:${resolvedPort}${MCP_PATH}`;

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await Promise.allSettled(Array.from(transports.values()).map((t) => t.close()));
    transports.clear();
  };

  return { url, port: resolvedPort, close };
}
