// `orrery icons new`: the starter drawing a new local icon begins from.

/** A starter on the 24 grid that passes check; its parts are placeholders to draw over. */
export function starterIcon(name: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ${name}: a 24 grid. Keep every edge, stroke included, between 2 and 22. -->
  <!-- Replace these placeholder parts with two to six of your own, silhouette first. -->
  <rect x="4" y="4" width="16" height="16" rx="3"/>
  <path d="M8 12h8"/>
  <path d="M12 8v8"/>
</svg>
`;
}
