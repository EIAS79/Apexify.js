import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { ApexifyRuntime, currentApexifyRuntime, defaultApexifyRuntime } from "../lib-next/runtime/context";
import { BoundedCache, resolveCacheOptions } from "../lib-next/runtime/cache";
import { resolveRenderLimits, assertCanvasWithinLimits } from "../lib-next/runtime/limits";
import {
  ApexifyRemoteFetchError,
  ApexifyResourceLimitError,
} from "../lib-next/runtime/errors";
import {
  classifyIpAddress,
  redactUrl,
  resolveNetworkTarget,
  type DnsLookup,
} from "../lib-next/media/network-policy";
import { RemoteFetchClient } from "../lib-next/media/remote-fetch";

function assertRejectedReason(reason: string) {
  return (error: unknown): boolean =>
    error instanceof ApexifyRemoteFetchError && error.details?.reason === reason;
}

async function testIpPolicy(): Promise<void> {
  const cases: Array<[string, ReturnType<typeof classifyIpAddress>]> = [
    ["0.0.0.0", "unspecified"],
    ["10.1.2.3", "private"],
    ["100.64.0.1", "carrier-grade-nat"],
    ["127.0.0.1", "loopback"],
    ["169.254.1.1", "link-local"],
    ["172.16.0.1", "private"],
    ["192.168.1.1", "private"],
    ["192.0.2.1", "documentation"],
    ["198.51.100.1", "documentation"],
    ["203.0.113.1", "documentation"],
    ["224.0.0.1", "multicast"],
    ["240.0.0.1", "reserved"],
    ["8.8.8.8", "public"],
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["fc00::1", "private"],
    ["fe80::1", "link-local"],
    ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
    ["::ffff:127.0.0.1", "loopback"],
    ["2606:4700:4700::1111", "public"],
  ];
  for (const [address, expected] of cases) {
    assert.equal(classifyIpAddress(address), expected, `${address} classification`);
  }

  const safe = new ApexifyRuntime().config.network;
  await assert.rejects(resolveNetworkTarget("ftp://example.com/file", safe), assertRejectedReason("PROTOCOL_BLOCKED"));
  await assert.rejects(resolveNetworkTarget("http://localhost/file", safe), assertRejectedReason("LOCALHOST_BLOCKED"));
  await assert.rejects(resolveNetworkTarget("http://127.0.0.1/file", safe), assertRejectedReason("IP_BLOCKED"));
  await assert.rejects(resolveNetworkTarget("http://[::1]/file", safe), assertRejectedReason("IP_BLOCKED"));

  const mixedLookup: DnsLookup = async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ];
  await assert.rejects(
    resolveNetworkTarget("http://mixed.test/file", safe, mixedLookup),
    assertRejectedReason("IP_BLOCKED")
  );

  const trusted = new ApexifyRuntime({ network: { trustedHosts: ["trusted.test"] } }).config.network;
  const loopbackLookup: DnsLookup = async () => [{ address: "127.0.0.1", family: 4 }];
  const target = await resolveNetworkTarget("http://trusted.test/file", trusted, loopbackLookup);
  assert.equal(target.address, "127.0.0.1");
  assert.equal(target.trusted, true);

  const optIn = new ApexifyRuntime({ network: { allowPrivateNetwork: true } }).config.network;
  const privateTarget = await resolveNetworkTarget("http://127.0.0.1/file", optIn);
  assert.equal(privateTarget.trusted, true);

  const redacted = redactUrl("https://user:pass@example.com/private/path?token=secret#fragment");
  assert.equal(redacted, "https://example.com/<redacted>");
  assert(!redacted.includes("user"));
  assert(!redacted.includes("secret"));
  assert(!redacted.includes("private/path"));
}

async function testCache(): Promise<void> {
  const cache = new BoundedCache<string, string>(
    resolveCacheOptions({ enabled: true, maxEntries: 2, maxBytes: 4, ttlMs: 30 }),
    (value) => Buffer.byteLength(value)
  );
  assert.equal(cache.set("a", "aa"), true);
  assert.equal(cache.set("b", "bb"), true);
  assert.equal(cache.get("a"), "aa");
  assert.equal(cache.set("c", "cc"), true);
  assert.equal(cache.get("b"), undefined, "least-recently-used entry must be evicted");
  assert.equal(cache.get("a"), "aa");
  assert.equal(cache.get("c"), "cc");
  assert.equal(cache.set("huge", "12345"), false, "single value larger than maxBytes must not be cached");

  await delay(35);
  assert.equal(cache.get("a"), undefined, "TTL expiry must evict entries");
  assert.equal(cache.get("c"), undefined, "TTL expiry must evict entries");
  assert(cache.stats().expirations >= 2);

  let attempts = 0;
  await assert.rejects(cache.getOrCreate("failure", async () => {
    attempts += 1;
    throw new Error("expected failure");
  }));
  const recovered = await cache.getOrCreate("failure", async () => {
    attempts += 1;
    return "ok";
  });
  assert.equal(recovered, "ok");
  assert.equal(attempts, 2, "failed factory result must never poison cache");
  assert.equal(cache.stats().failures, 1);

  cache.setEnabled(false);
  assert.equal(cache.stats().entries, 0, "disabling cache clears resident entries");
  assert.equal(cache.set("disabled", "x"), false);
  assert.equal(cache.get("disabled"), undefined);
  assert.equal(cache.stats().enabled, false);

  cache.setEnabled(true);
  cache.set("clear", "x");
  cache.clear();
  assert.equal(cache.stats().entries, 0);
}

