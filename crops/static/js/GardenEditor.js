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
        return state.crops.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
find(crop => {
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
        return state.beds.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
find(bed => {
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

            /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
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
        UIkit.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
modal('#crop-modal').hide();

        // 編集パネルを表示
        const controlPanel = document.getElementById('editor-control-panel');
        if (controlPanel) {
            controlPanel.style.display = 'block';
        }

        // 野菜名を更新
        const nameDisplay = document.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
getElementById('display-veg-name');
        if (nameDisplay) {
            nameDisplay.textContent = vegName;
        }

        // エディタを有効にする
        state.editor.active = true;
        state.editor.vegId = vegId;
        state.editor.vegName = vegName;
        state.isEditMode = true;

        GardenRenderer.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
draw();
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
        const controlPanel = document.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
getElementById('editor-control-panel');
        if (controlPanel) {
            controlPanel.style.display = 'none';
        }

        GardenRenderer.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
draw();
        console.log("編集をキャンセルしました");
    },

    // GardenEditor.js 内の一番下あたりに追加

    /**
     * 畝の編集・新規登録を開始
     */
    startBedEditing(bedId = null, bedName = '新しい畝') {
        const state = GardenState;
        
        // モーダルが開いていれば閉じる
        UIkit.modal('#crop-modal').hide();

        // エディタを有効にし、モードを 'bed' にする
        state.editor.active = true;
        state.editor.mode = 'bed'; // ★ここが重要
        state.editor.bedId = bedId;
        state.editor.bedName = bedName;
        console.log(`畝編集を開始: bedId=${bedId}, bedName=${bedName}`);
        
        // 編集時のデフォルトサイズ（例: 2マス×5マス など適当に初期化）
        state.editor.r = 5;
        state.editor.c = 5;
        state.editor.w = 5;
        state.editor.h = 2;

        state.isEditMode = true;

        // 再描画して青い枠（プレビュー）を出す
        GardenRenderer.draw();
    },
};