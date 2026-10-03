import type {
  Plan,
  PlannedStep,
  Recipe,
  Session,
  Step,
  StepRun,
} from "./types";

type Node = { recipe: Recipe; step: Step; order: number; next: string[] };
type ReadyStep = { recipe: Recipe; step: Step; run?: StepRun };

function validateBurners(burnerCount: number): void {
  if (!Number.isInteger(burnerCount) || burnerCount < 1) {
    throw new RangeError("コンロの数は 1 以上の整数にしてください。");
  }
}

function graph(recipes: Recipe[]): Map<string, Node> {
  const nodes = new Map<string, Node>();
  const recipeIds = new Set<string>();
  for (const recipe of recipes) {
    if (recipeIds.has(recipe.id))
      throw new Error("料理の ID が重複しています。");
    recipeIds.add(recipe.id);
    const localIds = new Set(recipe.steps.map((step) => step.id));
    for (const step of recipe.steps) {
      if (nodes.has(step.id)) throw new Error("手順の ID が重複しています。");
      if (!Number.isFinite(step.durationSec) || step.durationSec <= 0) {
        throw new Error("手順の時間は 0 より大きい数にしてください。");
      }
      if (step.dependsOn.some((id) => !localIds.has(id))) {
        throw new Error("手順の依存先が同じ料理の中に見つかりません。");
      }
      nodes.set(step.id, { recipe, step, order: nodes.size, next: [] });
    }
  }
  for (const node of nodes.values()) {
    for (const id of new Set(node.step.dependsOn))
      nodes.get(id)!.next.push(node.step.id);
  }
  return nodes;
}

/** Connected heating steps share a physical pan until their final step is done. */
function resourceGroups(nodes: Map<string, Node>): {
  groupFor: Map<string, string>;
  groups: Map<string, string[]>;
} {
  const parent = new Map<string, string>();
  for (const { step } of nodes.values())
    if (step.resource !== "none") parent.set(step.id, step.id);
  function root(id: string): string {
    const ancestor = parent.get(id)!;
    if (ancestor === id) return id;
    const result = root(ancestor);
    parent.set(id, result);
    return result;
  }
  for (const { step } of nodes.values()) {
    if (step.resource === "none") continue;
    for (const dependency of step.dependsOn) {
      if (nodes.get(dependency)!.step.resource === step.resource)
        parent.set(root(step.id), root(dependency));
    }
  }
  const groupFor = new Map<string, string>();
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const key = root(id);
    groupFor.set(id, key);
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  return { groupFor, groups };
}

/** Resource-safe list scheduling. Longest remaining dependency paths get priority. */
export function planRecipes(recipes: Recipe[], burnerCount = 2): Plan {
  validateBurners(burnerCount);
  const nodes = graph(recipes);
  const { groupFor, groups } = resourceGroups(nodes);
  const priorities = new Map<string, number>();
  const visiting = new Set<string>();
  function priority(id: string): number {
    if (priorities.has(id)) return priorities.get(id)!;
    if (visiting.has(id)) throw new Error("手順の依存関係が循環しています。");
    visiting.add(id);
    const node = nodes.get(id)!;
    const value =
      node.step.durationSec + Math.max(0, ...node.next.map(priority));
    visiting.delete(id);
    priorities.set(id, value);
    return value;
  }
  for (const id of nodes.keys()) priority(id);

  const tasks: PlannedStep[] = [];
  const scheduled = new Map<string, PlannedStep>();
  let time = 0;
  while (tasks.length < nodes.size) {
    const active = tasks.filter(
      (task) => task.startSec <= time && task.endSec > time,
    );
    let hands = active.filter(
      (task) => nodes.get(task.stepId)!.step.kind === "hands",
    ).length;
    const leased = new Set(
      [...groups.entries()]
        .filter(
          ([, ids]) =>
            ids.some((id) => scheduled.has(id)) &&
            !ids.every(
              (id) => scheduled.has(id) && scheduled.get(id)!.endSec <= time,
            ),
        )
        .map(([id]) => id),
    );
    const activeGroups = new Set(
      active
        .map((task) => groupFor.get(task.stepId))
        .filter((id): id is string => id !== undefined),
    );
    let burners = [...leased].filter(
      (id) => nodes.get(id)!.step.resource === "burner",
    ).length;
    let ovens = [...leased].filter(
      (id) => nodes.get(id)!.step.resource === "oven",
    ).length;
    function urgentDeadline(): number {
      return Math.min(
        ...[...nodes.values()]
          .filter(({ step }) => {
            const group = groupFor.get(step.id);
            return (
              !scheduled.has(step.id) &&
              step.kind === "hands" &&
              group !== undefined &&
              leased.has(group) &&
              step.dependsOn.length > 0 &&
              step.dependsOn.every((id) => scheduled.has(id))
            );
          })
          .map(({ step }) =>
            Math.max(...step.dependsOn.map((id) => scheduled.get(id)!.endSec)),
          )
          .filter((at) => at > time),
      );
    }
    const candidates = [...nodes.values()]
      .filter(
        ({ step }) =>
          !scheduled.has(step.id) &&
          step.dependsOn.every((id) => {
            const dependency = scheduled.get(id);
            return dependency !== undefined && dependency.endSec <= time;
          }),
      )
      .sort((a, b) => {
        const continuationA = leased.has(groupFor.get(a.step.id) ?? "") ? 1 : 0;
        const continuationB = leased.has(groupFor.get(b.step.id) ?? "") ? 1 : 0;
        return (
          continuationB - continuationA ||
          Number(b.step.kind === "wait") - Number(a.step.kind === "wait") ||
          priorities.get(b.step.id)! - priorities.get(a.step.id)! ||
          a.order - b.order
        );
      });

    for (const { recipe, step } of candidates) {
      const group = groupFor.get(step.id);
      const continuation = group !== undefined && leased.has(group);
      if (step.kind === "hands" && hands >= 1) continue;
      // Avoid committing the cook to prep that runs past a pan needing attention.
      if (
        step.kind === "hands" &&
        !continuation &&
        time + step.durationSec > urgentDeadline()
      )
        continue;
      if (group !== undefined && activeGroups.has(group)) continue;
      if (step.resource === "burner" && !continuation && burners >= burnerCount)
        continue;
      if (step.resource === "oven" && !continuation && ovens >= 1) continue;
      const task = {
        recipeId: recipe.id,
        stepId: step.id,
        startSec: time,
        endSec: time + step.durationSec,
      };
      tasks.push(task);
      scheduled.set(step.id, task);
      if (step.kind === "hands") hands += 1;
      if (group !== undefined) {
        leased.add(group);
        activeGroups.add(group);
      }
      if (step.resource === "burner" && !continuation) burners += 1;
      if (step.resource === "oven" && !continuation) ovens += 1;
    }
    if (tasks.length === nodes.size) break;
    const nextTime = Math.min(
      ...tasks.filter((task) => task.endSec > time).map((task) => task.endSec),
    );
    if (!Number.isFinite(nextTime))
      throw new Error("手順を並べられません。依存関係を確認してください。");
    time = nextTime;
  }
  return {
    tasks,
    durationSec: Math.max(0, ...tasks.map((task) => task.endSec)),
    sequentialSec: [...nodes.values()].reduce(
      (sum, { step }) => sum + step.durationSec,
      0,
    ),
  };
}

