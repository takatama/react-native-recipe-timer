import assert from "node:assert/strict";
import test from "node:test";
import {
  completeStep,
  createSession,
  extendStep,
  pauseStep,
  planRecipes,
  readySteps,
  reconcileSession,
  remainingSeconds,
  resumeStep,
  startStep,
} from "./engine";
import { SAMPLE_RECIPES } from "./samples";
import type { Recipe, Resource, Step } from "./types";

function step(
  id: string,
  kind: Step["kind"] = "wait",
  resource: Resource = "none",
  dependsOn: string[] = [],
  durationSec = 10,
): Step {
  return { id, title: id, detail: id, durationSec, kind, resource, dependsOn };
}

function recipe(id: string, steps: Step[]): Recipe {
  return {
    id,
    name: id,
    description: "",
    servings: 2,
    ingredients: [],
    color: "green",
    steps,
  };
}

test("a plan respects every dependency, the single cook, burners, and oven capacity", () => {
  const recipes = [
    recipe("a", [
      step("a-cut", "hands"),
      step("a-boil", "wait", "burner", ["a-cut"], 30),
      step("a-finish", "hands", "burner", ["a-boil"]),
    ]),
    recipe("b", [
      step("b-cut", "hands"),
      step("b-boil", "wait", "burner", ["b-cut"], 20),
      step("b-finish", "hands", "burner", ["b-boil"]),
    ]),
    recipe("c", [step("c-roast", "wait", "oven", [], 20)]),
    recipe("d", [step("d-roast", "wait", "oven", [], 10)]),
  ];
  const result = planRecipes(recipes, 2);
  assert.equal(result.tasks.length, 8);
  const nodes = new Map(
    recipes.flatMap((item) =>
      item.steps.map((item) => [item.id, item] as const),
    ),
  );
  const tasks = new Map(result.tasks.map((item) => [item.stepId, item]));
  for (const task of result.tasks) {
    for (const dependency of nodes.get(task.stepId)!.dependsOn) {
      assert.ok(
        tasks.get(dependency)!.endSec <= task.startSec,
        `${dependency} before ${task.stepId}`,
      );
    }
  }
  const events = [
    ...new Set(result.tasks.flatMap((item) => [item.startSec, item.endSec])),
  ];
  for (const time of events) {
    const active = result.tasks
      .filter((item) => item.startSec <= time && item.endSec > time)
      .map((item) => nodes.get(item.stepId)!);
    assert.ok(active.filter((item) => item.kind === "hands").length <= 1);
    assert.ok(active.filter((item) => item.resource === "burner").length <= 2);
    assert.ok(active.filter((item) => item.resource === "oven").length <= 1);
  }
  assert.ok(result.durationSec < result.sequentialSec);
  assert.deepEqual(
    planRecipes(recipes, 2),
    result,
    "same input gives same plan",
  );
});

test("one burner serializes physical heating while two burners allow overlap", () => {
  const recipes = [
    recipe("a", [step("a", "wait", "burner")]),
    recipe("b", [step("b", "wait", "burner")]),
  ];
  assert.equal(planRecipes(recipes, 1).durationSec, 20);
  assert.equal(planRecipes(recipes, 2).durationSec, 10);
  assert.equal(planRecipes([], 1).durationSec, 0);
});

test("a pan stays assigned between connected steps and its next action takes priority over long prep", () => {
  const recipes = [
    recipe("a", [
      step("heat", "wait", "burner"),
      step("turn", "hands", "burner", ["heat"]),
    ]),
    recipe("b", [step("long-prep", "hands", "none", [], 25)]),
    recipe("c", [step("other-pan", "wait", "burner")]),
  ];
  const planned = planRecipes(recipes, 1);
  const tasks = new Map(planned.tasks.map((item) => [item.stepId, item]));
  assert.equal(tasks.get("heat")!.startSec, 0);
  assert.equal(
    tasks.get("turn")!.startSec,
    10,
    "a heated pan is not left waiting while the cook starts long prep",
  );
  assert.ok(tasks.get("other-pan")!.startSec >= 20);
  assert.ok(tasks.get("long-prep")!.startSec >= 20);

  let session = startStep(createSession(recipes, 0), recipes[0].steps[0], 0);
  session = completeStep(session, "heat", 10_000);
  assert.deepEqual(
    readySteps(recipes, session, 10_000, 1).map((item) => item.step.id),
    ["turn", "long-prep"],
  );
  session = startStep(session, recipes[0].steps[1], 10_000);
  session = completeStep(session, "turn", 20_000);
  assert.ok(
    readySteps(recipes, session, 20_000, 1).some(
      (item) => item.step.id === "other-pan",
    ),
  );
});

