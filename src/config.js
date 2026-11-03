// ゲーム全体の調整値。バランス調整はここだけ触ればよいようにまとめる。

export const COMPANY_NAME = 'ちいさなストロー工場';

// ストローの色（1束ごとに色が切り替わる）
export const STRAW_COLORS = [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xffffff, 0xff9ff3, 0xffa94d];

export const CONFIG = {
  startMoney: 500,

  // 生産
  baseBundleInterval: 3.0, // 1束あたりの秒数（初期）
  bundleSizeMin: 4,
  bundleSizeMax: 5,
  avgBundleSize: 4.5,
  bundlerBuffer: 14, // 結束機の手前に溜められるストロー本数（超えるとカッター停止）
  beltSpeed: 0.9, // 初期のベルト速度（生産速度に比例して上がる）

  // お金（利益は「おろした時点」で入る）。卸値・取引先は製品ごと（src/data/products.js）

  // 倉庫
  baseDockCapacity: 30,

  // トラック
  truck: {
    leaveTime: 2.2,
    travelTime: 4.0,
    returnTime: 2.2,
    maxWait: 10.0, // 満載にならなくても、この秒数待ったら自動出発
  },
};

// 強化項目。effect(lv) が実際の値を返す。
export const UPGRADES = {
  speed: {
    name: '生産スピード',
    icon: '⚙️',
    baseCost: 200,
    growth: 1.15,
    max: 25,
    effect: (lv) => CONFIG.baseBundleInterval * Math.pow(0.92, lv),
    format: (v) => `${v.toFixed(2)}秒/束`,
  },
  truck: {
    name: 'トラック積載',
    icon: '🚚',
    baseCost: 350,
    growth: 1.28,
    max: 40,
    effect: (lv) => Math.round(6 * Math.pow(1.22, lv)),
    format: (v) => `${v.toLocaleString('ja-JP')}束/便`,
  },
  quality: {
    name: '品質（卸値）',
    icon: '✨',
    baseCost: 600,
    growth: 1.3,
    max: 50,
    effect: (lv) => 1 + 0.12 * lv,
    format: (v) => `×${v.toFixed(2)}`,
  },
  dock: {
    name: '倉庫の広さ',
    icon: '📦',
    baseCost: 300,
    growth: 1.22,
    max: 40,
    effect: (lv) => Math.round(CONFIG.baseDockCapacity * Math.pow(1.24, lv)),
    format: (v) => `${v.toLocaleString('ja-JP')}束`,
  },
};

// 初期の従業員（雇用・給料の仕組みは後で追加）
export const EMPLOYEES = [
  { name: '佐藤', role: '押出機オペレーター', station: 0, color: 0x2c3e75 },
  { name: '鈴木', role: 'カッター・品質チェック', station: 1, color: 0x2e7d5b },
  { name: '高橋', role: '結束・出荷', station: 2, color: 0x7a3e9d },
];

// ---- 舞台：栃木県鹿沼市 ----
// 土地の値段 = 区画の面積(㎡) × 参考地価(円/㎡) × yenScale × growth^(持っている区画数-1)
// 参考地価は 2026年公示地価の鹿沼市平均（住宅地 約2.6万・商業地 約4.4万・工業地 約1.9万円/㎡）と
// 町ごとの土地相場の推計（坪単価）をもとにした値。ゲーム用に丸めている。
export const LAND = {
  sectionArea: 336, // 1区画の面積（幅10m×奥行33.6m 相当）
  yenScale: 1 / 2000, // 現実の円 → ゲーム内の円
  growth: 1.45, // 区画を持つほど値段が上がる
  bulkDiscount: 0.9, // まとめて買うと1割引き
  sectionWidth: 5.0,
  depth: 16.8,
};

// 空き地（区画を並べた土地）。x は左端、z は区画の中心。区画は左から順に番号がつく。
// 本社(home)は最初の工場で、中央の区画(2番)を最初から持っている。
export const LOTS = [
  {
    id: 'home',
    name: '本社工場',
    short: '本社',
    town: '鹿沼市',
    kind: '工業地',
    unitPrice: 19100,
    note: '鹿沼市の工業地の平均（公示地価）',
    home: true,
    z: 0,
    startSection: 2,
  },
  {
    id: 'sendo',
    name: '千渡の空き地',
    short: '千渡',
    town: '鹿沼市千渡',
    kind: '住宅地',
    unitPrice: 23300,
    note: '千渡の土地相場（推計 約7.7万円/坪）',
    x: 37,
    z: -0.3,
    sections: 3,
  },
  {
    id: 'kamidono',
    name: '上殿町の空き地',
    short: '上殿町',
    town: '鹿沼市上殿町',
    kind: '商業地（駅の近く）',
    unitPrice: 33300,
    note: '上殿町の土地相場（推計 約11万円/坪）',
    x: 12,
    z: -24.2,
    sections: 2,
  },
  {
    id: 'fuchu',
    name: '府中町の空き地',
    short: '府中町',
    town: '鹿沼市府中町',
    kind: '住宅地',
    unitPrice: 39300,
    note: '府中町の土地相場（推計 約13万円/坪）',
    x: -2,
    z: 24,
    sections: 2,
  },
  {
    id: 'nishimoro',
    name: '西茂呂の空き地',
    short: '西茂呂',
    town: '鹿沼市西茂呂',
    kind: '住宅地（人気エリア）',
    unitPrice: 51400,
    note: '西茂呂の土地相場（推計 約17万円/坪、10年で+19%）',
    x: -50,
    z: -0.3,
    sections: 4,
  },
  {
    id: 'fukatsu',
    name: '鹿沼インター産業団地',
    short: 'インター団地',
    town: '鹿沼市深津',
    kind: '工業地（産業団地）',
    unitPrice: 15000,
    note: '近隣の産業団地の分譲価格（約1.3〜1.5万円/㎡）',
    x: 38,
    z: 24,
    sections: 5,
  },
];

// 機械：買った区画に順番に置く。3つそろうと新しいラインが動き出す
export const LANE_STEPS = [
  { key: 'extruder', name: '押出機', icon: '🏭', cost: 800 },
  { key: 'cutter', name: 'カッター', icon: '✂️', cost: 600 },
  { key: 'bundler', name: '結束機', icon: '🎀', cost: 1000 },
];
export const LANE_COST_GROWTH = 1.8; // 増設ラインが増えるたびに機械の値段が上がる