export function createSession(recipes: Recipe[], now: number): Session {
  // Also reject malformed dependency graphs before a physical cooking session begins.
  planRecipes(recipes);
  return {
    id:
      globalThis.crypto?.randomUUID() ??
      `cook-${now}-${Math.random().toString(36).slice(2)}`,
    startedAt: now,
    recipeIds: recipes.map((recipe) => recipe.id),
    runs: Object.fromEntries(
      recipes.flatMap((recipe) =>
        recipe.steps.map((step) => [step.id, { status: "pending" }]),
      ),
    ),
  };
}

function occupies(run: StepRun | undefined): boolean {
  return (
    run?.status === "running" ||
    run?.status === "paused" ||
    run?.status === "attention"
  );
}

/** Completion is always explicit; expired and paused steps still hold their equipment. */
export function readySteps(
  recipes: Recipe[],
  session: Session,
  now: number,
  burnerCount = 2,
): ReadyStep[] {
  validateBurners(burnerCount);
  const reconciled = reconcileSession(session, now);
  const selected = recipes.filter((recipe) =>
    session.recipeIds.includes(recipe.id),
  );
  const steps = selected.flatMap((recipe) =>
    recipe.steps.map((step) => ({
      recipe,
      step,
      run: reconciled.runs[step.id],
    })),
  );
  const occupied = steps.filter(({ step }) =>
    occupies(reconciled.runs[step.id]),
  );
  const nodes = graph(selected);
  const { groupFor, groups } = resourceGroups(nodes);
  const leased = new Set(
    [...groups.entries()]
      .filter(
        ([, ids]) =>
          ids.some(
            (id) =>
              reconciled.runs[id] && reconciled.runs[id].status !== "pending",
          ) && !ids.every((id) => reconciled.runs[id]?.status === "done"),
      )
      .map(([id]) => id),
  );
  const activeGroups = new Set(
    occupied
      .map(({ step }) => groupFor.get(step.id))
      .filter((id): id is string => id !== undefined),
  );
  const handsBusy = occupied.some(({ step }) => step.kind === "hands");
  const burnersUsed = [...leased].filter(
    (id) => nodes.get(id)!.step.resource === "burner",
  ).length;
  const ovenBusy = [...leased].some(
    (id) => nodes.get(id)!.step.resource === "oven",
  );
  const urgentAfterSec = Math.min(
    ...steps
      .filter(({ step }) => {
        const group = groupFor.get(step.id);
        return (
          step.kind === "hands" &&
          reconciled.runs[step.id]?.status === "pending" &&
          group !== undefined &&
          leased.has(group) &&
          step.dependsOn.length > 0 &&
          step.dependsOn.every(
            (id) =>
              reconciled.runs[id]?.status === "done" ||
              occupies(reconciled.runs[id]),
          ) &&
          step.dependsOn.some((id) => occupies(reconciled.runs[id]))
        );
      })
      .map(({ step }) =>
        Math.max(
          ...step.dependsOn.map((id) =>
            remainingSeconds(reconciled.runs[id], now),
          ),
        ),
      ),
  );
  const plannedStarts = new Map(
    planRecipes(selected, burnerCount).tasks.map((task) => [
      task.stepId,
      task.startSec,
    ]),
  );
  return steps
    .filter(({ step }) => {
      const group = groupFor.get(step.id);
      const continuation = group !== undefined && leased.has(group);
      if (reconciled.runs[step.id]?.status !== "pending") return false;
      if (!step.dependsOn.every((id) => reconciled.runs[id]?.status === "done"))
        return false;
      if (step.kind === "hands" && handsBusy) return false;
      // A new prep task must fit before an already-heating pan needs the cook.
      if (
        step.kind === "hands" &&
        !continuation &&
        step.durationSec > urgentAfterSec
      )
        return false;
      if (group !== undefined && activeGroups.has(group)) return false;
      if (
        step.resource === "burner" &&
        !continuation &&
        burnersUsed >= burnerCount
      )
        return false;
      if (step.resource === "oven" && !continuation && ovenBusy) return false;
      return true;
    })
    .sort(
      (a, b) =>
        Number(leased.has(groupFor.get(b.step.id) ?? "")) -
          Number(leased.has(groupFor.get(a.step.id) ?? "")) ||
        plannedStarts.get(a.step.id)! - plannedStarts.get(b.step.id)!,
    );
}

