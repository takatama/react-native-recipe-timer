// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Recipe } from "./types";

vi.mock("./browser", () => ({
  speak: vi.fn(),
  recognitionConstructor: vi.fn(() => undefined),
  unlockAudio: vi.fn(),
  chime: vi.fn(),
  notify: vi.fn(async () => undefined),
}));

const KEY = "kitchenflow.v2";
const importedRecipe: Recipe = {
  id: "review-draft",
  name: "オムレツの下書き",
  description: "保存前に確認する手順案。",
  servings: 2,
  color: "#c87545",
  ingredients: [{ name: "卵", amount: "2 個" }],
  steps: [
    {
      id: "review-draft-prep",
      title: "卵を溶く",
      detail: "卵を器に割り入れて溶きます。",
      durationSec: 60,
      kind: "hands",
      resource: "none",
      dependsOn: [],
    },
  ],
};
let request: ReturnType<typeof vi.fn>;
let nativeConfirm: ReturnType<typeof vi.spyOn>;

function saved() {
  return JSON.parse(localStorage.getItem(KEY)!);
}

async function showApp() {
  // App reads its saved state at module load, so each test starts with a fresh module.
  const { default: App } = await import("./App");
  return render(<App />);
}

function beginCooking() {
  fireEvent.click(screen.getAllByRole("button", { name: "調理をはじめる" })[0]);
}

async function importToReview() {
  fireEvent.click(screen.getByRole("button", { name: "レシピを取り込む" }));
  const dialog = screen.getByRole("dialog", { name: "レシピを取り込む" });
  fireEvent.change(within(dialog).getByLabelText(/レシピの文章/), {
    target: { value: "オムレツの下書き\n材料：卵 2 個\n1. 卵を溶く（1分）" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "手順案をつくる" }),
  );
  return screen.findByRole("dialog", { name: "レシピと手順を確認" });
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
  nativeConfirm = vi.spyOn(window, "confirm").mockImplementation(() => {
    throw new Error("終了の確認はアプリ内で行う必要があります。");
  });
  // JSDOM does not implement the browser's top-layer dialog presentation.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    }),
  });
  request = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/capabilities")
      return { ok: true, json: async () => ({ ai: false, model: "" }) };
    if (url === "/api/import") {
      const payload = JSON.parse(String(options?.body));
      expect(payload.useAI).toBe(false);
      return {
        ok: true,
        json: async () => ({
          recipe: structuredClone(importedRecipe),
          warnings: [],
        }),
      };
    }
    throw new Error(`予期しないネット接続: ${url}`);
  });
  vi.stubGlobal("fetch", request);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App cooking controls", () => {
  it("uses an app dialog for reset, preserves cooking on cancel, and ends only on confirmation", async () => {
    await showApp();
    beginCooking();
    const sessionId = saved().session.id;
    const recipeIds = saved().recipes.map((recipe: Recipe) => recipe.id);

    fireEvent.click(
      screen.getByRole("button", { name: "調理を終了・やり直す" }),
    );
    let dialog = screen.getByRole("dialog", { name: "調理を終了しますか？" });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(saved().session.id).toBe(sessionId);
    expect(nativeConfirm).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "調理に戻る" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saved().session.id).toBe(sessionId);

    fireEvent.click(
      screen.getByRole("button", { name: "調理を終了・やり直す" }),
    );
    dialog = screen.getByRole("dialog", { name: "調理を終了しますか？" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "タイマーを終了する" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saved().session).toBeNull();
    expect(saved().recipes.map((recipe: Recipe) => recipe.id)).toEqual(
      recipeIds,
    );
    expect(
      screen.getAllByRole("button", { name: "調理をはじめる" }).length,
    ).toBeGreaterThan(0);
  });

  it("replans and saves the burner count before cooking, and locks it while cooking", async () => {
    const view = await showApp();
    const burners = screen.getByRole("combobox", {
      name: "コンロ",
    }) as HTMLSelectElement;
    expect(burners.value).toBe("2");
    const initialMinutes = Number(
      view.container
        .querySelector(".plan-metrics strong")!
        .textContent!.replace(/\D/g, ""),
    );

    fireEvent.change(burners, { target: { value: "1" } });
    expect(burners.value).toBe("1");
    expect(saved().burners).toBe(1);
    const oneBurnerMinutes = Number(
      view.container
        .querySelector(".plan-metrics strong")!
        .textContent!.replace(/\D/g, ""),
    );
    expect(oneBurnerMinutes).toBeGreaterThan(initialMinutes);
    expect(
      screen.getByText("コンロ1口・つくる人1人で段取りを組みます"),
    ).toBeTruthy();

    beginCooking();
    expect(burners.disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "調理を終了・やり直す" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "タイマーを終了する",
      }),
    );
    expect(
      (screen.getByRole("combobox", { name: "コンロ" }) as HTMLSelectElement)
        .disabled,
    ).toBe(false);
    expect(saved().burners).toBe(1);
  });

  it("blocks voice mutations while confirmation or recipe review is open, then allows them after closing", async () => {
    const mic = {
      start: vi.fn(),
      abort: vi.fn(),
      onresult: null as null | ((event: any) => void),
    };
    function Recognition() {
      return mic;
    }
    const browser = await import("./browser");
    vi.mocked(browser.recognitionConstructor).mockReturnValue(Recognition);
    await showApp();
    beginCooking();
    fireEvent.click(screen.getByRole("button", { name: "音声オフ" }));
    expect(mic.start).toHaveBeenCalledOnce();
    const timerId = Object.keys(saved().session.runs).find(
      (id) => saved().session.runs[id].status === "running",
    )!;
    const deadline = saved().session.runs[timerId].deadline;
    const say = (transcript: string) =>
      act(() => {
        mic.onresult!({
          resultIndex: 0,
          results: [Object.assign([{ transcript }], { isFinal: true })],
        });
      });

    fireEvent.click(
      screen.getByRole("button", { name: "調理を終了・やり直す" }),
    );
    say("あと1分");
    say("できた");
    expect(saved().session.runs[timerId].deadline).toBe(deadline);
    expect(saved().session.runs[timerId].status).toBe("running");
    say("次は？");
    expect(browser.speak).toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "調理に戻る",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "鮭のレモンバター焼きの材料を見る" }),
    );
    say("あと1分");
    say("できた");
    expect(saved().session.runs[timerId].deadline).toBe(deadline);
    expect(saved().session.runs[timerId].status).toBe("running");
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: "閉じる",
      })[0],
    );

    say("あと1分");
    expect(saved().session.runs[timerId].deadline).toBe(deadline + 60_000);
    say("できた");
    expect(saved().session.runs[timerId].status).toBe("done");
    vi.mocked(browser.recognitionConstructor).mockReturnValue(undefined);
  });
});