async function testRuntimeInheritanceAndLimits(): Promise<void> {
  const runtime = new ApexifyRuntime({
    limits: { maxCanvasDimension: 100, maxTotalPixels: 5_000 },
    cache: { maxEntries: 4, maxBytes: 1024, ttlMs: 1000 },
  });
  assert.notEqual(runtime, defaultApexifyRuntime);
  assert.equal(currentApexifyRuntime(), defaultApexifyRuntime);

  await runtime.run(async () => {
    assert.equal(currentApexifyRuntime(), runtime);
    await delay(0);
    assert.equal(currentApexifyRuntime(), runtime, "runtime must survive async boundaries");
  });
  assert.equal(currentApexifyRuntime(), defaultApexifyRuntime);

  assert.doesNotThrow(() => assertCanvasWithinLimits(50, 50, runtime.config.limits, "test"));
  assert.throws(
    () => assertCanvasWithinLimits(101, 10, runtime.config.limits, "test"),
    ApexifyResourceLimitError
  );
  assert.throws(
    () => assertCanvasWithinLimits(100, 100, runtime.config.limits, "test"),
    ApexifyResourceLimitError
  );

  const inherited = resolveRenderLimits({ maxRemoteImageBytes: 1234 });
  assert.equal(inherited.maxRemoteImageBytes, 1234);
  assert(inherited.maxRemoteVideoBytes > inherited.maxRemoteImageBytes, "unspecified defaults must be inherited");
}

