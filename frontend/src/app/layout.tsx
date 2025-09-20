import type { Metadata } from "next";
import type { ReactNode } from "react";

import { NavigationBar } from "@/components/NavigationBar";
import { Providers } from "@/components/Providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "MockMate - AI Interview Coach",
  description: "Upload your resume, practice with an AI interviewer, and receive instant feedback.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <Providers>
          <NavigationBar />
          <div className="mx-auto max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-full px-6 py-8 xl:px-12 2xl:px-24">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
