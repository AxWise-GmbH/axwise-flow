# Orqanix Mobile-to-Desktop Synchronization Protocol Specification
**Document Version:** 1.0.0  
**Status:** Approved  
**Target Clients:** Orqanix Desktop (macOS/Linux/Windows), Orqanix Companion (iOS/Android), Orqanix Cloud (`orqaly-v2-api-preview`)

---

## 1. Executive Summary & Core Principles

The Orqanix Synchronization Protocol enables seamless, real-time collaboration between desktop and mobile devices. Rather than relying on simple "last-write-wins" (which destroys message turns during offline editing or simultaneous prompting), Orqanix uses an **Append-Only Event Ledger with Vector Timestamps and Branch Divergence Tracking**.

### Core Guarantees:
1. **Zero Message Loss:** Concurrent turns never overwrite each other. Every submitted prompt and generated response is retained in a directed acyclic graph (DAG).
2. **Causal Consistency:** Events are causally ordered via vector clocks ($V_A \le V_B \iff \text{event } A \to \text{event } B$).
3. **Cryptographic Integrity:** Every event is hashed with SHA-256 over its canonical payload, parent IDs, and vector clock. Tampered or corrupted events are rejected on ingestion.
4. **Transport Flexibility:** REST for bulk catch-up and snapshot retrieval; WebSockets for low-latency live event streaming and approval relays.

---

## 2. Topology & Roles

```
  +------------------------+
  |    Orqanix Mobile      |
  |  (Companion / Client)  |
  +-----------+------------+
              |
         WSS / REST
              |
              v
  +------------------------+          WSS / REST          +------------------------+
  |     Orqanix Cloud      | <--------------------------> |    Orqanix Desktop     |
  |  (Coordinator / Relay) |                              |  (Host / Tool Engine)  |
  +------------------------+                              +------------------------+
```

* **Desktop Host:** Holds the local workspace, file system access, terminal execution, and MCP tools. Originates tool output events and full execution turns.
* **Mobile Companion:** Lightweight conversational client. Capable of drafting user messages, viewing active runs, and approving high-permission tool calls (Human-In-The-Loop) while on the move.
* **Cloud Coordinator:** Authenticated message relay and ledger cache. Holds encrypted snapshots and dispatches push notifications.

---

## 3. Data Structures & Schemas

### 3.1 Vector Clock
A map of client device identifiers to monotonic sequence integers:
```typescript
type VectorClock = Record<string, number>;
// Example: { "desktop-c918a2": 14, "mobile-fa081b": 3 }
```

### 3.2 Ledger Event Schema
```typescript
interface LedgerEvent<T = unknown> {
  id: string;               // UUID v4
  sessionId: string;        // Target session identifier
  deviceId: string;         // Emitting client ID (e.g., 'desktop-a1', 'mobile-b2')
  type: LedgerEventType;    // 'session_init' | 'message_append' | 'message_update' | 'turn_completed' | 'branch_fork'
  clock: VectorClock;       // State of knowledge at event emission
  parentIds: string[];      // Causal parents in the session DAG
  timestamp: number;        // Monotonic Unix epoch in milliseconds
  payload: T;               // Structured event data
  hash: string;             // Hex-encoded SHA-256 of canonical fields
}
```

---

## 4. Transport Protocols

### 4.1 REST API (State Catch-up & Snapshots)

#### `GET /api/v1/sessions/:id/sync`
Fetches all missing events since the client's current vector clock.

* **Request Headers:**
  * `Authorization: Bearer <account_token>`
  * `X-Orqanix-Device-Id: <client_device_id>`
* **Query Parameters:**
  * `since_clock`: JSON-encoded vector clock of the requesting client.
* **Response `200 OK`:**
  ```json
  {
    "sessionId": "sess-98213",
    "serverClock": { "desktop-a1": 12, "mobile-b2": 4 },
    "events": [
      {
        "id": "e93140-...",
        "type": "message_append",
        "clock": { "desktop-a1": 12, "mobile-b2": 3 },
        "parentIds": ["e93139-..."],
        "timestamp": 1727428500000,
        "payload": { "role": "assistant", "content": "Tests passed." },
        "hash": "8f9a2..."
      }
    ],
    "hasDivergences": false
  }
  ```

#### `POST /api/v1/sessions/:id/sync`
Uploads a batch of newly appended local events.

* **Request Body:**
  ```json
  {
    "deviceId": "mobile-b2",
    "events": [ /* LedgerEvent[] */ ]
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "status": "merged",
    "addedCount": 2,
    "divergences": []
  }
  ```

---

### 4.2 WebSocket Protocol (Real-Time Duplex Relay)

* **Endpoint:** `wss://<cloud-host>/ws/sync?session=<sessionId>`
* **Subprotocol:** `orqanix-sync-v1`

#### Connection Handshake
1. Client connects with authentication token.
2. Client sends `client.hello`:
   ```json
   {
     "op": "client.hello",
     "deviceId": "mobile-b2",
     "sessionId": "sess-98213",
     "clock": { "desktop-a1": 10, "mobile-b2": 2 }
   }
   ```
3. Server responds with `server.hello` and streams all events where server clock > client clock.
4. Channel is established in duplex streaming mode.

#### WebSocket Message Types
| Opcode | Direction | Description |
| :--- | :--- | :--- |
| `event.append` | Client $\to$ Server $\to$ Peer | Broadcasts a newly signed ledger event |
| `event.ack` | Server $\to$ Client | Confirms receipt and persistence of event |
| `divergence.alert` | Server $\to$ Both | Notifies both clients of concurrent turn creation |
| `approval.request` | Desktop $\to$ Mobile | Relays a tool execution approval request (e.g. bash command) |
| `approval.reply` | Mobile $\to$ Desktop | User's decision (Approve / Reject) |
| `ping` / `pong` | Bidirectional | Connection heartbeat (30-second interval) |

---

## 5. Conflict Resolution & Branch Divergence

When two devices emit events concurrently ($V_A \parallel V_B$):
1. **Detection:**
   The merge engine identifies two child events sharing a common parent where neither clock dominates the other:
   ```
             [Event 1: User prompt]
                 /            \
     [Event 2: Desktop Turn]  [Event 3: Mobile Turn]   <-- CONCURRENT!
   ```
2. **Preservation:**
   Both branches remain active in the DAG. No data is pruned or overwritten.
3. **Linearization & Rendering:**
   * **Default Linear View:** The UI sorts events topologically, breaking ties using `(timestamp ASC, deviceId ASC, id ASC)`.
   * **Branch Explorer:** When divergences exist, the UI renders a branch pill indicator (e.g., `Branch 1: Desktop`, `Branch 2: Mobile`) allowing the user to inspect or switch conversation trajectories without losing either context.

---

## 6. Implementation Reference
The reference implementation is provided in:
- `ui/desktop/src/orqaly/sync/vectorClock.ts`
- `ui/desktop/src/orqaly/sync/eventLedger.ts`
- `ui/desktop/src/orqaly/sync/syncManager.ts`
- `ui/desktop/src/orqaly/sync/__tests__/eventLedger.test.ts`
