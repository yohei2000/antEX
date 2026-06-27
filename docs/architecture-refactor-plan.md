# antEX architecture refactor plan

この文書は、今後のグラフィック強化、特殊アリ追加、行動パターン複雑化、土木アリによる構造物追加に備えて、通常ゲーム本体のファイル構造と API 境界を整理するための計画である。

この段階ではゲーム挙動を変更しない。特に、通常アプリへ遠征モードを復活させない、セーブ互換性を壊さない、既存アリの `id`、`position`、`heading`、`gaitPhase`、`renderIndex` の連続性を壊さない、という制約を最優先する。

## 現状分析

### 初期確認

- cwd: `C:\Users\hitoa\Documents\Codex\antEX`
- `.git`, `package.json`, `src/`, `docs/`, `AGENTS.md`, `README.md` は存在する。
- `git status --short` は空で、作業ツリーは開始時点で clean。
- remote は `origin https://github.com/yohei2000/antEX.git`。
- `AGENTS.md` は遠征モード復活禁止、兵隊タブ出撃、味方ライブ色固定、敵襲通知、セーブ互換性維持を明示している。
- 計画作成時点の `README.md` には遠征タブや抽象遠征バトルの古い記述が残っていた。Phase 1 実行時に現行の兵隊タブ/敵襲仕様へ更新済み。設計判断では引き続き `AGENTS.md`、`docs/decision-log.md`、現行コードを優先する。

### ファイル構造と依存

現行の通常アプリは `index.html` から `src/simulation.ts` を直接読み込む構造である。`src/simulation.ts` は `three` だけを import し、通常ゲームの状態、AI、描画、UI、保存、debug hook を単一ファイル内で保持している。

`src/simulation.ts` は 4350 行程度で、先頭に `// @ts-nocheck` がある。大まかな責務は以下の順で同居している。

- DOM 参照: `document.querySelector` による `ui` オブジェクト
- balance/config: 固定ステップ、描画上限、敵襲、戦闘、カメラ、品質、強化定義
- state/save: `createDefaultColony()`, `normalizeRaidState()`, `migrateColony()`, `readColonyState()`
- procedural assets: ground texture、material/object disposal
- app services: `LoadingScreen`, `AssetService`, `InputManager`, `DebugPanel`
- live ant AI: `Ant3D`
- rival/raid enemy AI: `RivalAnt3D`
- ant instancing renderer: `AntRenderSystem`
- app orchestration: `AntColony3D`
- world generation/effects: terrain, nest, food, water, stone, branch, trails, corpses, combat effects
- UI rendering: `renderUpgrades()`, `updateStats()`
- debug surface: `window.__ANT_SIM`, `window.__ANT_SIM_READY`

`src/expedition/agent/` は、`types.ts`, `simulation.ts`, `renderer.ts`, `rng.ts`, `spatialHash.ts`, `adapter.ts` に分かれており、型、固定ステップ simulation、adapter、renderer、deterministic RNG、空間分割が分離されている。これは分割の良い前例だが、`src/expedition/` は旧遠征/検証由来として扱い、通常アプリへ遠征モードを戻す根拠にしない。

### 現行コードと仕様のずれ

- 現行 `index.html` の管理タブは `成長` と `兵隊` の 2 つのみで、`土木` タブはまだ通常 UI に見えない。
- `src/simulation.ts` 内にも `builder`, `heavySoldier`, `trailReinforce`, `lowBarricade` の実装は見当たらない。
- Phase 1 実行前の `README.md` は遠征中心の旧説明を含んでいた。Phase 1 で現行仕様へ更新済み。

この計画では、`土木`、`builder`、`heavySoldier`、`trailReinforce`、`lowBarricade` を今後追加しやすい API として設計する。ただし、仕様実装や UI 追加は別 PR で、ユーザー判断後に行う。

## 変更すべき構造

### 1. 通常ゲーム本体を module 境界へ分ける

`src/simulation.ts` の最終形は entrypoint 兼 temporary adapter に縮小し、永続状態、simulation、render、UI、debug を別 module に分ける。

