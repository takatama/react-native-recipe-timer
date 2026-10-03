import type { Recipe, Session } from "./types";
import { SAMPLE_RECIPES } from "./samples";
import { planRecipes } from "./engine";
const KEY = "kitchenflow.v2";
export interface Saved {
  recipes: Recipe[];
  selected: string[];
  session: Session | null;
  servings: number;
  burners: number;
}
export function readSaved(): Saved {
  const fallback = {
    recipes: SAMPLE_RECIPES,
    selected: SAMPLE_RECIPES.map((r) => r.id),
    session: null,
    servings: 2,
    burners: 2,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    if (
      !Array.isArray(value.recipes) ||
      value.recipes.some(
        (r: Recipe) =>
          !r.id ||
          !r.name ||
          !Array.isArray(r.steps) ||
          !r.steps.length ||
          r.steps.some(
            (s) =>
              !s.id ||
              !Number.isFinite(s.durationSec) ||
              s.durationSec <= 0 ||
              !Array.isArray(s.dependsOn),
          ),
      )
    )
      return fallback;
    planRecipes(value.recipes);
    const colors: Record<string, string> = {
      orange: "#c87545",
      green: "#638477",
      violet: "#8377a0",
    };
    value.recipes = value.recipes.map((r: Recipe) => ({
      ...r,
      color: colors[r.color] || r.color,
    }));
    const validIds = new Set(value.recipes.map((r: Recipe) => r.id));
    const session = value.session;
    if (
      session &&
      (!Number.isFinite(session.startedAt) ||
        !session.runs ||
        !Array.isArray(session.recipeIds) ||
        session.recipeIds.some((id: string) => !validIds.has(id)) ||
        Object.values(session.runs).some(
          (r: any) =>
            !["pending", "running", "paused", "attention", "done"].includes(
              r.status,
            ) ||
            (r.deadline !== undefined && !Number.isFinite(r.deadline)),
        ))
    )
      value.session = null;
    return {
      recipes: value.recipes,
      selected: (value.selected || []).filter((id: string) => validIds.has(id)),
      session: value.session || null,
      servings: Math.min(12, Math.max(1, Number(value.servings) || 2)),
      burners: Math.min(4, Math.max(1, Math.floor(Number(value.burners) || 2))),
    };
  } catch {
    return fallback;
  }
}
export function save(value: Saved): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
