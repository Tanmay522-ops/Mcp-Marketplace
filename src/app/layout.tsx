import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { Manrope, Instrument_Serif } from "next/font/google"

import "./globals.css"

import { ThemeProvider } from "@/providers/theme-provider"
import { Toaster } from "sonner"

const manrope = Manrope({
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "mcp-marketplace",
  description: "All MCP server at one place ",
}

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${manrope.className} ${instrumentSerif.variable} bg-black text-foreground`}
      >
        <ClerkProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            forcedTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
                {children}
            <Toaster richColors position="top-right" />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}