優先して分離する順序は、挙動変更リスクが低いものからにする。

1. config と pure derived calculation
2. save/migration
3. UI view model
4. debug API facade
5. render system
6. ant/world simulation

### 2. domain state と Three.js object を分離する

現在は `Ant3D`, `RivalAnt3D`, `AntColony3D` が domain state と Three.js 依存を直接共有している。今後は simulation state を plain object とし、render layer は snapshot を読むだけに寄せる。

目標は以下。

- simulation は `THREE.Object3D` を知らない。
- render は colony balance や save migration を知らない。
- UI は live object を直接 mutate せず、command API を呼ぶ。
- debug/verify は内部 class に直接依存せず、安定した debug API を呼ぶ。

### 3. colony resource と live ant を分ける

現行仕様では兵隊アリは平時は巣内リソースであり、プレイヤー指示時だけ地表へ出撃する。土木アリも、工事に割り当てられた時だけ地表へ出る。

したがって、特殊アリ追加に備える API は「全アリを常時 live actor にする」方向ではなく、以下を分けるべきである。

- `ColonyInventory`: 巣内リソースとしての worker/soldier/heavySoldier/builder 数
- `LiveAnt`: 盤面に存在する個体
- `AntAssignment`: sortie, forage, build, rescue などの一時割当

## 変更しない方がよい構造

- `src/expedition/` を通常アプリの新しい戦闘/兵隊モードとして復活させない。
- `src/expedition/agent/` の構造は参考にするが、通常本体は `src/sim/` に新しく分ける。
- 敵アリ色 `#8a4a2f`、味方ライブアリのデフォルト色固定、3対1までの組み合い、約2秒以上の戦闘表現、死体10秒消滅は維持する。
- 兵隊アリを平時の地表巡回 actor として常駐させない。
- 土木/構造物は完全な地形変形にしない。軽量な範囲効果と視覚表現に留める。
- save key `ant3d.colonyState` を不用意に変えない。
- live ant の配列 index を identity として扱わない。
- InstancedMesh 前提を崩し、個体ごとに大量の `Mesh` を持つ方向へ移行しない。
- Playwright を通すためだけにゲームロジックを変えない。

## 推奨ディレクトリ構成

```text
src/
  main.ts
  app/
    AntColonyApp.ts
    GameLoop.ts
    AppCommands.ts
  config/
    balance.ts
    upgrades.ts
    variants.ts
    construction.ts
    quality.ts
  state/
    colony.ts
    save.ts
    migrations.ts
    derived.ts
    schema.ts
  sim/
    ants/
      Ant.ts
      identity.ts
      variants.ts
      behavior.ts
      behaviors/
        forage.ts
        returnToNest.ts
        panic.ts
        rescue.ts
        sortieIntercept.ts
        buildStructure.ts
    combat/
      rival.ts
      grapple.ts
      corpses.ts
    world/
      worldState.ts
      terrain.ts
      food.ts
      pheromones.ts
      raid.ts
      structures.ts
      buildTasks.ts
      effects.ts
    systems/
      fixedStep.ts
      spatialQuery.ts
  render/
    ThreeScene.ts
    AntRenderSystem.ts
    RoleLabelSystem.ts
    StructureRenderSystem.ts
    TerrainRenderSystem.ts
    TrailRenderSystem.ts
    CombatEffectRenderSystem.ts
    materials.ts
    geometries.ts
    snapshots.ts
  ui/
    dom.ts
    viewModel.ts
    renderDom.ts
    events.ts
  debug/
    debugApi.ts
    scenarios.ts
    metrics.ts
  shared/
    math.ts
    rng.ts
    ids.ts
```

`src/simulation.ts` は移行中だけ compatibility entrypoint として残し、最終的には `src/main.ts` から `new AntColonyApp()` を起動する。

`src/expedition/` は旧遠征/検証由来として残す。通常アプリが import しない境界を保つ。

## `src/simulation.ts` の責務分解ポイント

### config

移動候補:

