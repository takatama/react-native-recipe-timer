import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CookingPot,
  LayoutDashboard,
  BookOpen,
  Plus,
  Mic,
  MicOff,
  Sun,
  Moon,
  Bell,
  CircleHelp,
  Check,
  X,
  Clock3,
  Flame,
  Hand,
  Play,
  Pause,
  RotateCcw,
  Camera,
  Link2,
  FileText,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Volume2,
  Sparkles,
  Send,
  Maximize2,
  Minimize2,
  Leaf,
  Fish,
  Soup,
  Utensils,
  CheckCircle2,
} from "lucide-react";
import type { Recipe, Session, Step, StepRun } from "./types";
import {
  planRecipes,
  createSession,
  readySteps,
  startStep,
  completeStep,
  pauseStep,
  resumeStep,
  extendStep,
  reconcileSession,
  remainingSeconds,
} from "./engine";
import { readSaved, save } from "./storage";
import {
  speak,
  recognitionConstructor,
  unlockAudio,
  chime,
  notify,
} from "./browser";

const palette = ["#c87545", "#638477", "#8377a0", "#477b98"];
const initial = readSaved();
const fmt = (sec: number) =>
  `${String(Math.floor(Math.max(0, sec) / 60)).padStart(2, "0")}:${String(Math.floor(Math.max(0, sec)) % 60).padStart(2, "0")}`;
const minutes = (sec: number) => Math.max(1, Math.ceil(sec / 60));
const clock = (at: number) =>
  new Date(at).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
function MealIcon({ index, size = 23 }: { index: number; size?: number }) {
  const Icon = [Fish, Leaf, Soup, Utensils][index % 4];
  return <Icon size={size} />;
}
function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      className={`modal ${wide ? "wide" : ""}`}
      ref={ref}
      aria-labelledby={titleId}
      onCancel={close}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={close} aria-label="閉じる">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function scaledAmount(amount: string, multiplier: number) {
  return amount.replace(/\d+(?:\.\d+)?(?:\/\d+)?/, (match) => {
    const parts = match.split("/").map(Number);
    const n = parts.length === 2 ? parts[0] / parts[1] : parts[0];
    return Number((n * multiplier).toFixed(2)).toString();
  });
}

