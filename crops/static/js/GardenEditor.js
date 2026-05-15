/**
 * GardenEditor.js - 畑エディタの編集機能
 * 作物の植え付け、検索、編集機能を担当
 */

const GardenEditor = {
    /**
     * 作物を座標から検索（日付条件付き）
     */
    getCropAt(r, c) {
        const state = GardenState;
        return state.crops.find(crop => {
            // 現在の日付で表示されている作物だけを対象にする
            const pAt = new Date(crop.planted_at);
            const hAt = crop.harvested_at ? new Date(crop.harvested_at) : null;
            const isVisible = pAt <= state.selectedDate && (!hAt || state.selectedDate < hAt);

            if (!isVisible) return false;

            return r >= crop.row && r < crop.row + crop.height &&
                   c >= crop.col && c < crop.col + crop.width;
        });
    },

    /**
     * 畝を座標から検索（日付条件付き）
     */
    findBedAt(r, c) {
        const state = GardenState;
        return state.beds.find(bed => {
            const createdAt = new Date(bed.created_at);
            const deletedAt = bed.deleted_at ? new Date(bed.deleted_at) : null;

            const isInside = r >= bed.row && r < bed.row + bed.height &&
                            c >= bed.col && c < bed.col + bed.width;

            const isExists = createdAt <= state.selectedDate &&
                            (!deletedAt || deletedAt > state.selectedDate);

            return isInside && isExists;
        });
    },

    /**
     * 畝をキーから検索
     */
    getBedAt(r, c) {
        const state = GardenState;
        const key = `${r}-${c}`;
        const bedInfo = state.beds[key];

        if (!bedInfo) return null;

        const createdAt = new Date(bedInfo.created_at);
        const deletedAt = bedInfo.deleted_at ? new Date(bedInfo.deleted_at) : null;

        const isExists = createdAt <= state.selectedDate &&
                        (!deletedAt || deletedAt > state.selectedDate);

        return isExists ? { id: bedInfo.bed_id, name: bedInfo.name } : null;
    },

    /**
     * 編集を開始
     */
    startEditing(vegId, vegName) {
        const state = GardenState;

        // モーダルを閉じる
        UIkit.modal('#crop-modal').hide();

        // 編集パネルを表示
        const controlPanel = document.getElementById('editor-control-panel');
        if (controlPanel) {
            controlPanel.style.display = 'block';
        }

        // 野菜名を更新
        const nameDisplay = document.getElementById('display-veg-name');
        if (nameDisplay) {
            nameDisplay.textContent = vegName;
        }

        // エディタを有効にする
        state.editor.active = true;
        state.editor.vegId = vegId;
        state.editor.vegName = vegName;
        state.isEditMode = true;

        GardenRenderer.draw();
    },

    /**
     * 編集をキャンセル
     */
    cancelEditing() {
        const state = GardenState;

        state.editor.active = false;
        state.editor.vegId = null;
        state.editor.vegName = '';
        state.isEditMode = false;

        // パネルを非表示
        const controlPanel = document.getElementById('editor-control-panel');
        if (controlPanel) {
            controlPanel.style.display = 'none';
        }

        GardenRenderer.draw();
        console.log("編集をキャンセルしました");
    },

};