export type Resource = "none" | "burner" | "oven";
export type StepKind = "hands" | "wait";
export interface Ingredient {
  name: string;
  amount: string;
}
export interface Step {
  id: string;
  title: string;
  detail: string;
  durationSec: number;
  kind: StepKind;
  resource: Resource;
  dependsOn: string[];
}
export interface Recipe {
  id: string;
  name: string;
  description: string;
  servings: number;
  ingredients: Ingredient[];
  steps: Step[];
  color: string;
  source?: string;
  sourceText?: string;
  warnings?: string[];
}
export type StepStatus =
  "pending" | "running" | "paused" | "attention" | "done";
export interface StepRun {
  status: StepStatus;
  startedAt?: number;
  deadline?: number;
  remainingSec?: number;
  completedAt?: number;
}
export interface Session {
  id: string;
  startedAt: number;
  recipeIds: string[];
  runs: Record<string, StepRun>;
}
export interface PlannedStep {
  recipeId: string;
  stepId: string;
  startSec: number;
  endSec: number;
}
export interface Plan {
  tasks: PlannedStep[];
  durationSec: number;
  sequentialSec: number;
}