test("runtime recommendations defer long prep before a heated pan needs attention", () => {
  const recipes = [
    recipe("pan", [
      step("preheat", "wait", "burner", [], 10),
      step("place-food", "hands", "burner", ["preheat"]),
    ]),
    recipe("prep", [step("long-prep", "hands", "none", [], 25)]),
    recipe("short", [step("short-prep", "hands", "none", [], 5)]),
    recipe("rest", [step("rest", "wait")]),
  ];
  const initial = createSession(recipes, 0);
  assert.ok(
    readySteps(recipes, initial, 0).some(
      (item) => item.step.id === "long-prep",
    ),
    "prep is allowed when no pan is heating",
  );
  const started = startStep(initial, recipes[0].steps[0], 0);
  const earlyIds = readySteps(recipes, started, 0).map((item) => item.step.id);
  assert.ok(!earlyIds.includes("long-prep"));
  assert.ok(
    earlyIds.includes("short-prep"),
    "a short task fits before the pan needs attention",
  );
  assert.ok(earlyIds.includes("rest"), "unattended work is still allowed");
  const nearIds = readySteps(recipes, started, 6_000).map(
    (item) => item.step.id,
  );
  assert.ok(!nearIds.includes("short-prep"));
  const expiredIds = readySteps(recipes, started, 10_000).map(
    (item) => item.step.id,
  );
  assert.ok(
    !expiredIds.includes("long-prep") && !expiredIds.includes("short-prep"),
  );
  const confirmed = completeStep(started, "preheat", 10_000);
  assert.equal(readySteps(recipes, confirmed, 10_000)[0].step.id, "place-food");
});

test("runtime recommendations follow the displayed plan instead of the recipe list order", () => {
  const initial = createSession(SAMPLE_RECIPES, 0);
  assert.deepEqual(
    readySteps(SAMPLE_RECIPES, initial, 0).map((item) => item.step.id),
    ["salmon-prep", "mushroom-prep", "broccoli-prep"],
  );
  let session = startStep(initial, SAMPLE_RECIPES[0].steps[0], 0);
  session = completeStep(session, "salmon-prep", 120_000);
  session = startStep(session, SAMPLE_RECIPES[0].steps[1], 120_000);
  assert.deepEqual(
    readySteps(SAMPLE_RECIPES, session, 120_000),
    [],
    "60 seconds of preheat cannot fit either remaining prep task",
  );
});

test("invalid dependency graphs and ambiguous IDs are rejected", () => {
  assert.throws(
    () =>
      planRecipes([
        recipe("a", [step("a", "hands", "none", ["b"])]),
        recipe("b", [step("b")]),
      ]),
    /依存先/,
  );
  assert.throws(
    () =>
      planRecipes([
        recipe("a", [
          step("a", "hands", "none", ["b"]),
          step("b", "wait", "none", ["a"]),
        ]),
      ]),
    /循環/,
  );
  assert.throws(
    () =>
      planRecipes([
        recipe("a", [step("shared")]),
        recipe("b", [step("shared")]),
      ]),
    /重複/,
  );
  assert.throws(
    () => planRecipes([recipe("a", [step("a", "hands", "none", [], 0)])]),
    /時間/,
  );
  assert.throws(() => planRecipes([], 0), /コンロ/);
});

test("example recipes schedule within roughly twenty minutes with two burners", () => {
  const result = planRecipes(SAMPLE_RECIPES, 2);
  assert.ok(
    result.durationSec <= 22 * 60,
    `planned ${result.durationSec} seconds`,
  );
  assert.ok(result.durationSec < result.sequentialSec);
  assert.ok(
    SAMPLE_RECIPES.every(
      (item) => item.servings === 2 && item.ingredients.length > 0,
    ),
  );
});

test("absolute deadlines survive a serialized reload and background suspension", () => {
  const recipes = [recipe("a", [step("boil")])];
  const initial = createSession(recipes, 1_000);
  const started = startStep(initial, recipes[0].steps[0], 2_000);
  assert.equal(started.runs.boil.deadline, 12_000);
  assert.equal(remainingSeconds(started.runs.boil, 3_001), 9);
  assert.equal(
    initial.runs.boil.status,
    "pending",
    "transitions do not mutate saved snapshots",
  );
  const restored = JSON.parse(JSON.stringify(started));
  const returned = reconcileSession(restored, 600_000);
  assert.equal(returned.runs.boil.status, "attention");
  assert.equal(remainingSeconds(returned.runs.boil, 600_000), 0);
  assert.equal(returned.runs.boil.completedAt, undefined);
  assert.equal(restored.runs.boil.status, "running");
});

