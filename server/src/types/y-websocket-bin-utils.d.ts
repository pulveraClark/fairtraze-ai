declare module "y-websocket/bin/utils" {
  import type { IncomingMessage } from "http";
  import type WebSocket from "ws";
  import type * as Y from "yjs";

  export interface YjsPersistence {
    bindState(docName: string, ydoc: Y.Doc): Promise<void> | void;
    writeState(docName: string, ydoc: Y.Doc): Promise<void> | void;
  }

  export function setPersistence(persistence: YjsPersistence | null): void;
  export function getPersistence(): YjsPersistence | null;
  export function getYDoc(docName: string, gc?: boolean): Y.Doc;
  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    opts?: { docName?: string; gc?: boolean }
  ): void;
  export const docs: Map<string, Y.Doc>;
}
