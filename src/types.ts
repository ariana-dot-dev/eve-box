export interface BoxInfo {
  id: string;
  state: "provisioning" | "provisioned" | "cloning" | "ready" | "idle" | "running" | "archiving" | "archived" | "error" | string;
  name?: string;
  archiveAfter?: string | null;
  url?: string;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Box is used purely as a runtime/substrate: create/resume/stop boxes and run
 * commands + read/write files inside them. The adapter never calls Box's
 * built-in prompt/agent endpoint; Eve actions are mapped to commands and files.
 */
export interface BoxClient {
  create(input: { name?: string; ttlSeconds?: number | null }): Promise<BoxInfo>;
  list?(): Promise<BoxInfo[]>;
  get(boxId: string): Promise<BoxInfo>;
  update(boxId: string, input: { name?: string; ttlSeconds?: number | null }): Promise<BoxInfo>;
  stop(boxId: string): Promise<BoxInfo | { ok: boolean }>;
  resume(boxId: string): Promise<BoxInfo | { ok: boolean }>;
  command(boxId: string, input: { command: string; cwd?: string; timeoutMs?: number; env?: Record<string, string> }): Promise<CommandResult>;
  readFile(boxId: string, path: string): Promise<string>;
  writeFile(boxId: string, path: string, content: string): Promise<void>;
  readFileBinary?(boxId: string, path: string): Promise<Uint8Array | null>;
  writeFileBinary?(boxId: string, path: string, content: Uint8Array): Promise<void>;
}
