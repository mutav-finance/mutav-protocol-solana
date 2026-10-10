//! Field lists of every v1 account, for the offset tables (generated with
//! `v1.rs`; keep the two in step).

macro_rules! caps_fields {
    ($t:ty) => {
        $crate::spans!($t;
            "max_tvl" => max_tvl,
            "max_cover_per_guarantee" => max_cover_per_guarantee,
            "max_claim_per_call" => max_claim_per_call,
            "max_claim_per_period" => max_claim_per_period,
            "min_request" => min_request,
            "max_request" => max_request,
            "max_nav_move_bps" => max_nav_move_bps,
            "stress_buffer" => stress_buffer,
            "max_queue_wait_secs" => max_queue_wait_secs,
            "max_reinstate_age" => max_reinstate_age,
            "_reserved" => _reserved,
        )
    };
}

macro_rules! vault_config_fields {
    ($t:ty) => {
        $crate::spans!($t;
            "version" => version,
            "bump" => bump,
            "authority_bump" => authority_bump,
            "admin" => admin,
            "operator" => operator,
            "pauser" => pauser,
            "reserve_mint" => reserve_mint,
            "reserve_token_program" => reserve_token_program,
            "reserve_decimals" => reserve_decimals,
            "share_mint" => share_mint,
            "coverage_ratio_bps" => coverage_ratio_bps,
            "fee_take_bps" => fee_take_bps,
            "payments_account" => payments_account,
            "treasury_account" => treasury_account,
            "investor_allowlist_root" => investor_allowlist_root,
            "caps" => caps,
            "paused" => paused,
            "feature_flags" => feature_flags,
            "mutav_capital_wallet" => mutav_capital_wallet,
            "adapter_count" => adapter_count,
            "adapter_bitmap" => adapter_bitmap,
            "pending_admin" => pending_admin,
            "pending_admin_expires_at" => pending_admin_expires_at,
            "pending_operator" => pending_operator,
            "pending_operator_expires_at" => pending_operator_expires_at,
            "pending_pauser" => pending_pauser,
            "pending_pauser_expires_at" => pending_pauser_expires_at,
            "guardians" => guardians,
            "_reserved" => _reserved,
        )
    };
}

macro_rules! vault_state_fields {
    ($t:ty) => {
        $crate::spans!($t;
            "version" => version,
            "bump" => bump,
            "mode" => mode,
            "brs_balance" => brs_balance,
            "remaining_cover_total" => remaining_cover_total,
            "coverage_required" => coverage_required,
            "provisions" => provisions,
            "shares_outstanding" => shares_outstanding,
            "nav_per_share" => nav_per_share,
            "pending_deposits_total" => pending_deposits_total,
            "pending_redeem_shares" => pending_redeem_shares,
            "claimable_assets_total" => claimable_assets_total,
            "active_guarantees" => active_guarantees,
            "next_deposit_seq" => next_deposit_seq,
            "deposit_head" => deposit_head,
            "next_redeem_seq" => next_redeem_seq,
            "redeem_head" => redeem_head,
            "fees_in_total" => fees_in_total,
            "fee_take_total" => fee_take_total,
            "claims_paid_total" => claims_paid_total,
            "fulfil_halted" => fulfil_halted,
            "last_refresh_ts" => last_refresh_ts,
            "last_refresh_slot" => last_refresh_slot,
            "income_total" => income_total,
            "inflow_nav" => inflow_nav,
            "claim_day_buckets" => claim_day_buckets,
            "claim_day_anchor" => claim_day_anchor,
            "_reserved" => _reserved,
        )
    };
}

macro_rules! guarantee_fields {
    ($t:ty) => {
        $crate::spans!($t;
            "version" => version,
            "bump" => bump,
            "id" => id,
            "agency_id" => agency_id,
            "refs_hash" => refs_hash,
            "default_cover" => default_cover,
            "exit_cover" => exit_cover,
            "default_paid" => default_paid,
            "exit_paid" => exit_paid,
            "provision_default" => provision_default,
            "provision_exit" => provision_exit,
            "open_claims" => open_claims,
            "status" => status,
            "registered_at" => registered_at,
            "closed_at" => closed_at,
            "_reserved" => _reserved,
        )
    };
}

macro_rules! claim_filing_fields {
    ($t:ty) => {
        $crate::spans!($t;
            "version" => version,
            "bump" => bump,
            "guarantee" => guarantee,
            "leg" => leg,
            "notice_ref_hash" => notice_ref_hash,
            "provision" => provision,
            "filed_at" => filed_at,
            "status" => status,
            "paid_amount" => paid_amount,
            "paid_at" => paid_at,
            "payments_account" => payments_account,
            "pix_e2e_hash" => pix_e2e_hash,
            "settled_at" => settled_at,
            "approved_amount" => approved_amount,
            "_reserved" => _reserved,
        )
    };
}

macro_rules! income_receipt_fields {
    ($t:ty) => {
        $crate::spans!($t;
            "version" => version,
            "bump" => bump,
            "kind" => kind,
            "ref_hash" => ref_hash,
            "period" => period,
            "gross" => gross,
            "take" => take,
            "net" => net,
            "slot" => slot,
            "_reserved" => _reserved,
        )
    };
}

macro_rules! deposit_request_fields {
    ($t:ty) => {
        $crate::spans!($t;
            "version" => version,
            "bump" => bump,
            "owner" => owner,
            "seq" => seq,
            "assets" => assets,
            "shares_out" => shares_out,
            "nav_at_fulfil" => nav_at_fulfil,
            "requested_at" => requested_at,
            "fulfilled_at" => fulfilled_at,
            "status" => status,
            "_reserved" => _reserved,
        )
    };
}

macro_rules! redeem_request_fields {
    ($t:ty) => {
        $crate::spans!($t;
            "version" => version,
            "bump" => bump,
            "owner" => owner,
            "seq" => seq,
            "shares" => shares,
            "assets_out" => assets_out,
            "nav_at_fill" => nav_at_fill,
            "requested_at" => requested_at,
            "filled_at" => filled_at,
            "status" => status,
            "shares_filled" => shares_filled,
            "_reserved" => _reserved,
        )
    };
}