export default function App() {
  const [recipes, setRecipes] = useState(initial.recipes),
    [selected, setSelected] = useState(initial.selected);
  const [session, setSession] = useState<Session | null>(initial.session),
    [servings, setServings] = useState(initial.servings);
  const [burners, setBurners] = useState(initial.burners);
  const [now, setNow] = useState(Date.now()),
    [library, setLibrary] = useState(false),
    [focusMode, setFocusMode] = useState(Boolean(initial.session));
  const [dialog, setDialog] = useState<
      "import" | "help" | "chat" | "reset" | null
    >(null),
    [editing, setEditing] = useState<Recipe | null>(null);
  const [sourcePhoto, setSourcePhoto] = useState("");
  const [toast, setToast] = useState(""),
    [capabilities, setCapabilities] = useState({ ai: false, model: "" });
  const [voice, setVoice] = useState(false),
    [transcript, setTranscript] = useState(""),
    [wakeWanted, setWakeWanted] = useState(false),
    [wakeActive, setWakeActive] = useState(false);
  const recognition = useRef<any>(null),
    voiceWanted = useRef(false),
    wake = useRef<any>(null),
    commandRef = useRef<(text: string) => void>(() => {}),
    notified = useRef(new Set<string>());
  const sessionRecipes = useMemo(
    () =>
      recipes.filter((r) => (session?.recipeIds || selected).includes(r.id)),
    [recipes, selected, session?.recipeIds],
  );
  const plan = useMemo(
    () => planRecipes(sessionRecipes, burners),
    [sessionRecipes, burners],
  );
  const ready = session
    ? readySteps(sessionRecipes, session, now, burners)
    : [];
  const all = sessionRecipes.flatMap((recipe) =>
    recipe.steps.map((step) => ({ recipe, step, run: session?.runs[step.id] })),
  );
  const active = all.filter(
    (item) =>
      item.run && ["running", "attention", "paused"].includes(item.run.status),
  );
  const attention = active.find((item) => item.run?.status === "attention");
  const current =
    attention ||
    active.find((item) => item.step.kind === "hands") ||
    ready[0] ||
    active[0];
  const done = all.filter((item) => item.run?.status === "done").length;
  const finished = !!session && done === all.length && all.length > 0;
  const remainingPlan = useMemo(() => {
    if (!session) return plan;
    const completeIds = new Set(
      Object.entries(session.runs)
        .filter(([, r]) => r.status === "done")
        .map(([id]) => id),
    );
    return planRecipes(
      sessionRecipes
        .map((r) => ({
          ...r,
          steps: r.steps
            .filter((s) => !completeIds.has(s.id))
            .map((s) => {
              const run = session.runs[s.id];
              const dependsOn = s.dependsOn.filter(
                (id) => !completeIds.has(id),
              );
              return {
                ...s,
                dependsOn,
                durationSec:
                  run && ["running", "paused", "attention"].includes(run.status)
                    ? Math.max(1, remainingSeconds(run, now))
                    : s.durationSec,
              };
            }),
        }))
        .filter((r) => r.steps.length),
      burners,
    );
  }, [session, sessionRecipes, now, burners]);

  useEffect(() => {
    fetch("/api/capabilities")
      .then((r) => r.json())
      .then(setCapabilities)
      .catch(() => {});
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    const update = () => {
      const at = Date.now();
      setNow(at);
      setSession((s) => (s ? reconcileSession(s, at) : s));
    };
    const timer = setInterval(update, 500);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (!save({ recipes, selected, session, servings, burners }))
      setToast(
        "このブラウザに保存できません。ページを閉じる前に確認してください。",
      );
  }, [recipes, selected, session, servings, burners]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!session) return;
    all
      .filter((item) => item.run?.status === "attention")
      .forEach(({ recipe, step, run }) => {
        const key = `${session.id}/${step.id}/${run?.deadline}`;
        if (notified.current.has(key)) return;
        notified.current.add(key);
        chime();
        void notify(`${recipe.name}：確認の時間`, step.title);
        if (voice)
          speak(
            `${step.title}。時間になりました。仕上がりを確認してください。`,
          );
      });
  }, [session, voice]);
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      if (
        !wakeWanted ||
        document.visibilityState !== "visible" ||
        !("wakeLock" in navigator)
      )
        return;
      try {
        const lock = await (navigator as any).wakeLock.request("screen");
        if (cancelled) {
          lock.release();
          return;
        }
        wake.current = lock;
        setWakeActive(true);
        lock.addEventListener("release", () => setWakeActive(false));
      } catch {
        setWakeActive(false);
      }
    };
    if (wakeWanted) void acquire();
    else {
      void wake.current?.release();
      setWakeActive(false);
    }
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void wake.current?.release();
    };
  }, [wakeWanted]);
  useEffect(() => {
    if (finished) setWakeWanted(false);
  }, [finished]);

  const readCurrent = () => {
    if (finished) {
      speak("すべての料理ができました。おつかれさまでした。");
      return;
    }
    if (!current) {
      speak("レシピを選んで、調理をはじめてください。");
      return;
    }
    speak(
      `${current.recipe.name}。${current.step.title}。${current.step.detail}${current.run?.status === "running" ? `。残り${minutes(remainingSeconds(current.run, now))}分です。` : ""}`,
    );
  };
  const begin = () => {
    if (!sessionRecipes.length) return;
    unlockAudio();
    const at = Date.now();
    const next = createSession(sessionRecipes, at);
    const first = readySteps(sessionRecipes, next, at, burners)[0];
    setSession(first ? startStep(next, first.step, at) : next);
    setWakeWanted(true);
    setFocusMode(true);
    setLibrary(false);
    setToast("調理をはじめました。できたら「できた」で次へ。");
  };
  const act = () => {
    if (!session || !current) return;
    unlockAudio();
    const at = Date.now();
    if (current.run?.status === "pending" || !current.run) {
      if (ready.some((r) => r.step.id === current.step.id))
        setSession(startStep(session, current.step, at));
    } else if (current.run.status === "paused")
      setSession(resumeStep(session, current.step.id, at));
    else setSession(completeStep(session, current.step.id, at));
  };
  commandRef.current = (text: string) => {
    const command = text.trim().replace(/[。！？!?、\s]/g, "");
    setTranscript(text);
    if (/^(次は|次は何|次の手順|読んで|読み上げて)$/.test(command))
      return readCurrent();
    if (dialog || editing) {
      setToast("画面を閉じてから、音声で調理を操作できます。");
      return;
    }
    if (/^(開始|はじめる|調理をはじめる|スタート)$/.test(command)) {
      if (!session) return begin();
      if (current && (!current.run || current.run.status === "pending"))
        return act();
      setToast("この工程はすでに開始しています。");
      return;
    }
    if (/^(できた|完了|終わった|次へ)$/.test(command)) {
      if (current?.run && ["running", "attention"].includes(current.run.status))
        return act();
      setToast("未開始の工程は「はじめる」で開始できます。");
      return;
    }
    const amount = command.match(/^(?:あと|追加)([1-9一二三四五六七八九])分$/);
    if (
      amount &&
      session &&
      current?.run &&
      ["running", "paused", "attention"].includes(current.run.status)
    ) {
      const n =
        Number(amount[1]) || "一二三四五六七八九".indexOf(amount[1]) + 1;
      setSession(extendStep(session, current.step.id, n * 60, Date.now()));
      setToast(`${current.step.title}を${n}分延長しました。`);
      return;
    }
    if (
      /^(停止|一時停止|計測を停止)$/.test(command) &&
      session &&
      current?.run?.status === "running"
    ) {
      setSession(pauseStep(session, current.step.id, Date.now()));
      return;
    }
    if (
      /^(再開|計測を再開)$/.test(command) &&
      session &&
      current?.run?.status === "paused"
    ) {
      setSession(resumeStep(session, current.step.id, Date.now()));
      return;
    }
    setToast(
      "「はじめる」「できた」「次は？」「あと1分」「一時停止」「再開」で操作できます。",
    );
  };
  const toggleVoice = () => {
    if (voiceWanted.current) {
      voiceWanted.current = false;
      recognition.current?.abort();
      setVoice(false);
      return;
    }
    const Recognition = recognitionConstructor();
    if (!Recognition) {
      setToast(
        "このブラウザは音声操作に対応していません。ボタンでも同じ操作ができます。",
      );
      return;
    }
    unlockAudio();
    const mic = new Recognition();
    mic.lang = "ja-JP";
    mic.continuous = true;
    mic.interimResults = false;
    mic.onresult = (event: any) => {
      if (recognition.current !== mic || window.speechSynthesis?.speaking)
        return;
      for (let i = event.resultIndex; i < event.results.length; i++)
        if (event.results[i].isFinal)
          commandRef.current(event.results[i][0].transcript);
    };
    mic.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      voiceWanted.current = false;
      setVoice(false);
      setToast(
        event.error === "not-allowed"
          ? "マイクが許可されていません。ブラウザの設定を確認してください。"
          : "音声を利用できません。接続とマイクを確認してください。",
      );
    };
    mic.onend = () => {
      if (recognition.current === mic && voiceWanted.current)
        setTimeout(() => {
          if (voiceWanted.current)
            try {
              mic.start();
            } catch {
              voiceWanted.current = false;
              setVoice(false);
            }
        }, 350);
    };
    recognition.current = mic;
    voiceWanted.current = true;
    try {
      mic.start();
      setVoice(true);
      setToast(
        "音声操作オン。音声はブラウザ提供元に送信される場合があります。",
      );
    } catch {
      voiceWanted.current = false;
      setVoice(false);
      setToast("音声を開始できませんでした。");
    }
  };
  useEffect(
    () => () => {
      voiceWanted.current = false;
      recognition.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        dialog ||
        editing ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
          (event.target as HTMLElement).tagName,
        )
      )
        return;
      event.preventDefault();
      session ? act() : begin();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const toggleSelected = (id: string) => {
    if (session) {
      setToast("調理を終えてから、献立を変更できます。");
      return;
    }
    setSelected((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
  };
  const reset = () => setDialog("reset");
  const confirmReset = () => {
    setSession(null);
    setWakeWanted(false);
    setFocusMode(false);
    notified.current.clear();
    setDialog(null);
  };
  const storeRecipe = (recipe: Recipe) => {
    setRecipes((list) =>
      list.some((r) => r.id === recipe.id)
        ? list.map((r) => (r.id === recipe.id ? recipe : r))
        : [...list, recipe],
    );
    if (!session)
      setSelected((list) =>
        list.includes(recipe.id) ? list : [...list, recipe.id],
      );
    setEditing(null);
    setSourcePhoto("");
    setToast("レシピを保存しました。");
  };

  return (
    <div className={`app ${focusMode ? "focus-mode" : ""}`}>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Kitchenflow ホーム">
          <span className="brand-mark">
            <CookingPot size={23} />
          </span>
          <span>
            kitchenflow
            <span className="brand-caption">YOUR KITCHEN COMPANION</span>
          </span>
        </a>
        <div className="nav-label">キッチン</div>
        <nav>
          <button
            className={!library ? "nav-item active" : "nav-item"}
            onClick={() => setLibrary(false)}
          >
            <LayoutDashboard size={19} />
            今日の料理<span className="nav-count">{sessionRecipes.length}</span>
          </button>
          <button
            className={library ? "nav-item active" : "nav-item"}
            onClick={() => setLibrary(true)}
          >
            <BookOpen size={19} />
            レシピノート
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="tiny-icon">
              <BookOpen size={16} />
            </span>
            <span>
              あなたのレシピは
              <br />
              このブラウザに保存
            </span>
          </div>
          <button className="nav-item" onClick={() => setDialog("help")}>
            <CircleHelp size={19} />
            使い方と端末の設定
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            キッチン <span>/</span>{" "}
            <strong>{library ? "レシピノート" : "今日の料理"}</strong>
          </div>
          <div className="top-tools">
            <button
              className={`tool ${voice ? "on" : ""}`}
              onClick={toggleVoice}
            >
              {voice ? <Mic size={17} /> : <MicOff size={17} />}
              <span>音声{voice ? "オン" : "オフ"}</span>
            </button>
            <button
              className={`tool ${wakeActive ? "on" : ""}`}
              onClick={() => {
                if (!("wakeLock" in navigator))
                  setToast(
                    "この端末は画面の維持に対応していません。端末の自動ロック設定を確認してください。",
                  );
                else setWakeWanted(!wakeWanted);
              }}
              title="調理中に画面が暗くなるのを防ぎます"
            >
              {wakeActive ? <Sun size={17} /> : <Moon size={17} />}
              <span>{wakeActive ? "画面を維持中" : "画面を維持"}</span>
            </button>
            <button
              className="icon-button"
              aria-label="使い方"
              onClick={() => setDialog("help")}
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {session
                  ? finished
                    ? "ALL DONE"
                    : "COOKING TOGETHER"
                  : "LET’S COOK"}
              </div>
              <h1>
                {library
                  ? "レシピノート"
                  : finished
                    ? "できあがり。いただきます。"
                    : session
                      ? "ひとつずつ、おいしく。"
                      : "今日、何をつくる？"}
              </h1>
              <p>
                {library
                  ? "いつもの料理も、新しい料理も。"
                  : session
                    ? `${done} / ${all.length} 工程が完了${finished ? "" : " · 次にすることを、ここで確認。"}`
                    : "つくる料理を選ぶと、段取りがひとつに。"}
              </p>
            </div>
            <div className="page-actions">
              {!session && !library && (
                <button
                  className="button primary"
                  disabled={!sessionRecipes.length}
                  onClick={begin}
                >
                  <Play size={17} fill="currentColor" />
                  調理をはじめる
                </button>
              )}
              <button
                className="button outline add-recipe"
                onClick={() => setDialog("import")}
              >
                <Plus size={18} />
                レシピを取り込む
              </button>
            </div>
          </div>
          {library ? (
            <section className="library-grid">
              {recipes.map((recipe, index) => (
                <article className="library-card" key={recipe.id}>
                  <div
                    className="meal-symbol"
                    style={{
                      color: recipe.color,
                      background: `${recipe.color}16`,
                    }}
                  >
                    <MealIcon index={index} size={29} />
                  </div>
                  <h2>{recipe.name}</h2>
                  <p>{recipe.description}</p>
                  <div className="muted">
                    <Clock3 size={15} />
                    {minutes(
                      recipe.steps.reduce((n, s) => n + s.durationSec, 0),
                    )}
                    分 · {recipe.steps.length}工程 · {recipe.servings}人分
                  </div>
                  <div className="library-actions">
                    <button
                      className="button outline"
                      disabled={!!session}
                      onClick={() => toggleSelected(recipe.id)}
                    >
                      {selected.includes(recipe.id) ? (
                        <Check size={16} />
                      ) : (
                        <Plus size={16} />
                      )}{" "}
                      {selected.includes(recipe.id)
                        ? "今日の料理に追加済み"
                        : "今日の料理に追加"}
                    </button>
                    <button
                      className="icon-button"
                      disabled={session?.recipeIds.includes(recipe.id)}
                      aria-label={`${recipe.name}を編集`}
                      onClick={() => setEditing(recipe)}
                    >
                      <Pencil size={18} />
                    </button>
                  </div>
                </article>
              ))}
              <button
                className="new-recipe-card"
                onClick={() =>
                  setEditing({
                    id: crypto.randomUUID(),
                    name: "",
                    description: "",
                    servings: 2,
                    ingredients: [],
                    steps: [
                      {
                        id: crypto.randomUUID(),
                        title: "",
                        detail: "",
                        durationSec: 60,
                        kind: "hands",
                        resource: "none",
                        dependsOn: [],
                      },
                    ],
                    color: palette[recipes.length % palette.length],
                  })
                }
              >
                <Plus size={27} />
                <span>手入力でレシピをつくる</span>
              </button>
            </section>
          ) : (
            <>
              <section className="meal-section">
                <div className="section-line">
                  <h2>
                    今日の料理{" "}
                    <span className="muted">{sessionRecipes.length}品</span>
                  </h2>
                  <div className="kitchen-controls">
                    <label className="burner-control">
                      <Flame size={15} />
                      コンロ
                      <select
                        value={burners}
                        disabled={!!session}
                        onChange={(e) => setBurners(Number(e.target.value))}
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option value={n} key={n}>
                            {n}口
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="servings-control">
                      <span>人数</span>
                      <button
                        aria-label="人数を減らす"
                        disabled={servings <= 1 || !!session}
                        onClick={() => setServings((s) => s - 1)}
                      >
                        −
                      </button>
                      <strong>{servings}人分</strong>
                      <button
                        aria-label="人数を増やす"
                        disabled={servings >= 12 || !!session}
                        onClick={() => setServings((s) => s + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
                <div className="meal-grid">
                  {sessionRecipes.map((recipe, index) => (
                    <article
                      className="meal-card"
                      key={recipe.id}
                      style={{ "--meal-color": recipe.color } as any}
                    >
                      <div className="meal-symbol">
                        <MealIcon index={recipes.indexOf(recipe)} />
                      </div>
                      <div className="meal-text">
                        <div className="meal-category">
                          {index === 0
                            ? "MAIN"
                            : index === 1
                              ? "SIDE"
                              : "SOUP & MORE"}
                        </div>
                        <h3>{recipe.name}</h3>
                        <span>
                          {recipe.steps.length}工程 ·{" "}
                          {minutes(
                            recipe.steps.reduce((n, s) => n + s.durationSec, 0),
                          )}
                          分
                        </span>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`${recipe.name}${session ? "の材料を見る" : "を献立から外す"}`}
                        onClick={() =>
                          session
                            ? setEditing(recipe)
                            : toggleSelected(recipe.id)
                        }
                      >
                        {session ? <BookOpen size={16} /> : <X size={16} />}
                      </button>
                    </article>
                  ))}
                  {!session && (
                    <button
                      className="meal-add"
                      onClick={() => setLibrary(true)}
                      aria-label="献立に料理を追加"
                    >
                      <Plus size={22} />
                      <span>料理を追加</span>
                    </button>
                  )}
                </div>
              </section>
              <div className="cooking-grid">
                <div className="main-column">
                  <section
                    className={`focus-card ${attention ? "attention-card" : ""}`}
                  >
                    <div className="focus-top">
                      <span className="focus-label">
                        {finished ? (
                          <CheckCircle2 size={17} />
                        ) : session ? (
                          attention ? (
                            <Bell size={17} />
                          ) : (
                            <Hand size={17} />
                          )
                        ) : (
                          <Utensils size={17} />
                        )}{" "}
                        {finished
                          ? "すべての工程が完了"
                          : session
                            ? attention
                              ? "仕上がりを確認してください"
                              : current?.step.kind === "wait" &&
                                  current.run?.status === "running"
                                ? "いまは、待ち時間"
                                : "いま、すること"
                            : "準備ができたら"}
                      </span>
                      <button
                        className="focus-toggle"
                        aria-label={
                          focusMode ? "通常の表示に戻す" : "大きな表示にする"
                        }
                        onClick={() => setFocusMode(!focusMode)}
                      >
                        {focusMode ? (
                          <Minimize2 size={19} />
                        ) : (
                          <Maximize2 size={19} />
                        )}
                      </button>
                    </div>
                    {!session ? (
                      <>
                        <div className="plan-title">
                          <span className="focus-kicker">
                            {sessionRecipes.length}品を、ひとつの流れで。
                          </span>
                          <h2>
                            段取りは、
                            <br />
                            ここにおまかせ。
                          </h2>
                          <p>
                            待ち時間に、次の料理を。
                            <br />
                            あなたのペースで進められます。
                          </p>
                        </div>
                        <div className="plan-metrics">
                          <div>
                            <span>できあがりの目安</span>
                            <strong>
                              {sessionRecipes.length
                                ? minutes(plan.durationSec)
                                : "—"}
                              <small>分</small>
                            </strong>
                          </div>
                          <div>
                            <span>順番につくる場合</span>
                            <strong className="secondary-metric">
                              {sessionRecipes.length
                                ? minutes(plan.sequentialSec)
                                : "—"}
                              <small>分</small>
                            </strong>
                          </div>
                        </div>
                        <div className="focus-footnote">
                          <Flame size={14} />
                          コンロ{burners}口・つくる人1人で段取りを組みます
                        </div>
                      </>
                    ) : finished ? (
                      <div className="finished">
                        <CookingPot size={64} strokeWidth={1.25} />
                        <h2>おつかれさまでした。</h2>
                        <p>食卓を囲む時間を、どうぞ。</p>
                        <button className="button primary" onClick={reset}>
                          調理を終了する
                        </button>
                      </div>
                    ) : current ? (
                      <>
                        <div className="focus-kicker">
                          <span
                            className="recipe-dot"
                            style={{ background: current.recipe.color }}
                          />
                          {current.recipe.name}
                          <span>
                            {" "}
                            · STEP{" "}
                            {current.recipe.steps.indexOf(current.step) + 1}
                          </span>
                        </div>
                        <h2 className="step-title">{current.step.title}</h2>
                        <p className="step-detail">
                          {current.step.detail ||
                            "レシピの手順に沿って進めてください。"}
                        </p>
                        <div className="step-timing">
                          <Clock3 size={20} />
                          {current.run?.status === "running" ? (
                            <strong>
                              {fmt(remainingSeconds(current.run, now))}
                            </strong>
                          ) : current.run?.status === "attention" ? (
                            <strong>確認の時間</strong>
                          ) : current.run?.status === "paused" ? (
                            <strong>
                              {fmt(remainingSeconds(current.run, now))}
                              <small> 計測を停止中</small>
                            </strong>
                          ) : (
                            <strong>
                              約{minutes(current.step.durationSec)}分
                            </strong>
                          )}
                          <span>
                            {current.step.kind === "hands"
                              ? "手を動かす作業"
                              : "待つ作業"}
                            {current.step.resource === "burner"
                              ? " · コンロ"
                              : current.step.resource === "oven"
                                ? " · オーブン"
                                : ""}
                          </span>
                        </div>
                        <div className="focus-actions">
                          <button className="button primary" onClick={act}>
                            {current.run?.status === "pending" ||
                            !current.run ? (
                              <>
                                <Play size={18} />
                                この工程をはじめる
                              </>
                            ) : current.run.status === "paused" ? (
                              <>
                                <Play size={18} />
                                計測を再開
                              </>
                            ) : (
                              <>
                                <Check size={20} />
                                {current.run.status === "attention"
                                  ? "確認できた・完了"
                                  : "できた・完了"}
                              </>
                            )}
                          </button>
                          <button
                            className="button dark-outline"
                            onClick={readCurrent}
                            aria-label="現在の手順を読み上げる"
                          >
                            <Volume2 size={19} />
                            <span>読み上げ</span>
                          </button>
                        </div>
                        <div className="focus-footnote">
                          <Mic size={14} />
                          {voice
                            ? "「はじめる」「できた」「次は？」「あと1分」で操作"
                            : "音声をオンにすると、手を使わずに操作できます"}
                        </div>
                      </>
                    ) : (
                      <div className="finished">
                        <Clock3 size={50} />
                        <h2>進行状況を確認</h2>
                        <p>
                          右側のタイマーから、完了した作業を確認してください。
                        </p>
                      </div>
                    )}
                  </section>
                  {session &&
                    !finished &&
                    !attention &&
                    ready.length > 0 &&
                    current?.step.id !== ready[0].step.id && (
                      <section className="next-task">
                        <span className="next-icon">
                          <Hand size={20} />
                        </span>
                        <div>
                          <span>
                            {current?.step.id === ready[0].step.id
                              ? "次に取りかかれる作業"
                              : "待ち時間にできること"}
                          </span>
                          <strong>{ready[0].step.title}</strong>
                          <small>
                            {ready[0].recipe.name} · 約
                            {minutes(ready[0].step.durationSec)}分
                          </small>
                        </div>
                        <button
                          className="button outline"
                          onClick={() => {
                            unlockAudio();
                            setSession(
                              startStep(session, ready[0].step, Date.now()),
                            );
                          }}
                        >
                          はじめる
                        </button>
                      </section>
                    )}
                  <Timeline
                    recipes={sessionRecipes}
                    plan={plan}
                    session={session}
                    now={now}
                  />
                </div>
                <aside className="right-column">
                  <section className="panel timer-panel">
                    <div className="section-line">
                      <h2>
                        <Clock3 size={18} />{" "}
                        {session ? "進行中のタイマー" : "今日の流れ"}
                      </h2>
                      {session && (
                        <span className="count-badge">{active.length}</span>
                      )}
                    </div>
                    {!session ? (
                      <>
                        <div className="flow-list">
                          {plan.tasks.slice(0, 5).map((task, index) => {
                            const recipe = sessionRecipes.find(
                              (r) => r.id === task.recipeId,
                            )!;
                            const step = recipe.steps.find(
                              (s) => s.id === task.stepId,
                            )!;
                            return (
                              <div className="flow-item" key={step.id}>
                                <span className="flow-number">
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                <div>
                                  <strong>{step.title}</strong>
                                  <span>{recipe.name}</span>
                                </div>
                                <span className="flow-time">
                                  {minutes(step.durationSec)}分
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="panel-note">
                          待つ工程は並行して進めます。
                          <br />
                          時間は目安。仕上がりは自分で確認。
                        </p>
                      </>
                    ) : active.length ? (
                      <div className="timer-list">
                        {active.map(({ recipe, step, run }) => (
                          <TimerCard
                            key={step.id}
                            recipe={recipe}
                            step={step}
                            run={run!}
                            now={now}
                            change={setSession}
                            session={session}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="empty-timers">
                        <Clock3 size={31} />
                        <p>
                          {finished
                            ? "タイマーはすべて完了しました。"
                            : "作業をはじめると、ここに表示されます。"}
                        </p>
                      </div>
                    )}
                  </section>
                  <section className="assistant-panel">
                    <div className="assistant-icon">
                      <Sparkles size={22} />
                    </div>
                    <h2>キッチンで、ひとりにしない。</h2>
                    <p>
                      手順を聞き直したいときも、
                      <br />
                      つくり方に迷ったときも。
                    </p>
                    <button
                      className="button outline"
                      onClick={() => setDialog("chat")}
                    >
                      <Sparkles size={16} />
                      相談する
                    </button>
                  </section>
                  <section className="finish-estimate">
                    <span>
                      <Clock3 size={17} />
                      {finished
                        ? "調理時間"
                        : session
                          ? "できあがりの目安"
                          : "いまはじめると"}
                    </span>
                    <strong>
                      {finished
                        ? `${minutes((Math.max(...Object.values(session!.runs).map((r) => r.completedAt || session!.startedAt)) - session!.startedAt) / 1000)}分`
                        : clock(
                            now +
                              (session
                                ? remainingPlan.durationSec
                                : plan.durationSec) *
                                1000,
                          )}
                    </strong>
                    <p>
                      {session
                        ? "作業の進み具合で変わります"
                        : "手順の時間と並行作業から計算"}
                    </p>
                  </section>
                  {session && (
                    <button className="end-session" onClick={reset}>
                      <RotateCcw size={15} />
                      調理を終了・やり直す
                    </button>
                  )}
                </aside>
              </div>
              <section className="ingredient-panel">
                <div className="section-line">
                  <h2>材料のチェック</h2>
                  <span className="muted">
                    {servings}人分 · 分量を調整して表示
                  </span>
                </div>
                <div className="ingredients-grid">
                  {sessionRecipes.map((recipe) => (
                    <div key={recipe.id}>
                      <h3>
                        <span
                          className="recipe-dot"
                          style={{ background: recipe.color }}
                        />
                        {recipe.name}
                      </h3>
                      {recipe.ingredients.length ? (
                        recipe.ingredients.map((ingredient, i) => (
                          <label
                            className="ingredient"
                            key={`${recipe.id}-${i}-${servings}`}
                          >
                            <input type="checkbox" />
                            <span>{ingredient.name}</span>
                            <span>
                              {scaledAmount(
                                ingredient.amount,
                                servings / recipe.servings,
                              )}
                            </span>
                          </label>
                        ))
                      ) : (
                        <p className="muted">材料の記載がありません</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          <footer>
            <span>
              kitchenflow <span>·</span> 料理の時間に、少しの余裕を。
            </span>
            <button onClick={() => setDialog("help")}>
              音声・通知・保存について
            </button>
          </footer>
        </main>
      </div>
      {voice && (
        <div className="voice-strip">
          <Mic size={16} />
          <span>
            {transcript
              ? `聞き取り：${transcript}`
              : "「はじめる」「できた」「次は？」「あと1分」"}
          </span>
          <button aria-label="音声を停止" onClick={toggleVoice}>
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="メッセージを閉じる" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {dialog === "import" && (
        <ImportDialog
          ai={capabilities.ai}
          close={() => setDialog(null)}
          review={(recipe, photo) => {
            setDialog(null);
            setEditing(recipe);
            setSourcePhoto(photo || "");
          }}
        />
      )}
      {editing && (
        <RecipeEditor
          recipe={editing}
          sourcePhoto={sourcePhoto}
          readOnly={!!session?.recipeIds.includes(editing.id)}
          close={() => {
            setEditing(null);
            setSourcePhoto("");
          }}
          saveRecipe={storeRecipe}
          remove={() => {
            setRecipes((list) => list.filter((r) => r.id !== editing.id));
            setSelected((list) => list.filter((id) => id !== editing.id));
            setEditing(null);
            setSourcePhoto("");
          }}
        />
      )}
      {dialog === "chat" && (
        <ChatDialog
          ai={capabilities.ai}
          current={current}
          session={session}
          close={() => setDialog(null)}
          command={(text) => commandRef.current(text)}
        />
      )}
      {dialog === "reset" && (
        <Modal title="調理を終了しますか？" close={() => setDialog(null)}>
          <p className="dialog-intro">
            動いているタイマーと、この調理の進行記録を終了します。レシピは保存されています。
          </p>
          <div className="confirmation-actions">
            <button className="button outline" onClick={() => setDialog(null)}>
              調理に戻る
            </button>
            <button className="button primary" onClick={confirmReset}>
              タイマーを終了する
            </button>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="調理前に、ひとつだけ。" close={() => setDialog(null)}>
          <div className="help-content">
            <p className="help-important">
              タイマーを確実に確認できるよう、調理中はこの画面を開いてお使いください。
            </p>
            <p>
              画面を維持する機能は、対応端末で使えます。ブラウザを閉じたり端末をロックすると、音や通知が遅れる・届かない場合があります。戻ったときは経過した時間を補正します。
            </p>
            <h3>音声で、手を休めずに</h3>
            <p>
              音声をオンにして「はじめる」「できた」「次は？」「あと1分」「一時停止」「再開」。音声はブラウザ提供元へ送られる場合があり、通信とマイクの許可が必要です。対応しない端末ではボタンをご利用ください。
            </p>
            <h3>時間が来たら、自分で確認</h3>
            <p>
              時間が来ても、作業を勝手に完了しません。火の通りは写真から判断しません。人数を変えた場合も、加熱時間は自動で変えません。
            </p>
            <h3>あなたの端末に保存</h3>
            <p>
              レシピと進行状況はこのブラウザに保存します。保存済みの料理は、初回読み込み後はオフラインでも使えます。ブラウザのデータ削除で消えます。写真や文章のAI取り込み・相談はGoogleに内容を送信します。
            </p>
            <button
              className="button outline"
              onClick={async () => {
                if (!("Notification" in window)) {
                  setToast("このブラウザは通知に対応していません。");
                  return;
                }
                try {
                  const permission = await Notification.requestPermission();
                  setToast(
                    permission === "granted"
                      ? "通知を有効にしました。調理中は画面を開いておいてください。"
                      : "通知は許可されていません。画面上でお知らせします。",
                  );
                } catch {
                  setToast("通知を有効にできませんでした。");
                }
              }}
            >
              <Bell size={17} />
              通知を有効にする
            </button>
            <p className="muted">
              スマホのホーム画面にも追加できます。端末への追加方法はブラウザの共有・メニューから確認できます。
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TimerCard({
  recipe,
  step,
  run,
  now,
  session,
  change,
}: {
  recipe: Recipe;
  step: Step;
  run: StepRun;
  now: number;
  session: Session;
  change: (s: Session) => void;
}) {
  const remaining = remainingSeconds(run, now);
  const progress = Math.max(
    0,
    Math.min(100, 100 - (remaining / step.durationSec) * 100),
  );
  return (
    <article
      className={`timer-card ${run.status === "attention" ? "due" : ""}`}
    >
      <div className="timer-recipe">
        <span className="recipe-dot" style={{ background: recipe.color }} />
        {recipe.name}
      </div>
      <h3>{step.title}</h3>
      <div className="timer-display">
        <strong>
          {run.status === "attention" ? "確認の時間" : fmt(remaining)}
        </strong>
        <span>
          {run.status === "paused"
            ? "計測停止中"
            : run.status === "attention"
              ? "仕上がりを確認"
              : step.kind === "wait"
                ? "待つ作業"
                : "作業中"}
        </span>
      </div>
      <div className="timer-progress">
        <span style={{ width: `${progress}%`, background: recipe.color }} />
      </div>
      <div className="timer-actions">
        <button
          onClick={() => change(extendStep(session, step.id, 60, Date.now()))}
        >
          +1分
        </button>
        <button
          aria-label={
            run.status === "paused"
              ? `${step.title}の計測を再開`
              : `${step.title}の計測を停止`
          }
          disabled={run.status === "attention"}
          onClick={() =>
            change(
              run.status === "paused"
                ? resumeStep(session, step.id, Date.now())
                : pauseStep(session, step.id, Date.now()),
            )
          }
        >
          {run.status === "paused" ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button
          onClick={() => change(completeStep(session, step.id, Date.now()))}
        >
          <Check size={15} />
          完了
        </button>
      </div>
    </article>
  );
}

function Timeline({
  recipes,
  plan,
  session,
  now,
}: {
  recipes: Recipe[];
  plan: ReturnType<typeof planRecipes>;
  session: Session | null;
  now: number;
}) {
  const max = Math.max(60, plan.durationSec),
    mark = [0, 0.25, 0.5, 0.75, 1];
  return (
    <section className="panel timeline-panel">
      <div className="section-line">
        <h2>段取りの見取り図</h2>
        <div className="timeline-legend">
          <span>
            <i />
            作業
          </span>
          <span>
            <i className="striped" />
            待ち時間
          </span>
        </div>
      </div>
      <div className="timeline-caption">
        {session
          ? "調理前に組んだ段取り · 実際の進行はタイマーで確認"
          : "同時にできることを、無理なく。"}
      </div>
      <div className="time-scale">
        <span />
        {mark.map((m) => (
          <span key={m}>{Math.round((max * m) / 60)}分</span>
        ))}
      </div>
      <div className="timeline-lanes">
        {recipes.map((recipe, index) => (
          <div className="timeline-lane" key={recipe.id}>
            <span className="lane-name">
              <MealIcon index={index} size={16} />
              <span>{recipe.name}</span>
            </span>
            <div className="lane-track">
              {plan.tasks
                .filter((task) => task.recipeId === recipe.id)
                .map((task) => {
                  const step = recipe.steps.find((s) => s.id === task.stepId)!;
                  const completed = session?.runs[step.id]?.status === "done";
                  return (
                    <div
                      key={task.stepId}
                      title={`${step.title} · ${minutes(step.durationSec)}分${completed ? " · 完了" : ""}`}
                      className={`timeline-block ${step.kind === "wait" ? "striped" : ""} ${completed ? "completed" : ""}`}
                      style={{
                        left: `${(task.startSec / max) * 100}%`,
                        width: `${((task.endSec - task.startSec) / max) * 100}%`,
                        backgroundColor: recipe.color,
                      }}
                    >
                      {completed ? <Check size={12} /> : null}
                    </div>
                  );
                })}
              {session && (
                <span
                  className="now-line"
                  style={{
                    left: `${Math.min(100, ((now - session.startedAt) / 1000 / max) * 100)}%`,
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="timeline-note">
        <Hand size={14} />
        作業はひとつずつ。待ち時間は重ねて、手際よく。
      </p>
    </section>
  );
}

function ImportDialog({
  ai,
  close,
  review,
}: {
  ai: boolean;
  close: () => void;
  review: (r: Recipe, photo?: string) => void;
}) {
  const [tab, setTab] = useState<"text" | "url" | "photo">("text"),
    [text, setText] = useState(""),
    [url, setUrl] = useState(""),
    [image, setImage] = useState<{ mimeType: string; data: string } | null>(
      null,
    ),
    [useAI, setUseAI] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [fileName, setFileName] = useState("");
  const file = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setError("JPEG・PNG・WebPの写真を選んでください。");
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setError("写真は4MB以下にしてください。");
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
    setImage({ mimeType: f.type, data });
    setFileName(f.name);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          tab === "photo"
            ? { image, useAI: true }
            : tab === "url"
              ? { url, useAI }
              : { text, useAI },
        ),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "取り込めませんでした。");
      review(
        {
          ...result.recipe,
          warnings: result.warnings,
          sourceText: tab === "text" ? text : undefined,
          description:
            result.recipe.description ||
            "取り込んだレシピ。工程と時間を確認してください。",
        },
        tab === "photo" && image
          ? `data:${image.mimeType};base64,${image.data}`
          : undefined,
      );
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "接続できませんでした。オンラインに戻ってから取り込んでください。"
          : e instanceof Error
            ? e.message
            : "接続を確認してください。",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal title="レシピを取り込む" close={close}>
      <form onSubmit={submit}>
        <p className="dialog-intro">いつものレシピを、調理中に使える手順に。</p>
        <div className="import-tabs">
          {(
            [
              ["text", FileText, "文章"],
              ["url", Link2, "URL"],
              ["photo", Camera, "写真"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              type="button"
              className={tab === id ? "selected" : ""}
              onClick={() => {
                setTab(id);
                setError("");
              }}
              key={id}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
        {tab === "text" ? (
          <label className="field">
            レシピの文章
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={
                "レシピ名\n材料：じゃがいも2個、塩少々\n1. じゃがいもを切る（3分）\n2. 鍋でゆでる（12分）\n3. 水を切り、塩で味を調える（1分）"
              }
              required
              maxLength={20000}
            />
            <small>
              AIを使わない場合、改行ごとに工程にします。時間がなければ1分の仮置き。
            </small>
          </label>
        ) : tab === "url" ? (
          <label className="field">
            レシピのURL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              required
            />
            <small>
              公開ページに対応。読み取れないページは文章を貼り付けてください。
            </small>
          </label>
        ) : (
          <>
            <label className="photo-drop">
              <Camera size={34} />
              <strong>{fileName || "レシピを撮影・写真を選ぶ"}</strong>
              <span>本やメモのレシピも、そのまま。</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(e) => void file(e.target.files?.[0])}
              />
            </label>
            {image && (
              <img
                className="import-preview"
                src={`data:${image.mimeType};base64,${image.data}`}
                alt="取り込むレシピの写真"
              />
            )}
            {!ai && (
              <p className="form-error">
                写真の読み取りにはAIの設定が必要です。文章からも取り込めます。
              </p>
            )}
          </>
        )}
        {tab !== "photo" && (
          <label className="check-line">
            <input
              type="checkbox"
              checked={useAI}
              disabled={!ai}
              onChange={(e) => setUseAI(e.target.checked)}
            />
            <span>
              {ai
                ? "AIで工程と待ち時間を整理する"
                : "AI未設定 · 文章の取り込みは使えます"}
            </span>
          </label>
        )}
        {(useAI || tab === "photo") && (
          <p className="privacy-note">
            <Sparkles size={15} />
            内容をGoogleに送信して手順案を作成します。AI利用には料金がかかる場合があります。保存前に確認できます。
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="button primary wide-button"
          disabled={loading || (tab === "photo" && (!image || !ai))}
        >
          {loading ? (
            "手順を読み取っています…"
          ) : (
            <>
              <Sparkles size={17} />
              手順案をつくる
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}

function RecipeEditor({
  recipe,
  sourcePhoto,
  readOnly,
  close,
  saveRecipe,
  remove,
}: {
  recipe: Recipe;
  sourcePhoto?: string;
  readOnly: boolean;
  close: () => void;
  saveRecipe: (r: Recipe) => void;
  remove: () => void;
}) {
  const [draft, setDraft] = useState<Recipe>(structuredClone(recipe)),
    [ingredientText, setIngredientText] = useState(
      recipe.ingredients.map((i) => `${i.name} | ${i.amount}`).join("\n"),
    ),
    [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (index: number, key: keyof Step, value: any) =>
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
    }));
  const move = (index: number, delta: number) =>
    setDraft((d) => {
      const steps = [...d.steps];
      [steps[index], steps[index + delta]] = [
        steps[index + delta],
        steps[index],
      ];
      return {
        ...d,
        steps: steps.map((step, index) => ({
          ...step,
          dependsOn: index ? [steps[index - 1].id] : [],
        })),
      };
    });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (
      !draft.name.trim() ||
      !draft.steps.length ||
      draft.steps.some(
        (s) =>
          !s.title.trim() ||
          !Number.isFinite(s.durationSec) ||
          s.durationSec < 1 ||
          s.durationSec > 86400,
      )
    ) {
      setError("料理名・工程名・1秒以上の時間を入力してください。");
      return;
    }
    saveRecipe({
      ...draft,
      name: draft.name.trim(),
      ingredients: ingredientText
        .split("\n")
        .filter((s) => s.trim())
        .map((line) => {
          const [name, ...amount] = line.split("|");
          return { name: name.trim(), amount: amount.join("|").trim() };
        }),
      steps: draft.steps,
    });
  };
  return (
    <Modal
      title={readOnly ? "レシピと材料" : "レシピと手順を確認"}
      close={close}
      wide
    >
      <form onSubmit={submit}>
        <p className="dialog-intro">
          {readOnly
            ? "調理中のレシピです。"
            : "時間は目安です。特に加熱の時間と待つ工程を確認してください。"}
        </p>
        <>
          {draft.warnings?.length ? (
            <div className="review-warnings">
              {draft.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
            </div>
          ) : null}
        </>
        <fieldset disabled={readOnly}>
          <div className="editor-top">
            <label className="field">
              料理名
              <input
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
                required
                maxLength={100}
              />
            </label>
            <label className="field compact-field">
              元の人数
              <input
                type="number"
                min="1"
                max="12"
                step="1"
                value={draft.servings}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, servings: Number(e.target.value) }))
                }
                required
              />
            </label>
          </div>
          <label className="field">
            材料 <small>1行に「材料名 | 分量」</small>
            <textarea
              rows={3}
              value={ingredientText}
              onChange={(e) => setIngredientText(e.target.value)}
            />
          </label>
          <div className="editor-steps">
            {draft.steps.map((step, index) => (
              <article className="editor-step" key={step.id}>
                <div className="editor-step-heading">
                  <strong>STEP {index + 1}</strong>
                  <div>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={readOnly || index === 0}
                      aria-label={`工程${index + 1}を上へ`}
                      onClick={() => move(index, -1)}
                    >
                      <ChevronUp size={17} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={readOnly || index === draft.steps.length - 1}
                      aria-label={`工程${index + 1}を下へ`}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronDown size={17} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`工程${index + 1}を削除`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          steps: d.steps
                            .filter((_, i) => i !== index)
                            .map((s) => ({
                              ...s,
                              dependsOn: [
                                ...new Set(
                                  s.dependsOn.flatMap((id) =>
                                    id === d.steps[index].id
                                      ? d.steps[index].dependsOn
                                      : [id],
                                  ),
                                ),
                              ],
                            })),
                        }))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <label className="field">
                  やること
                  <input
                    value={step.title}
                    onChange={(e) => update(index, "title", e.target.value)}
                    required
                    maxLength={160}
                  />
                </label>
                <label className="field">
                  手順の詳細
                  <textarea
                    rows={2}
                    value={step.detail}
                    onChange={(e) => update(index, "detail", e.target.value)}
                    maxLength={2000}
                  />
                </label>
                <div className="step-fields">
                  <label className="field">
                    目安の時間（分）
                    <input
                      type="number"
                      min="0.016"
                      max="1440"
                      step="any"
                      value={Number((step.durationSec / 60).toFixed(3))}
                      onChange={(e) =>
                        update(
                          index,
                          "durationSec",
                          Math.round(Number(e.target.value) * 60),
                        )
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    作業の種類
                    <select
                      value={step.kind}
                      onChange={(e) => update(index, "kind", e.target.value)}
                    >
                      <option value="hands">手を動かす</option>
                      <option value="wait">待つ</option>
                    </select>
                  </label>
                  <label className="field">
                    使うもの
                    <select
                      value={step.resource}
                      onChange={(e) =>
                        update(index, "resource", e.target.value)
                      }
                    >
                      <option value="none">コンロを使わない</option>
                      <option value="burner">コンロ</option>
                      <option value="oven">オーブン</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
          {!readOnly && (
            <button
              type="button"
              className="button outline"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  steps: [
                    ...d.steps,
                    {
                      id: crypto.randomUUID(),
                      title: "",
                      detail: "",
                      durationSec: 60,
                      kind: "hands",
                      resource: "none",
                      dependsOn: d.steps.length
                        ? [d.steps[d.steps.length - 1].id]
                        : [],
                    },
                  ],
                }))
              }
            >
              <Plus size={16} />
              工程を追加
            </button>
          )}
        </fieldset>
        {draft.source && (
          <p className="source-note">
            元のレシピ：
            {/^https?:\/\//.test(draft.source) ? (
              <a href={draft.source} target="_blank" rel="noreferrer">
                元のページを見る
              </a>
            ) : (
              draft.source
            )}
          </p>
        )}
        {draft.sourceText && (
          <details className="source-note">
            <summary>取り込んだ文章を見る</summary>
            <pre>{draft.sourceText}</pre>
          </details>
        )}
        {sourcePhoto && (
          <details className="source-note" open>
            <summary>元の写真を確認（写真は保存しません）</summary>
            <img
              className="import-preview"
              src={sourcePhoto}
              alt="取り込んだ手順と見比べるための元のレシピ写真"
            />
          </details>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {confirmDelete && (
          <div className="review-warnings" role="alert">
            <p>
              このレシピを削除しますか？
              このブラウザのレシピノートから削除されます。
            </p>
            <div className="confirmation-actions">
              <button
                type="button"
                className="button outline"
                onClick={() => setConfirmDelete(false)}
              >
                編集に戻る
              </button>
              <button type="button" className="button primary" onClick={remove}>
                レシピを削除する
              </button>
            </div>
          </div>
        )}
        <div className="editor-footer">
          {readOnly ? (
            <button type="button" className="button outline" onClick={close}>
              閉じる
            </button>
          ) : (
            <>
              <button
                type="button"
                className="text-button danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} />
                このレシピを削除
              </button>
              <button type="submit" className="button primary">
                <Check size={18} />
                確認して保存
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

function ChatDialog({
  ai,
  current,
  session,
  close,
  command,
}: {
  ai: boolean;
  current: any;
  session: Session | null;
  close: () => void;
  command: (text: string) => void;
}) {
  const [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [messages, setMessages] = useState<{ role: string; text: string }[]>([
      {
        role: "assistant",
        text: "次の手順を確認できます。つくり方の相談は、AIが利用できるときにお手伝いします。",
      },
    ]);
  const ask = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim() || busy) return;
    const q = question;
    setQuestion("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    if (/次|手順|いま|今/.test(q)) {
      const answer = current
        ? `${current.recipe.name}：${current.step.title}\n${current.step.detail}`
        : "料理を選んで、調理をはじめてください。";
      setMessages((m) => [...m, { role: "assistant", text: answer }]);
      return;
    }
    if (!ai) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "つくり方の相談にはAIの設定が必要です。元のレシピの記載をご確認ください。",
        },
      ]);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          context: {
            recipe: current?.recipe,
            step: current?.step,
            runs: session?.runs,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "回答を取得できませんでした。");
      setMessages((m) => [...m, { role: "assistant", text: result.answer }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: e instanceof Error ? e.message : "接続を確認してください。",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="キッチンの相棒" close={close}>
      <div className="chat-messages" aria-live="polite">
        {messages.map((m, i) => (
          <div className={`chat-message ${m.role}`} key={i}>
            {m.role === "assistant" && <Sparkles size={16} />}
            <p>{m.text}</p>
          </div>
        ))}
        {busy && <p className="muted">考えています…</p>}
      </div>
      <div className="chat-suggestions">
        <button
          onClick={() => {
            setQuestion("次の手順は？");
          }}
        >
          次の手順は？
        </button>
        <button
          onClick={() => {
            command("次は？");
          }}
        >
          手順を読み上げる
        </button>
      </div>
      <form className="chat-form" onSubmit={ask}>
        <input
          aria-label="相談したいこと"
          placeholder="つくり方で気になること…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={1000}
          required
        />
        <button
          className="button primary"
          aria-label="質問を送る"
          disabled={busy}
        >
          <Send size={18} />
        </button>
      </form>
      <p className="privacy-note">
        {ai
          ? "つくり方の相談は、質問と現在のレシピをGoogleへ送信します。回答でタイマーを変更することはありません。"
          : "現在の手順はAIなしで確認できます。"}
      </p>
    </Modal>
  );
}
