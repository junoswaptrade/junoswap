import { createPonderClient } from '@coshi190/junoswap-sdk'

export { isPonderError } from '@coshi190/junoswap-sdk'

export const ponderClient = createPonderClient(
    () => `${process.env.NEXT_PUBLIC_PONDER_URL}/graphql`
)
