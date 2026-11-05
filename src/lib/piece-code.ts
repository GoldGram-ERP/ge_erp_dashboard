// Piece codes on the Coding page. The backend gives each unit the next free code, line after line, so before Save the code a unit will
// probably get is the next code plus the units before it. It is a preview: the real codes are the ones the backend gives on Save.

/** Piece codes in the order a person reads them: shortest first, then by text (99 before 100, 74 before 75); the backend's rule. */
export const comparePieceCodes = (a: unknown, b: unknown): number => {
  const x = String(a ?? ""), y = String(b ?? "");
  return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
};

/** The units before each line: [4, 3] -> [0, 4]. The first code of line i is next + offsets[i]; every unit counts, drawn or not. */
export const unitsBefore = (quantities: number[]): number[] => quantities.map((_, i) => quantities.slice(0, i).reduce((sum, q) => sum + (Number(q) || 0), 0));
