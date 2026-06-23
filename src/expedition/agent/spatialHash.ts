import type { AntAgent } from "./types";

export class SpatialHash {
  private readonly cellSize: number;
  private readonly cells = new Map<string, AntAgent[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  clear() {
    this.cells.clear();
  }

  insert(agent: AntAgent) {
    const key = this.key(agent.position.x, agent.position.y);
    const list = this.cells.get(key);
    if (list) list.push(agent);
    else this.cells.set(key, [agent]);
  }

  query(x: number, y: number, radius: number) {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    const result: AntAgent[] = [];
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        const list = this.cells.get(`${cx}:${cy}`);
        if (list) result.push(...list);
      }
    }
    return result;
  }

  private key(x: number, y: number) {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
  }
}

