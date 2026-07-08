import jazzicon from '@metamask/jazzicon'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
    IChartApiBase,
    IPrimitivePaneRenderer,
    IPrimitivePaneView,
    ISeriesApi,
    ISeriesPrimitive,
    PrimitivePaneViewZOrder,
    SeriesAttachedParameter,
    SeriesType,
    Time,
} from 'lightweight-charts'

export interface CreatorMarker {
    time: Time
    high: number // candle high in display units (matches the series data)
    isBuy: boolean
}

const RADIUS = 9
const RING_WIDTH = 2
const GAP_ABOVE_BAR = 7
const STACK_GAP = 4
const BUY_COLOR = 'rgb(30, 215, 96)'
const SELL_COLOR = 'rgb(233, 20, 41)'

export async function createJazziconAvatar(
    address: string,
    size: number
): Promise<HTMLCanvasElement | null> {
    const seed = parseInt(address.slice(2, 10), 16)
    const el = jazzicon(size, seed)
    const svg = el.querySelector('svg')
    if (!svg) return null
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = el.style.backgroundColor || '#000'
    ctx.fillRect(0, 0, size, size)

    const url = `data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(svg))}`
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
            ctx.drawImage(img, 0, 0, size, size)
            resolve(canvas)
        }
        img.onerror = () => resolve(canvas) // background color alone still identifies buy/sell
        img.src = url
    })
}

interface MarkerPoint {
    x: number
    y: number
    isBuy: boolean
}

class CreatorMarkerRenderer implements IPrimitivePaneRenderer {
    constructor(
        private points: MarkerPoint[],
        private avatar: HTMLCanvasElement | null
    ) {}

    draw(target: CanvasRenderingTarget2D): void {
        target.useMediaCoordinateSpace(({ context: ctx }) => {
            for (const p of this.points) {
                const ring = p.isBuy ? BUY_COLOR : SELL_COLOR

                ctx.save()
                ctx.beginPath()
                ctx.arc(p.x, p.y, RADIUS, 0, Math.PI * 2)
                ctx.clip()
                if (this.avatar) {
                    ctx.drawImage(this.avatar, p.x - RADIUS, p.y - RADIUS, RADIUS * 2, RADIUS * 2)
                } else {
                    ctx.fillStyle = ring
                    ctx.fill()
                }
                ctx.restore()

                ctx.beginPath()
                ctx.arc(p.x, p.y, RADIUS, 0, Math.PI * 2)
                ctx.lineWidth = RING_WIDTH
                ctx.strokeStyle = ring
                ctx.stroke()
            }
        })
    }
}

class CreatorMarkerPaneView implements IPrimitivePaneView {
    private points: MarkerPoint[] = []

    constructor(private source: CreatorMarkerPrimitive) {}

    update(): void {
        this.points = this.source.computePoints()
    }

    zOrder(): PrimitivePaneViewZOrder {
        return 'top'
    }

    renderer(): IPrimitivePaneRenderer | null {
        if (this.points.length === 0) return null
        return new CreatorMarkerRenderer(this.points, this.source.avatar)
    }
}

/**
 * Pump.fun-style dev-trade badges: the creator's avatar in a small circle above
 * the candle, ring-colored green for a buy and red for a sell, stacked when a
 * candle has both.
 */
export class CreatorMarkerPrimitive implements ISeriesPrimitive<Time> {
    avatar: HTMLCanvasElement | null = null

    private chart: IChartApiBase<Time> | null = null
    private series: ISeriesApi<SeriesType, Time> | null = null
    private requestUpdate: (() => void) | null = null
    private markers: CreatorMarker[] = []
    private paneView = new CreatorMarkerPaneView(this)

    attached(param: SeriesAttachedParameter<Time>): void {
        this.chart = param.chart
        this.series = param.series
        this.requestUpdate = param.requestUpdate
    }

    detached(): void {
        this.chart = null
        this.series = null
        this.requestUpdate = null
    }

    setMarkers(markers: CreatorMarker[]): void {
        this.markers = markers
        this.requestUpdate?.()
    }

    setAvatar(avatar: HTMLCanvasElement | null): void {
        this.avatar = avatar
        this.requestUpdate?.()
    }

    updateAllViews(): void {
        this.paneView.update()
    }

    paneViews(): readonly IPrimitivePaneView[] {
        return [this.paneView]
    }

    computePoints(): MarkerPoint[] {
        if (!this.chart || !this.series || this.markers.length === 0) return []

        const timeScale = this.chart.timeScale()
        const points: MarkerPoint[] = []
        let prev: { x: number; y: number } | null = null

        const minY = RADIUS + RING_WIDTH
        for (const m of this.markers) {
            const x = timeScale.timeToCoordinate(m.time)
            const highY = this.series.priceToCoordinate(m.high)
            if (x === null || highY === null) continue

            const stacked: boolean = prev !== null && prev.x === x
            let y: number = stacked
                ? prev!.y - RADIUS * 2 - STACK_GAP
                : highY - GAP_ABOVE_BAR - RADIUS
            if (y < minY) y = stacked ? prev!.y + RADIUS * 2 + STACK_GAP : minY
            points.push({ x, y, isBuy: m.isBuy })
            prev = { x, y }
        }
        return points
    }
}
