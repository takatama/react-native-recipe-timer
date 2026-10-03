import type { Recipe } from "./types";

/** Illustrative, editable recipes. Times are estimates, never a food-safety guarantee. */
export const SAMPLE_RECIPES: Recipe[] = [
  {
    id: "salmon",
    name: "鮭のレモンバター焼き",
    color: "#c87545",
    servings: 2,
    description: "香ばしく焼いた鮭に、レモンとバターをからめます。",
    ingredients: [
      { name: "生鮭", amount: "2 切れ" },
      { name: "レモン", amount: "1/2 個" },
      { name: "バター", amount: "15 g" },
      { name: "オリーブオイル", amount: "小さじ 2" },
      { name: "塩・こしょう", amount: "少々" },
    ],
    steps: [
      {
        id: "salmon-prep",
        title: "鮭の下ごしらえ",
        detail:
          "鮭の水分をペーパーでふき、両面に塩・こしょうをふります。レモンを切ります。生魚を扱った手と器具を洗ってから、ほかの食材を扱いましょう。",
        durationSec: 120,
        kind: "hands",
        resource: "none",
        dependsOn: [],
      },
      {
        id: "salmon-preheat",
        title: "フライパンを温める",
        detail:
          "フライパンにオイルを入れ、中火で温めます。煙が出るほど加熱しないでください。例示レシピです。火力に合わせて時間を調整できます。",
        durationSec: 60,
        kind: "wait",
        resource: "burner",
        dependsOn: ["salmon-prep"],
      },
      {
        id: "salmon-place",
        title: "鮭をフライパンに入れる",
        detail: "鮭を皮側から静かに入れます。油はねに気をつけてください。",
        durationSec: 30,
        kind: "hands",
        resource: "burner",
        dependsOn: ["salmon-preheat"],
      },
      {
        id: "salmon-first-side",
        title: "鮭の片面を焼く",
        detail:
          "中火で焼き色をつけます。焦げそうなら火を弱めます。タイマーが鳴ったら、焼き色を確認して「完了」を押してください。",
        durationSec: 240,
        kind: "wait",
        resource: "burner",
        dependsOn: ["salmon-place"],
      },
      {
        id: "salmon-turn",
        title: "鮭を裏返す",
        detail: "身を崩さないように裏返し、火を少し弱めます。",
        durationSec: 30,
        kind: "hands",
        resource: "burner",
        dependsOn: ["salmon-first-side"],
      },
      {
        id: "salmon-second-side",
        title: "鮭の中まで火を通す",
        detail:
          "厚さや火力によって時間は変わります。中心まで十分に加熱できたかを確認してください。加熱が足りなければ時間を追加します。時間だけで食べられるとは判断できません。",
        durationSec: 180,
        kind: "wait",
        resource: "burner",
        dependsOn: ["salmon-turn"],
      },
      {
        id: "salmon-butter",
        title: "レモンバターをからめる",
        detail:
          "火を弱め、バターとレモン汁を加えます。溶けたバターを鮭にかけ、火を止めて盛り付けます。",
        durationSec: 60,
        kind: "hands",
        resource: "burner",
        dependsOn: ["salmon-second-side"],
      },
    ],
  },
  {
    id: "broccoli",
    name: "ブロッコリーの温サラダ",
    color: "#638477",
    servings: 2,
    description: "さっとゆでて、あたたかいままシンプルに。",
    ingredients: [
      { name: "ブロッコリー", amount: "1/2 株" },
      { name: "塩", amount: "少々" },
      { name: "オリーブオイル", amount: "大さじ 1" },
      { name: "レモン汁", amount: "小さじ 1" },
    ],
    steps: [
      {
        id: "broccoli-prep",
        title: "ブロッコリーを切る",
        detail: "洗って小房に分けます。茎は皮の硬い部分をむき、薄く切ります。",
        durationSec: 90,
        kind: "hands",
        resource: "none",
        dependsOn: [],
      },
      {
        id: "broccoli-water",
        title: "ゆでるお湯を沸かす",
        detail:
          "鍋にブロッコリーが浸かる程度の水と塩少々を入れ、沸かします。水の量と火力によって時間は変わります。沸騰してから完了にしてください。",
        durationSec: 180,
        kind: "wait",
        resource: "burner",
        dependsOn: ["broccoli-prep"],
      },
      {
        id: "broccoli-add",
        title: "ブロッコリーをお湯に入れる",
        detail: "沸騰したお湯に、茎、小房の順で入れます。",
        durationSec: 30,
        kind: "hands",
        resource: "burner",
        dependsOn: ["broccoli-water"],
      },
      {
        id: "broccoli-boil",
        title: "ブロッコリーをゆでる",
        detail:
          "好みの硬さになるまでゆでます。例示レシピの時間です。大きさに合わせて調整し、食感を確認してください。",
        durationSec: 120,
        kind: "wait",
        resource: "burner",
        dependsOn: ["broccoli-add"],
      },
      {
        id: "broccoli-drain",
        title: "湯切りして味をつける",
        detail:
          "火を止め、ざるにあげます。湯気と熱いお湯に注意してください。水気を切り、オリーブオイルとレモン汁、塩であえます。",
        durationSec: 60,
        kind: "hands",
        resource: "burner",
        dependsOn: ["broccoli-boil"],
      },
    ],
  },
  {
    id: "mushroom",
    name: "きのこのスープ",
    color: "#8377a0",
    servings: 2,
    description: "きのこのうまみを引き出す、ほっとするスープ。",
    ingredients: [
      { name: "しめじ", amount: "1/2 パック" },
      { name: "しいたけ", amount: "2 枚" },
      { name: "玉ねぎ", amount: "1/4 個" },
      { name: "水", amount: "400 ml" },
      { name: "コンソメ", amount: "小さじ 1" },
      { name: "オリーブオイル", amount: "小さじ 1" },
      { name: "塩・こしょう", amount: "少々" },
    ],
    steps: [
      {
        id: "mushroom-prep",
        title: "スープの具材を切る",
        detail:
          "しめじは石づきを落としてほぐし、しいたけと玉ねぎを薄く切ります。",
        durationSec: 120,
        kind: "hands",
        resource: "none",
        dependsOn: [],
      },
      {
        id: "mushroom-saute",
        title: "玉ねぎときのこを炒める",
        detail:
          "鍋にオイルを入れ、中火で玉ねぎときのこを炒めます。玉ねぎが透き通るのを目安にしてください。",
        durationSec: 120,
        kind: "hands",
        resource: "burner",
        dependsOn: ["mushroom-prep"],
      },
      {
        id: "mushroom-simmer",
        title: "スープを煮る",
        detail:
          "水とコンソメを入れて沸かし、沸騰したら弱火にして煮ます。例示レシピの時間です。具材に火が通ったかを確認して完了にしてください。",
        durationSec: 420,
        kind: "wait",
        resource: "burner",
        dependsOn: ["mushroom-saute"],
      },
      {
        id: "mushroom-finish",
        title: "スープの味をととのえる",
        detail:
          "塩・こしょうで味をととのえ、火を止めて器によそいます。熱い鍋とスープに気をつけてください。",
        durationSec: 60,
        kind: "hands",
        resource: "burner",
        dependsOn: ["mushroom-simmer"],
      },
    ],
  },
];

export const sampleRecipes = SAMPLE_RECIPES;
