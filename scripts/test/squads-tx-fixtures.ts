/**
 * Fixture bytes in the Squads v4 VaultTransaction, ConfigTransaction and
 * Proposal layouts. `squads-tx.test.ts` pins this encoder to golden bytes
 * serialized by the `@sqds/multisig` 2.1.4 beet types, so the decoders are
 * tested against the SDK layout without the repo depending on the SDK.
 * No key material.
 */
import { AccountRole, getAddressEncoder, type Address, type Instruction } from '@solana/kit';
import type { ConfigAction, VaultTransactionMessage } from '../release/lib/squads-tx';
import { CONFIG_TRANSACTION_DISCRIMINATOR, PROPOSAL_DISCRIMINATOR, PROPOSAL_STATUSES, SPENDING_LIMIT_PERIODS, VAULT_TRANSACTION_DISCRIMINATOR, type ProposalStatus } from '../release/lib/squads-tx';

const enc = getAddressEncoder();

export class Writer {
  parts: number[] = [];
  u8(v: number) {
    this.parts.push(v & 0xff);
    return this;
  }
  le(v: bigint | number, n: number) {
    const b = BigInt.asUintN(n * 8, BigInt(v));
    for (let i = 0; i < n; i++) this.parts.push(Number((b >> BigInt(8 * i)) & 0xffn));
    return this;
  }
  raw(b: ArrayLike<number>) {
    this.parts.push(...Array.from(b));
    return this;
  }
  key(a: Address) {
    return this.raw(enc.encode(a));
  }
  vecBytes(b: ArrayLike<number>) {
    return this.le(b.length, 4).raw(b);
  }
  vec<T>(xs: T[], f: (x: T) => void) {
    this.le(xs.length, 4);
    xs.forEach(f);
    return this;
  }
  bytes() {
    return new Uint8Array(this.parts);
  }
}

/**
 * Compiles instructions into a vault-transaction message the way the Squads
 * SDK does: the vault (payer) first, then signers, writable before readonly,
 * then non-signers, writable before readonly; program ids as readonly keys.
 */
export function compileMessage(vault: Address, ixs: Instruction[]): VaultTransactionMessage {
  const roles = new Map<string, { signer: boolean; writable: boolean }>();
  roles.set(vault, { signer: true, writable: true });
  const touch = (a: Address, signer: boolean, writable: boolean) => {
    const r = roles.get(a) ?? { signer: false, writable: false };
    roles.set(a, { signer: r.signer || signer, writable: r.writable || writable });
  };
  for (const ix of ixs) {
    for (const m of ix.accounts ?? []) touch(m.address, m.role === AccountRole.READONLY_SIGNER || m.role === AccountRole.WRITABLE_SIGNER, m.role === AccountRole.WRITABLE || m.role === AccountRole.WRITABLE_SIGNER);
    touch(ix.programAddress, false, false);
  }
  const all = [...roles.entries()];
  const pick = (s: boolean, w: boolean) => all.filter(([k, r]) => k !== vault && r.signer === s && r.writable === w).map(([k]) => k as Address);
  const ws = [vault, ...pick(true, true)];
  const rs = pick(true, false);
  const wn = pick(false, true);
  const rn = pick(false, false);
  const accountKeys = [...ws, ...rs, ...wn, ...rn];
  const at = (a: Address) => accountKeys.indexOf(a);
  return {
    numSigners: ws.length + rs.length,
    numWritableSigners: ws.length,
    numWritableNonSigners: wn.length,
    accountKeys,
    instructions: ixs.map((ix) => ({ programIdIndex: at(ix.programAddress), accountIndexes: (ix.accounts ?? []).map((m) => at(m.address)), data: new Uint8Array(ix.data ?? []) })),
    addressTableLookups: [],
  };
}

export function vaultTransactionBytes(o: {
  multisig: Address;
  creator: Address;
  index: bigint;
  bump?: number;
  vaultIndex?: number;
  vaultBump?: number;
  ephemeralSignerBumps?: number[];
  message: VaultTransactionMessage;
}): Uint8Array {
  const w = new Writer().raw(VAULT_TRANSACTION_DISCRIMINATOR).key(o.multisig).key(o.creator).le(o.index, 8).u8(o.bump ?? 255).u8(o.vaultIndex ?? 0).u8(o.vaultBump ?? 254);
  w.vecBytes(o.ephemeralSignerBumps ?? []);
  const m = o.message;
  w.u8(m.numSigners).u8(m.numWritableSigners).u8(m.numWritableNonSigners);
  w.vec(m.accountKeys, (k) => w.key(k));
  w.vec(m.instructions, (ix) => {
    w.u8(ix.programIdIndex).vecBytes(ix.accountIndexes).vecBytes(ix.data);
  });
  w.vec(m.addressTableLookups, (l) => {
    w.key(l.accountKey).vecBytes(l.writableIndexes).vecBytes(l.readonlyIndexes);
  });
  return w.bytes();
}

export function configTransactionBytes(o: { multisig: Address; creator: Address; index: bigint; bump?: number; actions: ConfigAction[] }): Uint8Array {
  const w = new Writer().raw(CONFIG_TRANSACTION_DISCRIMINATOR).key(o.multisig).key(o.creator).le(o.index, 8).u8(o.bump ?? 255);
  w.vec(o.actions, (a) => {
    switch (a.name) {
      case 'AddMember':
        w.u8(0).key(a.args.newMember).u8(a.args.permissions);
        break;
      case 'RemoveMember':
        w.u8(1).key(a.args.oldMember);
        break;
      case 'ChangeThreshold':
        w.u8(2).le(a.args.newThreshold, 2);
        break;
      case 'SetTimeLock':
        w.u8(3).le(a.args.newTimeLock, 4);
        break;
      case 'AddSpendingLimit':
        w.u8(4).key(a.args.createKey).u8(a.args.vaultIndex).key(a.args.mint).le(a.args.amount, 8).u8(SPENDING_LIMIT_PERIODS.indexOf(a.args.period as never));
        w.vec(a.args.members, (k) => w.key(k));
        w.vec(a.args.destinations, (k) => w.key(k));
        break;
      case 'RemoveSpendingLimit':
        w.u8(5).key(a.args.spendingLimit);
        break;
      case 'SetRentCollector':
        w.u8(6);
        if (a.args.newRentCollector) w.u8(1).key(a.args.newRentCollector);
        else w.u8(0);
        break;
    }
  });
  return w.bytes();
}

export function proposalBytes(o: {
  multisig: Address;
  index: bigint;
  status?: ProposalStatus;
  timestamp?: bigint;
  approved?: Address[];
  rejected?: Address[];
  cancelled?: Address[];
  padding?: number;
}): Uint8Array {
  const status = o.status ?? 'Active';
  const w = new Writer().raw(PROPOSAL_DISCRIMINATOR).key(o.multisig).le(o.index, 8).u8(PROPOSAL_STATUSES.indexOf(status));
  if (status !== 'Executing') w.le(o.timestamp ?? 1_700_000_000n, 8);
  w.u8(253);
  for (const list of [o.approved ?? [], o.rejected ?? [], o.cancelled ?? []]) w.vec(list, (k) => w.key(k));
  w.raw(new Array(o.padding ?? 0).fill(0));
  return w.bytes();
}