- `FIXED_DT`, frame cap, camera constants
- `DISPLAY_ANT_CAP`, corpse/effect caps
- raid constants
- soldier sortie constants
- `UPGRADE_BRANCHES`, `UPGRADE_DEFS`
- `PHEROMONE_PARAMS`
- quality presets

分離先:

- `src/config/balance.ts`
- `src/config/upgrades.ts`
- `src/config/quality.ts`

注意点:

- 最初の PR では数値を変えない。
- config export は readonly にし、実行時にテストから直接 mutate されない形にする。

### save/state/derived

移動候補:

- `createDefaultColony()`
- `createDefaultRaidState()`
- `normalizeRaidState()`
- `migrateColony()`
- `readColonyState()`
- `saveColony()`
- `applyOfflineProgress()`
- `computeDerived()`

分離先:

- `src/state/colony.ts`
- `src/state/save.ts`
- `src/state/migrations.ts`
- `src/state/derived.ts`

注意点:

- `computeDerived()` は現在 `this.colony.soldierAnts` と `attackPower/defensePower` を mutate している。まず pure function 化し、mutation は caller 側に寄せる。
- migration は `unknown` から始めて clamp/normalize する。
- active/retreating raid を load 時に warning へ戻す既存挙動を維持する。

### simulation

移動候補:

- `Ant3D` の sensing, steering, state transitions
- `RivalAnt3D` の target selection, raid pressure, combat
- `updateRaid()`, `beginRaid()`, `resolveRaid()`
- `terrainSpeedAt()`
- `addTrail()`, `updateTrailPheromone()`
- `findRivalThreat()`, `isNearFood()`

分離先:

- `src/sim/ants/*`
- `src/sim/world/*`
- `src/sim/combat/*`

注意点:

- `Ant3D` という名前は Three.js 依存に見える。domain 側は `Ant`, render 側は `AntRenderSystem` にする。
- `RivalAnt3D` も `RivalAnt` へ分け、render snapshot だけを render layer へ渡す。

### render

移動候補:

- `createRenderer()`
- `createSharedAssets()`
- `AntRenderSystem`
- materials/geometries
- terrain/nest/world mesh creation
- combat/corpse mesh creation

分離先:

- `src/render/ThreeScene.ts`
- `src/render/materials.ts`
- `src/render/geometries.ts`
- `src/render/AntRenderSystem.ts`
- `src/render/StructureRenderSystem.ts`
- `src/render/TrailRenderSystem.ts`
- `src/render/CombatEffectRenderSystem.ts`

注意点:

- `AntRenderSystem.materialStateFor()` は味方を常に `explore` material にする現行ルールを保持する。
- renderIndex allocator は domain identity と独立した service にする。
- `disposeObject3D()` と shared material/geometry skip は render utility として残す。

### UI

移動候補:

- `ui` DOM query
- `setActiveTab()`
- `renderUpgrades()`
- `updateStats()`
- panel gesture
- button event handlers

分離先:

- `src/ui/dom.ts`
- `src/ui/viewModel.ts`
- `src/ui/renderDom.ts`
- `src/ui/events.ts`

注意点:

- `updateStats()` は DOM 更新と derived calculation と `renderUpgrades()` を混ぜている。`createViewModel(state)` と `renderViewModel(dom, vm)` に分ける。
- 管理タブは `growth`, `construction`, `soldiers` を扱える shape にする。ただし UI 追加は仕様確認後に別 PR。

### debug/verify

移動候補:

- `window.__ANT_SIM`
- `window.__ANT_SIM_READY`
- test/verify 用 scenario setup
- renderer metrics

分離先:

- `src/debug/debugApi.ts`
- `src/debug/scenarios.ts`
- `src/debug/metrics.ts`

注意点:

- 現在の Playwright と verify script は `window.__ANT_SIM` の内部状態を直接 mutate している。分割後は `window.__ANT_DEBUG` のような狭い API へ寄せる。
- production build へ debug hook を露出しない。ローカル検証では dev/test mode または明示的な verify build flag で有効化する。

## AntVariant / behavior API

### 型の基本方針

