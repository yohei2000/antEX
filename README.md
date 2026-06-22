# antEX

アリの巣を小さな群れから巨大な地下帝国へ育てていく、モバイル前提の 3D 放置ゲームです。

公開 URL: https://yohei2000.github.io/antEX/

## Concept

antEX の中心体験は「アリの巣の大帝国を目指す」ことです。

最初は小さな巣と 12 匹程度のアリから始まります。時間経過で食料が増え、アリが増え、巣の収容上限や兵隊数が伸びていきます。プレイヤーは強化と遠征を選びながら、採餌、外敵、負傷、領土拡大を管理します。

## Current Features

- Vite + TypeScript + Three.js による 3D 盤面
- InstancedMesh によるアリ描画
- 初期 12 匹の小規模コロニー
- 時間経過による食料、アリ数、敵脅威の増加
- localStorage `ant3d.colonyState` による保存と復元
- 成長/強化/遠征を中心にしたモバイル UI
- 複数の自然餌場と広めの地形
- 味方より少し大きい茶色系の敵対アリ
- 敵対アリとの接触時の個体パラメータ勝負と押し合い
- UI 上の抽象遠征バトル
- GitHub Pages 配信

## Game Loop

1. 働きアリが食料を集める
2. 食料と収容上限に応じてアリが増える
3. 強化で採餌効率、孵化速度、収容上限、戦闘力を上げる
4. 兵隊を増やして遠征する
5. 勝利で食料と領土を得る
6. 外敵や敵脅威に備えながら、より大きな巣を目指す

## Controls

- ドラッグまたはタッチドラッグ: カメラ角度変更
- タップ: 近くのアリを選択
- ピンチ: ズーム
- 成長タブ: 巣と資源の状態確認、強化購入
- 遠征タブ: 兵隊を使った抽象バトル

マウス移動や hover だけではカメラは動きません。

## Design Docs

- [docs/design-pillars.md](docs/design-pillars.md): ゲームの基本設計方針
- [docs/decision-log.md](docs/decision-log.md): ユーザー判断と設計変更の履歴
- [docs/asset-pipeline.md](docs/asset-pipeline.md): 今後アセットを追加する場合の方針

## Project Structure

```text
.
├── index.html
├── styles.css
├── src/
│   ├── global.d.ts
│   └── simulation.ts
├── scripts/
│   ├── asset-audit.mjs
│   ├── serve.mjs
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
npm.cmd test
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

検証では以下を確認します。

- mobile 390x844
- desktop 1366x768
- canvas が非空
- renderer.info の取得
- 初期アリ数が 12 匹
- 敵対アリが少数配置されている
- hover だけではカメラが回転しない
- 放置成長で食料/アリ数が増える
- 強化で収容上限が改善する
- 遠征で食料と領土が増える
- 保存と復元が機能する
- 敵対アリ接触時に押し合いと採餌妨害が起きる

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
