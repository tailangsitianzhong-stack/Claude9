# 工場拡大×株式×土地 経営ゲーム 事前リサーチレポート

作成日: 2026-11-03 / 目的: Web 3D（three.js 等）で作る「工場→量産→資金→株・土地買収→再投資」ゲームの設計材料

---

## 1. 工場機械のデザイン

### 調べたもの
CGTrader / itch.io / Superhive(Blender Market) の低ポリ工場アセット、Kenney Conveyor Kit、射出成形機・CNC・ロボットアームの実機写真やパテント図、Factorio / Satisfactory のアート方針の評論。実際に見た画像は数十点（各アセットのプレビュー、ストック写真、パテント図）で、100枚には届いていない。足りない分は機械の種類ごとの形の特徴として整理した。

### 機械の型（ゲーム内のティアに使える）
| 系統 | 代表機械 | 形の特徴（シルエット） |
|---|---|---|
| 搬送 | ベルト／ローラーコンベア、スプリッタ、リフト | 細長い・矢印模様・ローラーの繰り返し |
| 素材 | 精錬炉、溶鉱炉、粉砕機 | 背が高い円筒・煙突・赤熱部の発光 |
| 成形 | プレス機、射出成形機、鋳造機 | 門型フレーム（プレス）、横長の箱＋ホッパー（射出） |
| 加工 | CNC旋盤／マシニングセンタ、レーザー | 透明窓付きの箱・内部で回る主軸 |
| 組立 | ロボットアーム、組立セル | 台座＋多関節アーム、動きで見分けがつく |
| 検査・梱包 | 検査ゲート、パレタイザ、箱詰め機 | 門型センサー、段ボールの積み上げ |
| 化学 | タンク、反応槽、配管 | 球・円筒タンク、配管 |
| 電力 | 発電機、変電設備 | 碍子、ケーブル、回転タービン |

### デザインの原則
1. **一目でわかる形**：見下ろし視点では形そのものより「輪郭（シルエット）」と「色」で機械を見分ける。種類ごとにシルエットを大きく変える（Factorio は見た目より読みやすさを優先している）。
2. **色で役割を示す**：本体は灰色系、搬入口は青・搬出口はオレンジのように**入出力の向きを色と矢印で必ず示す**。動いている／止まっている／詰まっているは発光色で示す（緑・黄・赤）。
3. **グリッドに沿ったサイズ**：1×1、2×2、3×3 などマス単位に揃えると配置がパズルになる（Satisfactory は 3D の制約を設計課題にしている）。
4. **動きで「生産している感じ」を出す**：プレスの上下、アームの回転、ベルトのテクスチャ送り。アニメは単純でも効果が大きい。
5. **上位機種は見た目でわかるように**：同じ系統の上位機は「大型化・装飾ライン追加・色の差し替え」で強化を表す。新しくモデルを作らずに済む。
6. **Web 向け軽量化**：1機械 500〜3,000 ポリゴン、テクスチャはパレット1枚を全機械で共有、同じ機械は InstancedMesh でまとめて描画、形式は glTF/GLB。

### 使える素材（ライセンスは要確認）
- Kenney Conveyor Kit（60以上のモデル、工場・倉庫向け）
- Free CC0 Industrial 3D Models（12点、CC0）
- Modular Prototype Kit（64点以上、CC0、.gltf あり）
- 有料の Industrial Machines Pack（コンベア・アーム・CNC・プレス）

---

## 2. 株式の知識と株価の動き（基礎から専門的な内容まで）

### レベル1：基礎
- 株価は**需要と供給**で決まる。業績は長期的な方向を決め、短期の動きは評価倍率（PER／PBR）の変化で大半が説明できる。
- **PER** = 株価 ÷ 1株あたり利益（利益の何年分の値段か）。**PBR** = 株価 ÷ 1株あたり純資産（1倍を下回ると「解散価値より安い」）。
- 時価総額 = 株価 × 発行済み株式数。配当利回り、ROE。

### レベル2：取引所の仕組み（日本）
- **板寄せ方式**：寄付き・引け・売買中断後の再開時に、注文を集めて1つの約定価格を決める。
- **ザラバ方式**：取引時間中は価格優先・時間優先で次々に約定する。
- **値幅制限（ストップ高・ストップ安）**：前日終値を基準に段階的に決まる（例：1,000円未満は±150円）。値が急に飛びそうなときは**特別気配**を出して約定させない。
- → ゲームでは「1日の値幅上限」と「売買が成立しない日」を入れると、本物らしさと緊張感が出る。

