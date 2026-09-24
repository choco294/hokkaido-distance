# 北海道の距離感

北海道の会場とホテルの直線距離を、東京・大阪・札幌など、なじみのある街の地図に置き換えて比べるWebアプリです。

![北海道の距離感](public/og.png)

**公開デモ:** [北海道の距離感](https://hokkaido-distance.chocozukushi.chatgpt.site/share)

## 主な機能

- 会場・ホテル・比較の起点を、施設名・住所・地図から指定
- 空白区切りのキーワード検索と、登録済みの正式名称・別名補完
- 北海道内の2地点の直線距離を、選んだ都市を中心とした円で比較
- Google Mapsで経路を確認できるリンク
- X（Twitter）向けのOG画像・メタデータ
- ログイン、APIキー、有料APIなし

施設検索には無料の外部サービスを利用しています。Google Mapsと同等の網羅性はなく、施設が見つからない場合や名称・位置が古い場合があります。その場合は「地図で指定」を利用してください。

## 技術構成

- React / TypeScript
- Vinext / Vite
- Leaflet
- Tailwind CSS
- Cloudflare Workers（公開環境）

## ローカル起動

Node.js 22.13以降とpnpm 11を使用します。

```bash
corepack enable
pnpm install
pnpm dev
```

起動後、`http://localhost:5173` を開いてください。ログインや環境変数は不要です。

## 検証

```bash
pnpm build
node scripts/check-place-search.cjs
```

公開中のOGメタデータと画像は次のコマンドで確認できます。

```bash
node scripts/check-social-card.mjs
```

## 距離の計算

平均地球半径 6,371.0088 km を使い、haversine式で大円距離を計算します。表示する円は直線距離の比較用で、道路距離・所要時間・等時間圏ではありません。

## データと外部サービス

- 背景地図: [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)
- 施設・駅の位置: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- 施設検索: [Photon API](https://github.com/komoot/photon/blob/master/docs/api-v1.md)
- 名称・別名の補完: [Wikipedia](https://ja.wikipedia.org/)
- 地図表示: [Leaflet](https://leafletjs.com/)

検索語は検索実行時に外部サービスへ送信されます。公開サービスの利用条件・可用性・レート制限に従ってください。大規模利用では、自前の検索基盤などへの移行を推奨します。

`scripts/fixtures/wikipedia-places.json` はWikipedia contributorsのAPI応答から抽出した検証用データで、[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) の対象です。地図・検索結果・同梱データなど第三者由来のコンテンツには、それぞれのライセンスが適用されます。

## ライセンス

アプリのソースコードは [MIT License](LICENSE) で公開しています。
