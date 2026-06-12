Component({
  properties: {
    src: { type: String, value: '' },
    rotateX: { type: Number, value: 0 },
    rotateY: { type: Number, value: 0 },
    scale: { type: Number, value: 1 }
  },
  lifetimes: {
    attached() {
      this.triggerEvent('loaded');
    }
  }
});
