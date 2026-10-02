use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::{
    constants::CONFIG_SEED, errors::MutavError, events::VaultInitialized, state::VaultConfig,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub pauser: Pubkey,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Reserve asset mint; owner is checked against SPL Token / Token-2022.
    pub reserve_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + VaultConfig::INIT_SPACE,
        seeds = [CONFIG_SEED, reserve_mint.key().as_ref()],
        bump,
    )]
    pub config: Account<'info, VaultConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    for role in [args.admin, args.operator, args.pauser] {
        require_keys_neq!(role, Pubkey::default(), MutavError::InvalidRole);
    }

    let config = &mut ctx.accounts.config;
    config.admin = args.admin;
    config.operator = args.operator;
    config.pauser = args.pauser;
    config.reserve_mint = ctx.accounts.reserve_mint.key();
    config.bump = ctx.bumps.config;
    config._reserved = [0; 128];

    emit!(VaultInitialized {
        config: config.key(),
        reserve_mint: config.reserve_mint,
        admin: config.admin,
        operator: config.operator,
        pauser: config.pauser,
    });
    Ok(())
}