async function startServer(): Promise<{
  server: http.Server;
  port: number;
  state: { retry: number; jitter: number; active: number; maxActive: number };
}> {
  const state = { retry: 0, jitter: 0, active: 0, maxActive: 0 };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://test.local");
    if (url.pathname === "/ok") {
      response.statusCode = 200;
      response.end("ok");
      return;
    }
    if (url.pathname === "/large-header") {
      response.statusCode = 200;
      response.setHeader("content-length", "1000");
      response.end("x".repeat(1000));
      return;
    }
    if (url.pathname === "/large-chunked") {
      response.statusCode = 200;
      response.write("12345");
      response.end("67890");
      return;
    }
    if (url.pathname === "/slow") {
      await delay(80);
      if (!response.destroyed) {
        response.statusCode = 200;
        response.end("slow");
      }
      return;
    }
    if (url.pathname === "/retry") {
      state.retry += 1;
      if (state.retry === 1) {
        response.statusCode = 503;
        response.setHeader("retry-after", "0");
        response.end("retry");
        return;
      }
      response.statusCode = 200;
      response.end("retried");
      return;
    }
    if (url.pathname === "/jitter") {
      state.jitter += 1;
      if (state.jitter === 1) {
        response.statusCode = 503;
        response.end("retry");
        return;
      }
      response.statusCode = 200;
      response.end("jittered");
      return;
    }
    if (url.pathname === "/redirect-blocked") {
      const address = server.address();
      assert(address && typeof address === "object");
      response.statusCode = 302;
      response.setHeader("location", `http://blocked.test:${address.port}/ok`);
      response.end();
      return;
    }
    if (url.pathname === "/redirect-one") {
      response.statusCode = 302;
      response.setHeader("location", "/redirect-two");
      response.end();
      return;
    }
    if (url.pathname === "/redirect-two") {
      response.statusCode = 302;
      response.setHeader("location", "/ok");
      response.end();
      return;
    }
    if (url.pathname === "/concurrency") {
      state.active += 1;
      state.maxActive = Math.max(state.maxActive, state.active);
      try {
        await delay(25);
        response.statusCode = 200;
        response.end("concurrency");
      } finally {
        state.active -= 1;
      }
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  return { server, port: address.port, state };
}

async function testRemoteFetch(): Promise<void> {
  const { server, port, state } = await startServer();
  const lookup: DnsLookup = async () => [{ address: "127.0.0.1", family: 4 }];
  const base = `http://trusted.test:${port}`;
  try {
    const runtime = new ApexifyRuntime({
      network: {
        trustedHosts: ["trusted.test"],
        retries: 0,
        timeoutMs: 1000,
        maxRedirects: 2,
      },
      limits: { maxConcurrentRemoteFetches: 2 },
    });
    const client = new RemoteFetchClient(runtime, { lookup });
    assert.equal((await client.fetchBuffer(`${base}/ok`, { maxBytes: 16 })).toString(), "ok");

    await assert.rejects(
      client.fetchBuffer(`${base}/redirect-blocked`, { maxBytes: 16 }),
      assertRejectedReason("IP_BLOCKED")
    );

    const oneRedirectRuntime = new ApexifyRuntime({
      network: { trustedHosts: ["trusted.test"], retries: 0, timeoutMs: 1000, maxRedirects: 1 },
    });
    await assert.rejects(
      new RemoteFetchClient(oneRedirectRuntime, { lookup }).fetchBuffer(`${base}/redirect-one`, { maxBytes: 16 }),
      assertRejectedReason("TOO_MANY_REDIRECTS")
    );

    await assert.rejects(
      client.fetchBuffer(`${base}/large-header`, { maxBytes: 8 }),
      ApexifyResourceLimitError
    );
    await assert.rejects(
      client.fetchBuffer(`${base}/large-chunked`, { maxBytes: 8 }),
      ApexifyResourceLimitError
    );

    const timeoutRuntime = new ApexifyRuntime({
      network: { trustedHosts: ["trusted.test"], retries: 0, timeoutMs: 15 },
    });
    await assert.rejects(
      new RemoteFetchClient(timeoutRuntime, { lookup }).fetchBuffer(`${base}/slow`, { maxBytes: 16 }),
      assertRejectedReason("TIMEOUT")
    );

    const abortRuntime = new ApexifyRuntime({
      network: { trustedHosts: ["trusted.test"], retries: 0, timeoutMs: 1000 },
    });
    const controller = new AbortController();
    const abortPromise = new RemoteFetchClient(abortRuntime, { lookup })
      .fetchBuffer(`${base}/slow`, { maxBytes: 16, signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    await assert.rejects(abortPromise, assertRejectedReason("ABORTED"));

    const retryDelays: number[] = [];
    const retryRuntime = new ApexifyRuntime({
      network: {
        trustedHosts: ["trusted.test"],
        retries: 1,
        timeoutMs: 1000,
        retryBaseDelayMs: 100,
        retryMaxDelayMs: 1000,
        retryJitterRatio: 0.25,
      },
    });
    const retryClient = new RemoteFetchClient(retryRuntime, {
      lookup,
      random: () => 0.5,
      sleep: async (ms) => { retryDelays.push(ms); },
    });
    assert.equal((await retryClient.fetchBuffer(`${base}/retry`, { maxBytes: 16 })).toString(), "retried");
    assert.deepEqual(retryDelays, [0], "Retry-After: 0 must override exponential backoff");
    assert.equal(state.retry, 2);

    const jitterDelays: number[] = [];
    const jitterClient = new RemoteFetchClient(retryRuntime, {
      lookup,
      random: () => 1,
      sleep: async (ms) => { jitterDelays.push(ms); },
    });
    assert.equal((await jitterClient.fetchBuffer(`${base}/jitter`, { maxBytes: 16 })).toString(), "jittered");
    assert.deepEqual(jitterDelays, [125], "retry jitter must be bounded and deterministic under injected RNG");

    await Promise.all([
      client.fetchBuffer(`${base}/concurrency?a=1`, { maxBytes: 32 }),
      client.fetchBuffer(`${base}/concurrency?a=2`, { maxBytes: 32 }),
      client.fetchBuffer(`${base}/concurrency?a=3`, { maxBytes: 32 }),
      client.fetchBuffer(`${base}/concurrency?a=4`, { maxBytes: 32 }),
    ]);
    assert.equal(state.maxActive, 2, "remote transport concurrency must never exceed configured bound");

    let redactionError: ApexifyRemoteFetchError | undefined;
    try {
      await client.fetchBuffer(`${base}/private/path?token=supersecret`, { maxBytes: 32 });
    } catch (error) {
      if (error instanceof ApexifyRemoteFetchError) redactionError = error;
    }
    assert(redactionError);
    const serialized = JSON.stringify(redactionError.toJSON());
    assert(!serialized.includes("supersecret"));
    assert(!serialized.includes("private/path"));
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function main(): Promise<void> {
  await testIpPolicy();
  await testCache();
  await testRuntimeInheritanceAndLimits();
  await testRemoteFetch();
  console.log("phase3 infrastructure tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
