'use client'

import { useState } from 'react'
import { useChainId } from 'wagmi'
import type { Token } from '@/types/tokens'
import { useTokenBalances } from '@/hooks/useTokenBalance'
import { useTokenMetadata } from '@/hooks/useTokenMetadata'
import { useCustomTokensStore } from '@/store/custom-tokens-store'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { TokenIcon, TokenIconSkeleton } from '@/components/ui/token-icon'
import { EmptyState } from '@/components/ui/empty-state'
import { ChevronDown, Search, Copy, Loader2, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBalance, isValidTokenAddress } from '@/services/tokens'
import { toastSuccess } from '@/lib/toast'

function truncateAddress(address: string): string {
    if (!address || address.length < 10) return address
    return `${address.slice(0, 6)}...${address.slice(-4)}`
}

interface ImportTokenRowProps {
    address: string
    chainId: number
    onImport: (token: Token) => void
}

function ImportTokenRow({ address, chainId, onImport }: ImportTokenRowProps) {
    const { token, isLoading, isError } = useTokenMetadata(address, chainId)
    const addCustomToken = useCustomTokensStore((s) => s.addCustomToken)

    if (isLoading) {
        return (
            <div className="flex items-center gap-3 p-2">
                <TokenIconSkeleton size="sm" />
                <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-32 animate-pulse rounded bg-muted" />
                </div>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (isError || !token) {
        return (
            <EmptyState
                title="Couldn't load token"
                description="No ERC-20 found at this address on the current network."
            />
        )
    }

    const handleImport = () => {
        addCustomToken(token)
        onImport(token)
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleImport}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleImport()
            }}
            className="flex items-center gap-3 w-full p-2 rounded-xl border border-transparent transition-all duration-150 hover:bg-muted/50"
        >
            <TokenIcon src={token.logo} symbol={token.symbol} size="sm" />
            <div className="min-w-0 flex-1 text-left">
                <div className="text-sm font-medium">{token.symbol}</div>
                <div className="truncate text-xs text-muted-foreground">
                    {token.name || truncateAddress(token.address)}
                </div>
            </div>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Plus className="h-3.5 w-3.5" />
                Import
            </span>
        </div>
    )
}

interface TokenListProps {
    tokens: Token[]
    selectedToken?: Token | null
    disabledToken?: Token | null
    onSelect: (token: Token) => void
}

function TokenList({ tokens, selectedToken, disabledToken, onSelect }: TokenListProps) {
    const chainId = useChainId()
    const customTokens = useCustomTokensStore((s) => s.customTokens)
    const removeCustomToken = useCustomTokensStore((s) => s.removeCustomToken)
    const [searchQuery, setSearchQuery] = useState('')
    const filteredTokens = tokens.filter(
        (token) =>
            token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
            token.address.toLowerCase().includes(searchQuery.toLowerCase())
    )
    const {
        balances: _balances,
        rawBalances,
        isLoading: isLoadingBalances,
    } = useTokenBalances({
        tokens: filteredTokens,
        limit: 30,
    })
    const handleCopyAddress = (e: React.MouseEvent, address: string) => {
        e.stopPropagation()
        navigator.clipboard.writeText(address)
        toastSuccess('Address copied to clipboard')
    }
    const getBalance = (tokenAddress: string) => {
        if (isLoadingBalances) return '...'
        const token = tokens.find((t) => t.address === tokenAddress)
        const rawBalance = rawBalances?.[tokenAddress.toLowerCase()]
        if (token && rawBalance !== undefined) {
            return formatBalance(rawBalance, token.decimals)
        }
        return '0'
    }
    return (
        <div className="flex flex-col">
            <div className="py-2">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search token..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>
            <ScrollArea className="h-96">
                <div className="py-2 pr-4">
                    {filteredTokens.length === 0 ? (
                        isValidTokenAddress(searchQuery) ? (
                            <ImportTokenRow
                                address={searchQuery}
                                chainId={chainId}
                                onImport={(token) => {
                                    onSelect(token)
                                    setSearchQuery('')
                                }}
                            />
                        ) : (
                            <EmptyState title="No tokens found" />
                        )
                    ) : (
                        <div className="space-y-1">
                            {filteredTokens.map((token) => {
                                const isSelected = selectedToken?.address === token.address
                                const isOpposite =
                                    disabledToken?.address.toLowerCase() ===
                                    token.address.toLowerCase()
                                const isDisabled = isSelected || isOpposite
                                const isCustom = customTokens.some(
                                    (t) =>
                                        t.chainId === token.chainId &&
                                        t.address.toLowerCase() === token.address.toLowerCase()
                                )
                                return (
                                    <div
                                        key={token.address}
                                        role="button"
                                        tabIndex={isDisabled ? -1 : 0}
                                        onClick={() => {
                                            if (!isDisabled) onSelect(token)
                                        }}
                                        aria-disabled={isDisabled}
                                        onKeyDown={(e) => {
                                            if (isDisabled) return
                                            if (e.key === 'Enter' || e.key === ' ') onSelect(token)
                                        }}
                                        className={cn(
                                            'flex items-center gap-3 w-full p-2 rounded-xl transition-all duration-150',
                                            isSelected && 'bg-muted/40 border border-border',
                                            isOpposite &&
                                                'border border-transparent opacity-40 cursor-not-allowed',
                                            !isDisabled &&
                                                'border border-transparent hover:bg-muted/50'
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'relative flex-shrink-0',
                                                isSelected && 'ring-2 ring-border rounded-full'
                                            )}
                                        >
                                            <TokenIcon
                                                src={token.logo}
                                                symbol={token.symbol}
                                                size="sm"
                                            />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <div
                                                className={cn(
                                                    'text-sm',
                                                    isSelected
                                                        ? 'font-semibold text-foreground'
                                                        : 'font-medium'
                                                )}
                                            >
                                                {token.symbol}
                                            </div>
                                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                <span className="font-mono">
                                                    {truncateAddress(token.address)}
                                                </span>
                                                <button
                                                    onClick={(e) =>
                                                        handleCopyAddress(e, token.address)
                                                    }
                                                    className="hover:text-foreground"
                                                >
                                                    <Copy className="h-3 w-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <span className="text-sm text-muted-foreground">
                                            {getBalance(token.address)}
                                        </span>
                                        {isCustom && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    removeCustomToken(token)
                                                    toastSuccess('Token removed')
                                                }}
                                                aria-label={`Remove ${token.symbol}`}
                                                className="text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}

interface TokenSelectProps {
    token: Token | null
    tokens: Token[]
    disabledToken?: Token | null
    onSelect: (token: Token) => void
    className?: string
}

export function TokenSelect({
    token,
    tokens,
    disabledToken,
    onSelect,
    className,
}: TokenSelectProps) {
    const [open, setOpen] = useState(false)
    const handleSelect = (selectedToken: Token) => {
        onSelect(selectedToken)
        setOpen(false)
    }
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        'min-w-32 h-10 justify-start px-3 rounded-xl',
                        !token && 'text-muted-foreground',
                        className
                    )}
                >
                    {token ? (
                        <div className="flex items-center gap-2">
                            <TokenIcon src={token.logo} symbol={token.symbol} size="xs" />
                            <span className="font-medium">{token.symbol}</span>
                        </div>
                    ) : (
                        'Select'
                    )}
                    <ChevronDown className="ml-auto h-5 w-5 opacity-50" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Select a token</DialogTitle>
                </DialogHeader>
                <TokenList
                    tokens={tokens}
                    selectedToken={token}
                    disabledToken={disabledToken}
                    onSelect={handleSelect}
                />
            </DialogContent>
        </Dialog>
    )
}