### レベル3：統計モデル
- 基本モデル：**幾何ブラウン運動（GBM）**　`dS = μS dt + σS dW`。対数リターンは正規分布で、それぞれ独立。
- 現実の株価はこのモデルから次の点で外れる（いわゆる stylized facts）：
  - **ファットテール**：大きく動く日が正規分布で見込むより頻繁にある。
  - **ボラティリティ・クラスタリング**：荒れた日の後は荒れた日が続く → **GARCH** や確率ボラティリティで再現する。
  - **ジャンプ**：決算やニュースで価格が不連続に飛ぶ → **ジャンプ拡散**（Merton モデル）。
  - **レバレッジ効果**：下落時のほうがボラティリティが上がる。
  - 短期は**モメンタム**（数か月は同じ方向に続きやすい）、長期は**平均回帰**（PER が適正水準に戻る）。

### レベル4：マーケット・マイクロストラクチャ（深いところ）
- **ビッド・アスク・スプレッド**は、情報を持つ相手と取引するリスク・在庫リスク・処理コストの合計。
- **マーケットインパクトの平方根則**：大量に売買すると、価格は「数量の平方根」に比例して自分に不利な方向へ動く（実証で指数は約0.5）。注文を分けて出すことと、板が補充されることの両方で生まれる。
- 板の厚さが買い側と売り側で偏っていると、短期の方向の目安になる。
- → **プレイヤーが大量に買うと株価が上がって買収コストが増える**、をこの法則で実装できる。

### レベル5：支配権・M&A（ゲームの核心）
- **TOB（株式公開買付け）**：一定以上の株を取得する場合は公開買付けが義務になる。2024年の法改正で、義務が生じる基準が「3分の1超」から**30%超**に下がり、市場内での買付けも対象になった。
- 持株比率の節目：**1/3超＝特別決議への拒否権**、**過半数＝取締役を選べる（経営支配）**、**2/3以上＝特別決議を単独で可決**（合併など）、ほぼ全株＝完全子会社化。
- TOB 価格には通常、市場価格に**プレミアム（20〜50%程度が目安）**を上乗せする。

### ゲーム用の株価エンジン案
```
年率ドリフト μ  = 業績の成長率 ＋ 市場全体のセンチメント
ボラティリティ σ_t = GARCH(1,1) で更新（荒れた日が続く）
ジャンプ      = 決算・事件イベントのとき ±5〜20%
長期の引き戻し  = (適正PER − 現在のPER) × κ（PERが適正水準へ戻る）
自分の売買の影響 = Y·σ·√(注文量 / 1日の出来高)
値幅制限      = 前日終値を基準にした段階表
```

---

## 3. 地価と土地の知識

### 公的な価格の種類（日本）
| 指標 | 発表元 | 基準日 | 用途・目安 |
|---|---|---|---|
| 公示地価 | 国土交通省 | 1月1日 | 取引価格の基準となる正常な価格 |
| 基準地価 | 都道府県 | 7月1日 | 公示地価を補う |
| 路線価 | 国税庁 | 1月1日 | 相続税・贈与税の評価。公示地価の約8割 |
| 固定資産税評価額 | 市町村 | 3年ごと | 公示地価の約7割 |
| 実勢価格 | 市場 | 随時 | 実際の取引価格。買い手がつくかどうかで決まる |

### 地価の決まり方
- **取引事例比較法**：近くで実際に取引された価格と比べる。
- **収益還元法**：`価格 = 年間の純収益 ÷ 還元利回り（キャップレート）`。近年はこの方法が重視されている。
  - → 金利が下がるとキャップレートも下がり、地価は上がる。**金利は地価を最も強く動かす要因**。
- **原価法**：造成にかかる費用から積み上げる。

### 地価を動かす要因
- **用途地域**：土地の使い道を決める区分。
  - 工業専用地域：住宅は建てられない。建ぺい率30〜60%、容積率100〜400%。
  - 工業地域：建ぺい率50・60%、容積率100〜400%。
  - 準工業地域：住宅や店舗も建てられる。容積率は最大500%。
  - 容積率が高いほど、同じ土地に多く建てられるので土地の価値が上がる。**途中で用途地域や容積率が変わると地価が跳ねる**（例：北上市が半導体工場の進出に合わせて、工業専用地域への変更と容積率の見直しを計画）。
- 交通の便（駅、高速道路のインターチェンジ、港）、インフラ（電力・水）、人口、周辺に工場が集まっていること。
- 大きな工場がやって来ると周りの地価が上がる（TSMC の熊本進出のような例）。

### 歴史上の大きな動き：日本の土地バブル
- 1987年に公定歩合が2.5%まで下がり、お金が不動産に流れ込んだ → 1985〜90年に三大都市圏の商業地は約**+180%**。
- 1990年に金利が6%へ引き上げられ、融資の総量規制と1991年の地価税が重なった → **1991年の公示地価がピーク**で、その後は長く下がり続けた。
- 教訓：地価は**金利と信用（借りられるお金の量）の影響を強く受け、行き過ぎた後でゆっくり反転する**。株よりも動きが遅く、取引されにくい（売りたいときにすぐ売れない）。