`variant` はセーブ/設計上のアリ種別、`behaviorState` は live actor の一時状態として分ける。

```ts
export type AntVariantId = "worker" | "soldier" | "heavySoldier" | "builder";

export type AntBehaviorState =
  | "forage"
  | "returnToNest"
  | "panic"
  | "wet"
  | "stunned"
  | "rescue"
  | "sortieIntercept"
  | "build"
  | "flee"
  | "clash";

export interface LiveAntIdentity {
  id: number;
  renderIndex: number | null;
  spawnReason: "initialWorker" | "populationSync" | "soldierSortie" | "buildAssignment";
}

export interface LiveAntKinematics {
  position: { x: number; z: number };
  previousPosition: { x: number; z: number };
  heading: number;
  previousHeading: number;
  velocity: { x: number; z: number };
  gaitPhase: number;
}

export interface AntVariantDef {
  id: AntVariantId;
  label: string;
  spawnPolicy: "alwaysLive" | "sortieOnly" | "assignmentOnly";
  stats: {
    moveSpeed: number;
    carryCapacity: number;
    combatPower: number;
    buildPower: number;
    stamina: number;
  };
  allowedTasks: AntTaskKind[];
  behaviorProfile: string;
  renderProfile: string;
}
```

### behavior interface

Behavior は `ant` と `world query` を読み、steering、state transition、event を返す。DOM、localStorage、Three.js へ直接触らない。

```ts
export interface AntBehaviorContext {
  dt: number;
  colony: Readonly<ColonyState>;
  world: WorldQuery;
  commands: SimCommandSink;
}

export interface AntBehaviorResult {
  steering: { x: number; z: number };
  nextState?: AntBehaviorState;
  events?: SimEvent[];
}

export interface AntBehavior {
  id: string;
  canRun(ant: LiveAnt, context: AntBehaviorContext): boolean;
  tick(ant: LiveAnt, context: AntBehaviorContext): AntBehaviorResult;
}
```

### identity continuity rules

- `id` は `AntIdAllocator` が発行し、配列 index とは無関係にする。
- `renderIndex` は `RenderSlotAllocator` が `faction:id` 単位で保持する。
- `position`, `heading`, `gaitPhase` は behavior や render system の切り替えで再初期化しない。
- worker から soldier へ「変身」させるのではなく、巣内 resource と live actor assignment を分ける。
- sortie/build assignment で live actor を生成する場合は、`spawnReason` を残す。

## WorldStructure / BuildTask / effect API

### 基本方針

土木工事は完全な地形変形ではなく、軽量な範囲効果と視覚表現にする。まずは `trailReinforce` と `lowBarricade` の 2 種だけを API で表現できるようにする。

```ts
export type StructureKind = "trailReinforce" | "lowBarricade";

export interface WorldStructure {
  id: string;
  kind: StructureKind;
  position: { x: number; z: number };
  rotation: number;
  radius: number;
  length?: number;
  width?: number;
  createdAt: number;
  durability: number;
  effect: StructureEffect;
}

export interface BuildTask {
  id: string;
  kind: StructureKind;
  target: BuildTarget;
  requiredWork: number;
  completedWork: number;
  assignedAntIds: number[];
  status: "queued" | "active" | "complete" | "cancelled";
  structureId?: string;
}

export interface StructureEffect {
  movementMultiplier?: number;
  pheromoneDecayMultiplier?: number;
  raidPathCost?: number;
  coverBonus?: number;
  blocksSmallEnemies?: boolean;
}
```

### effect query

Simulation 側は `WorldQuery` 経由で構造物効果を読む。

```ts
export interface WorldQuery {
  terrainSpeedAt(x: number, z: number): number;
  structureEffectsAt(x: number, z: number): StructureEffect[];
  movementMultiplierAt(x: number, z: number): number;
  raidPathCostAt(x: number, z: number): number;
}
```

`trailReinforce` は移動や food pheromone 維持に小さく効く。`lowBarricade` は敵襲経路や接近速度へ小さく効く。どちらも地形 mesh を破壊的に変形しない。

## Three.js render layer

