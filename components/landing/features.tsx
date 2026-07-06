'use client'

import { type ComponentType, type FC } from 'react'
import { GraduationCap, Repeat, Rocket } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useScrollReveal } from '@/hooks/useScrollReveal'

interface Feature {
    name: string
    description: string
    icon: ComponentType<{ className?: string }>
    href: string
}

function BridgeIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M2 15h20" />
            <path d="M7 18V4" />
            <path d="M17 18V4" />
            <path d="M2 13 Q4.5 4 7 4 Q12 13 17 4 Q19.5 4 22 13" />
            <path d="M9.5 7.5V15" />
            <path d="M12 8.5V15" />
            <path d="M14.5 7.5V15" />
        </svg>
    )
}

const features: Feature[] = [
    {
        name: 'Aggregate Swap',
        description:
            'Find the best rates across multiple DEXs with intelligent routing. Junoswap aggregates liquidity sources to get you the optimal price on every trade.',
        icon: Repeat,
        href: '/swap',
    },
    {
        name: 'Cross-Chain Bridge',
        description:
            'Seamlessly move assets between chains with one click. Fast, secure transfers powered by trusted bridge providers — no wrapping or manual steps required.',
        icon: BridgeIcon,
        href: '/bridge',
    },
    {
        name: 'Memecoin Launchpad',
        description:
            'Launch and discover the next memecoin on a fair-launch bonding curve. Trade early, earn points, and be part of the community from day one.',
        icon: Rocket,
        href: '/launchpad',
    },
]

function railPath(branchX: number, laneY: number): string {
    const r = 10
    const s = laneY < 125 ? -1 : 1
    const cw = s > 0 ? 1 : 0
    const ccw = s > 0 ? 0 : 1
    return [
        `M 40 125 H ${branchX - r}`,
        `A ${r} ${r} 0 0 ${cw} ${branchX} ${125 + s * r}`,
        `V ${laneY - s * r}`,
        `A ${r} ${r} 0 0 ${ccw} ${branchX + r} ${laneY}`,
        `H ${400 - branchX - r}`,
        `A ${r} ${r} 0 0 ${ccw} ${400 - branchX} ${laneY - s * r}`,
        `V ${125 + s * r}`,
        `A ${r} ${r} 0 0 ${cw} ${400 - branchX + r} 125`,
        'H 360',
    ].join(' ')
}

const swapRails = [
    { d: railPath(62, 45), delay: '0s' },
    { d: railPath(88, 85), delay: '0.15s' },
    { d: 'M 40 125 H 360', delay: '0.3s' },
    { d: railPath(88, 165), delay: '0.45s' },
    { d: railPath(62, 205), delay: '0.6s' },
]

const dexChips = [
    { x: 200, y: 45 },
    { x: 145, y: 85 },
    { x: 255, y: 85 },
    { x: 145, y: 165 },
    { x: 255, y: 165 },
    { x: 200, y: 205 },
]

function DexChip({ x, y }: { x: number; y: number }) {
    const warm = y > 125
    return (
        <g>
            <rect
                x={x - 5.5}
                y={y - 5.5}
                width="11"
                height="11"
                rx="3"
                className={cn('fill-card', warm ? 'stroke-[#FF914D]/35' : 'stroke-primary/35')}
                strokeWidth="1"
            />
            <circle
                cx={x}
                cy={y}
                r="1.75"
                className={warm ? 'fill-[#FF914D]/70' : 'fill-primary/70'}
            />
        </g>
    )
}

