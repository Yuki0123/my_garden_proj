/**
 * GardenMouseEvents.js - 畑エディタのマウスイベント処理
 * Canvas上のクリック、ドラッグ、リサイズを担当
 */

const GardenMouseEvents = {
    /**
     * マウス座標をグリッド座標に変換
     */
    getMousePos(e) {
        const state = GardenState;
        const rect = state.canvas.getBoundingClientRect();
        return {
            c: Math.floor((e.clientX - rect.left) / state.cellSize),
            r: Math.floor((e.clientY - rect.top) / state.cellSize)
        };
    },

    /**
     * マウスダウンイベント
     */
    handleMouseDown(e) {
        const state = GardenState;
        const pos = this.getMousePos(e);

        // ===== 収穫モード =====
        if (state.isHarvestMode) {
            const targetCrop = this.findCropAt(pos);
            if (targetCrop) {
                GardenAPI.harvestCrop(targetCrop.id);
            }
            return;
        }

        // ===== 作物検索（日付フィルタリング付き） =====
        const crop = state.crops.find(c => {
            // 座標が範囲内か確認
            const inRange = pos.r >= c.row && pos.r < c.row + c.height &&
                           pos.c >= c.col && pos.c < c.col + c.width;
            
            if (!inRange) return false;
            
            // 日付条件で表示されているか確認（重要！）
            const pAt = c.planted_at.slice(0, 10);
            const hAt = c.harvested_at ? c.harvested_at.slice(0, 10) : null;
            const isVisible = pAt <= state.selectedDate && (!hAt || state.selectedDate < hAt);
            
            return isVisible;
        });
        console.log("Clicked position:", pos, "Found crop:", crop);

        // ===== 畝検索 =====
        const row = pos.r;
        const col = pos.c;
        const bedKey = `${row}-${col}`;
        const bedData = state.beds ? state.beds[bedKey] : null;

        // ===== モーダルを表示（編集モード以外） =====
        if (!state.isHarvestMode && !state.isEditMode) {
            const targetData = {
                r: row,
                c: col,
                cropId: crop ? crop.id : null,
                cropName: crop ? crop.veg_name : null,
                bedId: bedData ? bedData.bed_id : null,
                bedName: bedData ? bedData.name : null
            };
            GardenAPI.openMaintenanceModal(targetData);
            return;
        }

        // ===== 編集モード：ドラッグ・リサイズ =====
        if (!state.editor.active) return;

        // リサイズハンドル（右下隅）を掴んだか判定
        if (pos.c === state.editor.c + state.editor.w - 1 &&
            pos.r === state.editor.r + state.editor.h - 1) {
            state.editor.isResizing = true;
        }
        // 枠内を掴んだか判定
        else if (pos.c >= state.editor.c && pos.c < state.editor.c + state.editor.w &&
                 pos.r >= state.editor.r && pos.r < state.editor.r + state.editor.h) {
            state.editor.isDragging = true;
            state.editor.offset.c = pos.c - state.editor.c;
            state.editor.offset.r = pos.r - state.editor.r;
        }
    },

    /**
     * マウスムーブイベント
     */
    handleMouseMove(e) {
        const state = GardenState;
        if (!state.editor.active) return;

        const pos = this.getMousePos(e);

        if (state.editor.isResizing) {
            state.editor.w = Math.max(1, pos.c - state.editor.c + 1);
            state.editor.h = Math.max(1, pos.r - state.editor.r + 1);
        } else if (state.editor.isDragging) {
            state.editor.c = pos.c - state.editor.offset.c;
            state.editor.r = pos.r - state.editor.offset.r;
        }

        GardenRenderer.draw();
    },

    /**
     * マウスアップイベント
     */
    handleMouseUp() {
        const state = GardenState;
        state.editor.isDragging = false;
        state.editor.isResizing = false;
    },

    /**
     * 座標から作物を検索（重なっている場合は上のものを優先）
     */
    findCropAt(pos) {
        const state = GardenState;
        return [...state.crops].reverse().find(crop =>
            pos.r >= crop.row && pos.r < crop.row + crop.height &&
            pos.c >= crop.col && pos.c < crop.col + crop.width
        );
    },

    /**
     * イベントリスナーを登録
     */
    bindEvents() {
        const state = GardenState;

        state.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        state.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());

        // 日付変更時
        state.currentDate.addEventListener('change', () => {
            state.selectedDate = state.currentDate.value;
            console.log("Selected date changed:", state.selectedDate);
            if (typeof GardenAPI.loadMaintenanceLogs === 'function') {
                GardenAPI.loadMaintenanceLogs();
            }
        });
    }
};
