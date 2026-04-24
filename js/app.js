// App Main Controller
(function() {
    const app = window.flowerApp;

    // Default Settings
    app.currentTool = 'pen';
    app.lineWidth = 3;
    app.uiMode = 'paint'; // 'paint' or 'slider'
    app.petalParams = {
        count: 5,
        dist: 13,
        tip: 120,
        reach: 75,
        width: 100,
        rotate: 54,
        size: 1.0
    };

    function init() {
        app.initCanvas();

        // 初期状態で中心に直径10mm(半径5mm=50units)の円を塗りつぶしで配置
        const cx = app.INTERNAL_SIZE / 2;
        const cy = app.INTERNAL_SIZE / 2;
        const radius = 5 * app.MM_TO_UNIT; // 5mm = 50units
        const points = [];
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push({
                x: cx + Math.cos(angle) * radius,
                y: cy + Math.sin(angle) * radius
            });
        }
        app.fixedStrokes.push({ points: points, width: app.lineWidth, fill: true });
        app.render();

        // UI Tool Events
        document.getElementById('tool-pen').addEventListener('click', () => setTool('pen'));
        document.getElementById('tool-eraser').addEventListener('click', () => setTool('eraser'));
        document.getElementById('tool-bucket').addEventListener('click', () => setTool('bucket'));
        
        const sizeSlider = document.getElementById('brush-size');
        const sizeVal = document.getElementById('size-val');
        sizeSlider.addEventListener('input', (e) => {
            app.lineWidth = parseInt(e.target.value);
            sizeVal.textContent = app.lineWidth;
        });

        // History Events
        document.getElementById('btn-undo').addEventListener('click', () => app.undo());
        document.getElementById('btn-redo').addEventListener('click', () => app.redo());
        document.getElementById('btn-clear').addEventListener('click', () => app.clearAll());

        // Export Events
        document.getElementById('btn-download-dxf').addEventListener('click', () => app.downloadDXF());
        document.getElementById('btn-download').addEventListener('click', () => app.downloadSVG());

        // Pointer Events for Canvas
        app.canvas.addEventListener('pointerdown', startDrawing);
        window.addEventListener('pointermove', moveDrawing);
        window.addEventListener('pointerup', stopDrawing);

        app.updateButtons();

        // Mode Switching
        const tabPaint = document.getElementById('tab-paint');
        const tabSlider = document.getElementById('tab-slider');
        const sidebar = document.getElementById('sidebar');
        const toolbar = document.querySelector('.toolbar');

        if (tabPaint && tabSlider) {
            tabPaint.addEventListener('click', () => {
                app.uiMode = 'paint';
                tabPaint.classList.add('active');
                tabSlider.classList.remove('active');
                sidebar.classList.add('hidden');
                document.querySelectorAll('.paint-only').forEach(el => el.classList.remove('hidden'));
                app.render();
            });

            tabSlider.addEventListener('click', () => {
                app.uiMode = 'slider';
                tabSlider.classList.add('active');
                tabPaint.classList.remove('active');
                sidebar.classList.remove('hidden');
                document.querySelectorAll('.paint-only').forEach(el => el.classList.add('hidden'));
                app.render();
            });
        }

        // Slider Controls
        const petalSlider = document.getElementById('petal-count');
        const petalVal = document.getElementById('petal-count-val');
        if (petalSlider) {
            petalSlider.addEventListener('input', (e) => {
                app.petalParams.count = parseInt(e.target.value);
                petalVal.textContent = app.petalParams.count;
                app.render();
            });
        }

        const setupSlider = (id, valId, paramName, isFloat = false) => {
            const slider = document.getElementById(id);
            const display = document.getElementById(valId);
            if (slider && display) {
                slider.addEventListener('input', (e) => {
                    const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
                    app.petalParams[paramName] = val;
                    display.textContent = val;
                    app.render();
                });
            }
        };

        setupSlider('petal-dist', 'petal-dist-val', 'dist');
        setupSlider('petal-tip', 'petal-tip-val', 'tip');
        setupSlider('petal-reach', 'petal-reach-val', 'reach');
        setupSlider('petal-width', 'petal-width-val', 'width');
        setupSlider('petal-rotate', 'petal-rotate-val', 'rotate');
        setupSlider('petal-size', 'petal-size-val', 'size', true);
    }

    function setTool(tool) {
        app.currentTool = tool;
        document.getElementById('tool-pen').classList.toggle('active', tool === 'pen');
        document.getElementById('tool-eraser').classList.toggle('active', tool === 'eraser');
        document.getElementById('tool-bucket').classList.toggle('active', tool === 'bucket');
    }

    function clampPos(pos) {
        return {
            x: Math.max(0, Math.min(app.INTERNAL_SIZE, pos.x)),
            y: Math.max(0, Math.min(app.INTERNAL_SIZE, pos.y))
        };
    }

    function startDrawing(e) {
        if (app.uiMode !== 'paint') return;
        if (e.button !== 0) return; // 左クリックのみ
        const pos = clampPos(app.getInternalPos(e));
        
        if (app.currentTool === 'bucket') {
            app.saveState();
            app.fills.push(pos);
            app.render();
            return;
        }

        app.isDrawing = true;
        if (app.currentTool === 'pen') {
            app.saveState();
            app.currentStroke = { points: [pos], width: app.lineWidth };
        } else {
            app.saveState();
            app.eraseAt(pos);
        }
        app.render();
    }

    function moveDrawing(e) {
        if (!app.isDrawing) return;
        const pos = clampPos(app.getInternalPos(e));
        if (app.currentTool === 'pen') {
            app.currentStroke.points.push(pos);
        } else {
            app.eraseAt(pos);
        }
        app.render();
    }

    function stopDrawing() {
        if (!app.isDrawing) return;
        app.isDrawing = false;
        if (app.currentStroke) {
            app.strokes.push(app.currentStroke);
            app.currentStroke = null;
        }
        app.render();
        app.updateButtons();
    }

    // Run on Load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
