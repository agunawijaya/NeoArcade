export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export function discTouchesRect(x: number, y: number, radius: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius * radius;
}

export function discTouchesCircle(x: number, y: number, radius: number, circle: Circle): boolean {
  return (x - circle.x) ** 2 + (y - circle.y) ** 2 <= (radius + circle.radius) ** 2;
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function pointInCircle(x: number, y: number, circle: Circle): boolean {
  return (x - circle.x) ** 2 + (y - circle.y) ** 2 <= circle.radius * circle.radius;
}
