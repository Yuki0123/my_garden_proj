/**
 * GardenRenderer.js - 畑エディタの描画ロジック
 * Canvas上への全ての描画を担当
 */

const GardenRenderer = {
    /**
     * メイン描画ループ
     */
    draw() {
        const state = GardenState;
        const selectedDate = new Date(state.currentDate.value);

        // Canvas クリア
        state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

        // グリッドを描画
        this.drawGrid();

        // 本日のお世話ログアイコンを描画
        if (state.maintenanceLogs && Array.isArray(state.maintenanceLogs)) {
            state.maintenanceLogs.forEach(log => {
                const x = log.col * state.cellSize;
                const y = log.row * state.cellSize;
                
                // タスク種別ごとに色を分ける
                state.ctx.fillStyle = (log.task_type === 'watering') ? '#00bfff' : '#ffcc00';
                state.ctx.beginPath();
                state.ctx.arc(
                    x + state.cellSize / 2,
                    y + state.cellSize / 2,
                    4, 0, Math.PI * 2
                );
                state.ctx.fill();
            });
        }

        // 作物を描画（日付条件で表示/非表示を判定）
        state.crops.forEach(crop => {
            const pAt = new Date(crop.planted_at);
            const hAt = crop.harvested_at ? new Date(crop.harvested_at) : null;
            
            // 植え付け日が今日以前 かつ (収穫されていない または 収穫日が今日より先)
            if (pAt <= selectedDate && (!hAt || selectedDate < hAt)) {
                this.drawCrop(crop);
            }
        });

        // エディタプレビューを描画（編集中の場合）
        if (state.editor.active) {
            this.drawPreview();
        }
    },

    /**
     * グリッドを描画
     */
    drawGrid() {
        const state = GardenState;

        for (let r = 0; r < state.rows; r++) {
            const isAlt = Math.floor(r / 30) % 2 === 0;
            for (let c = 0; c < state.cols; c++) {
                const x = c * state.cellSize;
                const y = r * state.cellSize;
                const plot = state.plotData[`${r}-${c}`];

                // 色を決定（畝かどうか）
                let fillColor = (plot && plot.is_bed) ? '#8b45136e' : (isAlt ? '#cfd7be' : '#e5ead8');

                state.ctx.fillStyle = fillColor;
                state.ctx.fillRect(x, y, state.cellSize-0.2, state.cellSize-0.2);
            }
        }
    },

    /**
     * 個別の作物を描画
     */
    drawCrop(crop) {
        const state = GardenState;
        
        if (!crop.icon_url) return;

        const img = new Image();
        img.src = crop.icon_url;

        // 画像読み込み完了後に描画
        img.onload = () => {
            const iw = img.width;
            const ih = img.height;
            const aspect = iw / ih;

            // 1マス 10cm の設定
            const cmPerPlot = 10;
            const spacingPx = (crop.spacing_cm / cmPerPlot) * state.cellSize*1.2;

            const areaX = crop.col * state.cellSize;
            const areaY = crop.row * state.cellSize;
            const areaW = crop.width * state.cellSize;
            const areaH = crop.height * state.cellSize;

            // デバッグ用：作物の占有エリアを赤い枠で表示
            //state.ctx.strokeStyle = 'red';
            //state.ctx.strokeRect(areaX, areaY, areaW, areaH);

            const iconH = state.cellSize * 2.5;
            const iconW = iconH * aspect;

            if (crop.planting_method === 'dense') {
                // 【筋蒔き/密植】間隔に合わせて並べて描画
                for (let y = spacingPx / 2; y < areaH; y += spacingPx) {
                    for (let x = spacingPx / 2; x < areaW; x += spacingPx) {
                        const targetX = areaX + x - (iconW / 2);
                        const targetY = areaY + y - (iconH / 2);

                        // エリアからはみ出さないかチェック
                        if (x + iconW / 2 <= areaW && y + iconH / 2 <= areaH) {
                            state.ctx.drawImage(img, targetX, targetY, iconW, iconH);
                        }
                    }
                }
            } else {
                // 【個体植え】エリアの中央に大きく1つ描画
                let drawW, drawH;
                if (areaW / areaH > aspect) {
                    drawH = areaH ;
                    drawW = drawH * aspect;
                } else {
                    drawW = areaW ;
                    drawH = drawW / aspect;
                }

                const targetX = areaX + (areaW - drawW) / 2;
                const targetY = areaY + (areaH - drawH) / 2;
                state.ctx.drawImage(img, targetX, targetY, drawW, drawH);
            }
        };
    },

    /**
     * 編集中のプレビュー枠を描画
     */
    drawPreview() {
        const state = GardenState;
        const x = state.editor.c * state.cellSize;
        const y = state.editor.r * state.cellSize;
        const w = state.editor.w * state.cellSize;
        const h = state.editor.h * state.cellSize;

        // 半透明のエリア
        state.ctx.fillStyle = 'rgba(52, 152, 219, 0.4)';
        state.ctx.fillRect(x, y, w, h);

        // 青い枠
        state.ctx.strokeStyle = '#3498db';
        state.ctx.lineWidth = 2;
        state.ctx.strokeRect(x, y, w, h);

        // リサイズハンドル（右下）
        state.ctx.fillStyle = '#fff';
        state.ctx.fillRect(x + w - 10, y + h - 10, 20, 20);
        state.ctx.strokeRect(x + w - 10, y + h - 10, 20, 20);
    }
};