render layer は simulation snapshot を受け取るだけにする。

```ts
export interface RenderFrameSnapshot {
  ants: AntRenderSnapshot[];
  rivals: AntRenderSnapshot[];
  trails: TrailRenderSnapshot[];
  structures: StructureRenderSnapshot[];
  combatEffects: CombatEffectSnapshot[];
  corpses: CorpseRenderSnapshot[];
  camera: CameraSnapshot;
}
```

推奨 layer:

- `TerrainRenderSystem`: static terrain, nest, natural obstacles
- `AntRenderSystem`: InstancedMesh for live ants and rivals
- `StructureRenderSystem`: trail reinforcement, barricade visuals
- `TrailRenderSystem`: food/alarm/rescue/water pheromone rings
- `CombatEffectRenderSystem`: dust, ring, slash
- `RoleLabelSystem`: optional labels/debug overlay

重要な render invariants:

- friendly live ants always use default material, independent of behavior state.
- rival ants use rival material, including clash.
- InstancedMesh capacity and render slots stay stable.
- render system can hide or release slots without changing domain identity.
- all dynamic objects have explicit dispose path.

## localStorage save/migration

### 現行

- key: `ant3d.colonyState`
- current version: `4`
- durable fields include food, lifetimeFood, antPopulation, soldierAnts, woundedAnts, attackPower, defensePower, nestLevel, territory, enemyThreat, fallenAnts, hatchProgress, battleCooldownUntil, raidState, unlockedEnemyColonies, upgrades, battleLog, lastSavedAt.
- `raidSoon` mode suppresses saving.
- active/retreating raid is normalized to warning on load.

### 方針

- save key は変えない。
- version bump は必要な時だけ行う。
- first refactor PR では version を上げない。
- 新しい fields は optional とし、migration で default を補う。
- live ants, trails, combat effects, corpses, transient render state, debug state は保存しない。
- `WorldStructure` と `BuildTask` を保存する場合は version bump し、空配列 default を追加する。
- migration test fixture を作り、v1 から v4 相当の古い断片保存を読み込めることを確認する。

推奨 envelope:

```ts
export interface ColonySaveV5 extends ColonySaveV4 {
  version: 5;
  antInventory?: Partial<Record<AntVariantId, number>>;
  structures?: WorldStructureSave[];
  buildTasks?: BuildTaskSave[];
}
```

ただし、`version: 5` は土木/構造物を実装する PR まで保留する。

## UI view model / DOM 更新

現行 `updateStats()` は derived calculation、DOM text 更新、raid notice、battle log、upgrade list 再描画を一度に行っている。今後は以下に分ける。

```ts
export interface GameViewModel {
  resources: ResourceVm;
  colonySummary: string;
  raidNotice: RaidNoticeVm;
  tabs: TabVm[];
  upgrades: UpgradeCardVm[];
  soldiers: SoldierPanelVm;
  construction?: ConstructionPanelVm;
  battleLog: string[];
}
```

- `createGameViewModel(state, derived)` は pure function。
- `renderDom(dom, vm)` は DOM 差分更新だけを行う。
- `bindUiEvents(dom, commands)` は user input を command へ変換する。
- Playwright は DOM text と debug API を見る。internal class へ依存しない。

## debug API / verification 方針

現行の Playwright/verify は `window.__ANT_SIM` へ深く依存している。短期的には互換 adapter を残しつつ、以下の安定 API へ移行する。

```ts
export interface AntDebugApi {
  isReady(): boolean;
  getSnapshot(): DebugSnapshot;
  getRendererMetrics(): RendererMetrics;
  commands: {
    setColonyFixture(input: Partial<ColonyState>): void;
    startSoldierSortie(): boolean;
    advanceFixedSteps(count: number): void;
    setupRaid(input?: RaidFixture): void;
    setupCombatFixture(input: CombatFixture): void;
  };
}
```

方針:

- tests/scripts は `window.__ANT_DEBUG` を優先し、移行期間のみ `__ANT_SIM` fallback を使う。
- debug API は scenario setup と snapshot だけを提供し、class instance の丸ごと公開をやめる。
- production build では debug API を露出しない。ローカル verify では dev/test mode または明示 flag で有効にする。
- `data-testid` は UI の存在確認に使い、simulation 内部の代替にはしない。

