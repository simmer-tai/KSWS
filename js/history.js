// History (Undo/Redo) Manager
window.flowerApp = window.flowerApp || {};

window.flowerApp.undoStack = [];
window.flowerApp.redoStack = [];

window.flowerApp.saveState = function() {
    const state = {
        strokes: this.strokes,
        eraserStrokes: this.eraserStrokes || [],
        fills: this.fills || []
    };
    this.undoStack.push(JSON.stringify(state));
    this.redoStack = [];
    this.updateButtons();
};

window.flowerApp.undo = function() {
    if (this.undoStack.length === 0) return;
    const currentState = {
        strokes: this.strokes,
        eraserStrokes: this.eraserStrokes || [],
        fills: this.fills || []
    };
    this.redoStack.push(JSON.stringify(currentState));
    
    const prevState = JSON.parse(this.undoStack.pop());
    this.strokes = prevState.strokes;
    this.eraserStrokes = prevState.eraserStrokes || [];
    this.fills = prevState.fills;
    
    this.render();
    this.updateButtons();
};

window.flowerApp.redo = function() {
    if (this.redoStack.length === 0) return;
    const currentState = {
        strokes: this.strokes,
        eraserStrokes: this.eraserStrokes || [],
        fills: this.fills || []
    };
    this.undoStack.push(JSON.stringify(currentState));
    
    const nextState = JSON.parse(this.redoStack.pop());
    this.strokes = nextState.strokes;
    this.eraserStrokes = nextState.eraserStrokes || [];
    this.fills = nextState.fills;
    
    this.render();
    this.updateButtons();
};

window.flowerApp.clearAll = function() {
    if (confirm('すべて消去しますか？')) {
        this.saveState();
        this.strokes = [];
        this.eraserStrokes = [];
        this.fills = [];
        this.render();
    }
};

window.flowerApp.updateButtons = function() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = this.undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = this.redoStack.length === 0;
};