function SwapVisual() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,hsl(0_100%_60%_/_0.12),transparent)]" />

            <div className="absolute -top-8 -left-8 h-40 w-40 rounded-full bg-primary/5 blur-2xl" />
            <div className="absolute -bottom-12 -right-8 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
            <div className="absolute top-1/4 right-1/4 h-24 w-24 rounded-full bg-[#FF914D]/5 blur-xl" />

            <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 400 250"
                preserveAspectRatio="xMidYMid slice"
                fill="none"
                aria-hidden="true"
            >
                <defs>
                    <linearGradient id="route-grad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="hsl(0 100% 60%)" />
                        <stop offset="100%" stopColor="#FF914D" />
                    </linearGradient>
                    <pattern id="swap-dots" width="20" height="20" patternUnits="userSpaceOnUse">
                        <circle cx="1.5" cy="1.5" r="1" className="fill-primary/15" />
                    </pattern>
                    <radialGradient id="swap-grid-fade" cx="0.5" cy="0.5" r="0.65">
                        <stop offset="0%" stopColor="white" stopOpacity="0.8" />
                        <stop offset="65%" stopColor="white" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </radialGradient>
                    <mask id="swap-grid-mask">
                        <rect width="400" height="250" fill="url(#swap-grid-fade)" />
                    </mask>
                    <clipPath id="swap-token-a">
                        <circle cx="40" cy="125" r="8.5" />
                    </clipPath>
                    <clipPath id="swap-token-b">
                        <circle cx="360" cy="125" r="8.5" />
                    </clipPath>
                </defs>

                <rect width="400" height="250" fill="url(#swap-dots)" mask="url(#swap-grid-mask)" />

                {swapRails.map((rail, i) => (
                    <g key={rail.d} className={i !== 0 ? 'animate-route-dim' : undefined}>
                        <path d={rail.d} className="stroke-primary/15" strokeWidth="1" />
                        <path
                            d={rail.d}
                            pathLength={1}
                            stroke="url(#route-grad)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeDasharray="0.15 1.15"
                            className="animate-route-pulse"
                            style={{ animationDelay: rail.delay }}
                        />
                    </g>
                ))}

                {dexChips.map((chip) => (
                    <DexChip key={`${chip.x}-${chip.y}`} x={chip.x} y={chip.y} />
                ))}

                <g className="animate-route-best">
                    <path
                        d={swapRails[0]!.d}
                        stroke="url(#route-grad)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                    />
                    <rect
                        x="194.5"
                        y="39.5"
                        width="11"
                        height="11"
                        rx="3"
                        className="fill-card"
                        stroke="url(#route-grad)"
                        strokeWidth="1.5"
                    />
                    <circle cx="200" cy="45" r="2" fill="hsl(0 100% 60%)" />
                </g>

                <circle cx="40" cy="125" r="16" className="fill-primary/10" />
                <circle
                    cx="40"
                    cy="125"
                    r="11"
                    className="fill-card stroke-primary/40"
                    strokeWidth="1.5"
                />
                <image
                    href="/tokens/kub.png"
                    x="31.5"
                    y="116.5"
                    width="17"
                    height="17"
                    clipPath="url(#swap-token-a)"
                />
                <circle cx="360" cy="125" r="16" className="fill-[#FF914D]/10" />
                <circle
                    cx="360"
                    cy="125"
                    r="11"
                    className="fill-card stroke-[#FF914D]/50"
                    strokeWidth="1.5"
                />
                <image
                    href="/tokens/usdc.png"
                    x="351.5"
                    y="116.5"
                    width="17"
                    height="17"
                    clipPath="url(#swap-token-b)"
                />
            </svg>

            <div className="absolute inset-x-0 top-[4%] flex justify-center">
                <div className="animate-best-badge rounded-full border border-primary/30 bg-card px-2.5 py-0.5 text-[10px] font-medium text-primary">
                    Best price
                </div>
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#FF914D] p-0.5">
                    <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-card">
                        <Repeat
                            className="h-10 w-10 animate-spin text-primary"
                            style={{ animationDuration: '8s' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

function orbitPath(nx: number, ny: number): string {
    const dx = 200 - nx
    const dy = 125 - ny
    const k = 0.28
    return `M ${nx} ${ny} Q ${nx + dx / 2 - dy * k} ${ny + dy / 2 + dx * k} 200 125`
}

function onRing(deg: number): { x: number; y: number } {
    const t = (deg * Math.PI) / 180
    return { x: 200 + 150 * Math.cos(t), y: 125 + 80 * Math.sin(t) }
}

interface BridgeNode {
    name: string
    icon: string
    x: number
    y: number
    warm: boolean
    labelDy: number
    invertInLight?: boolean
}

const bridgeNodes: BridgeNode[] = [
    { name: 'BNB Chain', icon: '/chains/bnbchain.svg', ...onRing(215), warm: false, labelDy: -20 },
    { name: 'Base', icon: '/chains/base.svg', ...onRing(325), warm: true, labelDy: -20 },
    { name: 'KUB Chain', icon: '/chains/kubchain.png', ...onRing(145), warm: true, labelDy: 27 },
    {
        name: 'Worldchain',
        icon: '/chains/worldchain.svg',
        ...onRing(35),
        warm: false,
        labelDy: 27,
        invertInLight: true,
    },
]

const bridgeTransfers = [
    { from: 0, to: 3, color: 'hsl(0 100% 60%)', inDelay: '0s', outDelay: '1.08s' },
    { from: 2, to: 1, color: '#FF914D', inDelay: '1.32s', outDelay: '2.4s' },
    { from: 1, to: 0, color: '#FFD700', inDelay: '3.72s', outDelay: '4.8s' },
]

function BridgeVisual() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,hsl(0_100%_60%_/_0.12),transparent)]" />

            <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-primary/5 blur-2xl" />
            <div className="absolute -bottom-12 -left-8 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
            <div className="absolute top-1/4 left-1/4 h-24 w-24 rounded-full bg-[#FF914D]/5 blur-xl" />

            <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 400 250"
                preserveAspectRatio="xMidYMid slice"
                fill="none"
                aria-hidden="true"
            >
                <defs>
                    <pattern id="bridge-dots" width="20" height="20" patternUnits="userSpaceOnUse">
                        <circle cx="1.5" cy="1.5" r="1" className="fill-primary/15" />
                    </pattern>
                    <radialGradient id="bridge-grid-fade" cx="0.5" cy="0.5" r="0.65">
                        <stop offset="0%" stopColor="white" stopOpacity="0.8" />
                        <stop offset="65%" stopColor="white" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </radialGradient>
                    <mask id="bridge-grid-mask">
                        <rect width="400" height="250" fill="url(#bridge-grid-fade)" />
                    </mask>
                    {bridgeNodes.map((node, i) => (
                        <clipPath key={node.name} id={`bridge-node-${i}`}>
                            <circle cx={node.x} cy={node.y} r="8.5" />
                        </clipPath>
                    ))}
                </defs>

                <rect
                    width="400"
                    height="250"
                    fill="url(#bridge-dots)"
                    mask="url(#bridge-grid-mask)"
                />

                <ellipse
                    cx="200"
                    cy="125"
                    rx="150"
                    ry="80"
                    className="stroke-primary/25"
                    strokeWidth="1"
                />
                <ellipse
                    cx="200"
                    cy="125"
                    rx="100"
                    ry="53"
                    className="stroke-primary/15"
                    strokeWidth="1"
                />

                {bridgeNodes.map((node) => (
                    <path
                        key={node.name}
                        d={orbitPath(node.x, node.y)}
                        className="stroke-primary/15"
                        strokeWidth="1"
                    />
                ))}

                {bridgeTransfers.map((t) => {
                    const from = bridgeNodes[t.from]!
                    const to = bridgeNodes[t.to]!
                    return (
                        <g key={`${t.from}-${t.to}`}>
                            <path
                                d={orbitPath(from.x, from.y)}
                                pathLength={1}
                                stroke={t.color}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeDasharray="0.15 1.15"
                                className="animate-bridge-pulse-in"
                                style={{ animationDelay: t.inDelay }}
                            />
                            <path
                                d={orbitPath(to.x, to.y)}
                                pathLength={1}
                                stroke={t.color}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeDasharray="0.15 1.15"
                                className="animate-bridge-pulse-out"
                                style={{ animationDelay: t.outDelay }}
                            />
                        </g>
                    )
                })}

                {bridgeNodes.map((node, i) => (
                    <g key={node.name}>
                        <circle
                            cx={node.x}
                            cy={node.y}
                            r="16"
                            className={node.warm ? 'fill-[#FF914D]/10' : 'fill-primary/10'}
                        />
                        <circle
                            cx={node.x}
                            cy={node.y}
                            r="11"
                            className={cn(
                                'fill-card',
                                node.warm ? 'stroke-[#FF914D]/50' : 'stroke-primary/40'
                            )}
                            strokeWidth="1.5"
                        />
                        <image
                            href={node.icon}
                            x={node.x - 8.5}
                            y={node.y - 8.5}
                            width="17"
                            height="17"
                            clipPath={`url(#bridge-node-${i})`}
                            className={cn(node.invertInLight && 'invert dark:invert-0')}
                        />
                        <text
                            x={node.x}
                            y={node.y + node.labelDy}
                            textAnchor="middle"
                            fontSize="8"
                            fontWeight={500}
                            className="fill-muted-foreground/80"
                        >
                            {node.name}
                        </text>
                    </g>
                ))}
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-bridge-hub flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#FF914D] p-0.5">
                    <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-card">
                        <BridgeIcon className="h-10 w-10 text-primary" />
                    </div>
                </div>
            </div>
        </div>
    )
}

