// Line-based diff (longest common subsequence). Used to show what a reviewer changed in a generated draft.

/** @returns {{ type: 'same' | 'added' | 'removed', text: string }[]} */
export function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const lengths = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      result.push({ type: 'removed', text: a[i] });
      i += 1;
    } else {
      result.push({ type: 'added', text: b[j] });
      j += 1;
    }
  }
  a.slice(i).forEach((text) => result.push({ type: 'removed', text }));
  b.slice(j).forEach((text) => result.push({ type: 'added', text }));
  return result;
}
