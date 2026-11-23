/** The two source colors, defined once as CSS variables in index.css (:root) so every view draws them the same. */
export const SOURCE_COLOR = {
  github: "var(--ft-source-github)",
  docs: "var(--ft-source-docs)",
} as const;

export type SourceKey = keyof typeof SOURCE_COLOR;

export const SOURCE_NAME: Record<SourceKey, string> = { github: "GitHub", docs: "Docs" };
