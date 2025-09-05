import WebSocket from 'ws';

interface WebSocketMessage {
  type: string;
  data: any;
}

export function websocketHandler(ws: WebSocket) {
  console.log('New WebSocket connection established');

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    data: {
      message: 'Connected to Managed Funds WebSocket',
      timestamp: new Date().toISOString(),
    },
  }));

  // Handle incoming messages
  ws.on('message', (data: Buffer) => {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          handleSubscription(ws, message.data);
          break;
        case 'unsubscribe':
          handleUnsubscription(ws, message.data);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', data: { timestamp: new Date().toISOString() } }));
          break;
        default:
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Unknown message type' },
          }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Invalid message format' },
      }));
    }
  });

  // Handle connection close
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
}

function handleSubscription(ws: WebSocket, data: any) {
  const { channel } = data;
  
  // Store subscription info (in production, use Redis or similar)
  (ws as any).subscriptions = (ws as any).subscriptions || new Set();
  (ws as any).subscriptions.add(channel);
  
  ws.send(JSON.stringify({
    type: 'subscribed',
    data: { channel },
  }));
  
  console.log(`Client subscribed to channel: ${channel}`);
}

function handleUnsubscription(ws: WebSocket, data: any) {
  const { channel } = data;
  
  if ((ws as any).subscriptions) {
    (ws as any).subscriptions.delete(channel);
  }
  
  ws.send(JSON.stringify({
    type: 'unsubscribed',
    data: { channel },
  }));
  
  console.log(`Client unsubscribed from channel: ${channel}`);
}

// Broadcast function for sending updates to subscribed clients
export function broadcast(wss: WebSocket.Server, channel: string, data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const subscriptions = (client as any).subscriptions;
      if (subscriptions && subscriptions.has(channel)) {
        client.send(JSON.stringify({
          type: 'update',
          channel,
          data,
          timestamp: new Date().toISOString(),
        }));
      }
    }
  });
}
