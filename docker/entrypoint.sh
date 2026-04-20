#!/bin/bash
set -e

# Apply firewall rules if enabled
if [ "$FRIENDLIST_FIREWALL" = "true" ]; then
  # Default deny outbound
  iptables -P OUTPUT DROP

  # Allow loopback
  iptables -A OUTPUT -o lo -j ACCEPT

  # Allow established connections
  iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

  # Allow DNS
  iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

  # Allow host.docker.internal (for MCP -> friendlist server)
  if getent hosts host.docker.internal > /dev/null 2>&1; then
    HOST_IP=$(getent hosts host.docker.internal | awk '{print $1}')
    iptables -A OUTPUT -d "$HOST_IP" -j ACCEPT
  fi

  # Allow configured hosts
  IFS=',' read -ra HOSTS <<< "$FRIENDLIST_ALLOWED_HOSTS"
  for host in "${HOSTS[@]}"; do
    host=$(echo "$host" | xargs)  # trim whitespace
    if [ -n "$host" ]; then
      # Resolve and allow each host
      iptables -A OUTPUT -d "$host" -p tcp --dport 443 -j ACCEPT
      iptables -A OUTPUT -d "$host" -p tcp --dport 80 -j ACCEPT
    fi
  done

  echo "Firewall rules applied (default-deny with allowlist)"
fi

# Drop to claude user and exec the command
exec su -s /bin/bash claude -c "$*"
