// SVG Export Manager
window.flowerApp = window.flowerApp || {};

window.flowerApp.getOutlinePaths = function() {
    const size = this.INTERNAL_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // シルエットを描画（太さを持たせる）
    ctx.fillStyle = 'black';
    ctx.strokeStyle = 'black';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // 固定要素（中心円など）を描画
    this.fixedStrokes.forEach(s => {
        if (!s.points || s.points.length === 0) return;
        ctx.beginPath();
        
        const scale = (this.uiMode === 'slider') ? this.petalParams.size : 1.0;
        const cx = 300, cy = 300;
        const getScaledX = (p) => cx + (p.x - cx) * scale;
        const getScaledY = (p) => cy + (p.y - cy) * scale;

        this.drawSmoothedPath(ctx, s.points, getScaledX, getScaledY);
        
        if (s.fill) {
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.lineWidth = s.width * 10;
            ctx.stroke();
        }
    });

    // ユーザーが描いた線をシルエットに含める
    this.strokes.forEach(s => {
        if (!s.points || s.points.length === 0) return;
        ctx.beginPath();
        this.drawSmoothedPath(ctx, s.points, p => p.x, p => p.y);
        if (s.fill) {
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.lineWidth = s.width * 10;
            ctx.stroke();
        }
    });

    // スライダーモードの花びらをシルエットに含める
    if (this.uiMode === 'slider') {
        const { count, dist, tip, reach, width, rotate, size } = this.petalParams;
        const cx = this.INTERNAL_SIZE / 2;
        const cy = this.INTERNAL_SIZE / 2;
        const rotateRad = (rotate * Math.PI) / 180;

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + rotateRad;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            
            ctx.beginPath();
            const xBase = dist * size;
            const xTip = (dist + tip) * size;
            const xReach = (dist + reach) * size;
            const yHalfWidth = width * 0.5 * size;

            ctx.moveTo(xBase, 0);
            ctx.quadraticCurveTo(xReach, yHalfWidth * 2, xTip, 0);
            ctx.quadraticCurveTo(xReach, -yHalfWidth * 2, xBase, 0);
            ctx.fill();
            ctx.restore();
        }
    }

    // --- ペンと消しゴムを時系列順にインターリーブして描画 ---
    const layers = [
        ...this.strokes.map(s => ({ ...s, type: 'pen' })),
        ...this.eraserStrokes.map(s => ({ ...s, type: 'eraser' }))
    ];
    layers.sort((a, b) => (a.id || 0) - (b.id || 0));

    layers.forEach(layer => {
        if (!layer.points || layer.points.length === 0) return;
        if (layer.type === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }

        ctx.beginPath();
        this.drawSmoothedPath(ctx, layer.points, p => p.x, p => p.y);
        if (layer.fill) {
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.lineWidth = layer.width * 10;
            ctx.stroke();
        }
    });
    ctx.globalCompositeOperation = 'source-over';

    // --- 消去された fixedStrokes をシルエットに復元 ---
    this.fixedStrokes.forEach(s => {
        if (!s.points || s.points.length === 0) return;
        ctx.beginPath();
        this.drawSmoothedPath(ctx, s.points, p => p.x, p => p.y);
        if (s.fill) {
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.lineWidth = s.width * 10;
            ctx.stroke();
        }
    });

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;

    // 塗りつぶしツール（バケツ）の処理を適用
    if (this.fills && this.fills.length > 0) {
        this.fills.forEach(f => {
            this.floodFill(data, size, Math.round(f.x), Math.round(f.y));
        });
        ctx.putImageData(imgData, 0, 0);
    }

    const getAlpha = (x, y) => {
        if (x < 0 || x >= size || y < 0 || y >= size) return 0;
        return data[(y * size + x) * 4 + 3];
    };

    const visited = new Uint8Array(size * size);
    const paths = [];

    // Moore-Neighbor Tracing
    const trace = (startX, startY) => {
        let currX = startX, currY = startY;
        let prevX = startX - 1, prevY = startY;
        const path = [];
        const neighbors = [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]];

        do {
            path.push({x: currX, y: currY});
            visited[currY * size + currX] = 1;
            let startDir = 0;
            for(let i=0; i<8; i++) {
                if (currX + neighbors[i][0] === prevX && currY + neighbors[i][1] === prevY) {
                    startDir = (i + 1) % 8;
                    break;
                }
            }
            let found = false;
            for(let i=0; i<8; i++) {
                const dir = (startDir + i) % 8;
                const nextX = currX + neighbors[dir][0];
                const nextY = currY + neighbors[dir][1];
                if (getAlpha(nextX, nextY) > 128) {
                    prevX = currX; prevY = currY;
                    currX = nextX; currY = nextY;
                    found = true;
                    break;
                }
            }
            if (!found) break;
        } while ((currX !== startX || currY !== startY) && path.length < 5000);
        return path;
    };

    for(let y=0; y<size; y++) {
        for(let x=0; x<size; x++) {
            if (getAlpha(x,y) > 128 && !visited[y * size + x]) {
                if (getAlpha(x-1, y) <= 128) {
                    const p = trace(x, y);
                    if (p.length > 3) paths.push(this.simplifyPath(p, 0.5));
                } else {
                    visited[y * size + x] = 1;
                }
            }
        }
    }
    return paths;
};