test("a timer ending cannot unlock a dependent step until the cook confirms completion", () => {
  const recipes = [
    recipe("a", [
      step("boil", "wait", "burner"),
      step("drain", "hands", "burner", ["boil"]),
    ]),
  ];
  let session = startStep(createSession(recipes, 0), recipes[0].steps[0], 0);
  session = reconcileSession(session, 10_000);
  assert.deepEqual(readySteps(recipes, session, 10_000), []);
  session = completeStep(session, "boil", 12_000);
  assert.deepEqual(
    readySteps(recipes, session, 12_000).map((item) => item.step.id),
    ["drain"],
  );
  assert.equal(session.runs.boil.completedAt, 12_000);
  assert.equal(
    completeStep(session, "drain", 12_000).runs.drain.status,
    "pending",
    "unstarted work cannot be marked done",
  );
});

test("ready steps respect the cook and retain resources for paused and expired work", () => {
  const recipes = [
    recipe("a", [step("pan-a", "wait", "burner")]),
    recipe("b", [step("pan-b", "wait", "burner")]),
    recipe("c", [step("pan-c", "wait", "burner")]),
    recipe("d", [step("cut", "hands")]),
    recipe("e", [step("plate", "hands")]),
  ];
  let session = createSession(recipes, 0);
  session = startStep(session, recipes[0].steps[0], 0);
  session = startStep(session, recipes[1].steps[0], 0);
  session = pauseStep(session, "pan-a", 1_000);
  assert.deepEqual(
    readySteps(recipes, session, 11_000, 2).map((item) => item.step.id),
    ["cut", "plate"],
  );
  session = startStep(session, recipes[3].steps[0], 11_000);
  assert.deepEqual(readySteps(recipes, session, 12_000, 2), []);
  session = completeStep(session, "pan-b", 12_000);
  assert.deepEqual(
    readySteps(recipes, session, 12_000, 2).map((item) => item.step.id),
    ["pan-c"],
  );
});

test("pause, resume, and extension affect only the selected timer", () => {
  const recipes = [recipe("a", [step("a")]), recipe("b", [step("b")])];
  let session = createSession(recipes, 0);
  session = startStep(session, recipes[0].steps[0], 0);
  session = startStep(session, recipes[1].steps[0], 0);
  session = pauseStep(session, "a", 2_250);
  assert.equal(session.runs.a.remainingSec, 7.75);
  assert.equal(remainingSeconds(session.runs.a, 90_000), 8);
  assert.equal(session.runs.b.deadline, 10_000);
  session = extendStep(session, "a", 30, 90_000);
  assert.equal(session.runs.a.status, "paused");
  assert.equal(session.runs.a.remainingSec, 37.75);
  session = resumeStep(session, "a", 100_000);
  assert.equal(session.runs.a.deadline, 137_750);
  assert.equal(session.runs.b.deadline, 10_000);
  session = reconcileSession(session, 110_000);
  assert.equal(session.runs.a.status, "running");
  assert.equal(session.runs.b.status, "attention");
  session = extendStep(session, "b", 20, 110_000);
  assert.equal(session.runs.b.status, "running");
  assert.equal(session.runs.b.deadline, 130_000);
  assert.equal(session.runs.a.deadline, 137_750);
});

test("elapsed timers cannot be hidden by pausing; finished timers cannot be restarted accidentally", () => {
  const recipes = [recipe("a", [step("a")])];
  let session = startStep(createSession(recipes, 0), recipes[0].steps[0], 0);
  session = pauseStep(session, "a", 10_000);
  assert.equal(session.runs.a.status, "attention");
  session = completeStep(session, "a", 12_000);
  assert.equal(
    startStep(session, recipes[0].steps[0], 20_000).runs.a.status,
    "done",
  );
  assert.equal(extendStep(session, "a", 60, 20_000).runs.a.status, "done");
  assert.equal(resumeStep(session, "a", 20_000).runs.a.status, "done");
});

test("readiness is limited to the recipes saved in this session", () => {
  const recipes = [recipe("a", [step("a")]), recipe("b", [step("b")])];
  const session = createSession([recipes[0]], 0);
  assert.deepEqual(
    readySteps(recipes, session, 0).map((item) => item.step.id),
    ["a"],
  );
});
