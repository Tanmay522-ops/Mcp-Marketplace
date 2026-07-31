'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'

type Props = {
    workspaceId: string
}

const steps = [
    {
        number: '01',
        title: 'Discover',
        description: 'Browse hundreds of MCP servers across categories: productivity, dev, data, and more.',
    },
    {
        number: '02',
        title: 'Deploy',
        description: 'One-click deploy from our MCP registry, or deploy custom MCPs from GitHub.',
    },
    {
        number: '03',
        title: 'Connect',
        description: 'Your agent can use the server immediately. Tools appear in the client.',
    },
]

const McpServersEmptyState = ({ workspaceId }: Props) => {
    // Same UnicornStudio loading + branding-hiding logic as the real
    // marketing hero — ported directly rather than reusing that component,
    // since it renders its OWN unrelated content (title, header, footer)
    // baked in. This copy only loads the animated background itself.
    useEffect(() => {
        const embedScript = document.createElement('script')
        embedScript.type = 'text/javascript'
        embedScript.textContent = `
      !function(){
        if(!window.UnicornStudio){
          window.UnicornStudio={isInitialized:!1};
          var i=document.createElement("script");
          i.src="https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.33/dist/unicornStudio.umd.js";
          i.onload=function(){
            window.UnicornStudio.isInitialized||(UnicornStudio.init(),window.UnicornStudio.isInitialized=!0)
          };
          (document.head || document.body).appendChild(i)
        }
      }();
    `
        document.head.appendChild(embedScript)

        const style = document.createElement('style')
        style.textContent = `
      [data-us-project] {
        position: relative !important;
        overflow: hidden !important;
      }
      [data-us-project] canvas {
        clip-path: inset(0 0 10% 0) !important;
      }
      [data-us-project] * {
        pointer-events: none !important;
      }
      [data-us-project] a[href*="unicorn"],
      [data-us-project] button[title*="unicorn"],
      [data-us-project] div[title*="Made with"],
      [data-us-project] .unicorn-brand,
      [data-us-project] [class*="brand"],
      [data-us-project] [class*="credit"],
      [data-us-project] [class*="watermark"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        position: absolute !important;
        left: -9999px !important;
        top: -9999px !important;
      }
    `
        document.head.appendChild(style)

        const hideBranding = () => {
            const selectors = [
                '[data-us-project]',
                '[data-us-project="OMzqyUv6M3kSnv0JeAtC"]',
                '.unicorn-studio-container',
                'canvas[aria-label*="Unicorn"]',
            ]
            selectors.forEach((selector) => {
                document.querySelectorAll(selector).forEach((container) => {
                    container.querySelectorAll('*').forEach((el) => {
                        const text = (el.textContent || '').toLowerCase()
                        const title = (el.getAttribute('title') || '').toLowerCase()
                        const href = (el.getAttribute('href') || '').toLowerCase()
                        if (
                            text.includes('made with') ||
                            text.includes('unicorn') ||
                            title.includes('made with') ||
                            title.includes('unicorn') ||
                            href.includes('unicorn.studio')
                        ) {
                            const htmlEl = el as HTMLElement
                            htmlEl.style.display = 'none'
                            htmlEl.style.visibility = 'hidden'
                            htmlEl.style.opacity = '0'
                            htmlEl.style.pointerEvents = 'none'
                            htmlEl.style.position = 'absolute'
                            htmlEl.style.left = '-9999px'
                            htmlEl.style.top = '-9999px'
                            try {
                                el.remove()
                            } catch {
                                /* ignore */
                            }
                        }
                    })
                })
            })
        }

        hideBranding()
        const interval = setInterval(hideBranding, 50)
        const timeouts = [500, 1000, 2000, 5000, 10000].map((ms) => setTimeout(hideBranding, ms))

        return () => {
            clearInterval(interval)
            timeouts.forEach(clearTimeout)
            document.head.removeChild(embedScript)
            document.head.removeChild(style)
        }
    }, [])

    return (
        <div className="relative w-full min-h-[80vh] overflow-hidden rounded-xl bg-black">
            {/* Animated background */}
            <div className="absolute inset-0 w-full h-full hidden lg:block">
                <div
                    data-us-project="OMzqyUv6M3kSnv0JeAtC"
                    style={{ width: '100%', height: '100%', minHeight: '100%' }}
                />
            </div>
            {/* Mobile fallback — stars */}
            <div className="absolute inset-0 w-full h-full lg:hidden stars-bg" />

            {/* Foreground content — Discover / Deploy / Connect */}
            <div className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
                    Discover. Deploy. Connect.
                </h1>
                <p className="text-[13.5px] text-white/60 max-w-lg mb-10">
                    MCP servers expose a collection of tools your AI agents can call to take real action
                    across the apps and systems you already use.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-white/15 rounded-xl bg-black/40 backdrop-blur-sm mb-8 max-w-3xl w-full">
                    {steps.map((step, i) => (
                        <div
                            key={step.number}
                            className={`px-6 py-5 text-left ${i > 0 ? 'md:border-l border-white/15' : ''}`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-1 h-1 rounded-full bg-white/60" />
                                <span className="text-[10.5px] font-mono tracking-wider text-white/50 uppercase">
                                    Step {step.number}
                                </span>
                            </div>
                            <p className="text-[15px] font-semibold text-white mb-1.5">{step.title}</p>
                            <p className="text-[12.5px] text-white/50 leading-relaxed">{step.description}</p>
                        </div>
                    ))}
                </div>

                <Link
                    href={`/dashboard/${workspaceId}/browse`}
                    className="h-9 px-4 rounded-md bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-colors flex items-center gap-1.5"
                >
                    <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                    Add server
                </Link>
            </div>

            <style jsx>{`
                .stars-bg {
                    background-image:
                        radial-gradient(1px 1px at 20% 30%, white, transparent),
                        radial-gradient(1px 1px at 60% 70%, white, transparent),
                        radial-gradient(1px 1px at 50% 50%, white, transparent),
                        radial-gradient(1px 1px at 80% 10%, white, transparent),
                        radial-gradient(1px 1px at 90% 60%, white, transparent),
                        radial-gradient(1px 1px at 33% 80%, white, transparent),
                        radial-gradient(1px 1px at 15% 60%, white, transparent),
                        radial-gradient(1px 1px at 70% 40%, white, transparent);
                    background-size: 200% 200%, 180% 180%, 250% 250%, 220% 220%, 190% 190%, 240% 240%, 210% 210%, 230% 230%;
                    background-position: 0% 0%, 40% 40%, 60% 60%, 20% 20%, 80% 80%, 30% 30%, 70% 70%, 50% 50%;
                    opacity: 0.3;
                }
            `}</style>
        </div>
    )
}

export default McpServersEmptyState