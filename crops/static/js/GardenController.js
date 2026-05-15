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

        console.log("GardenController: Initializing...", config);

        // ==========================================
        // 1. DOM要素と基本設定
        // ==========================================
        state.areaId = config.areaId;
        state.canvas = document.getElementById(config.canvasId);
        if (!state.canvas) {
            console.error("Canvas element not found:", config.canvasId);
            return;
        }

        state.ctx = state.canvas.getContext('2d');
        state.currentDate = document.getElementById('current-date');

        // ==========================================
        // 2. 日付の初期設定
        // ==========================================
        if (state.currentDate && !state.currentDate.value) {
            const now = new Date();
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
        const dataElement = document.getElementById(config.plotDataId);
        if (dataElement) {
            state.plotData = JSON.parse(dataElement.textContent);
        }

        const vTypesElement = document.getElementById(config.vegetableTypesId);
        if (vTypesElement) {
            state.vTypes = JSON.parse(vTypesElement.textContent);
            GardenUI.renderVegetablePicker();
        }

        const bedDataElement = document.getElementById(config.bedDataId);
        if (bedDataElement) {
            state.beds = JSON.parse(bedDataElement.textContent);
        }

        // ==========================================
        // 4. UI設定
        // ==========================================
        GardenUI.updateSize();

        // 収穫モードボタン
        const harvestBtn = document.getElementById('harvest-mode-btn');
        if (harvestBtn) {
            harvestBtn.addEventListener('click', () => {
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
