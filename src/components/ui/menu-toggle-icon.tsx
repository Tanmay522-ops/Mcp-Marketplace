"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface MenuToggleIconProps
    extends React.SVGProps<SVGSVGElement> {
    open: boolean;
    duration?: number;
}

export function MenuToggleIcon({
    open,
    className,
    duration = 300,
    ...props
}: MenuToggleIconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("size-5", className)}
            {...props}
        >
            {/* Top Line */}
            <line
                x1="4"
                y1={open ? "12" : "6"}
                x2="20"
                y2={open ? "12" : "6"}
                style={{
                    transformOrigin: "12px 12px",
                    transform: open ? "rotate(45deg)" : "rotate(0deg)",
                    transition: `all ${duration}ms ease`,
                }}
            />

            {/* Middle Line */}
            <line
                x1="4"
                y1="12"
                x2="20"
                y2="12"
                style={{
                    opacity: open ? 0 : 1,
                    transition: `all ${duration}ms ease`,
                }}
            />

            {/* Bottom Line */}
            <line
                x1="4"
                y1={open ? "12" : "18"}
                x2="20"
                y2={open ? "12" : "18"}
                style={{
                    transformOrigin: "12px 12px",
                    transform: open ? "rotate(-45deg)" : "rotate(0deg)",
                    transition: `all ${duration}ms ease`,
                }}
            />
        </svg>
    );
}