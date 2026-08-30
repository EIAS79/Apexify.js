import type { ApexifyRuntime } from "../runtime/context";
import { RemoteFetchClient } from "./remote-fetch";

// Service association, not a data cache: WeakMap prevents runtime retention and centralizes concurrency.
const clients = new WeakMap<ApexifyRuntime, RemoteFetchClient>();

export function getRemoteFetchClient(runtime: ApexifyRuntime): RemoteFetchClient {
  const existing = clients.get(runtime);
  if (existing) return existing;
  const created = new RemoteFetchClient(runtime);
  clients.set(runtime, created);
  return created;
}
