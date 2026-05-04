export type Transport = "stdio" | "http";

export interface RunConfig {
  transport: Transport;
  host: string;
  port: number;
}

export const DEFAULT_CONFIG: RunConfig = {
  transport: "stdio",
  host: "127.0.0.1",
  port: 4173,
};

export const HELP_TEXT =
  `twinery-mcp-poc [OPTIONS]\n` +
  `\n` +
  `Options:\n` +
  `  --transport <stdio|http>   Transport mode. Default: stdio.\n` +
  `  --host <string>            HTTP bind host. Default: 127.0.0.1.\n` +
  `                             Only used when --transport http.\n` +
  `  --port <number>            HTTP bind port. Default: 4173. Use 0 for\n` +
  `                             OS-assigned. Only used when --transport http.\n` +
  `  --help                     Print this help text and exit 0.\n` +
  `\n` +
  `Exit codes:\n` +
  `  0   Server stopped cleanly.\n` +
  `  1   Server crashed (uncaught exception or HTTP listen error).\n` +
  `  2   Invalid CLI args.\n`;

export class CliError extends Error {
  readonly stderrMessage: string;
  readonly includeHelp: boolean;
  constructor(stderrMessage: string, opts: { includeHelp?: boolean } = {}) {
    super(stderrMessage);
    this.stderrMessage = stderrMessage;
    this.includeHelp = opts.includeHelp ?? false;
  }
}

export class HelpRequested extends Error {
  constructor() {
    super("help");
  }
}

function requireValue(flag: string, value: string | undefined): string {
  if (value === undefined) {
    if (flag === "--host") {
      throw new CliError("[twinery-mcp-poc] --host requires a value");
    }
    if (flag === "--transport") {
      throw new CliError("[twinery-mcp-poc] --transport must be 'stdio' or 'http' (got '')");
    }
    if (flag === "--port") {
      throw new CliError("[twinery-mcp-poc] --port must be an integer 0–65535 (got '')");
    }
    throw new CliError(`[twinery-mcp-poc] ${flag} requires a value`);
  }
  return value;
}

function parseTransport(raw: string): Transport {
  if (raw === "stdio" || raw === "http") return raw;
  throw new CliError(`[twinery-mcp-poc] --transport must be 'stdio' or 'http' (got '${raw}')`);
}

function parsePort(raw: string): number {
  if (!/^-?\d+$/.test(raw)) {
    throw new CliError(`[twinery-mcp-poc] --port must be an integer 0–65535 (got '${raw}')`);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new CliError(`[twinery-mcp-poc] --port must be an integer 0–65535 (got '${raw}')`);
  }
  return n;
}

function parseHost(raw: string): string {
  if (raw.length === 0) {
    throw new CliError("[twinery-mcp-poc] --host requires a value");
  }
  return raw;
}

export function parseArgs(argv: string[]): RunConfig {
  const cfg: RunConfig = { ...DEFAULT_CONFIG };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      throw new HelpRequested();
    } else if (arg === "--transport") {
      cfg.transport = parseTransport(requireValue("--transport", argv[i + 1]));
      i += 2;
    } else if (arg.startsWith("--transport=")) {
      cfg.transport = parseTransport(arg.slice("--transport=".length));
      i += 1;
    } else if (arg === "--port") {
      cfg.port = parsePort(requireValue("--port", argv[i + 1]));
      i += 2;
    } else if (arg.startsWith("--port=")) {
      cfg.port = parsePort(arg.slice("--port=".length));
      i += 1;
    } else if (arg === "--host") {
      cfg.host = parseHost(requireValue("--host", argv[i + 1]));
      i += 2;
    } else if (arg.startsWith("--host=")) {
      cfg.host = parseHost(arg.slice("--host=".length));
      i += 1;
    } else {
      throw new CliError(`[twinery-mcp-poc] unknown flag: ${arg}`, { includeHelp: true });
    }
  }
  return cfg;
}