const pricePath =
    'M 28 206 C 32.7 203.3 47.7 191.7 56 190 C 64.3 188.3 69.3 199.3 78 196 C 86.7 192.7 99.0 173.0 108 170 C 117.0 167.0 122.7 182.0 132 178 C 141.3 174.0 154.7 149.8 164 146 C 173.3 142.2 179.0 160.7 188 155 C 197.0 149.3 209.0 117.5 218 112 C 227.0 106.5 233.0 126.3 242 122 C 251.0 117.7 263.0 90.7 272 86 C 281.0 81.3 285.7 97.7 296 94 C 306.3 90.3 321.3 71.7 334 64 C 346.7 56.3 365.7 50.7 372 48'

const volumeBars = [
    { x: 34, h: 9, o: 0.14 },
    { x: 56, h: 14, o: 0.18 },
    { x: 78, h: 7, o: 0.12 },
    { x: 100, h: 17, o: 0.2 },
    { x: 122, h: 10, o: 0.14 },
    { x: 144, h: 20, o: 0.22 },
    { x: 166, h: 12, o: 0.16 },
    { x: 188, h: 16, o: 0.18 },
    { x: 210, h: 24, o: 0.26 },
    { x: 232, h: 13, o: 0.16 },
    { x: 254, h: 21, o: 0.24 },
    { x: 276, h: 27, o: 0.3 },
    { x: 298, h: 18, o: 0.22 },
    { x: 320, h: 30, o: 0.34 },
    { x: 342, h: 23, o: 0.26 },
    { x: 362, h: 34, o: 0.38 },
]

