// Canvas and Drawing Manager
window.flowerApp = window.flowerApp || {};

// Constants
window.flowerApp.INTERNAL_SIZE = 600;
window.flowerApp.MM_TO_UNIT = 10;
window.flowerApp.UNIT_TO_MM = 0.1;

// State
window.flowerApp.strokes = [];
window.flowerApp.fixedStrokes = []; // 消去・編集不可能な固定要素
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
    const allStrokes = [...this.strokes];
    if (this.currentStroke) allStrokes.push(this.currentStroke);

    // 描画範囲を枠内に制限
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(this.offsetX, this.offsetY, this.INTERNAL_SIZE * this.scale, this.INTERNAL_SIZE * this.scale);
    this.ctx.clip();

    // 塗りつぶしプレビューの描画 (重いため、必要な時のみ実行するか簡易化)
    if (this.fills && this.fills.length > 0) {
        const fCanvas = document.createElement('canvas');
        fCanvas.width = this.INTERNAL_SIZE;
        fCanvas.height = this.INTERNAL_SIZE;
        const fCtx = fCanvas.getContext('2d');
        
        fCtx.fillStyle = 'black';
        fCtx.strokeStyle = 'black';
        fCtx.lineCap = 'round';
        fCtx.lineJoin = 'round';

        // 固定要素とストロークを一時キャンバスに描画
        [...this.fixedStrokes, ...allStrokes].forEach(s => {
            if (!s.points || s.points.length === 0) return;
            fCtx.save();
            if (s.isEraser) {
                fCtx.globalCompositeOperation = 'destination-out';
            }
            fCtx.beginPath();
            this.drawSmoothedPath(fCtx, s.points, p => p.x, p => p.y);
            if (s.fill) { fCtx.closePath(); fCtx.fill(); }
            else { fCtx.lineWidth = s.width * 10; fCtx.stroke(); }
            fCtx.restore();
        });

        const fData = fCtx.getImageData(0, 0, this.INTERNAL_SIZE, this.INTERNAL_SIZE);
        this.fills.forEach(f => {
            this.floodFill(fData.data, this.INTERNAL_SIZE, Math.round(f.x), Math.round(f.y));
        });
        fCtx.putImageData(fData, 0, 0);
        this.lastFillData = fData; // 消しゴム判定用に保存

        // プレビューとしてメインキャンバスに合成
        this.ctx.globalAlpha = 1.0; 
        this.ctx.drawImage(fCanvas, 0, 0, this.INTERNAL_SIZE, this.INTERNAL_SIZE, this.offsetX, this.offsetY, this.INTERNAL_SIZE * this.scale, this.INTERNAL_SIZE * this.scale);
        this.ctx.globalAlpha = 1.0;
    } else {
        this.lastFillData = null;
    }

    // 固定要素の描画
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

    // ユーザー描画要素の描画
    allStrokes.forEach(stroke => {
        this.ctx.beginPath();
        this.drawSmoothedPath(this.ctx, stroke.points, p => this.offsetX + p.x * this.scale, p => this.offsetY + p.y * this.scale);
        
        if (stroke.fill) {
            this.ctx.closePath();
            this.ctx.fillStyle = '#000000';
            this.ctx.fill();
        } else {
            this.ctx.lineWidth = stroke.width * this.scale * 10;
            this.ctx.strokeStyle = stroke.isEraser ? '#ffffff' : '#000000'; // 消しゴムなら白で描画
            this.ctx.stroke();
        }
    });

    // スライダーモードの花びら描画
    if (this.uiMode === 'slider') {
        const { count, dist, tip, reach, width, rotate, size } = this.petalParams;
        const cx = this.INTERNAL_SIZE / 2;
        const cy = this.INTERNAL_SIZE / 2;
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
            // 二次ベジェ曲線: 基点 -> 膨らみ(制御点) -> 先端
            this.ctx.quadraticCurveTo(xReach, yHalfWidth * 2, xTip, 0);
            this.ctx.quadraticCurveTo(xReach, -yHalfWidth * 2, xBase, 0);
            
            this.ctx.fillStyle = '#000000';
            this.ctx.fill();
            this.ctx.restore();
        }
    }

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

// 塗りつぶし（シード点）の消去のみを行う関数
window.flowerApp.eraseFillOnly = function(pos) {
    if (!this.lastFillData) return;

    const radius = this.lineWidth * 30;
    const size = this.INTERNAL_SIZE;
    const data = this.lastFillData.data;
    let changed = false;

    // 1. 直接シード点を消す判定
    const originalFillCount = this.fills.length;
    this.fills = this.fills.filter(f => Math.hypot(f.x - pos.x, f.y - pos.y) > radius);
    if (this.fills.length !== originalFillCount) changed = true;

    // 2. 塗りつぶされた「面」に触れた場合の連動消去
    // 消しゴムの範囲内のいずれかのピクセルが塗りつぶされているか確認
    let hitX = -1, hitY = -1;
    for (let dy = -radius; dy <= radius; dy += 10) { // パフォーマンスのため粗めにスキャン
        for (let dx = -radius; dx <= radius; dx += 10) {
            if (dx*dx + dy*dy > radius*radius) continue;
            const x = Math.round(pos.x + dx);
            const y = Math.round(pos.y + dy);
            if (x >= 0 && x < size && y >= 0 && y < size) {
                if (data[(y * size + x) * 4 + 3] > 128) {
                    hitX = x; hitY = y;
                    break;
                }
            }
        }
        if (hitX !== -1) break;
    }

    if (hitX !== -1) {
        // ヒットしたエリアの連結成分を探索し、そこに含まれるシード点をすべて削除
        const stack = [[hitX, hitY]];
        const visited = new Uint8Array(size * size);
        const seedsToRemove = new Set();
        
        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            if (cx < 0 || cx >= size || cy < 0 || cy >= size) continue;
            const idx = cy * size + cx;
            if (visited[idx] || data[idx * 4 + 3] <= 128) continue;
            visited[idx] = 1;

            // このエリアが塗りつぶされているなら、その中のシードを探す
            // (効率のため、すべてのシードについてvisitedを後でチェックする)
            if (stack.length < 5000) { // 探索範囲の安全制限
                stack.push([cx + 2, cy], [cx - 2, cy], [cx, cy + 2], [cx, cy - 2]); // 粗めに探索
            }
        }

        const prevCount = this.fills.length;
        this.fills = this.fills.filter(f => {
            const fidx = Math.round(f.y) * size + Math.round(f.x);
            return !visited[fidx];
        });
        if (this.fills.length !== prevCount) changed = true;
    }

    if (changed) {
        this.render();
    }
};
