/**
 * GardenController.js - 畑エディタの統合・初期化
 * 全モジュールを統合し、初期化を担当
 */

const GardenController = {
    /**
     * 初期化処理
     */
    init(config) {
        const state = GardenState;

        console.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
log("GardenController: Initializing...", config);

        // ==========================================
        // 1. DOM要素と基本設定
        // ==========================================
        state.areaId = config.areaId;
        state.canvas = document.getElementById(config.canvasId);
        if (!state.canvas) {
            console.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
error("Canvas element not found:", config.canvasId);
            return;
        }

        state.ctx = state.canvas.getContext('2d');
        state.currentDate = document.getElementById('current-date');

        // ==========================================
        // 2. 日付の初期設定
        // ==========================================
        if (state.currentDate && !state.currentDate.value) {
            const now = new     /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            state.currentDate.value = `${y}-${m}-${d}`;
        }

        if (state.currentDate) {
            state.selectedDate = state.currentDate.value;
        }

        // ==========================================
        // 3. JSON データを解析
        // ==========================================
        const dataElement = document.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
getElementById(config.plotDataId);
        if (dataElement) {
            state.plotData = JSON.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
parse(dataElement.textContent);
        }

        const vTypesElement = document.getElementById(config.vegetableTypesId);
        if (vTypesElement) {
            state.vTypes = JSON.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
parse(vTypesElement.textContent);
            GardenUI.renderVegetablePicker();
        }

        const bedDataElement = document.getElementById(config.bedDataId);
        if (bedDataElement) {
            state.beds = JSON.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
parse(bedDataElement.textContent);
        }

        // ==========================================
        // 4. UI設定
        // ==========================================
        GardenUI.updateSize();

        // 収穫モードボタン
        const harvestBtn = document.getElementById('harvest-mode-btn');
        if (harvestBtn) {
            harvestBtn.    /**
     * 【目的】TODO: 関数の目的を記述
     * 【説明】TODO: 詳細な説明を記述
     * 【処理】TODO: 処理フローを記述
     * 【パラメータ】TODO: 入力パラメータを記述
     * 【戻り値】TODO: 戻り値を記述
     * 【副作用】TODO: 状態変化・DOM操作を記述
     */
addEventListener('click', () => {
                state.isHarvestMode = !state.isHarvestMode;
                GardenUI.updateHarvestModeUI(state.isHarvestMode);
            });
        }

        // メンテナンスフォーム
        const maintenanceForm = document.getElementById('maintenance-form');
        if (maintenanceForm) {
            maintenanceForm.onsubmit = async (e) => {
                e.preventDefault();
                await GardenAPI.saveMaintenanceLog();
            };
        }

        // ==========================================
        // 5. イベントバインディング
        // ==========================================
        GardenMouseEvents.bindEvents();

        // ウィンドウリサイズ対応
        window.addEventListener('resize', () => {
            GardenUI.updateSize();
            GardenRenderer.draw();
        });

        // ==========================================
        // 6. データ読み込みと初期描画
        // ==========================================
        GardenAPI.loadMaintenanceLogs();
        GardenAPI.loadSavedCrops();
        GardenRenderer.draw();

        console.log("GardenController: Initialization complete");
    }
};
