// What every importer returns: the spec as YAML text, warnings for what it could not carry
// over, and the icons it guessed from names (listed so the user checks them).
export interface Imported {
  yaml: string;
  warnings: string[];
  guessed?: Record<string, string>;
}
