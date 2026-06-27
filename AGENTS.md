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
- ライブ状態の味方アリは、警戒・逃走・戦闘中でも常にデフォルト色で描画すること。
- 敵襲の接近・開始・撃退は、兵隊タブを開いていなくてもユーザーに分かる表示を保つこと。

## Current gameplay rules
- 遠征モードは削除済み。通常アプリへ復活させない。
- 兵隊アリは平時は巣内リソースとして扱い、プレイヤーが兵隊タブから指示した時だけ地表へ出撃する。
- 出撃兵は見えている敵、または敵襲シグナル方向へ向かって前進する。巣周辺だけで待機させない。
- 敵アリ色は落ち着いた赤茶 `#8a4a2f` を維持する。
- 味方アリのライブ表示色は状態に関係なくデフォルト色を維持する。戦闘状態を色変更で表現しない。
- 戦闘は即ワープ/即ノックバックではなく、約2秒以上の組み合いとして見せる。
- 味方側は最大3匹まで1匹の敵に取り付き、正面・横・後ろ寄りから噛み付く配置を許可する。
- 戦闘後、敗者は画面内で固まらない。敵は画面外へ退却するか、死体として残る。死体は敵味方とも10秒で消える。
- 敵襲完了時の味方死亡数表示は、敵襲開始時の `fallenAnts` との差分を使う。`raid.casualties` 単体を表示の根拠にしない。
- 土木アリは工事に割り当てられている時だけ地表へ出る。未割当の土木アリは巣内リソースとして扱い、地表には描画しない。
- 土木工事は待機中の土木アリがいる限り、別種類の工事を同時に進められる。1つの工事へ無制限に密集させない。
- 巣は盛り上がった蓋状のドームではなく、地面に開いた穴として描画する。穴に入った味方アリは地表に表示せず、最低10秒は外へ出さない。

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

## Deployment
- GitHub Pages は `main` push で `.github/workflows/deploy.yml` が自動デプロイする。
- main 以外のブランチを一時デプロイする場合は、`github-pages` environment の branch policy を一時追加し、デプロイ後に必ず削除する。
- main への push はユーザーが明示した場合だけ実行する。
- ユーザーが実装後のデプロイまで求めている流れでは、明示的な停止指示がない限り、検証後に現在ブランチをpushして一時branch policy経由でデプロイまで進める。

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
