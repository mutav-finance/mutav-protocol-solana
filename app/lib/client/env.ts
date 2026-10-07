import { parseCluster } from "../cluster";

/** Inlined at build time; throws (and so refuses to render) on mainnet. */
export const CLUSTER = parseCluster(process.env.NEXT_PUBLIC_CLUSTER);
