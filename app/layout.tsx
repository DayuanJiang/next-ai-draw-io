import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
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
    keywords: ["AI diagram generator", "AWS architecture", "flowchart creator", "draw.io", "AI drawing tool", "technical diagrams", "diagram automation"],
    authors: [{ name: "Next AI Draw.io" }],
    creator: "Next AI Draw.io",
    publisher: "Next AI Draw.io",
    metadataBase: new URL("https://next-ai-draw-io.vercel.app"),
    openGraph: {
        title: "Next AI Draw.io - AI Diagram Generator",
        description: "Create professional diagrams with AI assistance. Supports AWS architecture, flowcharts, and more.",
        type: "website",
        url: "https://next-ai-draw-io.vercel.app",
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
        description: "Create professional diagrams with AI assistance",
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
        description: 'AI-powered diagram generator that integrates with draw.io for creating AWS architecture diagrams, flowcharts, and technical diagrams.',
        url: 'https://next-ai-draw-io.vercel.app',
        offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
        },
        aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: '5',
            ratingCount: '1',
        },
    };

    return (
        <html lang="en">
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
                <DiagramProvider>{children}</DiagramProvider>

                <Analytics />
            </body>
        </html>
    );
}
