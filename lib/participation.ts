export function displayPoints(points: number) {
  const value = points.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return points > 0 ? `+${value}` : value;
}
