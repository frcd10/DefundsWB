/**
 * Utility functions for consistent number formatting across the app
 */

/**
 * Format SOL amounts with appropriate precision
 * Shows 2 decimals for amounts >= 0.01, more precision for smaller amounts
 */
export function formatSol(amount: number): string {
  if (amount === 0) return '0.00';
  if (amount >= 0.01) return amount.toFixed(2);
  if (amount >= 0.001) return amount.toFixed(3);
  return amount.toFixed(4);
}

/**
 * Format percentage values with 2 decimal places
 * @param percentage - The percentage to format
 * @returns Formatted string with 2 decimal places and % sign
 */
export function formatPercentage(percentage: number): string {
  return `${Number(percentage).toFixed(2)}%`;
}

/**
 * Format shares with 2 decimal places
 * @param shares - The share amount to format
 * @returns Formatted string with 2 decimal places
 */
export function formatShares(shares: number): string {
  return Number(shares).toFixed(2);
}

/**
 * Format P&L with proper sign and 2 decimal places
 * @param pnl - The P&L amount to format
 * @returns Formatted string with sign and 2 decimal places
 */
export function formatPnL(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '';
  return `${sign}${Number(pnl).toFixed(2)}`;
}

/**
 * Format P&L percentage with proper sign and 2 decimal places
 * @param pnlPercentage - The P&L percentage to format
 * @returns Formatted string with sign, 2 decimal places and % sign
 */
export function formatPnLPercentage(pnlPercentage: number): string {
  const sign = pnlPercentage >= 0 ? '+' : '';
  return `${sign}${Number(pnlPercentage).toFixed(2)}%`;
}