## `@ts-nocheck` を外す段階戦略

1. `@ts-nocheck` を残したまま、typed module を新規作成する。
2. `src/state/*`, `src/config/*`, `src/shared/*` を strict に近い書き方で追加する。
3. `simulation.ts` から pure function を import して使う。挙動は変えない。
4. `global.d.ts` の `Window` 型を `unknown` から `AntDebugApi` へ狭める。
5. `AntRenderSystem` を typed module へ移す。`AntRenderSnapshot` を境界にする。
6. `Ant`/`RivalAnt` の domain 型を作り、class field を明示する。
7. 残った `AntColony3D` を `AntColonyApp` へ分ける。
8. 最後に `simulation.ts` から `@ts-nocheck` を外すか、`simulation.ts` を削除して `main.ts` に置換する。

禁止事項:

- 最初から `strict: true` にして全体を一気に直さない。
- 型エラーを消すためにゲームロジックを変えない。
- `any` を広げて typed module の価値を消さない。

## 段階的移行計画

### Phase 0: documentation only

- この文書を追加する。
- ゲーム挙動は変更しない。

### Phase 1: config/state pure extraction

Status: 2026-06-27 に最初の安全スライスとして実行済み。`src/config/`, `src/state/`, `src/shared/math.ts` を追加し、`src/simulation.ts` は既存 public method を保ったまま pure module を参照する形へ移行した。

- `src/config/upgrades.ts`, `src/config/balance.ts` を追加する。
- `src/state/colony.ts`, `src/state/derived.ts`, `src/state/migrations.ts`, `src/state/save.ts` を追加する。
- `simulation.ts` は既存関数の呼び出し先を import へ置き換える。
- `SAVE_KEY`, save version, migration behavior は変えない。
- unit test で default colony, migration, derived values を固定する。

### Phase 2: debug facade

- `src/debug/debugApi.ts` を追加する。
- `window.__ANT_DEBUG` を tests/scripts から使う。
- `window.__ANT_SIM` は互換 fallback として一時残す。
- debug API は production へ露出しない方式を決める。

### Phase 3: render extraction

- `AntRenderSystem`, materials, geometries, disposal helper を `src/render/` へ移す。
- `AntRenderSnapshot` を導入する。
- 味方 default material 固定と rival material 固定を unit/playwright で確認する。

### Phase 4: world/effects extraction

- terrain/food/trails/corpses/combatEffects を `src/sim/world` と `src/render/*RenderSystem` に分ける。
- `WorldQuery` を導入し、ants は `sim` 全体ではなく query を読む。

### Phase 5: ant behavior extraction

- `Ant` domain class と behavior modules を作る。
- worker forage/return/panic/rescue/sortieIntercept を順に移す。
- `AntVariantDef` を導入するが、最初は現行 worker/soldier resource の挙動を変えない。

### Phase 6: construction API skeleton

- `WorldStructure`, `BuildTask`, `StructureEffect` 型と no-op system を追加する。
- `trailReinforce` と `lowBarricade` の config だけを追加し、実際の UI/効果は仕様確認後に行う。
- save version bump は実際に durable structures を保存する PR まで保留する。

### Phase 7: construction gameplay implementation

- `土木` タブ追加。
- builder inventory と build assignment を追加。
- assigned builder だけ地表へ出る。
- `trailReinforce` と `lowBarricade` を軽量範囲効果として実装する。
- save migration を v5 へ上げる。

### Phase 8: remove `@ts-nocheck`

- 残る app shell を typed 化する。
- `src/simulation.ts` を thin entrypoint にするか削除する。

## セーブ互換性の守り方

