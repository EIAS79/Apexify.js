import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { loadImageCached } from "../lib-next/image/image-properties";
import {
  assertRemoteImageUrlFresh,
  fetchRemoteImageBuffer,
  RemoteImageFetchError,
} from "../lib-next/image/resolvable-image-source";

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8xO7QAAAABJRU5ErkJggg==",
  "base64"
);

async function main(): Promise<void> {
  let requestCount = 0;
  const server = http.createServer((_, response) => {
    requestCount += 1;

    // The first fetchRemoteImageBuffer call should retry once and then succeed.
    if (requestCount === 1) {
      response.statusCode = 503;
      response.end("temporary");
      return;
    }

    // The first loadImageCached call should exhaust all three attempts.
    if (requestCount >= 3 && requestCount <= 5) {
      response.statusCode = 503;
      response.end("temporary");
      return;
    }

    response.statusCode = 200;
    response.setHeader("content-type", "image/png");
    response.end(PNG);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const source = `http://127.0.0.1:${address.port}/image.png`;

    const fetched = await fetchRemoteImageBuffer(source, { attempts: 2, timeoutMs: 1_000 });
    assert.equal(fetched.length, PNG.length);
    assert.equal(requestCount, 2, "transient 503 should be retried");

    await assert.rejects(loadImageCached(source), /HTTP 503/);
    assert.equal(requestCount, 5, "first cached load should exhaust three attempts");

    const image = await loadImageCached(source);
    assert.equal(image.width, 1);
    assert.equal(image.height, 1);
    assert.equal(requestCount, 6, "rejected cache entry must be evicted and fetched again");

    const expired = "https://media.discordapp.net/attachments/1/2/image.png?ex=00000001&is=00000000&hm=test";
    assert.throws(
      () => assertRemoteImageUrlFresh(expired),
      (error: unknown) =>
        error instanceof RemoteImageFetchError && error.code === "DISCORD_ATTACHMENT_EXPIRED"
    );

    console.log("remote image hotfix smoke test passed");
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
