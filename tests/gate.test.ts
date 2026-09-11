import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { RiotApiError, riotFetch } from "@/lib/riot/client";
import { GATE_POLICY, gateStats, resetGateForTests, withRiotGate } from "@/lib/riot/gate";

/**
 * The two behaviours that protect us from Riot rate limits: global request
 * pacing, and bounded retries that respect Retry-After.
 */

let realFetch: typeof globalThis.fetch;

beforeEach(() => {
  resetGateForTests();
  realFetch = globalThis.fetch;
  process.env.RIOT_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("global request gate", () => {
  it("is shared across callers and caps concurrency", async () => {
    let inFlight = 0;
    let peak = 0;

    const task = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
    };

    // Twelve requests from different "participants" share one gate.
    await Promise.all(Array.from({ length: 12 }, () => withRiotGate(task)));

    assert.ok(
      peak <= GATE_POLICY.maxConcurrent,
      `peak concurrency ${peak} exceeded limit ${GATE_POLICY.maxConcurrent}`,
    );
    assert.equal(gateStats().admitted, 12);
    assert.equal(gateStats().active, 0);
  });

  it("paces request starts by the configured interval", async () => {
    const starts: number[] = [];

    await Promise.all(
      Array.from({ length: 4 }, () =>
        withRiotGate(async () => {
          starts.push(Date.now());
        }),
      ),
    );

    starts.sort((a, b) => a - b);
    const span = starts[starts.length - 1]! - starts[0]!;
    const expected = GATE_POLICY.minIntervalMs * (starts.length - 1);

    assert.ok(
      span >= expected * 0.6,
      `4 requests spanned ${span}ms, expected roughly ${expected}ms of pacing`,
    );
  });
});

describe("riotFetch retries", () => {
  it("retries a 429 and honours Retry-After", async () => {
    let calls = 0;

    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) {
        return new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "1" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof globalThis.fetch;

    const started = Date.now();
    const result = await riotFetch<{ ok: boolean }>(
      "https://na1.api.riotgames.com",
      "/lol/test",
    );
    const elapsed = Date.now() - started;

    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2, "the 429 should have been retried once");
    assert.ok(elapsed >= 900, `expected a ~1s Retry-After wait, waited ${elapsed}ms`);
  });

  it("retries 5xx but gives up after a bounded number of attempts", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("boom", { status: 503 });
    }) as typeof globalThis.fetch;

    await assert.rejects(
      () => riotFetch("https://na1.api.riotgames.com", "/lol/test"),
      (error: unknown) => error instanceof RiotApiError && error.status === 503,
    );

    assert.ok(calls > 1, "5xx should be retried");
    assert.ok(calls <= 3, `retries must stay bounded, saw ${calls} attempts`);
  });

  it("does not retry an ordinary 4xx", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("nope", { status: 404 });
    }) as typeof globalThis.fetch;

    await assert.rejects(
      () => riotFetch("https://na1.api.riotgames.com", "/lol/test"),
      (error: unknown) => error instanceof RiotApiError && error.isNotFound,
    );

    assert.equal(calls, 1, "a 404 must not be retried");
  });

  it("never puts the API key in the error it throws", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 403 })) as typeof globalThis.fetch;

    const error = await riotFetch(
      "https://na1.api.riotgames.com",
      "/lol/test",
    ).catch((e: unknown) => e as RiotApiError);

    assert.ok(error instanceof RiotApiError);
    assert.equal(error.message.includes("test-key"), false);
  });
});