### ゲーム用の地価モデル案
```
区画の価値 = 基礎地価 × 立地係数 × 用途地域係数 × (1 + 容積率ボーナス)
          × (1 + 周辺の工場数 × 集積効果) ÷ キャップレート(金利に連動)
動き方    = 株より遅い（月単位で更新）、景気の波に遅れてついてくる、
            時々「用途地域の変更」「インフラ開通」イベントで跳ねる
売買コスト = 手数料・税で5〜10%（気軽に転売しにくい）
```

---

## 4. ゲーム設計への示唆（まとめ）
1. **ゲームの循環**：工場の生産 → 売上 → 土地を買う（工場を建てる枠が増える／含み益）→ 株を買う（配当・支配権）→ 買収で相手の工場を手に入れる → また生産。
2. **3つの資産で性格を分ける**：工場＝安定して稼ぐ／株＝値動きが速く、大きく儲かることも損することもある／土地＝動きが遅く、確実に増えるが売りにくい。
3. **金利という共通パラメータ**を1つ用意すると、株と土地が一緒に動く（バブルと崩壊を再現できる）。
4. **持株比率の節目（30%、1/3、50%、2/3）**をそのまま報酬の段階にする（拒否権 → 経営権 → 合併）。
5. **自分の売買が株価を動かす**（平方根則）ことで、「大きくなるほど簡単には買えない」というバランスが自然に生まれる。

---

## 出典
- 工場機械：[CGTrader 産業機械](https://www.cgtrader.com/3d-models/industrial/industrial-machine/industrial-machines-pack) / [Stylized Low Poly Factory](https://www.cgtrader.com/3d-models/vehicle/sci-fi-vehicle/stylized-low-poly-factory-with-truck) / [Automated conveyor & robot arm](https://www.cgtrader.com/3d-models/industrial/industrial-machine/automated-factory-conveyor-and-robotic-arm-system) / [Conveyor Works](https://forums.unrealengine.com/t/nebula-forms-conveyor-works-low-poly-factory-asset-pack/2673676) / [Kenney Conveyor Kit](https://kenney-assets.itch.io/conveyor-kit) / [Free CC0 Industrial](https://3dmodelscc0.itch.io/free-cc0-industrial-3d-models) / [Modular Prototype Kit](https://downloadforfree.gumroad.com/l/free-modular-prototype-kit-3d-model) / [Injection Molding Press (Blender Artists)](https://blenderartists.org/t/injection-molding-press/343636) / [Robot arm design patent](https://patents.justia.com/patent/D268033) / [Factory builder genre analysis](https://leafwing-studios.github.io/Emergence/high-level/genre-analysis.html) / [PC Gamer: Satisfactory review](https://www.pcgamer.com/games/sim/satisfactory-review)
- 株式：[ピクテ PER・PBR](https://www.pictet.co.jp/basics-of-asset-management/practical-basic-knowledge/equity/20161130.html) / [IG 株価変動要因](https://www.ig.com/jp/trading-strategies/what-causes-share-prices-to-change--201202) / [マネ部 売買ルール](https://money-bu-jpx.com/basic/stock/equities/rule-02/) / [auカブコム 約定の仕組み](https://kabu.com/beginner/stock/contract.html) / [Lévy models review (Purdue)](https://www.stat.purdue.edu/%7Efigueroa/Papers/LevyModelsReview2.pdf) / [ISEG lecture slides](https://fenix.iseg.ulisboa.pt/downloadFile/281608120784280/Slides_MIF6P.pdf) / [Market impact in a latent order book](https://arxiv.org/pdf/1802.06101) / [Square-root impact](https://www.emergentmind.com/papers/2607.04280) / [金融庁 TOB資料](https://www.fsa.go.jp/singi/singi_kinyu/tob_wg/shiryou/20230605/03.pdf) / [BUSINESS LAWYERS TOB](https://www.businesslawyers.jp/practices/1195)
- 土地：[国交省資料](https://www.mlit.go.jp/common/001136128.pdf) / [コトバンク 地価](https://kotobank.jp/word/%E5%9C%B0%E4%BE%A1-95859) / [三井住友トラスト不動産 用語集](https://smtrc.jp/useful/glossary/print/n/107) / [三井ホーム 用語](https://www.mec-h.com/words/detail?n=105) / [北上市 用途変更](https://www.city.kitakami.iwate.jp/material/files/group/25/kougyoudantiyoutohenkou2.pdf) / [東急リバブル バブル史](https://www.livable.co.jp/fudosan-toushi/propertista/report/202409/index03.html) / [ピクテ 金融史](https://www.pictet.co.jp/basics-of-asset-management/new-generation/financial-history/20260128.html) / [RIETI バブル期土地取引](https://www.rieti.go.jp/en/publications/summary/21070015.html)

※ TOBプレミアムの目安・TSMC熊本の例・GARCH等の補足は一般知識に基づく。数値（値幅表、税評価の割合など）は実装前に公式資料で再確認を推奨。
