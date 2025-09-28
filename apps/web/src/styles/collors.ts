// Central color tokens (intentionally named 'collors' per project request)
// Exporting both raw values and a CSS variable injector helper.

export const collors = {
  brand: {
    darkNavy: '#050021',
    accent: '#44FFB3',
  },
  semantic: {
    // Map existing semantic tokens if needed later
    success: '#44FFB3',
    danger: '#ef4444', // Tailwind red-500 fallback
  },
  neutral: {
    white: '#FFFFFF',
    black: '#000000',
  },
};

// CSS variable names follow --color-<group>-<token>
export function buildColorCSSVariables() {
  const lines: string[] = [];
  for (const [group, groupObj] of Object.entries(collors)) {
    for (const [name, value] of Object.entries(groupObj as Record<string,string>)) {
      lines.push(`  --color-${group}-${name}: ${value};`);
    }
  }
  return `:root {\n${lines.join('\n')}\n}`;
}

// Convenience typed accessor
export type Collors = typeof collors;
