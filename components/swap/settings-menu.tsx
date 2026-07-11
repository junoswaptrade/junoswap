'use client'

import { useState, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn, isValidNumberInput } from '@/lib/utils'

const SLIPPAGE_PRESETS = [0.1, 0.5, 1] as const

interface SettingsMenuProps {
    slippage: number
    deadlineMinutes: number
    onSlippageChange: (slippage: number) => void
    onDeadlineChange: (minutes: number) => void
}

function isValidSlippage(value: string): boolean {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0.01 || num > 50) return false
    return (value.split('.')[1]?.length ?? 0) <= 2
}

function isValidDeadline(value: string): boolean {
    return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 60
}

export function SettingsMenu({
    slippage,
    deadlineMinutes,
    onSlippageChange,
    onDeadlineChange,
}: SettingsMenuProps) {
    const [open, setOpen] = useState(false)
    const isPreset = SLIPPAGE_PRESETS.some((p) => p === slippage)
    const [slippageInput, setSlippageInput] = useState(isPreset ? '' : String(slippage))
    const [deadlineInput, setDeadlineInput] = useState(String(deadlineMinutes))

    useEffect(() => {
        if (open) {
            setSlippageInput(isPreset ? '' : String(slippage))
            setDeadlineInput(String(deadlineMinutes))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const handleSlippageInput = (value: string) => {
        if (value !== '' && !isValidNumberInput(value)) return
        setSlippageInput(value)
        if (isValidSlippage(value)) onSlippageChange(parseFloat(value))
    }

    const handleDeadlineInput = (value: string) => {
        if (!/^\d*$/.test(value)) return
        setDeadlineInput(value)
        if (isValidDeadline(value)) onDeadlineChange(Number(value))
    }

    const slippageInputInvalid = slippageInput !== '' && !isValidSlippage(slippageInput)
    const deadlineInputInvalid = deadlineInput !== '' && !isValidDeadline(deadlineInput)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Swap settings"
                    title="Swap settings"
                    className={cn(
                        'h-8 w-8',
                        open
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                    )}
                >
                    <Settings className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3 space-y-3">
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Max slippage</span>
                        <span className="text-xs font-medium">{slippage}%</span>
                    </div>
                    <div className="flex gap-1">
                        {SLIPPAGE_PRESETS.map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                className={cn(
                                    'h-7 flex-1 rounded-md text-xs transition-colors',
                                    slippage === preset && slippageInput === ''
                                        ? 'bg-accent font-medium text-accent-foreground'
                                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                                )}
                                onClick={() => {
                                    setSlippageInput('')
                                    onSlippageChange(preset)
                                }}
                            >
                                {preset}%
                            </button>
                        ))}
                        <div className="relative flex-[1.5]">
                            <Input
                                type="text"
                                inputMode="decimal"
                                placeholder="Custom"
                                value={slippageInput}
                                onChange={(e) => handleSlippageInput(e.target.value)}
                                onBlur={() => {
                                    if (slippageInputInvalid)
                                        setSlippageInput(isPreset ? '' : String(slippage))
                                }}
                                className={cn(
                                    'h-7 w-full rounded-md bg-muted/50 px-2 pr-5 text-right text-xs placeholder:text-xs',
                                    slippageInput !== '' &&
                                        !slippageInputInvalid &&
                                        'bg-accent font-medium',
                                    slippageInputInvalid &&
                                        'text-destructive ring-1 ring-inset ring-destructive'
                                )}
                            />
                            <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                %
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Tx deadline</span>
                    <div className="flex items-center gap-1.5">
                        <Input
                            type="text"
                            inputMode="numeric"
                            value={deadlineInput}
                            onChange={(e) => handleDeadlineInput(e.target.value)}
                            onBlur={() => {
                                if (deadlineInput === '' || deadlineInputInvalid)
                                    setDeadlineInput(String(deadlineMinutes))
                            }}
                            className={cn(
                                'h-7 w-14 rounded-md bg-muted/50 px-2 text-right text-xs',
                                deadlineInputInvalid &&
                                    'text-destructive ring-1 ring-inset ring-destructive'
                            )}
                        />
                        <span className="text-xs text-muted-foreground">min</span>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
