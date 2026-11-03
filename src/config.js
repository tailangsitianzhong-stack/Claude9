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

  // お金（利益は「おろした時点」で入る）
  pricePerStraw: 12, // 卸値（1本）
  materialCostPerStraw: 3, // 原料費（1本）

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
    growth: 1.25,
    max: 15,
    effect: (lv) => 6 + 4 * lv,
    format: (v) => `${v}束/便`,
  },
  quality: {
    name: '品質（卸値）',
    icon: '✨',
    baseCost: 600,
    growth: 1.32,
    max: 10,
    effect: (lv) => 1 + 0.12 * lv,
    format: (v) => `×${v.toFixed(2)}`,
  },
  dock: {
    name: '倉庫の広さ',
    icon: '📦',
    baseCost: 300,
    growth: 1.2,
    max: 10,
    effect: (lv) => CONFIG.baseDockCapacity + 15 * lv,
    format: (v) => `${v}束`,
  },
};

// 初期の従業員（雇用・給料の仕組みは後で追加）
export const EMPLOYEES = [
  { name: '佐藤', role: '押出機オペレーター', station: 0, color: 0x2c3e75 },
  { name: '鈴木', role: 'カッター・品質チェック', station: 1, color: 0x2e7d5b },
  { name: '高橋', role: '結束・出荷', station: 2, color: 0x7a3e9d },
];

// 初期のおろし先（架空）。トラックは順番に回る。
export const BUYERS = [
  { id: 'midori', name: 'みどり商店', priceMul: 1.0 },
  { id: 'sora', name: 'カフェ・ソラ', priceMul: 1.15 },
  { id: 'hanamaru', name: 'はなまるスーパー', priceMul: 0.95 },
];

// ---- 工場の拡張 ----
// 土地：中央の区画(0)から左右に広げる。区画番号 -2..2
export const LAND = {
  minPlot: -2,
  maxPlot: 2,
  // 何区画目を買うかで値段が決まる（1区画目, 2区画目, ...）
  costs: [2000, 6000, 15000, 40000],
};

// 機械：買った区画に順番に置く。3つそろうと新しいラインが動き出す
export const LANE_STEPS = [
  { key: 'extruder', name: '押出機', icon: '🏭', cost: 800 },
  { key: 'cutter', name: 'カッター', icon: '✂️', cost: 600 },
  { key: 'bundler', name: '結束機', icon: '🎀', cost: 1000 },
];
export const LANE_COST_GROWTH = 1.8; // 増設ラインが増えるたびに機械の値段が上がる
