import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description =
    "촬영 현장의 미디어 롤, 오프로드, QC, 저장매체와 인계 정보를 A4 데일리 리포트로 정리합니다.";

  return {
    title: {
      default: "DIT Daily Report",
      template: "%s · DIT Daily Report",
    },
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "DIT Daily Report",
      description,
      type: "website",
      url: origin,
      images: [
        {
          url: `${origin}/og.png`,
          width: 1734,
          height: 907,
          alt: "DIT Daily Report — 촬영 데이터에서 A4 리포트까지",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "DIT Daily Report",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
