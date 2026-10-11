export interface Transform {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
}

export type Affine = readonly [number, number, number, number, number, number];
export interface Point { x: number; y: number }

export function affine(transform: Transform = {}, origin: Point = { x: 0, y: 0 }): Affine {
  const { x = 0, y = 0, scaleX = 1, scaleY = 1, rotation = 0, opacity = 1 } = transform;
  if (![x, y, scaleX, scaleY, rotation, opacity, origin.x, origin.y].every(Number.isFinite)
    || Math.abs(scaleX * scaleY) < 1e-8 || opacity < 0 || opacity > 1) {
    throw new Error("Transform requires finite invertible scales and opacity in [0,1]");
  }
  const angle = (rotation % 360) * Math.PI / 180;
  const matrix: Affine = [Math.cos(angle) * scaleX, Math.sin(angle) * scaleX,
    -Math.sin(angle) * scaleY, Math.cos(angle) * scaleY, origin.x + x, origin.y + y];
  inverse(matrix);
  return matrix;
}

export function inverse([a, b, c, d, e, f]: Affine): Affine {
  const determinant = a * d - b * c;
  if (![a, b, c, d, e, f, determinant].every(Number.isFinite) || Math.abs(determinant) < 1e-8) throw new Error("Invalid affine inverse: finite invertible coefficients required");
  const result: Affine = [d / determinant, -b / determinant, -c / determinant, a / determinant,
    (c * f - d * e) / determinant, (b * e - a * f) / determinant];
  const inverseDeterminant = result[0] * result[3] - result[1] * result[2];
  if (!result.every(Number.isFinite) || !Number.isFinite(inverseDeterminant) || inverseDeterminant === 0) {
    throw new Error("Invalid affine inverse: finite invertible coefficients required");
  }
  return result;
}

export function point([a, b, c, d, e, f]: Affine, { x, y }: Point): Point {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

export function cssMatrix(matrix: Affine): string { return `matrix(${matrix.join(",")})`; }