const priceGridlines = [
    { y: 90, label: '$1M' },
    { y: 140, label: '$100K' },
    { y: 190, label: '$10K' },
]

const fireworkSparks = [
    { x: 68, y: -13, size: 6, color: '#FFD700', delay: 0 },
    { x: 48, y: -50, size: 5, color: '#FF914D', delay: 0.06 },
    { x: 8, y: -70, size: 6, color: '#FFD700', delay: 0.03 },
    { x: -38, y: -58, size: 4, color: '#FFD700', delay: 0.09 },
    { x: -68, y: -23, size: 5, color: '#FF914D', delay: 0 },
    { x: -63, y: 28, size: 6, color: '#FFD700', delay: 0.05 },
    { x: -20, y: 65, size: 4, color: '#FF914D', delay: 0.1 },
    { x: 28, y: 63, size: 5, color: '#FFD700', delay: 0.02 },
    { x: 60, y: 38, size: 4, color: '#FFD700', delay: 0.08 },
]

function LaunchpadVisual() {
    return (
        <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_50%_80%,hsl(0_100%_60%_/_0.15),transparent)]" />

            <div className="absolute -top-8 -left-8 h-40 w-40 rounded-full bg-primary/5 blur-2xl" />
            <div className="absolute -bottom-12 -right-8 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
            <div className="absolute top-1/3 left-1/4 h-24 w-24 rounded-full bg-[#FF914D]/5 blur-xl" />

            <div className="absolute top-[12%] left-[10%] h-2.5 w-2.5 rotate-45 bg-[#FFD700]/30" />
            <div className="absolute top-[28%] left-[30%] h-2 w-2 rotate-45 bg-[#FFD700]/20 animate-pulse" />
            <div className="absolute top-[8%] left-[46%] h-1.5 w-1.5 rotate-45 bg-[#FFD700]/25" />
            <div className="absolute top-[34%] left-[58%] h-2 w-2 rotate-45 bg-[#FFD700]/20 animate-pulse" />

            <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 400 250"
                preserveAspectRatio="xMidYMid slice"
                fill="none"
                aria-hidden="true"
            >
                <defs>
                    <pattern
                        id="launchpad-dots"
                        width="20"
                        height="20"
                        patternUnits="userSpaceOnUse"
                    >
                        <circle cx="1.5" cy="1.5" r="1" className="fill-primary/15" />
                    </pattern>
                    <radialGradient id="launchpad-grid-fade" cx="0.5" cy="0.5" r="0.65">
                        <stop offset="0%" stopColor="white" stopOpacity="0.8" />
                        <stop offset="65%" stopColor="white" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </radialGradient>
                    <mask id="launchpad-grid-mask">
                        <rect width="400" height="250" fill="url(#launchpad-grid-fade)" />
                    </mask>
                    <linearGradient id="launchpad-line-grad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="hsl(0 100% 60%)" />
                        <stop offset="55%" stopColor="#FF914D" />
                        <stop offset="100%" stopColor="#FFD700" />
                    </linearGradient>
                    <linearGradient id="launchpad-area-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF914D" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#FF914D" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="launchpad-sweep-grad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="white" />
                        <stop offset="88%" stopColor="white" />
                        <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </linearGradient>
                    <mask id="launchpad-sweep-mask">
                        <rect
                            width="460"
                            height="250"
                            fill="url(#launchpad-sweep-grad)"
                            className="animate-chart-sweep"
                        />
                    </mask>
                    <radialGradient id="launchpad-dot-grad">
                        <stop offset="0%" stopColor="white" />
                        <stop offset="45%" stopColor="#FFE58A" />
                        <stop offset="100%" stopColor="#FFD700" />
                    </radialGradient>
                </defs>

                <rect
                    width="400"
                    height="250"
                    fill="url(#launchpad-dots)"
                    mask="url(#launchpad-grid-mask)"
                />

                {priceGridlines.map((grid) => (
                    <g key={grid.label}>
                        <line
                            x1="28"
                            y1={grid.y}
                            x2="372"
                            y2={grid.y}
                            className="stroke-primary/10"
                            strokeWidth="1"
                            strokeDasharray="3 6"
                        />
                        <text
                            x="28"
                            y={grid.y - 4}
                            fontSize="7"
                            fontWeight={500}
                            className="fill-muted-foreground/50"
                        >
                            {grid.label}
                        </text>
                    </g>
                ))}

                <line
                    x1="28"
                    y1="232"
                    x2="372"
                    y2="232"
                    className="stroke-primary/15"
                    strokeWidth="1"
                />

                <g className="animate-chart-cycle">
                    <g mask="url(#launchpad-sweep-mask)">
                        {volumeBars.map((bar) => (
                            <rect
                                key={bar.x}
                                x={bar.x}
                                y={230 - bar.h}
                                width="10"
                                height={bar.h}
                                rx="2"
                                className="fill-primary"
                                opacity={bar.o}
                            />
                        ))}
                        <path
                            d={`${pricePath} L 372 232 L 28 232 Z`}
                            fill="url(#launchpad-area-grad)"
                        />
                    </g>
                    <path
                        d={pricePath}
                        pathLength={1}
                        stroke="url(#launchpad-line-grad)"
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="animate-chart-draw opacity-20 blur-[5px]"
                    />
                    <path
                        d={pricePath}
                        pathLength={1}
                        stroke="url(#launchpad-line-grad)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="animate-chart-draw opacity-40 blur-[2px]"
                    />
                    <path
                        d={pricePath}
                        pathLength={1}
                        stroke="url(#launchpad-line-grad)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="animate-chart-draw"
                    />
                    <circle
                        r="8"
                        fill="#FFD700"
                        className="animate-chart-dot opacity-35 blur-[4px]"
                        style={{ offsetPath: `path("${pricePath}")` }}
                    />
                    <circle
                        r="3"
                        fill="url(#launchpad-dot-grad)"
                        className="animate-chart-dot drop-shadow-[0_0_6px_rgba(255,215,0,0.8)]"
                        style={{ offsetPath: `path("${pricePath}")` }}
                    />
                </g>
            </svg>

            <div className="absolute inset-x-0 top-[44%] flex justify-end pr-[7%]">
                <div className="animate-graduated-badge rounded-full bg-gradient-to-r from-[#FFD700] via-[#FF914D] to-primary p-px shadow-[0_6px_24px_-6px_rgba(255,183,0,0.6)]">
                    <div className="relative flex items-center gap-1.5 overflow-hidden rounded-full bg-card px-3 py-1">
                        <div className="animate-badge-shimmer absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#FFD700]/25 to-transparent" />
                        <GraduationCap className="h-3.5 w-3.5 text-[#FF914D]" />
                        <span className="bg-gradient-to-r from-primary to-[#FF914D] bg-clip-text text-[10px] font-semibold tracking-wide text-transparent">
                            Graduated
                        </span>
                    </div>
                </div>
            </div>

            <div className="absolute top-[10%] right-[6%]">
                <div
                    className="animate-rocket-aura pointer-events-none absolute left-1/2 top-1/2 -ml-16 -mt-16 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(255,215,0,0.55),rgba(255,145,77,0.3)_45%,transparent_70%)] blur-lg"
                    aria-hidden="true"
                />
                <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                    <div className="animate-firework-ring absolute left-1/2 top-1/2 -ml-14 -mt-14 h-28 w-28 rounded-full border-2 border-[#FFD700]/60" />
                    <div
                        className="animate-firework-ring absolute left-1/2 top-1/2 -ml-14 -mt-14 h-28 w-28 rounded-full border border-[#FF914D]/50"
                        style={{ animationDelay: '0.15s' }}
                    />
                    {fireworkSparks.map((spark) => (
                        <div
                            key={`${spark.x}-${spark.y}`}
                            className="animate-firework-spark absolute left-1/2 top-1/2"
                            style={
                                {
                                    width: spark.size,
                                    height: spark.size,
                                    marginLeft: -spark.size / 2,
                                    marginTop: -spark.size / 2,
                                    backgroundColor: spark.color,
                                    boxShadow: `0 0 6px ${spark.color}`,
                                    animationDelay: `${spark.delay}s`,
                                    '--fw-x': `${spark.x}px`,
                                    '--fw-y': `${spark.y}px`,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                </div>
                <div className="animate-launchpad-lift flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#FF914D] p-0.5">
                    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[14px] bg-card">
                        <div className="animate-rocket-core absolute inset-0 bg-gradient-to-br from-[#FFD700]/20 via-[#FF914D]/10 to-transparent" />
                        <Rocket className="animate-rocket-icon relative h-10 w-10 text-primary" />
                    </div>
                </div>
            </div>
        </div>
    )
}

const visualComponents: FC[] = [SwapVisual, BridgeVisual, LaunchpadVisual]

function FeatureRow({ feature, index }: { feature: Feature; index: number }) {
    const isReversed = index % 2 !== 0
    const Visual = visualComponents[index]!
    const reveal = useScrollReveal({ threshold: 0.15 })

    return (
        <div
            ref={reveal.ref as React.RefObject<HTMLDivElement>}
            data-reveal
            className={cn(
                'group grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-16',
                'animate-reveal-up',
                reveal.isVisible && 'is-visible'
            )}
        >
            <div
                className={cn(
                    'relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-border/30 bg-card transition-colors duration-500 shadow-[0_0_60px_-15px_hsl(0_100%_60%_/_0.15)]',
                    isReversed && 'lg:order-last',
                    'animate-reveal-scale'
                )}
            >
                <Visual />
            </div>

            <div className={cn('flex flex-col gap-4', isReversed && 'lg:order-first')}>
                <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">{feature.name}</h3>
                <p className="text-md leading-relaxed text-muted-foreground">
                    {feature.description}
                </p>
            </div>
        </div>
    )
}

export function Features() {
    const headingReveal = useScrollReveal({ threshold: 0.2 })

    return (
        <section className="py-20 sm:py-32">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <h2
                        ref={headingReveal.ref as React.RefObject<HTMLHeadingElement>}
                        data-reveal
                        className={cn(
                            'mt-2 text-3xl font-bold tracking-tight sm:text-4xl',
                            'animate-reveal-up',
                            headingReveal.isVisible && 'is-visible'
                        )}
                    >
                        One platform for swapping, bridging, and launching across every chain.
                    </h2>
                </div>

                <div className="mt-16 space-y-20 sm:mt-20 lg:space-y-32">
                    {features.map((feature, index) => (
                        <FeatureRow key={feature.name} feature={feature} index={index} />
                    ))}
                </div>
            </div>
        </section>
    )
}
