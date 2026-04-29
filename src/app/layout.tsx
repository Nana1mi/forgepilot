// 根布局：配置字体、元数据，并注入全局 Provider
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "ForgePilot - AI 编程助手",
  description: "让 AI Agent 自动规划并执行代码变更",
  icons: {
    icon: "/brand/readme-logo.png",
    apple: "/brand/readme-logo.png",
  },
  openGraph: {
    title: "ForgePilot - AI 编程助手",
    description: "让 AI Agent 自动规划并执行代码变更",
    images: [
      {
        url: "/brand/social-preview.png",
        width: 1200,
        height: 630,
        alt: "ForgePilot",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ForgePilot - AI 编程助手",
    description: "让 AI Agent 自动规划并执行代码变更",
    images: ["/brand/social-preview.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
