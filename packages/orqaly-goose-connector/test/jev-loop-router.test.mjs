import assert from "node:assert/strict";
import test from "node:test";
import {
  triageTurnIntentWithJev,
  evaluateArtifactSafetyWithJev,
  triageComputerUseModalityWithJev,
  COMPUTER_USE_MODALITIES,
} from "../src/jev-loop-router.mjs";

const routeBody = () => ({
  model: "jev-1.13.0",
  answers: {
    route: {
      type: "choice",
      choice: "quick_info",
      confidence: 0.96,
      probabilities: {
        quick_info: 0.96,
        research: 0.01,
        local_engineering: 0.01,
        conversation: 0.01,
        mixed: 0.01,
      },
    },
    thinking_effort: {
      type: "choice",
      choice: "off",
      confidence: 0.96,
      probabilities: { off: 0.96, low: 0.03, high: 0.01 },
    },
  },
});
const safetyBody = () => ({
  model: "jev-1.13.0",
  answers: {
    contains_hardcoded_secrets: { type: "noul", noul: 0.03 },
    is_production_ready: { type: "noul", noul: 0.95 },
  },
});
const invoke = (body) =>
  triageTurnIntentWithJev({
    message: "Weather?",
    apiKey: "fake",
    fetchImpl: async () => Response.json(body),
  });
const safety = (body) =>
  evaluateArtifactSafetyWithJev({
    content: "dummy document",
    apiKey: "fake",
    fetchImpl: async () => Response.json(body),
  });

test("explicit empty key never falls back to environment or calls network", async () => {
  const original = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "dummy-env-key";
  try {
    const fetchImpl = () => {
      throw new Error("must not call");
    };
    assert.equal(
      (await triageTurnIntentWithJev({ message: "hi", apiKey: "", fetchImpl }))
        .route,
      "uncertain",
    );
    assert.deepEqual(
      await evaluateArtifactSafetyWithJev({
        content: "hello",
        apiKey: "",
        fetchImpl,
      }),
      {
        evaluated: false,
        status: "not_evaluated",
        passed: null,
        reason: "MISSING_API_KEY",
        violations: [],
      },
    );
  } finally {
    if (original === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = original;
  }
});
test("valid routing and safety responses retain real model/probability evidence", async () => {
  assert.equal((await invoke(routeBody())).route, "quick_info");
  const good = await safety(safetyBody());
  assert.equal(good.passed, true);
  assert.equal(good.model, "jev-1.13.0");
  const bad = safetyBody();
  bad.answers.contains_hardcoded_secrets.noul = 0.98;
  assert.equal((await safety(bad)).passed, false);
  const notReady = safetyBody();
  notReady.answers.is_production_ready.noul = 0.1;
  assert.equal((await safety(notReady)).passed, false);
});
test("invalid route/effort enums and probability evidence are not evaluated", async () => {
  const edits = [
    (b) => {
      b.answers.route.choice = "exec";
    },
    (b) => {
      delete b.answers.thinking_effort;
    },
    (b) => {
      b.answers.thinking_effort.choice = "maximum";
    },
    (b) => {
      delete b.answers.route.confidence;
    },
    (b) => {
      b.answers.route.confidence = 2;
    },
    (b) => {
      b.answers.route.probabilities.mixed = 1;
    },
    (b) => {
      b.answers.route.probabilities.mixed = -1;
    },
    (b) => {
      b.answers.route.choice = "research";
    },
    (b) => {
      b.model = "";
    },
  ];
  for (const edit of edits) {
    const body = routeBody();
    edit(body);
    assert.equal((await invoke(body)).evaluated, false);
  }
});
test("low confidence remains uncertain", async () => {
  const body = routeBody();
  body.answers.route.confidence = 0.5;
  assert.equal((await invoke(body)).route, "uncertain");
});
test("missing, malformed, or oversized safety evidence never passes", async () => {
  for (const body of [
    {},
    { model: "jev-1", answers: {} },
    {
      model: "jev-1",
      answers: {
        ...safetyBody().answers,
        contains_hardcoded_secrets: { type: "noul", noul: "0" },
      },
    },
  ]) {
    const value = await safety(body);
    assert.equal(value.passed, null);
    assert.equal(value.evaluated, false);
  }
  const value = await evaluateArtifactSafetyWithJev({
    content: "x".repeat(24001),
    apiKey: "fake",
    fetchImpl: () => {
      throw new Error("must not send a prefix");
    },
  });
  assert.equal(value.reason, "CONTENT_TOO_LARGE");
});
for (const [name, method, input] of [
  ["triage", triageTurnIntentWithJev, { message: "hi" }],
  ["safety", evaluateArtifactSafetyWithJev, { content: "hello" }],
]) {
  test(`${name} bounds a hanging body even when the transport ignores abort`, async () => {
    let signal;
    const start = performance.now();
    const value = await method({
      ...input,
      apiKey: "fake",
      timeoutMs: 10,
      fetchImpl: async (_url, options) => {
        signal = options.signal;
        return { ok: true, text: () => new Promise(() => {}) };
      },
    });
    assert.equal(value.reason, "TIMEOUT");
    assert.equal(value.evaluated, false);
    assert.equal(signal.aborted, true);
    assert.ok(performance.now() - start < 300);
  });
  test(`${name} respects cancellation and invalid/oversized response bodies`, async () => {
    const controller = new AbortController();
    controller.abort();
    assert.equal(
      (
        await method({
          ...input,
          apiKey: "fake",
          signal: controller.signal,
          fetchImpl: () => {
            throw new Error("no call");
          },
        })
      ).reason,
      "CANCELLED",
    );
    for (const body of ["{bad", "x".repeat(16001)]) {
      assert.equal(
        (
          await method({
            ...input,
            apiKey: "fake",
            fetchImpl: async () => new Response(body),
          })
        ).reason,
        "INVALID_JEV_RESPONSE",
      );
    }
  });
}

test("triageComputerUseModalityWithJev correctly classifies physical GUI and cursor speed", async () => {
  const mockBody = {
    model: "jev-1.13.0",
    answers: {
      modality: {
        type: "choice",
        choice: "physical_gui",
        confidence: 0.95,
        probabilities: {
          physical_gui: 0.95,
          background_headless: 0.02,
          visual_ocr: 0.02,
          multiapp_workflow: 0.01,
        },
      },
      cursor_speed: {
        type: "choice",
        choice: "fast",
        confidence: 0.88,
        probabilities: {
          snappy: 0.05,
          fast: 0.88,
          normal: 0.05,
          smooth: 0.02,
        },
      },
    },
  };

  const res = await triageComputerUseModalityWithJev({
    message: "Drag formula from cell A1 to A20 in Google Sheets",
    apiKey: "fake-key",
    fetchImpl: async () => Response.json(mockBody),
  });

  assert.equal(res.evaluated, true);
  assert.equal(res.modality, COMPUTER_USE_MODALITIES.PHYSICAL_GUI);
  assert.equal(res.cursorSpeed, "fast");
  assert.equal(res.confidence, 0.95);
});

