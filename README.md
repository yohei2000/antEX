# antEX

アリの巣を小さな群れから巨大な地下帝国へ育てていく、モバイル前提の 3D 放置ゲームです。

公開 URL: https://yohei2000.github.io/antEX/

## Concept

antEX の中心体験は「アリの巣の大帝国を目指す」ことです。

最初は小さな巣と 12 匹程度のアリから始まります。時間経過で食料が増え、アリが増え、巣の収容上限、兵隊数、土木アリが伸びていきます。プレイヤーは強化、土木工事、兵隊出撃を選びながら、採餌、敵襲、防衛、負傷を管理します。

## Current Features

- Vite + TypeScript + Three.js による 3D 盤面
- InstancedMesh によるアリ描画
- 初期 12 匹の小規模コロニー
- 時間経過による食料、アリ数、敵脅威の増加
- localStorage `ant3d.colonyState` による保存と復元
- 成長/土木/兵隊を中心にしたモバイル UI
- 複数の自然餌場と広めの地形
- 予兆つきの敵襲サイクル
- 味方より少し大きい赤茶系の敵アリ
- 敵アリとの約2秒以上の組み合い戦闘と最大3匹までの加勢
- 兵隊タブからの一時出撃と敵襲迎撃
- 重兵装アリと土木アリの巣内リソース管理
- 土木タブからの採餌道整備と低い土塁の発注
- ボクセル風ブロックによる土木建築物の進捗描画
- 重兵装、盾頭、酸射、斥候、小隊長、土木アリによる役割分化
- GitHub Pages 配信

## Game Loop

1. 働きアリが食料を集める
2. 食料と収容上限に応じてアリが増える
3. 強化で採餌効率、孵化速度、収容上限、戦闘力を上げる
4. 土木アリを育て、採餌道や低い土塁を必要な場所へ発注する
5. 兵隊を増やし、敵襲時に兵隊タブから出撃させる
6. 敵襲の接近、開始、撃退または被害を確認する
7. 外敵や敵脅威に備えながら、より大きな巣を目指す

## Controls

- ドラッグまたはタッチドラッグ: カメラ角度変更
- タップ: 近くのアリを選択
- ピンチ: ズーム
- 成長タブ: 巣と資源の状態確認、強化購入
- 土木タブ: 土木アリの状態確認、採餌道整備、低い土塁の発注
- 兵隊タブ: 巣内兵隊の確認、兵隊出撃

通常アプリから遠征モードは削除済みです。兵隊アリは平時は巣内リソースとして扱い、プレイヤーが兵隊タブから指示した時だけ地表へ出撃します。

土木アリも平時は巣内リソースとして扱い、土木タブから工事に割り当てられた時だけ地表へ出ます。土木工事は完全な地形変形ではなく、軽量な範囲効果と視覚表現として扱います。

マウス移動や hover だけではカメラは動きません。

## Design Docs

- [docs/design-pillars.md](docs/design-pillars.md): ゲームの基本設計方針
- [docs/decision-log.md](docs/decision-log.md): ユーザー判断と設計変更の履歴
- [docs/asset-pipeline.md](docs/asset-pipeline.md): 今後アセットを追加する場合の方針
- [docs/architecture-refactor-plan.md](docs/architecture-refactor-plan.md): 通常ゲーム本体の段階的な構造分割計画

## Project Structure

```text
.
├── index.html
├── styles.css
├── src/
│   ├── config/
│   │   ├── balance.ts
│   │   ├── construction.ts
│   │   ├── upgrades.ts
│   │   └── variants.ts
│   ├── render/
│   │   └── VoxelBuildingRenderer.ts
│   ├── shared/
│   ├── state/
│   │   ├── colony.ts
│   │   ├── derived.ts
│   │   ├── migrations.ts
│   │   ├── save.ts
│   │   └── schema.ts
│   ├── expedition/
│   ├── global.d.ts
│   └── simulation.ts
├── scripts/
│   ├── asset-audit.mjs
│   ├── serve.mjs
│   ├── verify-combat-outcomes.mjs
│   └── verify-render.mjs
├── tests/
│   ├── playwright/
│   └── unit/
├── vite.config.ts
├── tsconfig.json
├── playwright.config.ts
├── docs/
└── .github/workflows/deploy.yml
```

`src/simulation.ts` はまだ通常ゲームの compatibility entrypoint / orchestration 層です。新しい拡張では、まず以下の registry/state 境界を優先します。

- `src/config/variants.ts`: `worker`, `soldier`, `heavySoldier`, `builder` などのアリ種別定義
- `src/config/construction.ts`: `trailReinforce`, `lowBarricade` などの土木工事定義
- `src/config/upgrades.ts`: 強化ツリー定義
- `src/config/balance.ts`: 汎用バランス定数
- `src/render/VoxelBuildingRenderer.ts`: 土木建築物のボクセル風描画テンプレート
- `src/state/*`: colony state、derived calculation、save/migration、保存 schema

土木対象を増やす場合は、まず `src/config/construction.ts` の `CONSTRUCTION_KINDS` / `CONSTRUCTION_DEFS` に追加し、必要な UI、effect、render、migration test を追従させます。アリ種別を増やす場合は、まず `src/config/variants.ts` を起点にします。

## Local Development

Vite dev server で起動します。Three.js は npm dependency としてバンドルします。

```powershell
npm.cmd run dev
```

静的ビルド:

```powershell
npm.cmd run build
```

構文チェック:

```powershell
npm.cmd run check
```

Unit test:

```powershell
npm.cmd run test
```

アセット参照チェック:

```powershell
npm.cmd run asset:audit
```

## Verification

headless Chrome または Edge を使い、モバイル幅とデスクトップ幅で WebGL canvas とゲーム状態を検証します。

```powershell
npm.cmd run verify
```

Playwright smoke/save-load:

```powershell
npm.cmd run eval:smoke
npm.cmd run eval:save
```

敵襲を短時間で確認する場合:

```text
/?raidSoon=1
```

戦闘描画や敵襲 AI を変更した場合:

```powershell
npm.cmd run verify:combat
```

検証では以下を確認します。

- mobile 390x844
- desktop 1366x768
- canvas が非空
- renderer.info の取得
- 初期アリ数が 12 匹
- 平時の敵アリ数が 0 匹で、敵襲は予兆後に外縁から始まる
- hover だけではカメラが回転しない
- 放置成長で食料/アリ数が増える
- 強化で収容上限が改善する
- 兵隊タブから巣内兵隊を一時出撃できる
- 出撃兵が見えている敵または敵襲シグナル方向へ向かう
- 土木タブから採餌道整備と低い土塁を発注できる
- 土木アリが未割当時は巣内に留まり、工事割当時だけ地表で作業する
- 保存と復元が機能する
- 敵アリ接触時に組み合い、加勢、死体寿命、敵襲通知が機能する

## Deployment

`.github/workflows/deploy.yml` で GitHub Pages に配信します。

`main` ブランチへの push で `npm ci`、`npm run build` を実行し、Vite の `dist/` を Pages artifact として公開します。

公開先:

```text
https://yohei2000.github.io/antEX/
```

## Performance Notes

- アリは InstancedMesh で描画する
- 初期表示数は少数に保つ
- 表示上限を設けて、コロニー成長と描画負荷を切り離す
- `pixelRatio` は上限付きで設定する
- `renderer.outputColorSpace = THREE.SRGBColorSpace`
- `renderer.toneMapping = THREE.ACESFilmicToneMapping`
- `?debug=1` で renderer.info を確認できる
