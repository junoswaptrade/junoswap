'use client'

import { Fragment, useMemo, useEffect, useRef, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { parseUnits, zeroAddress, type Address } from 'viem'
import type { Token } from '@/types/tokens'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useSwapStore } from '@/store/swap-store'
import { useTokenBalance } from '@/hooks/useTokenBalance'
import { useMultiDexQuotes } from '@/hooks/useMultiDexQuotes'
import { useRoutePriceImpact } from '@/hooks/useRoutePriceImpact'
import { useDebounce } from '@/hooks/useDebounce'
import { useUniV3SwapExecution } from '@/hooks/useUniV3SwapExecution'
import { useUniV2SwapExecution } from '@/hooks/useUniV2SwapExecution'
import { useAggRouterSwapExecution } from '@/hooks/useAggRouterSwapExecution'
import { useSplitRoute } from '@/hooks/useSplitRoute'
import { useCrossDexRoute } from '@/hooks/useCrossDexRoute'
import { splitClearsMargin } from '@/services/dex/split-routing'
import {
    splitToPlan,
    crossDexToPlan,
    bestPlan,
    planToLegs,
    describePlan,
} from '@/services/dex/agg-plan'
import { useTokenApproval } from '@/hooks/useTokenApproval'
import { useSwapUrlSync } from '@/hooks/useSwapUrlSync'
import { useChainTokens } from '@/hooks/useChainTokens'
import { calculateMinOutput } from '@/services/dex/uniswap-v3'
import { calculateMinOutput as calculateMinOutputV2 } from '@/services/dex/uniswap-v2'
import { formatBalance, formatTokenAmount, formatDisplayAmount } from '@/services/tokens'
import { ConnectModal } from '@/components/web3/connect-modal'
import { toastError } from '@/lib/toast'
import { getDefaultPairTokens } from '@/lib/tokens'
import {
    getDexConfig,
    isV2Config,
    getDefaultDexForChain,
    getSupportedDexs,
    ProtocolType,
} from '@/lib/dex-config'
import type { RouteQuote } from '@/types/routing'
import { TokenSelect } from './token-select'
import { SettingsMenu } from './settings-menu'
import { ArrowDownUp, ArrowRightLeft, CandlestickChart } from 'lucide-react'
import { toast } from 'sonner'
import { isSameToken, getWrapOperation } from '@/services/tokens'
import { isValidNumberInput, cn } from '@/lib/utils'
import { getChainMetadata, isNativeToken, shouldSkipUnwrap } from '@/lib/wagmi'
import { getAggRouterAddress, isAggRouterChain } from '@/lib/abis/agg-router-junoswap'
import { MIN_AGG_IMPROVEMENT_BPS } from '@/lib/routing-config'
import { useKkubUnwrap } from '@/hooks/useKkubUnwrap'

interface SwapCardProps {
    tokens?: Token[]
    showChart?: boolean
    onToggleChart?: () => void
}

