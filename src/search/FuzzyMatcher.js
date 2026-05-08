export function damerauLevenshtein(left = '', right = '', maxDistance = Infinity) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const leftLength = left.length;
  const rightLength = right.length;

  if (Math.abs(leftLength - rightLength) > maxDistance) {
    return maxDistance + 1;
  }

  const matrix = Array.from({ length: leftLength + 1 }, () => new Array(rightLength + 1).fill(0));

  for (let row = 0; row <= leftLength; row += 1) {
    matrix[row][0] = row;
  }
  for (let column = 0; column <= rightLength; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= leftLength; row += 1) {
    let rowMin = Infinity;
    for (let column = 1; column <= rightLength; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );

      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + cost);
      }

      rowMin = Math.min(rowMin, matrix[row][column]);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }
  }

  return matrix[leftLength][rightLength];
}
