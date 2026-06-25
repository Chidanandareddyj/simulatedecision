/**
 * Iterative proportional fitting on a contingency table.
 * Adjusts cell counts to match row and column marginals.
 */

export function ipf(
  seed: number[][],
  rowTargets: number[],
  colTargets: number[],
  maxIter = 200,
  tol = 1e-8,
): number[][] {
  const rows = seed.length;
  const cols = seed[0]?.length ?? 0;
  const table = seed.map((r) => [...r]);

  for (let iter = 0; iter < maxIter; iter++) {
    let maxErr = 0;

    for (let i = 0; i < rows; i++) {
      const rowSum = table[i].reduce((a, b) => a + b, 0);
      if (rowSum <= 0) continue;
      const factor = rowTargets[i] / rowSum;
      for (let j = 0; j < cols; j++) table[i][j] *= factor;
      maxErr = Math.max(maxErr, Math.abs(rowSum - rowTargets[i]) / Math.max(rowTargets[i], 1));
    }

    for (let j = 0; j < cols; j++) {
      let colSum = 0;
      for (let i = 0; i < rows; i++) colSum += table[i][j];
      if (colSum <= 0) continue;
      const factor = colTargets[j] / colSum;
      for (let i = 0; i < rows; i++) table[i][j] *= factor;
      maxErr = Math.max(maxErr, Math.abs(colSum - colTargets[j]) / Math.max(colTargets[j], 1));
    }

    if (maxErr < tol) break;
  }

  return table;
}

export function tableToDistribution(table: number[][]): number[] {
  const flat: number[] = [];
  for (const row of table) flat.push(...row);
  const total = flat.reduce((a, b) => a + b, 0);
  return flat.map((v) => (total > 0 ? v / total : 0));
}

export function marginalFromTable(
  table: number[][],
  rowLabels: string[],
  colLabels: string[],
): { row: Record<string, number>; col: Record<string, number> } {
  const row: Record<string, number> = {};
  const col: Record<string, number> = {};
  for (let i = 0; i < rowLabels.length; i++) {
    row[rowLabels[i]] = table[i].reduce((a, b) => a + b, 0);
  }
  for (let j = 0; j < colLabels.length; j++) {
    let s = 0;
    for (let i = 0; i < table.length; i++) s += table[i][j];
    col[colLabels[j]] = s;
  }
  return { row, col };
}
