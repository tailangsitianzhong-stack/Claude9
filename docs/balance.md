# ゲームバランス設計（プレイヤーレベル・製品）

## 方針（参考にした考え方）
- **費用は指数関数的に増え、生産は多項式的にしか増えない**ので、放っておくと進みが止まる。止まりかけたところで倍率（新製品）を与えて、また進ませる（Kongregate "The Math of Idle Games" Part I）。
- 調整は手作業で遊ぶのではなく**シミュレーションで行う**。最適な買い方は「収入の増え方 ÷ 値段」が最大のものを買い続けること（同 Part I）。bot による調整は業界でも使われている（Supercell の講演、GEEvo 論文）。
- レベル曲線は1つの式で決めるのではなく、**到達時間の目標から逆算**する（RPG の経験値表の考え方）。

## プレイヤーレベル
- 経験値 = **これまでに稼いだ純利益の合計**（お金を使っても減らない）。
- 最大 **Lv.10,000**。次のレベルまでの必要経験値：`exp(a + bL + c√L + d·lnL) + 80 + 6L`
- 係数は `node scripts/balance-sim.mjs --fit` で決めた。
  1. 1レベルあたりの目標時間を `6 × (1 + L/120)` 秒に置く。
  2. bot に遊ばせて、各レベルでの収入を測る。
  3. 「必要経験値 ＝ 目標時間 × そのときの収入」として作り直す（6回くり返す）。
  4. 最後に式に当てはめる（最小二乗法）。

### 到達時間（最適に遊ぶ bot の場合）
| レベル | 到達時間 | 目標 |
|---|---|---|
| Lv.10 | 約1分 | 1分 |
| Lv.100 | 17分 | 14分 |
| Lv.500 | 2.4時間 | 2.6時間 |
| Lv.1,000 | 7時間 | 9時間 |
| Lv.3,000 | 63時間 | 67時間 |
| Lv.5,000 | 175時間 | 182時間 |
| Lv.10,000 | 687時間 | 711時間 |

人が遊ぶと bot より遅くなる。オフライン中の収入はまだない。

## 製品（100種類 = 10系統 × 10品）
| 系統（最初の製品） | 解放 | 1本の卸値 | 取引先 |
|---|---|---|---|
| プラスチックストロー | Lv.1 | ¥12 | 3社 |
| 紙ストロー | Lv.257 | ¥78 | 19社 |
| 飲料用特殊ストロー | Lv.776 | ¥432 | 35社 |
| 環境配慮ストロー | Lv.1,482 | ¥2,225 | 51社 |
| 食品・業務用チューブ | Lv.2,347 | ¥1.09万 | 67社 |
| 工業用チューブ | Lv.3,354 | ¥5.20万 | 83社 |
| 医療用チューブ | Lv.4,489 | ¥24.2万 | 99社 |
| 精密・半導体チューブ | Lv.5,744 | ¥111万 | 115社 |
| 先端素材チューブ | Lv.7,112 | ¥499万 | 131社 |
| 宇宙・航空チューブ | Lv.8,586 | ¥2,229万 | 147社 |
| （最後）軌道エレベーター用ケーブル管 | Lv.10,000 | ¥1.06億 | 81社 |

- 解放レベル：`2 + 9998 × (i/99)^1.6`。前半は間隔が短く、後半は長い。
- 卸値：1品ごとに約1.15倍。系統が上がるたびに上乗せがある。
- **取引先**：系統が上がるほど増える。**需要は取引先1社あたり 1分10束**。需要を超えて作ると、超えた分は値崩れする（受け取る額は需要までの分）。
- 偶数番は**量産品**（取引先が多い）、奇数番は**こだわり品**（取引先は半分、単価は1.35倍）。
- ラインごとに作る製品を選べる。需要が限られているので、**複数の製品に振り分けたほうがもうかる**。古い製品にも出番が残る（generator relevancy）。「おまかせ配分」で自動で割り当てられる。
- 現実との対応：プラスチック 約1.3円 : 紙 約3.9円（約3倍）を、序盤の系統の並び（プラ → 紙）に反映した。原料費は定価の25%。

## 強化の上限（Lv.10,000 まで遊べるように拡張）
| 強化 | 上限 | 効果 |
|---|---|---|
| 生産スピード | Lv.25 | 約8倍 |
| トラック積載 | Lv.40 | 6 × 1.22^Lv（約17,000束/便） |
| 品質 | Lv.50 | 卸値 ×7 |
| 倉庫 | Lv.40 | 30 × 1.24^Lv |

## 出典
- [The Math of Idle Games, Part I（Game Developer）](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i)
- [The Math of Idle Games, Part II](https://www.gamedeveloper.com/disciplines/the-math-of-idle-games-part-ii)
- [Kongregate: Quest for Progress](https://blog.kongregate.com/quest-for-progress-the-math-of-idle-games)
- [GEEvo: Game Economy Generation and Balancing with Evolutionary Algorithms (arXiv)](https://arxiv.org/html/2404.18574v1)
- [Idle Game Growth Rate Calculator](https://west-games.com/idle-game-growth-rate-calculator/)
- [Graphs for Player Progression](https://medium.com/@ipooprainbows/graphs-for-player-progression-part-i-c56d83740450)
- [Game design math: RPG level-based progression](https://davideaversa.it/blog/gamedesign-math-rpg-level-based-progression/)
