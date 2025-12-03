import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { GoogleAnalytics } from "@next/third-parties/google";
import { DiagramProvider } from "@/contexts/diagram-context";

import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Next AI Draw.io - AI-Powered Diagram Generator",
    description: "Create AWS architecture diagrams, flowcharts, and technical diagrams using AI. Free online tool integrating draw.io with AI assistance for professional diagram creation.",
    keywords: ["AI diagram generator", "AWS architecture", "flowchart creator", "draw.io", "AI drawing tool", "technical diagrams", "diagram automation", "free diagram generator", "online diagram maker"],
    authors: [{ name: "Next AI Draw.io" }],
    creator: "Next AI Draw.io",
    publisher: "Next AI Draw.io",
    metadataBase: new URL("https://next-ai-drawio.jiang.jp"),
    openGraph: {
        title: "Next AI Draw.io - AI Diagram Generator",
        description: "Create professional diagrams with AI assistance. Supports AWS architecture, flowcharts, and more.",
        type: "website",
        url: "https://next-ai-drawio.jiang.jp",
        siteName: "Next AI Draw.io",
        locale: "en_US",
        images: [
            {
                url: "/architecture.png",
                width: 1200,
                height: 630,
                alt: "Next AI Draw.io - AI-powered diagram creation tool",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Next AI Draw.io - AI Diagram Generator",
        description: "Create professional diagrams with AI assistance. Free, no login required.",
        images: ["/architecture.png"],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
    icons: {
        icon: "/favicon.ico",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Next AI Draw.io',
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Web Browser',
        description: 'AI-powered diagram generator with targeted XML editing capabilities that integrates with draw.io for creating AWS architecture diagrams, flowcharts, and technical diagrams. Features diagram history, multi-provider AI support, and real-time collaboration.',
        url: 'https://next-ai-drawio.jiang.jp',
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
        },
    };

    return (
        <html lang="en">
            <head>
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <DiagramProvider>{children}</DiagramProvider>

                <Analytics />
            </body>
            {process.env.NEXT_PUBLIC_GA_ID && (
                <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
            )}
        </html>
    );
}
