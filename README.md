# 蟻の群れリアクションラボ

蟻の群れに水、落下物、餌、枝を置き、個体ごとの性格と状態遷移を観察する静的 Canvas シミュレータです。

## 開き方

`index.html` をブラウザで開きます。外部依存はありません。

## 操作

- 観察: 蟻を選択して個体の役割、状態、性格値を見る
- 水: ドラッグで水たまりを作る
- 物: クリックで落下物を置く
- 餌: クリックで餌を置く
- 枝: ドラッグで障害物を置く
- 消す: 水、物、餌、枝を消す

## 検証

JavaScript の構文確認:

```powershell
npm.cmd run check
```

## GitHub Pages

`.github/workflows/deploy.yml` で GitHub Pages に配信します。

1. GitHub にこのフォルダを `main` ブランチで push
2. リポジトリの `Settings > Pages` で `Source` を `GitHub Actions` に設定
3. `Actions` の `Deploy GitHub Pages` が成功したら公開 URL を確認

初回 push 例:

```powershell
git add .
git commit -m "Add ant colony reaction simulator"
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