describe("App import review", () => {
  it("does not adopt an imported draft before saving, including when review is closed", async () => {
    await showApp();
    const originalIds = saved().recipes.map((recipe: Recipe) => recipe.id);
    const dialog = await importToReview();
    expect(
      (within(dialog).getByLabelText("料理名") as HTMLInputElement).value,
    ).toBe(importedRecipe.name);
    expect(saved().recipes.map((recipe: Recipe) => recipe.id)).toEqual(
      originalIds,
    );
    expect(saved().selected).not.toContain(importedRecipe.id);
    expect(saved().session).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(saved().recipes.map((recipe: Recipe) => recipe.id)).toEqual(
      originalIds,
    );
    expect(saved().selected).not.toContain(importedRecipe.id);
    expect(
      request.mock.calls.every(([url]) =>
        ["/api/capabilities", "/api/import"].includes(url),
      ),
    ).toBe(true);
  });

  it("adopts the reviewed recipe and adds it to the meal only after explicit save", async () => {
    await showApp();
    const dialog = await importToReview();
    expect(
      saved().recipes.some((recipe: Recipe) => recipe.id === importedRecipe.id),
    ).toBe(false);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "確認して保存" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      saved().recipes.find((recipe: Recipe) => recipe.id === importedRecipe.id)
        ?.name,
    ).toBe(importedRecipe.name);
    expect(saved().selected).toContain(importedRecipe.id);
    expect(screen.getAllByText(importedRecipe.name).length).toBeGreaterThan(0);
    expect(saved().session).toBeNull();
  });
});