- `ant3d.colonyState` を維持する。
- migration は unknown-safe にし、壊れた localStorage でも default colony へ戻す。
- version bump なしの refactor PR では JSON shape を変えない。
- version bump が必要な PR では、fixture を追加し、旧 save の読み込みを unit test する。
- new fields は optional default にする。
- active raid load normalization と `raidSoon` save suppression を維持する。
- `fallenAnts` と `raid.startFallenAnts` の差分で敵襲死亡数を出す現行 rule を migration 後も維持する。
- `soldierAnts` は巣内リソースとして保存し、出撃中 live actor は保存しない。
- builder/heavySoldier を追加する場合も、まず inventory count と assignment を分けて保存する。

## テスト/検証方針

### unit

- config export が現行値と一致する。
- `createDefaultColony()` と migration が旧断片 save を補完する。
- `computeDerived()` が現行の主要比率を維持する。
- `AntVariantDef` registry が重複 id を持たない。
- `WorldStructure` effect aggregation が deterministic。
- `RenderSlotAllocator` が `faction:id` の stable slot を維持する。

### Playwright

- 初期 12 匹、平時兵隊非表示、兵隊タブ出撃、出撃後迎撃、敵襲通知、味方 default material 固定を維持する。
- UI test は `__ANT_DEBUG` と DOM を使い、内部 class/method 直接呼び出しを減らす。
- save/load は旧 save fixture と新 save fixture の両方を確認する。

### verify

通常 refactor PR:

- `npm run check`
- `npm run build`
- `npm run test`
- `npm run asset:audit`
- `npm run eval:smoke`
- `npm run eval:save`
- `npm run verify`

戦闘描画、敵襲 AI、corpse、grapple、renderIndex に触る PR:

- 上記に加えて `npm run verify:combat`
- screenshot を確認する。

## 最初の最小 PR 案

目的: ゲーム挙動を一切変えず、最も安全な境界から分割を開始する。

内容:

1. `src/config/upgrades.ts` を追加し、`UPGRADE_BRANCHES`, `UPGRADE_DEFS`, `upgradeCost()`, `upgradeLevel()`, `upgradeName()` を移す。
2. `src/state/colony.ts` と `src/state/migrations.ts` を追加し、`createDefaultColony()`, `createDefaultRaidState()`, `normalizeRaidState()`, `migrateColony()` を移す。
3. `src/state/derived.ts` を追加し、`computeDerivedColony(colony)` を pure function として実装する。
4. `src/simulation.ts` は import して使うだけにし、数値と UI 文言は変えない。
5. unit test に migration/derived fixture を追加する。
6. README の遠征記述を現行の兵隊タブ/敵襲説明へ更新するか、別 docs PR として切り出す。

この PR ではやらないこと:

- `土木` タブ追加
- builder/heavySoldier 実装
- save version bump
- render system 移動
- debug hook 仕様変更
- `@ts-nocheck` 削除

主なリスク:

- `computeDerived()` の副作用を pure 化すると、`soldierAnts`, `attackPower`, `defensePower` の反映タイミングが変わる可能性がある。
- `UPGRADE_DEFS` の参照同一性や順序が UI/test に影響する可能性がある。
- migration の default 補完順が変わると旧 save 読み込みが変化する可能性がある。

対策:

- まず current output fixture を作り、移動前後で一致させる。
- `npm run eval:save` を必ず実行する。
- `git diff` で `src/simulation.ts` のロジック変更が import 置換だけに近いことを確認する。

## README / AGENTS への追記案

README は Phase 1 実行時に現行挙動へ更新済み。

- 遠征タブ、抽象遠征バトル、遠征で領土を得る説明は削除済み。
- 兵隊は平時は巣内リソースで、兵隊タブから出撃する説明へ更新済み。
- `?raidSoon=1` は敵襲確認 URL として記載済み。
- `土木` タブはまだ通常 UI へ実装していないため、README では現在機能として扱わない。実装時に追記する。

AGENTS は大きな変更不要。ただし土木実装が入る段階で、以下を追記するとよい。

- 土木アリは工事割当時だけ地表へ出る。
- `trailReinforce` と `lowBarricade` は軽量な範囲効果であり、完全地形変形ではない。
- `WorldStructure` 保存を追加する PR では migration test と `eval:save` を必須にする。