function updateRun(session: Session, stepId: string, run: StepRun): Session {
  return { ...session, runs: { ...session.runs, [stepId]: run } };
}

export function startStep(session: Session, step: Step, now: number): Session {
  if (session.runs[step.id]?.status !== "pending") return session;
  return updateRun(session, step.id, {
    status: "running",
    startedAt: now,
    deadline: now + step.durationSec * 1000,
  });
}

export function completeStep(
  session: Session,
  stepId: string,
  now: number,
): Session {
  const run = session.runs[stepId];
  if (!occupies(run)) return session;
  return updateRun(session, stepId, {
    status: "done",
    startedAt: run.startedAt,
    completedAt: now,
  });
}

export function remainingSeconds(run: StepRun, now: number): number {
  if (run.status === "paused")
    return Math.max(0, Math.ceil(run.remainingSec ?? 0));
  if (run.status !== "running" || run.deadline === undefined) return 0;
  return Math.max(0, Math.ceil((run.deadline - now) / 1000));
}

export function pauseStep(
  session: Session,
  stepId: string,
  now: number,
): Session {
  const run = session.runs[stepId];
  if (run?.status !== "running") return session;
  if (run.deadline !== undefined && run.deadline <= now) {
    return updateRun(session, stepId, {
      ...run,
      status: "attention",
      remainingSec: 0,
    });
  }
  return updateRun(session, stepId, {
    status: "paused",
    startedAt: run.startedAt,
    // Preserve fractions during pause; round only the displayed countdown.
    remainingSec: Math.max(0, ((run.deadline ?? now) - now) / 1000),
  });
}

export function resumeStep(
  session: Session,
  stepId: string,
  now: number,
): Session {
  const run = session.runs[stepId];
  if (run?.status !== "paused") return session;
  const remaining = Math.max(0, run.remainingSec ?? 0);
  return updateRun(session, stepId, {
    status: remaining > 0 ? "running" : "attention",
    startedAt: run.startedAt,
    deadline: now + remaining * 1000,
  });
}

/** Extra time affects this timer only, including when its alarm is awaiting confirmation. */
export function extendStep(
  session: Session,
  stepId: string,
  seconds: number,
  now: number,
): Session {
  const run = session.runs[stepId];
  if (!run || !Number.isFinite(seconds) || seconds <= 0) return session;
  if (run.status === "paused") {
    return updateRun(session, stepId, {
      ...run,
      remainingSec: (run.remainingSec ?? 0) + seconds,
    });
  }
  if (run.status !== "running" && run.status !== "attention") return session;
  return updateRun(session, stepId, {
    status: "running",
    startedAt: run.startedAt,
    deadline: Math.max(now, run.deadline ?? now) + seconds * 1000,
  });
}

/** Absolute deadlines survive tab suspension, reload, and a device returning from sleep. */
export function reconcileSession(session: Session, now: number): Session {
  let result = session;
  for (const [id, run] of Object.entries(session.runs)) {
    if (
      run.status === "running" &&
      run.deadline !== undefined &&
      run.deadline <= now
    ) {
      result = updateRun(result, id, {
        ...run,
        status: "attention",
        remainingSec: 0,
      });
    }
  }
  return result;
}
