/**
 * GardenUI.js - 畑エディタのUI・ユーティリティ
 * UI生成、キャンバスリサイズなどを担当
 */

const GardenUI = {
    /**
     * 野菜ピッカーUIを生成
     */
    renderVegetablePicker() {
        const state = GardenState;
        const picker = document.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
getElementById('v-type-picker');
        if (!picker) return;

        const types = state.vTypes;
        if (!types || !Array.isArray(types)) {
            console.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
error("renderVegetablePicker: 野菜データが不正です", types);
            return;
        }

        picker.innerHTML = types.map(vt => `
            <div class="veg-item" 
                 onclick="GardenEditor.startEditing(${vt.id}, '${vt.name}')" 
                 style="cursor:pointer; display:inline-block; text-align:center; margin:10px; padding:10px; border:1px solid #eee; border-radius:8px; width:80px;">
                <img src="${vt.icon ? '/media/' + vt.icon : '/static/images/default.png'}" 
                     style="width:40px; height:40px; object-fit:contain; display:block; margin:0 auto 5px;">
                <span style="font-size:12px;">${vt.name}</span>
            </div>
        `).join('');
    },

    /**
     * キャンバスサイズを更新
     */
    updateSize() {
        const state = GardenState;
        const wrapper = state.canvas.parentElement;
        state.canvas.width = wrapper.clientWidth;
        state.cellSize = state.canvas.width / state.cols;
        state.canvas.height = state.rows * state.cellSize;
    },

    /**
     * 収穫モードの UI を更新
     */
    updateHarvestModeUI(isActive) {
        const state = GardenState;
        const harvestBtn = document.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
getElementById('harvest-mode-btn');
        if (harvestBtn) {
                /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
if (isActive) {
                harvestBtn.textContent = '🌾 収穫・撤去モード: ON';
                harvestBtn.classList.replace('uk-button-default', 'uk-button-danger');
                state.canvas.style.cursor = 'crosshair';
                GardenEditor.cancelEditing();
            } else {
                harvestBtn.textContent = '🌾 収穫・撤去モード: OFF';
                harvestBtn.classList.replace('uk-button-danger', 'uk-button-default');
                state.canvas.style.cursor = 'default';
            }
        }
    }
};
