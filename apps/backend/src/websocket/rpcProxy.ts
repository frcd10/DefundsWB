import WebSocket from 'ws';

// Simple transparent WebSocket proxy: browser <-> backend <-> private RPC WSS
// Configure BACKEND_SOLANA_WS_URL to your provider's WSS endpoint (e.g., wss://rpc.helius.xyz/?api-key=...)
export function rpcProxyHandler(clientWs: WebSocket) {
  const upstreamUrl = process.env.BACKEND_SOLANA_WS_URL;
  if (!upstreamUrl) {
    console.error('BACKEND_SOLANA_WS_URL not set; closing RPC WS proxy connection');
    clientWs.close(1011, 'RPC WS proxy not configured');
    return;
  }

  const upstream = new WebSocket(upstreamUrl);

  // When upstream opens, start piping messages
  upstream.on('open', () => {
    // Forward client -> upstream
    clientWs.on('message', (data) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data);
      }
    });

    clientWs.on('close', () => {
      try { upstream.close(); } catch {}
    });

    clientWs.on('error', (err) => {
      console.error('[WS proxy] client error', err);
      try { upstream.close(); } catch {}
    });
  });

  // Forward upstream -> client
  upstream.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  upstream.on('close', (code, reason) => {
    try { clientWs.close(code, reason.toString()); } catch {}
  });

  upstream.on('error', (err) => {
    console.error('[WS proxy] upstream error', err);
    try { clientWs.close(1011, 'Upstream error'); } catch {}
  });
}
