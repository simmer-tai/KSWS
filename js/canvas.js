// Canvas and Drawing Manager
window.flowerApp = window.flowerApp || {};

// Constants
window.flowerApp.INTERNAL_SIZE = 600;
window.flowerApp.MM_TO_UNIT = 10;
window.flowerApp.UNIT_TO_MM = 0.1;

// State
window.flowerApp.strokes = [];
window.flowerApp.eraserStrokes = []; // 消しゴムの軌跡（白）
window.flowerApp.fixedStrokes = []; // 消去・編集不可能な固定要素
window.flowerApp.strokeCounter = 0; // 重なり順管理用のカウンター
window.flowerApp.fills = [];        // 塗りつぶしのシード点 [{x, y}]
window.flowerApp.scale = 1;
window.flowerApp.offsetX = 0;
window.flowerApp.offsetY = 0;
window.flowerApp.isDrawing = false;
window.flowerApp.currentStroke = null;
window.flowerApp.uiMode = 'paint';
window.flowerApp.petalParams = {
    count: 5,
    dist: 13,
    tip: 120,
    reach: 75,
    width: 100,
    rotate: 54,
    size: 1.0
};

window.flowerApp.initCanvas = function() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('canvas-container');
    
    window.addEventListener('resize', () => this.resize());
    this.resize();
};

window.flowerApp.resize = function() {
    if (!this.canvas || !this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.canvas.width = w;
    this.canvas.height = h;

    const margin = 0.8;
    this.scale = Math.min(w * margin / this.INTERNAL_SIZE, h * margin / this.INTERNAL_SIZE);
    this.offsetX = (w - this.INTERNAL_SIZE * this.scale) / 2;
    this.offsetY = (h - this.INTERNAL_SIZE * this.scale) / 2;

    this.render();
};

window.flowerApp.getInternalPos = function(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left - this.offsetX) / this.scale,
        y: (e.clientY - rect.top - this.offsetY) / this.scale
    };
};

// 二次ベジェ曲線を用いた滑らかな描画ヘルパー
window.flowerApp.drawSmoothedPath = function(ctx, points, getX, getY) {
    if (!points || points.length === 0) return;
    
    const p0 = points[0];
    ctx.moveTo(getX(p0), getY(p0));
    
    if (points.length === 2) {
        const p1 = points[1];
        ctx.lineTo(getX(p1), getY(p1));
    } else if (points.length > 2) {
        for (let i = 1; i < points.length - 1; i++) {
            const pCurrent = points[i];
            const pNext = points[i + 1];
            const xc = (getX(pCurrent) + getX(pNext)) / 2;
            const yc = (getY(pCurrent) + getY(pNext)) / 2;
            ctx.quadraticCurveTo(getX(pCurrent), getY(pCurrent), xc, yc);
        }
        // 終点へ直線で繋ぐ
        const pLast = points[points.length - 1];
        ctx.lineTo(getX(pLast), getY(pLast));
    }
};

