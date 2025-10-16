//! Central build / version tagging for deployment verification.
//! Bump BUILD_TAG each time you deploy a new binary that changes executable code or IDL.

pub const BUILD_TAG: &str = "DEFUNDS001"; // deployment build identifier
pub const ROUTE_VERSION: u8 = 2; // Jupiter shared accounts route version in use

// Optionally add semantic components (e.g., +idl if IDL changed) in future.