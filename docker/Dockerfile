FROM node:20-bookworm

# Install networking tools for firewall support
RUN apt-get update && \
    apt-get install -y --no-install-recommends iptables iproute2 && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Set up MCP server
COPY src/server/mcp/server.ts src/server/mcp/tools.ts /opt/friendlist-mcp/
RUN npm install -g tsx

# Create non-root user
RUN useradd -m -s /bin/bash claude && \
    mkdir -p /workspace && \
    chown claude:claude /workspace

# Copy entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_OPTIONS="--max-old-space-size=4096"

WORKDIR /workspace

ENTRYPOINT ["/entrypoint.sh"]
