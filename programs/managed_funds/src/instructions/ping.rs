use anchor_lang::prelude::*;
use crate::version::{BUILD_TAG, ROUTE_VERSION};

#[derive(Accounts)]
pub struct PingBuild {}

pub fn ping_build(_ctx: Context<PingBuild>) -> Result<()> {
    msg!("managed_funds::ping_build");
    msg!("build={}", BUILD_TAG);
    msg!("route_v={}", ROUTE_VERSION);
    Ok(())
}
