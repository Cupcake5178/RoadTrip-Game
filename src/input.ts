export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  locked = false;
  constructor(public canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.mouseX = 0;
      this.mouseY = 0;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseX += e.movementX;
        this.mouseY += e.movementY;
      }
    });
    canvas.addEventListener('click', () => this.lock());
  }
  lock() {
    const p = this.canvas.requestPointerLock?.();
    p?.catch(() => {});
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  down(...keys: string[]) {
    return keys.some((key) => this.keys.has(key));
  }
  hit(key: string) {
    return this.pressed.has(key);
  }
  end() {
    this.pressed.clear();
    this.mouseX = this.mouseY = 0;
  }
  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.mouseX = this.mouseY = 0;
  }
}