export function SwapCard({ tokens: tokensOverride, showChart, onToggleChart }: SwapCardProps) {
    const { address, isConnected } = useAccount()
    const chainId = useChainId()
    const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
    const [isRateFlipped, setIsRateFlipped] = useState(false)
    const { tokens: chainTokens, isLoading: isLoadingTokens } = useChainTokens(chainId)
    const tokens = tokensOverride || chainTokens
    const { urlTokensPending } = useSwapUrlSync(tokens, isLoadingTokens)
    const {
        tokenIn,
        tokenOut,
        amountIn,
        setTokenIn,
        setTokenOut,
        setAmountIn,
        settings,
        swapTokens,
        setQuote,
        setIsLoading,
        setSlippage,
        setDeadlineMinutes,
        selectedDex,
        setSelectedDex,
        setAggRouteKind,
        setAggPredictedOut,
    } = useSwapStore()
    const dexConfig = getDexConfig(chainId, selectedDex)
    const isV2Protocol = dexConfig && isV2Config(dexConfig)
    const hasInitializedTokensRef = useRef(false)
    const supportedDexs = useMemo(() => getSupportedDexs(chainId), [chainId])
    useEffect(() => {
        const defaultDex = getDefaultDexForChain(chainId)
        if (!supportedDexs.includes(selectedDex)) {
            setSelectedDex(defaultDex)
        }
    }, [chainId, supportedDexs, selectedDex, setSelectedDex])
    const {
        balance: balanceInValue,
        isLoading: isLoadingBalanceIn,
        refetch: refetchBalanceIn,
    } = useTokenBalance({
        token: tokenIn,
        address,
    })
    const {
        balance: balanceOutValue,
        isLoading: isLoadingBalanceOut,
        refetch: refetchBalanceOut,
    } = useTokenBalance({
        token: tokenOut,
        address,
    })
    const debouncedAmountIn = useDebounce(amountIn, 500)
    const amountInBigInt = useMemo(() => {
        if (!debouncedAmountIn || !tokenIn) return 0n
        try {
            return parseUnits(debouncedAmountIn, tokenIn.decimals)
        } catch {
            return 0n
        }
    }, [debouncedAmountIn, tokenIn])
    const { dexQuotes, allRoutes } = useMultiDexQuotes({
        tokenIn,
        tokenOut,
        amountIn: amountInBigInt,
        enabled: !!tokenIn && !!tokenOut && amountInBigInt > 0n,
    })
    const selectedDexQuote = useMemo(() => {
        const quoteData = dexQuotes[selectedDex]
        return {
            quote: quoteData?.quote ?? null,
            isLoading: quoteData?.isLoading ?? false,
            isError: quoteData?.isError ?? false,
            error: quoteData?.error ?? null,
            fee: quoteData?.fee,
        }
    }, [dexQuotes, selectedDex])
    const selectedDexRoute = useMemo(() => {
        const routesForDex = allRoutes.filter((r) => r.dexId === selectedDex)
        return routesForDex[0] ?? null
    }, [allRoutes, selectedDex])
    const displayRoute = useMemo<RouteQuote | null>(() => {
        if (selectedDexRoute) return selectedDexRoute
        if (!selectedDexQuote.quote || !tokenIn || !tokenOut) return null
        return {
            route: {
                path: [tokenIn.address as Address, tokenOut.address as Address],
                fees: selectedDexQuote.fee ? [selectedDexQuote.fee] : undefined,
                isMultiHop: false,
                intermediaryTokens: [],
            },
            quote: selectedDexQuote.quote,
            dexId: selectedDex,
            protocolType: isV2Protocol ? ProtocolType.V2 : ProtocolType.V3,
        }
    }, [
        selectedDexRoute,
        selectedDexQuote.quote,
        selectedDexQuote.fee,
        tokenIn,
        tokenOut,
        selectedDex,
        isV2Protocol,
    ])
    const wrapOp = useMemo(() => {
        return getWrapOperation(tokenIn, tokenOut)
    }, [tokenIn, tokenOut])
    const { quote, isLoading: isQuoteLoading, isError, error, fee: quoteFee } = selectedDexQuote
    const effectiveQuote = quote
    const shouldShowError = useMemo(() => {
        return isError && !effectiveQuote
    }, [isError, effectiveQuote])
    const isWrapUnwrap = !!wrapOp
    const wrapOperation = wrapOp
    const fee = quoteFee ?? 3000
    const { priceImpact } = useRoutePriceImpact({
        route: displayRoute,
        tokenIn,
        tokenOut,
        amountIn: amountInBigInt,
        enabled: !isWrapUnwrap,
    })
    const prevQuoteAmountOutRef = useRef<bigint | null>(null)
    const prevIsLoadingRef = useRef<boolean>(false)

    useEffect(() => {
        if (
            effectiveQuote &&
            tokenOut &&
            effectiveQuote.amountOut !== prevQuoteAmountOutRef.current
        ) {
            prevQuoteAmountOutRef.current = effectiveQuote.amountOut
            setQuote(effectiveQuote)
        } else if (!effectiveQuote) {
            prevQuoteAmountOutRef.current = null
        }

        if (isQuoteLoading !== prevIsLoadingRef.current) {
            prevIsLoadingRef.current = isQuoteLoading
            setIsLoading(isQuoteLoading)
        }

        if (isError && error && !isQuoteLoading && !effectiveQuote && amountInBigInt > 0n) {
            toastError(error, 'Failed to get quote')
        }
    }, [
        effectiveQuote,
        isQuoteLoading,
        isError,
        error,
        tokenOut,
        setQuote,
        setIsLoading,
        amountInBigInt,
    ])
    const isSameTokenSwap = isSameToken(tokenIn, tokenOut)
    const aggEligible = isAggRouterChain(chainId) && !isWrapUnwrap && settings.autoSelectBestDex
    const splitRoute = useSplitRoute({
        tokenIn,
        tokenOut,
        amountIn: amountInBigInt,
        allRoutes,
        enabled: aggEligible,
    })
    const crossDex = useCrossDexRoute({
        tokenIn,
        tokenOut,
        amountIn: amountInBigInt,
        enabled: aggEligible,
    })
    const aggPlan = useMemo(() => {
        const splitPlan = splitRoute.allocation ? splitToPlan(splitRoute.allocation, chainId) : null
        const crossPlan = crossDex.leg
            ? crossDexToPlan(crossDex.leg, amountInBigInt, splitRoute.aggFeeBps)
            : null
        return bestPlan(splitPlan, crossPlan)
    }, [splitRoute.allocation, splitRoute.aggFeeBps, crossDex.leg, amountInBigInt, chainId])
    const bestSingleOut = allRoutes[0]?.quote.amountOut ?? null
    const liveUseAgg =
        aggEligible &&
        !!aggPlan &&
        splitClearsMargin(aggPlan.predictedNetOut, bestSingleOut, MIN_AGG_IMPROVEMENT_BPS)
    const [pinnedUseAgg, setPinnedUseAgg] = useState<boolean | null>(null)
    const useAggPath = (pinnedUseAgg ?? liveUseAgg) && !!aggPlan
    useEffect(() => {
        setPinnedUseAgg(null)
    }, [amountInBigInt, tokenIn?.address, tokenOut?.address, chainId])
    const aggLegs = useMemo(
        () => (useAggPath && aggPlan ? planToLegs(aggPlan) : null),
        [useAggPath, aggPlan]
    )
    const amountOutMinimum = useMemo(() => {
        if (useAggPath && aggPlan && tokenOut) {
            return calculateMinOutput(aggPlan.predictedNetOut, Math.floor(settings.slippage * 100))
        }
        if (!effectiveQuote || !tokenOut) return 0n
        const calcFn = isV2Protocol ? calculateMinOutputV2 : calculateMinOutput
        return calcFn(effectiveQuote.amountOut, Math.floor(settings.slippage * 100))
    }, [useAggPath, aggPlan, effectiveQuote, tokenOut, settings.slippage, isV2Protocol])
    const displayAmountOut = useMemo(() => {
        if (isQuoteLoading) return '...'
        if (useAggPath && aggPlan && tokenOut) {
            return formatDisplayAmount(aggPlan.predictedNetOut, tokenOut.decimals)
        }
        if (shouldShowError) return '0'
        if (effectiveQuote && tokenOut) {
            return formatDisplayAmount(effectiveQuote.amountOut, tokenOut.decimals)
        }
        return '0'
    }, [useAggPath, aggPlan, effectiveQuote, isQuoteLoading, shouldShowError, tokenOut])
    const symbolOf = useMemo(() => {
        const byAddr = new Map(tokens.map((t) => [t.address.toLowerCase(), t.symbol]))
        return (addr: Address) => byAddr.get(addr.toLowerCase()) ?? `${addr.slice(0, 6)}…`
    }, [tokens])
    const planLegs = useMemo(
        () => (useAggPath && aggPlan ? describePlan(aggPlan, symbolOf) : null),
        [useAggPath, aggPlan, symbolOf]
    )
    useEffect(() => {
        const nextKind = useAggPath && aggPlan ? aggPlan.kind : null
        const nextOut = useAggPath && aggPlan ? aggPlan.predictedNetOut : null
        const s = useSwapStore.getState()
        if (s.aggRouteKind !== nextKind) setAggRouteKind(nextKind)
        if (s.aggPredictedOut !== nextOut) setAggPredictedOut(nextOut)
    }, [useAggPath, aggPlan, setAggRouteKind, setAggPredictedOut])
    const {
        needsApproval,
        isApproving,
        isConfirming: isConfirmingApprovalRaw,
        approve,
        hash: approvalHash,
    } = useTokenApproval({
        token: tokenIn ?? tokens[0]!,
        owner: address,
        amountToApprove: amountInBigInt,
        spender: useAggPath ? getAggRouterAddress(chainId) : undefined,
    })
    const needsApprovalCheck = useMemo(() => {
        if (wrapOp === 'wrap') return false
        if (wrapOp === 'unwrap') return false
        return needsApproval
    }, [needsApproval, wrapOp])
    const isKubUnwrapDirect = !!wrapOp && wrapOp === 'unwrap' && shouldSkipUnwrap(chainId)
    const skipSwapSimulation = needsApprovalCheck || isKubUnwrapDirect
    const v3Swap = useUniV3SwapExecution({
        tokenIn: tokenIn ?? tokens[0]!,
        tokenOut: tokenOut ?? tokens[1] ?? tokens[0]!,
        amountIn: amountInBigInt,
        amountOutMinimum,
        recipient: address ?? zeroAddress,
        slippage: settings.slippage,
        deadlineMinutes: settings.deadlineMinutes,
        fee,
        route: selectedDexRoute?.route,
        skipSimulation: skipSwapSimulation,
    })
    const v2Swap = useUniV2SwapExecution({
        tokenIn: tokenIn ?? tokens[0]!,
        tokenOut: tokenOut ?? tokens[1] ?? tokens[0]!,
        amountIn: amountInBigInt,
        amountOutMinimum,
        recipient: address ?? zeroAddress,
        deadlineMinutes: settings.deadlineMinutes,
        route: selectedDexRoute?.route,
        skipSimulation: skipSwapSimulation,
    })
    const aggSwap = useAggRouterSwapExecution({
        tokenIn: tokenIn ?? tokens[0]!,
        tokenOut: tokenOut ?? tokens[1] ?? tokens[0]!,
        amountIn: amountInBigInt,
        amountOutMinimum,
        recipient: address ?? zeroAddress,
        deadlineMinutes: settings.deadlineMinutes,
        legs: aggLegs,
        skipSimulation: skipSwapSimulation,
    })
    const {
        swap,
        isPreparing,
        isExecuting,
        isConfirming: isConfirmingSwapRaw,
        isSuccess,
        isError: swapIsError,
        error: swapError,
        hash: swapHash,
    } = useAggPath ? aggSwap : isV2Protocol ? v2Swap : v3Swap
    const isNativeOutput = !!tokenOut && isNativeToken(tokenOut.address as Address)
    const skipUnwrap = (!!isNativeOutput || isKubUnwrapDirect) && shouldSkipUnwrap(chainId)
    const {
        startUnwrap,
        reset: resetUnwrap,
        isApproving: isApprovingUnwrap,
        isConfirmingApproval: isConfirmingUnwrapApproval,
        isWithdrawing,
        isConfirmingWithdraw,
        isUnwrapping,
        isSuccess: isUnwrapSuccess,
        isError: isUnwrapError,
        unwrapHash,
    } = useKkubUnwrap({
        chainId,
        amount: isKubUnwrapDirect ? amountInBigInt : amountOutMinimum,
        owner: address,
    })
    useEffect(() => {
        if (isSuccess && skipUnwrap && !isUnwrapping && !isUnwrapSuccess && !isUnwrapError) {
            startUnwrap()
        }
    }, [isSuccess, skipUnwrap, isUnwrapping, isUnwrapSuccess, isUnwrapError, startUnwrap])
    useEffect(() => {
        const finalSuccess = skipUnwrap ? isUnwrapSuccess : isSuccess
        const finalHash = skipUnwrap ? unwrapHash : swapHash
        if (finalSuccess && finalHash) {
            const meta = getChainMetadata(chainId)
            const explorerUrl = meta?.explorer
                ? `${meta.explorer}/tx/${finalHash}`
                : `https://etherscan.io/tx/${finalHash}`
            toast.success(isKubUnwrapDirect ? 'Unwrap successful!' : 'Swap successful!', {
                action: {
                    label: 'View Transaction',
                    onClick: () => window.open(explorerUrl, '_blank', 'noopener,noreferrer'),
                },
            })
            refetchBalanceIn?.()
            refetchBalanceOut?.()
        }
    }, [
        skipUnwrap,
        isKubUnwrapDirect,
        isSuccess,
        isUnwrapSuccess,
        swapHash,
        unwrapHash,
        chainId,
        refetchBalanceIn,
        refetchBalanceOut,
    ])
    useEffect(() => {
        if (isUnwrapError) {
            toastError('KKUB unwrap failed. You received KKUB instead of KUB.')
        }
    }, [isUnwrapError])
    useEffect(() => {
        if (swapIsError && swapError) {
            toastError(swapError, 'Swap failed')
        }
    }, [swapIsError, swapError])
    const isUpdatingFromUrl = useSwapStore((state) => state.isUpdatingFromUrl)
    const prevChainIdRef = useRef(chainId)
    useEffect(() => {
        if (prevChainIdRef.current !== chainId && prevChainIdRef.current !== 0) {
            if (!isUpdatingFromUrl) {
                setTokenIn(null)
                setTokenOut(null)
                hasInitializedTokensRef.current = false
            }
        }
        prevChainIdRef.current = chainId
    }, [chainId, setTokenIn, setTokenOut, isUpdatingFromUrl])
    useEffect(() => {
        if (isUpdatingFromUrl || urlTokensPending) return
        const { tokenIn: liveTokenIn, tokenOut: liveTokenOut } = useSwapStore.getState()
        if (!hasInitializedTokensRef.current && !liveTokenIn && tokens.length > 0 && tokens[0]) {
            const { stablecoin, nativeTokens } = getDefaultPairTokens(chainId)
            const defaultIn = nativeTokens[0] ?? tokens[0]
            setTokenIn(defaultIn)
            if (
                !liveTokenOut &&
                stablecoin &&
                stablecoin.address.toLowerCase() !== defaultIn.address.toLowerCase()
            ) {
                setTokenOut(stablecoin)
            }
            hasInitializedTokensRef.current = true
        }
    }, [
        tokenIn,
        tokenOut,
        tokens,
        chainId,
        setTokenIn,
        setTokenOut,
        isUpdatingFromUrl,
        urlTokensPending,
    ])
    const isConfirmingApproval = approvalHash && isConfirmingApprovalRaw
    const isConfirmingSwap = swapHash && isConfirmingSwapRaw
    const handleSwapTokens = () => {
        swapTokens()
    }
    const handleMaxAmount = () => {
        if (tokenIn && balanceInValue > 0n) {
            setAmountIn(formatTokenAmount(balanceInValue, tokenIn.decimals))
        }
    }
    return (
        <Card>
            <CardContent className="p-0">
                <div className="flex items-center justify-between px-6 pt-4">
                    <h2 className="text-base font-semibold">Swap</h2>
                    <div className="flex items-center gap-1">
                        {onToggleChart && (
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Toggle price chart"
                                title="Toggle price chart"
                                className={cn(
                                    'h-8 w-8',
                                    showChart
                                        ? 'bg-accent text-accent-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                                onClick={onToggleChart}
                            >
                                <CandlestickChart className="h-4 w-4" />
                            </Button>
                        )}
                        <SettingsMenu
                            slippage={settings.slippage}
                            deadlineMinutes={settings.deadlineMinutes}
                            onSlippageChange={setSlippage}
                            onDeadlineChange={setDeadlineMinutes}
                        />
                    </div>
                </div>
                <div className="space-y-2 px-6 pb-6 pt-3">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="amount-in">From</Label>
                        <span
                            className="text-xs text-muted-foreground cursor-pointer hover:underline"
                            onClick={handleMaxAmount}
                        >
                            Balance:{' '}
                            {tokenIn
                                ? isLoadingBalanceIn
                                    ? '...'
                                    : formatBalance(balanceInValue, tokenIn.decimals)
                                : '0'}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            id="amount-in"
                            type="text"
                            placeholder="0"
                            className="flex-1 h-10 text-2xl font-medium md:text-2xl p-0"
                            autoFocus
                            autoComplete="off"
                            inputMode="decimal"
                            pattern="^[0-9]*\.?[0-9]*$"
                            value={amountIn}
                            onChange={(e) => {
                                const value = e.target.value
                                if (isValidNumberInput(value)) {
                                    setAmountIn(value)
                                }
                            }}
                        />
                        <TokenSelect
                            token={tokenIn}
                            tokens={tokens}
                            disabledToken={tokenOut}
                            onSelect={setTokenIn}
                        />
                    </div>
                </div>
                <div className="relative flex items-center justify-center py-1">
                    <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-10 h-8 w-8 rounded-full border bg-background"
                        onClick={handleSwapTokens}
                        disabled={!tokenIn || !tokenOut}
                    >
                        <ArrowDownUp className="h-4 w-4" />
                    </Button>
                </div>
                <div className="space-y-2 p-6">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="amount-out">To</Label>
                        <span className="text-xs text-muted-foreground">
                            Balance:{' '}
                            {tokenOut
                                ? isLoadingBalanceOut
                                    ? '...'
                                    : formatBalance(balanceOutValue, tokenOut.decimals)
                                : '0'}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <Input
                            id="amount-out"
                            type="text"
                            placeholder="0"
                            className="flex-1 h-10 text-2xl font-medium md:text-2xl p-0"
                            readOnly
                            autoComplete="off"
                            value={displayAmountOut}
                        />
                        <TokenSelect
                            token={tokenOut}
                            tokens={tokens}
                            disabledToken={tokenIn}
                            onSelect={setTokenOut}
                        />
                    </div>
                </div>
                <div className="space-y-4 p-6 pt-0">
                    {effectiveQuote && tokenIn && tokenOut && !isQuoteLoading && (
                        <Card className="bg-muted/50 p-1">
                            <CardContent className="space-y-1 p-3 text-xs">
                                {isWrapUnwrap && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Operation</span>
                                            <span className="font-semibold">
                                                {wrapOperation === 'wrap'
                                                    ? `Wrap ${tokenOut.symbol}`
                                                    : `Unwrap ${tokenIn.symbol}`}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Rate</span>
                                            <span className="font-semibold">1:1</span>
                                        </div>
                                    </>
                                )}
                                {!isWrapUnwrap && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Rate</span>
                                            <span
                                                className="font-medium cursor-pointer hover:underline flex items-center gap-1"
                                                onClick={() => setIsRateFlipped(!isRateFlipped)}
                                                title="Click to flip rate"
                                            >
                                                {!isRateFlipped ? (
                                                    <>
                                                        1 {tokenIn.symbol} ={' '}
                                                        {amountIn && parseFloat(amountIn) > 0
                                                            ? (
                                                                  parseFloat(displayAmountOut) /
                                                                  parseFloat(amountIn)
                                                              ).toFixed(6)
                                                            : '0'}{' '}
                                                        {tokenOut.symbol}
                                                    </>
                                                ) : (
                                                    <>
                                                        1 {tokenOut.symbol} ={' '}
                                                        {displayAmountOut &&
                                                        parseFloat(displayAmountOut) > 0
                                                            ? (
                                                                  parseFloat(amountIn) /
                                                                  parseFloat(displayAmountOut)
                                                              ).toFixed(6)
                                                            : '0'}{' '}
                                                        {tokenIn.symbol}
                                                    </>
                                                )}
                                                <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">
                                                Min. Received
                                            </span>
                                            <span className="font-medium">
                                                {formatDisplayAmount(
                                                    amountOutMinimum,
                                                    tokenOut.decimals
                                                )}{' '}
                                                {tokenOut.symbol}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Fee</span>
                                            <span className="font-medium">
                                                {(fee / 10000).toFixed(2)}%
                                            </span>
                                        </div>
                                        {priceImpact !== undefined && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">
                                                    Price Impact
                                                </span>
                                                <span
                                                    className={cn(
                                                        'font-medium',
                                                        priceImpact >= 5 && 'text-negative'
                                                    )}
                                                >
                                                    {priceImpact < 0.01
                                                        ? '<0.01'
                                                        : priceImpact.toFixed(2)}
                                                    %
                                                </span>
                                            </div>
                                        )}
                                        {planLegs ? (
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-muted-foreground">Route</span>
                                                <div className="flex flex-col items-end gap-0.5">
                                                    {planLegs.map((leg, i) => (
                                                        <span
                                                            key={i}
                                                            className="font-medium flex items-center gap-1 flex-wrap justify-end text-xs"
                                                        >
                                                            {planLegs.length > 1 && (
                                                                <span className="text-muted-foreground">
                                                                    {leg.percent}%
                                                                </span>
                                                            )}
                                                            {leg.hops.map((h, j) => (
                                                                <Fragment key={j}>
                                                                    {j === 0 && (
                                                                        <span>{h.symbolIn}</span>
                                                                    )}
                                                                    <span className="text-muted-foreground">
                                                                        →
                                                                    </span>
                                                                    <span className="text-[10px] uppercase text-muted-foreground">
                                                                        {h.dexId}
                                                                    </span>
                                                                    <span>{h.symbolOut}</span>
                                                                </Fragment>
                                                            ))}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            displayRoute && (
                                                <div className="flex justify-between items-center gap-2">
                                                    <span className="text-muted-foreground">
                                                        Route
                                                    </span>
                                                    <span className="font-medium flex items-center gap-1 flex-wrap justify-end">
                                                        <span className="text-[10px] uppercase text-muted-foreground">
                                                            {displayRoute.dexId}
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                            •
                                                        </span>
                                                        {tokenIn?.symbol}
                                                        {displayRoute.route.intermediaryTokens.map(
                                                            (t) => (
                                                                <Fragment key={t.address}>
                                                                    <span className="text-muted-foreground">
                                                                        →
                                                                    </span>
                                                                    {t.symbol}
                                                                </Fragment>
                                                            )
                                                        )}
                                                        <span className="text-muted-foreground">
                                                            →
                                                        </span>
                                                        {tokenOut?.symbol}
                                                    </span>
                                                </div>
                                            )
                                        )}
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    )}
                    {!isWrapUnwrap &&
                        !isSameTokenSwap &&
                        tokenIn &&
                        tokenOut &&
                        amountInBigInt > 0n &&
                        !effectiveQuote &&
                        !isQuoteLoading && (
                            <Card className="bg-muted/50 p-1">
                                <CardContent className="p-3 text-xs text-center text-muted-foreground">
                                    No route found for {tokenIn.symbol} → {tokenOut.symbol}. Try a
                                    different amount or token pair.
                                </CardContent>
                            </Card>
                        )}
                    <Button
                        className="w-full"
                        size="lg"
                        disabled={
                            !tokenIn ||
                            !tokenOut ||
                            isQuoteLoading ||
                            isSameTokenSwap ||
                            (!isWrapUnwrap && amountInBigInt > 0n && !effectiveQuote) ||
                            (isKubUnwrapDirect
                                ? isUnwrapping
                                : (isPreparing && !needsApprovalCheck) ||
                                  isExecuting ||
                                  (needsApprovalCheck && (isApproving || isConfirmingApproval))) ||
                            (amountInBigInt > 0n && amountInBigInt > balanceInValue) ||
                            (!isKubUnwrapDirect && isUnwrapping)
                        }
                        onClick={() => {
                            if (!isConnected) {
                                setIsConnectModalOpen(true)
                                return
                            }
                            if (needsApprovalCheck) {
                                if (pinnedUseAgg === null) setPinnedUseAgg(liveUseAgg)
                                approve()
                            } else if (isKubUnwrapDirect) {
                                if (!isUnwrapping && !isUnwrapSuccess) startUnwrap()
                            } else if (!isPreparing) {
                                if (pinnedUseAgg === null) setPinnedUseAgg(liveUseAgg)
                                if (skipUnwrap) resetUnwrap()
                                swap()
                            }
                        }}
                    >
                        {!isConnected
                            ? 'Connect Wallet'
                            : isSameTokenSwap
                              ? 'Select Different Tokens'
                              : amountInBigInt > 0n && amountInBigInt > balanceInValue
                                ? 'Insufficient Balance'
                                : isWrapUnwrap
                                  ? wrapOperation === 'unwrap' && isKubUnwrapDirect
                                      ? isApprovingUnwrap
                                          ? 'Approving KKUB...'
                                          : isConfirmingUnwrapApproval
                                            ? 'Confirming Approval...'
                                            : isWithdrawing
                                              ? 'Withdrawing KKUB...'
                                              : isConfirmingWithdraw
                                                ? 'Confirming...'
                                                : isUnwrapSuccess
                                                  ? 'Unwrapped!'
                                                  : 'Unwrap KKUB'
                                      : isPreparing
                                        ? 'Simulating...'
                                        : isExecuting
                                          ? wrapOperation === 'wrap'
                                              ? 'Wrapping...'
                                              : 'Unwrapping...'
                                          : isConfirmingSwap
                                            ? 'Confirming...'
                                            : wrapOperation === 'wrap'
                                              ? `Wrap ${tokenOut?.symbol}`
                                              : `Unwrap ${tokenIn?.symbol}`
                                  : isUnwrapping
                                    ? isApprovingUnwrap
                                        ? 'Approving KKUB...'
                                        : isConfirmingUnwrapApproval
                                          ? 'Confirming Approval...'
                                          : isWithdrawing
                                            ? 'Withdrawing KKUB...'
                                            : isConfirmingWithdraw
                                              ? 'Confirming...'
                                              : 'Unwrapping...'
                                    : needsApprovalCheck
                                      ? isApproving
                                          ? 'Approving...'
                                          : isConfirmingApproval
                                            ? 'Confirming...'
                                            : `Approve ${tokenIn?.symbol || 'Token'}`
                                      : isPreparing
                                        ? 'Simulating...'
                                        : isExecuting
                                          ? 'Swapping...'
                                          : isConfirmingSwap
                                            ? 'Confirming...'
                                            : isQuoteLoading
                                              ? 'Fetching Quote...'
                                              : tokenIn && tokenOut
                                                ? 'Swap'
                                                : 'Select Tokens'}
                    </Button>
                </div>
                <ConnectModal open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen} />
            </CardContent>
        </Card>
    )
}
