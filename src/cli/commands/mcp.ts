import { startMcpServer } from "../../mcp/server.js";

export async function mcpCommand(): Promise<void> {
  try {
    await startMcpServer();
  } catch (error) {
    process.stderr.write(
      `AgentFence MCP server failed to start: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    );
    process.exit(1);
  }
}