// 指定された座標から境界線（アルファ値>128）にぶつかるまで塗りつぶす（スタック走査形式）
window.flowerApp.floodFill = function(data, size, startX, startY) {
    const stack = [[startX, startY]];
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

        // 上下左右の4近傍をスタックに追加
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
};

// パスの簡略化 (Douglas-Peucker)
window.flowerApp.simplifyPath = function(points, epsilon) {
    if (points.length <= 2) return points;
    const findMaxDist = (pts) => {
        let maxDist = 0, index = 0;
        const start = pts[0], end = pts[pts.length - 1];
        for(let i=1; i<pts.length - 1; i++) {
            const p = pts[i];
            const dx = end.x - start.x, dy = end.y - start.y;
            const dist = (dx === 0 && dy === 0) ? Math.hypot(p.x-start.x, p.y-start.y) :
                Math.abs(dy*p.x - dx*p.y + end.x*start.y - end.y*start.x) / Math.hypot(dx, dy);
            if (dist > maxDist) { maxDist = dist; index = i; }
        }
        return { dist: maxDist, index: index };
    };
    const res = findMaxDist(points);
    if (res.dist > epsilon) {
        const left = this.simplifyPath(points.slice(0, res.index + 1), epsilon);
        const right = this.simplifyPath(points.slice(res.index), epsilon);
        return left.slice(0, left.length - 1).concat(right);
    }
    return [points[0], points[points.length - 1]];
};

window.flowerApp.downloadSVG = function() {
    const outlinedPaths = this.getOutlinePaths();
    const cx = 30, cy = 30, sw = 2.5, sh = 5;
    const slit = `<rect x="${cx - sw/2}" y="${cy - sh/2}" width="${sw}" height="${sh}" fill="none" stroke="#ff0000" stroke-width="0.1" />`;

    const paths = outlinedPaths.map(points => {
        const d = points.map((p, i) => `${i===0?'M':'L'}${(p.x*0.1).toFixed(3)} ${(p.y*0.1).toFixed(3)}`).join(' ') + 'Z';
        return `<path d="${d}" fill="none" stroke="#000000" stroke-width="0.1" />`;
    }).join('\n');

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="60mm" viewBox="0 0 60 60">
  <title>Flower Outline Export</title>
  ${slit}
  ${paths}
</svg>`;
    this.saveFile(new Blob([svg], {type:'image/svg+xml;charset=utf-8'}), 'flower_pro.svg');
};

window.flowerApp.downloadDXF = function() {
    const outlinedPaths = this.getOutlinePaths();
    const CRLF = "\r\n";
    
    // Header
    let dxf = "0" + CRLF + "SECTION" + CRLF + "2" + CRLF + "HEADER" + CRLF;
    dxf += "9" + CRLF + "$ACADVER" + CRLF + "1" + CRLF + "AC1009" + CRLF; // AutoCAD R12
    dxf += "0" + CRLF + "ENDSEC" + CRLF;
    
    // Entities
    dxf += "0" + CRLF + "SECTION" + CRLF + "2" + CRLF + "ENTITIES" + CRLF;

    const addPolyline = (points, layer, closed) => {
        let lines = "0" + CRLF + "POLYLINE" + CRLF;
        lines += "8" + CRLF + layer + CRLF;
        lines += "66" + CRLF + "1" + CRLF; // Entities follow
        lines += "70" + CRLF + (closed ? "1" : "0") + CRLF;
        
        points.forEach(p => {
            lines += "0" + CRLF + "VERTEX" + CRLF;
            lines += "8" + CRLF + layer + CRLF;
            lines += "10" + CRLF + p.x.toFixed(4) + CRLF;
            lines += "20" + CRLF + p.y.toFixed(4) + CRLF;
        });
        
        lines += "0" + CRLF + "SEQEND" + CRLF;
        lines += "8" + CRLF + layer + CRLF;
        return lines;
    };

    // スリット (Layer: Slit)
    const sw = 2.5, sh = 5, cx = 30, cy = 30;
    const slit = [
        {x: cx - sw/2, y: 60 - (cy - sh/2)},
        {x: cx + sw/2, y: 60 - (cy - sh/2)},
        {x: cx + sw/2, y: 60 - (cy + sh/2)},
        {x: cx - sw/2, y: 60 - (cy + sh/2)}
    ];
    dxf += addPolyline(slit, "Slit", true);

    // 外周パス (Layer: Outline)
    outlinedPaths.forEach(points => {
        const mmPoints = points.map(p => ({
            x: p.x * 0.1,
            y: 60 - (p.y * 0.1) // Y軸反転
        }));
        dxf += addPolyline(mmPoints, "Outline", true);
    });

    dxf += "0" + CRLF + "ENDSEC" + CRLF + "0" + CRLF + "EOF" + CRLF;

    this.saveFile(new Blob([dxf], {type:'text/plain;charset=utf-8'}), 'flower_pro.dxf');
};

// ヘルパー: ファイル保存ロジックの改善
window.flowerApp.saveFile = function(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    a.style.display = 'none';
    a.href = url; 
    a.download = filename;
    document.body.appendChild(a); 
    
    // 確実にユーザーアクションとして発火させる
    a.click(); 

    // URLの開放を10秒後まで大幅に遅延（または開放しない）
    // ブラウザがファイルをディスクに書き込む時間を十分に確保
    setTimeout(() => {
        if (a && a.parentNode) {
            document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
    }, 10000); 
};
