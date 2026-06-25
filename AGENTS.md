# AGENTS.md

## Project
このリポジトリはブラウザで動くゲームプロトタイプ。Codexはゲーム仕様を勝手に変更せず、実装・検証・レポートを行う。

## Game design pillars
- プレイヤーが選択の因果関係を理解できること。
- プレイヤーが自律的に成長するアリのコロニーにうれしさを感じられること。
- プレイヤーがアリに感情移入し、敵に攻撃され、思うようにアリが成長できないことを悔しく感じること
- ランダム性は許可するが、結果の理由は説明可能にすること。
- 数値バランス変更は小さく、根拠を残すこと。
- 遠征モードは使わない。兵隊アリは平時は巣内にいて、プレイヤー指示で兵隊タブから出撃すること。

## Allowed changes
- Playwright設定、テスト、検証スクリプト、data-testid追加、開発時限定debug hook。
- 既存挙動を保つための小さな修正。
- docs/decision-log.mdへの追記。
- 今後のCodex引き継ぎに必要なルール、検証手順、運用上の注意が増えた場合のAGENTS.md更新。

## Forbidden changes
- ゲーム仕様の暗黙変更。
- UI文言の大幅変更。
- 本番buildへのdebug hook露出。
- セーブデータ互換性を壊す変更。
- unrelated refactor。
- テストを通すためだけのゲームロジック改変。

## Commands
- Install: `npm install`
- Dev: `npm run dev`
- Unit test: `npm run test`
- Smoke eval: `npm run eval:smoke`
- Save/load eval: `npm run eval:save`
- Combat visual eval: `npm run verify:combat`
- Raid quick check URL: `/?raidSoon=1`

## Maintenance
- 作業中に恒久的な注意点、禁止事項、検証手順、リポジトリ運用ルールが増えた場合は、必要に応じてAGENTS.mdを更新する。
- 一時的な作業メモや今回限りの結果はAGENTS.mdではなく、最終報告またはdocs/decision-log.mdに残す。

## Definition of Done
- `npm run test` が通る。
- `npm run eval:smoke` が通る。
- セーブ機能がある場合は `npm run eval:save` が通る。
- 戦闘描画や敵襲AIを変更した場合は `npm run verify:combat` を実行し、出力スクリーンショットを確認する。
- 失敗時はPlaywright report、screenshot、console error、原因候補を報告する。
- 最終報告に変更点、検証結果、残リスク、未対応事項を含める。

## Stop conditions
- 同じエラーで3回連続失敗。
- 仕様判断が必要。
- セーブ仕様変更が必要。
- production露出やデータ破壊の可能性がある。