window.flowerApp.render = function() {
    if (!this.ctx) return;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // --- ガイド枠の描画 ---
    // エリア外を少し暗くする (シャドウ)
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    // 上
    this.ctx.fillRect(0, 0, this.canvas.width, this.offsetY);
    // 下
    this.ctx.fillRect(0, this.offsetY + this.INTERNAL_SIZE * this.scale, this.canvas.width, this.canvas.height);
    // 左
    this.ctx.fillRect(0, this.offsetY, this.offsetX, this.INTERNAL_SIZE * this.scale);
    // 右
    this.ctx.fillRect(this.offsetX + this.INTERNAL_SIZE * this.scale, this.offsetY, this.canvas.width, this.INTERNAL_SIZE * this.scale);

    // Guide Frame (60x60mm)
    this.ctx.lineWidth = 2; // 少し太くする
    this.ctx.strokeStyle = '#cbd5e1'; // 明るいグレー
    this.ctx.setLineDash([10, 5]); // 長めの点線
    this.ctx.strokeRect(this.offsetX, this.offsetY, this.INTERNAL_SIZE * this.scale, this.INTERNAL_SIZE * this.scale);
    this.ctx.setLineDash([]);
    
    // 枠線をさらに強調 (細い実線)
    this.ctx.lineWidth = 0.5;
    this.ctx.strokeStyle = '#94a3b8';
    this.ctx.strokeRect(this.offsetX, this.offsetY, this.INTERNAL_SIZE * this.scale, this.INTERNAL_SIZE * this.scale);

    // Slit (2.5mm x 5mm = 25 x 50 units)
    const sw = 2.5 * this.MM_TO_UNIT;
    const sh = 5 * this.MM_TO_UNIT;
    this.ctx.lineWidth = 1; // 太さを1に固定
    this.ctx.strokeStyle = '#94a3b8';
    this.ctx.strokeRect(
        this.offsetX + (this.INTERNAL_SIZE - sw) / 2 * this.scale,
        this.offsetY + (this.INTERNAL_SIZE - sh) / 2 * this.scale,
        sw * this.scale,
        sh * this.scale
    );

    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // --- 描画のメイン処理 ---
    // ペンと消しゴムのストロークをID順にインターリーブするためのリストを作成
    const layers = [
        ...this.strokes.map(s => ({ ...s, type: 'pen' })),
        ...this.eraserStrokes.map(s => ({ ...s, type: 'eraser' }))
    ];
    if (this.currentStroke) layers.push({ ...this.currentStroke, type: 'pen' });
    if (this.currentEraserStroke) layers.push({ ...this.currentEraserStroke, type: 'eraser' });

    // ID順にソート（時系列順の重なりを再現）
    layers.sort((a, b) => (a.id || 0) - (b.id || 0));

    // 描画範囲を枠内に制限
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(this.offsetX, this.offsetY, this.INTERNAL_SIZE * this.scale, this.INTERNAL_SIZE * this.scale);
    this.ctx.clip();

    // 1. fixedStrokes（ベース描画）
    this.fixedStrokes.forEach(stroke => {
        this.ctx.beginPath();
        const s = (this.uiMode === 'slider') ? this.petalParams.size : 1.0;
        const cx = 300, cy = 300;
        const getScaledX = (p) => this.offsetX + (cx + (p.x - cx) * s) * this.scale;
        const getScaledY = (p) => this.offsetY + (cy + (p.y - cy) * s) * this.scale;
        this.drawSmoothedPath(this.ctx, stroke.points, getScaledX, getScaledY);
        if (stroke.fill) {
            this.ctx.closePath();
            this.ctx.fillStyle = '#000000';
            this.ctx.fill();
        } else {
            this.ctx.lineWidth = stroke.width * this.scale * 10;
            this.ctx.strokeStyle = '#000000';
            this.ctx.stroke();
        }
    });

    // 2. 塗りつぶしプレビューの描画
    if (this.fills && this.fills.length > 0) {
        const fCanvas = document.createElement('canvas');
        fCanvas.width = this.INTERNAL_SIZE;
        fCanvas.height = this.INTERNAL_SIZE;
        const fCtx = fCanvas.getContext('2d');
        fCtx.fillStyle = 'black';
        fCtx.strokeStyle = 'black';
        fCtx.lineCap = 'round';
        fCtx.lineJoin = 'round';

        // 境界判定用に、時系列順に描画（消しゴムを反映）
        const silhouetteLayers = [
            ...this.strokes.map(s => ({ ...s, type: 'pen' })),
            ...this.eraserStrokes.map(s => ({ ...s, type: 'eraser' }))
        ];
        if (this.currentStroke) silhouetteLayers.push({ ...this.currentStroke, type: 'pen' });
        if (this.currentEraserStroke) silhouetteLayers.push({ ...this.currentEraserStroke, type: 'eraser' });
        silhouetteLayers.sort((a, b) => (a.id || 0) - (b.id || 0));

        // fixedStrokes は常にベースとして描画
        this.fixedStrokes.forEach(s => {
            if (!s.points || s.points.length === 0) return;
            fCtx.beginPath();
            this.drawSmoothedPath(fCtx, s.points, p => p.x, p => p.y);
            if (s.fill) { fCtx.closePath(); fCtx.fill(); }
            else { fCtx.lineWidth = s.width * 10; fCtx.stroke(); }
        });

        // インターリーブ描画
        silhouetteLayers.forEach(layer => {
            if (!layer.points || layer.points.length === 0) return;
            if (layer.type === 'eraser') fCtx.globalCompositeOperation = 'destination-out';
            else fCtx.globalCompositeOperation = 'source-over';

            fCtx.beginPath();
            this.drawSmoothedPath(fCtx, layer.points, p => p.x, p => p.y);
            if (layer.fill) { fCtx.closePath(); fCtx.fill(); }
            else { fCtx.lineWidth = layer.width * 10; fCtx.stroke(); }
        });
        fCtx.globalCompositeOperation = 'source-over';

        const fData = fCtx.getImageData(0, 0, this.INTERNAL_SIZE, this.INTERNAL_SIZE);
        this.fills.forEach(f => {
            this.floodFill(fData.data, this.INTERNAL_SIZE, Math.round(f.x), Math.round(f.y));
        });
        fCtx.putImageData(fData, 0, 0);

        this.ctx.drawImage(fCanvas, 0, 0, this.INTERNAL_SIZE, this.INTERNAL_SIZE, this.offsetX, this.offsetY, this.INTERNAL_SIZE * this.scale, this.INTERNAL_SIZE * this.scale);
    }

    // 3. スライダーモードの花びら描画
    if (this.uiMode === 'slider') {
        const { count, dist, tip, reach, width, rotate, size } = this.petalParams;
        const cx = this.INTERNAL_SIZE / 2, cy = this.INTERNAL_SIZE / 2;
        const rotateRad = (rotate * Math.PI) / 180;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + rotateRad;
            this.ctx.save();
            this.ctx.translate(this.offsetX + cx * this.scale, this.offsetY + cy * this.scale);
            this.ctx.rotate(angle);
            this.ctx.beginPath();
            const xBase = (dist * size) * this.scale;
            const xTip = ((dist + tip) * size) * this.scale;
            const xReach = ((dist + reach) * size) * this.scale;
            const yHalfWidth = (width * 0.5 * size) * this.scale;
            this.ctx.moveTo(xBase, 0);
            this.ctx.quadraticCurveTo(xReach, yHalfWidth * 2, xTip, 0);
            this.ctx.quadraticCurveTo(xReach, -yHalfWidth * 2, xBase, 0);
            this.ctx.fillStyle = '#000000';
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    // 4. インターリーブされたストロークと消しゴムのメイン描画（ID順）
    layers.forEach(layer => {
        this.ctx.beginPath();
        this.drawSmoothedPath(this.ctx, layer.points, p => this.offsetX + p.x * this.scale, p => this.offsetY + p.y * this.scale);
        this.ctx.lineWidth = layer.width * this.scale * 10;
        this.ctx.strokeStyle = (layer.type === 'eraser') ? '#ffffff' : '#000000';
        this.ctx.stroke();
    });

    // 5. 消しゴムで消された fixedStrokes を保護（最終復元）
    this.fixedStrokes.forEach(stroke => {
        this.ctx.beginPath();
        const s = (this.uiMode === 'slider') ? this.petalParams.size : 1.0;
        const cx = 300, cy = 300;
        const getScaledX = (p) => this.offsetX + (cx + (p.x - cx) * s) * this.scale;
        const getScaledY = (p) => this.offsetY + (cy + (p.y - cy) * s) * this.scale;
        this.drawSmoothedPath(this.ctx, stroke.points, getScaledX, getScaledY);
        if (stroke.fill) {
            this.ctx.closePath();
            this.ctx.fillStyle = '#000000';
            this.ctx.fill();
        } else {
            this.ctx.lineWidth = stroke.width * this.scale * 10;
            this.ctx.strokeStyle = '#000000';
            this.ctx.stroke();
        }
    });

    this.ctx.restore();

    // 寸法の描画 (60mm x 60mm)
    this.ctx.save();
    const fontSize = Math.max(10, 14 * this.scale);
    this.ctx.font = `${fontSize}px Inter`;
    this.ctx.fillStyle = '#64748b';
    this.ctx.strokeStyle = '#94a3b8';
    this.ctx.lineWidth = Math.max(1, 1 * this.scale);

    const canvasW = this.INTERNAL_SIZE * this.scale;
    const canvasH = this.INTERNAL_SIZE * this.scale;
    const dimMargin = 30 * this.scale;
    const tickSize = 5 * this.scale;

    // 下辺 (X軸)
    this.ctx.beginPath();
    this.ctx.moveTo(this.offsetX, this.offsetY + canvasH + dimMargin);
    this.ctx.lineTo(this.offsetX + canvasW, this.offsetY + canvasH + dimMargin);
    // 端線
    this.ctx.moveTo(this.offsetX, this.offsetY + canvasH + dimMargin - tickSize);
    this.ctx.lineTo(this.offsetX, this.offsetY + canvasH + dimMargin + tickSize);
    this.ctx.moveTo(this.offsetX + canvasW, this.offsetY + canvasH + dimMargin - tickSize);
    this.ctx.lineTo(this.offsetX + canvasW, this.offsetY + canvasH + dimMargin + tickSize);
    this.ctx.stroke();
    
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText('60mm', this.offsetX + canvasW / 2, this.offsetY + canvasH + dimMargin + tickSize + 2);

    // 左辺 (Y軸)
    this.ctx.beginPath();
    this.ctx.moveTo(this.offsetX - dimMargin, this.offsetY);
    this.ctx.lineTo(this.offsetX - dimMargin, this.offsetY + canvasH);
    // 端線
    this.ctx.moveTo(this.offsetX - dimMargin - tickSize, this.offsetY);
    this.ctx.lineTo(this.offsetX - dimMargin + tickSize, this.offsetY);
    this.ctx.moveTo(this.offsetX - dimMargin - tickSize, this.offsetY + canvasH);
    this.ctx.lineTo(this.offsetX - dimMargin + tickSize, this.offsetY + canvasH);
    this.ctx.stroke();

    this.ctx.save();
    this.ctx.translate(this.offsetX - dimMargin - tickSize - 5, this.offsetY + canvasH / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText('60mm', 0, 0);
    this.ctx.restore();

    this.ctx.restore();

    // --- マスキング処理 ---
    // スリット部分を背景色で塗りつぶして線を隠す
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(
        this.offsetX + (this.INTERNAL_SIZE - sw) / 2 * this.scale,
        this.offsetY + (this.INTERNAL_SIZE - sh) / 2 * this.scale,
        sw * this.scale,
        sh * this.scale
    );

    // ガイドとしてのスリット枠を再描画（隠れないように）
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = '#94a3b8';
    this.ctx.strokeRect(
        this.offsetX + (this.INTERNAL_SIZE - sw) / 2 * this.scale,
        this.offsetY + (this.INTERNAL_SIZE - sh) / 2 * this.scale,
        sw * this.scale,
        sh * this.scale
    );

    // --- 消しゴムカーソルの描画 ---
    if (this.currentTool === 'eraser' && this.mousePos) {
        this.ctx.save();
        this.ctx.beginPath();
        const r = this.lineWidth * 30 * this.scale;
        this.ctx.arc(this.offsetX + this.mousePos.x * this.scale, this.offsetY + this.mousePos.y * this.scale, r, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'; // 薄い赤
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        this.ctx.restore();
    }
};

// 指定された座標から境界線（アルファ値>128）にぶつかるまで塗りつぶす（スタック走査形式）
window.flowerApp.floodFill = function(data, size, startX, startY) {
    const stack = [[Math.round(startX), Math.round(startY)]];
    const fillAlpha = 255;
    const threshold = 128;
    const visited = new Uint8ClampedArray(size * size);

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        
        const idx = y * size + x;
        if (visited[idx]) continue;
        
        const pixelIdx = idx * 4 + 3;
        if (data[pixelIdx] > threshold) continue;

        data[pixelIdx] = fillAlpha;
        visited[idx] = 1;

        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
};
