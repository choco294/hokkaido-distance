import type { Metadata } from "next";

export const siteUrl = "https://hokkaido-distance.chocozukushi.chatgpt.site";
const title = "北海道の距離感 | この距離、あなたの街なら？";
const description = "北海道のライブ会場とホテルの直線距離を、なじみのある街の地図に置き換えて比較。会場・ホテル・比較の起点を選んで、北海道の距離感をつかもう。";
// A new image URL lets consumers distinguish this card from earlier fetches.
const image = {
  url: `${siteUrl}/og.png?v=20260919-2`,
  width: 1200, height: 628, type: "image/png",
  alt: "北海道の距離感。この距離、あなたの街なら？ 緑色の北海道マーク",
};

export function shareMetadata(path = "/"): Metadata {
  const url = new URL(path, siteUrl).href;
  return {
    metadataBase: new URL(siteUrl),
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "ja_JP", url, siteName: "北海道の距離感", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [{ url: image.url, alt: image.alt }] },
  };
}
