/**
 * GardenState.js - 畑エディタの状態管理
 * グローバル状態を一元管理するモジュール
 */

const GardenState = {
    // ==========================================
    // キャンバス・基本設定
    // ==========================================
    canvas: null,
    ctx: null,
    cellSize: 0,
    rows: 180,
    cols: 70,

    // ==========================================
    // 日付・領域情報
    // ==========================================
    areaId: null,
    currentDate: null,       // HTMLの date input 要素
    selectedDate: null,      // Dateオブジェクト（カレンダーで選んだ日）

    // ==========================================
    // 画面上のデータ
    // ==========================================
    plotData: {},            // マス目ごとの情報 { "0-0": {...}, ... }
    crops: [],               // 保存された作物配列
    beds: {},                // 畝データ { "0-0": {...}, ... }
    vTypes: [],              // 野菜タイプ一覧
    maintenanceLogs: [],     // 本日のお世話ログ

    // ==========================================
    // エディタ・モード状態
    // ==========================================
    editor: {
        mode: 'crop',        // ★追加: 'crop' (作物) か 'bed' (畝) かを区別する
        bedId: null,         // ★追加: 編集中の畝ID
        bedName: '',         // ★追加: 編集中の畝名

        active: false,
        vegId: null,
        vegName: '',
        r: 10,
        c: 10,
        w: 3,
        h: 3,
        isDragging: false,
        isResizing: false,
        dragStart: { r: 0, c: 0 },
        offset: { r: 0, c: 0 }
    },

    isEditMode: false,
    isHarvestMode: false,

    // ==========================================
    // 編集対象（モーダル用）
    // ==========================================
    currentLogTarget: {
        r: null,
        c: null,
        cropId: null,
        bedId: null
    },

    // ==========================================
    // 状態リセット
    // ==========================================
    reset() {
        this.editor = {
            mode: 'crop',        // ★追加: 'crop' (作物) か 'bed' (畝) かを区別する
            bedId: null,         // ★追加: 編集中の畝ID
            bedName: '',         // ★追加: 編集中の畝名

            active: false,
            vegId: null,
            vegName: '',
            r: 10,
            c: 10,
            w: 3,
            h: 3,
            isDragging: false,
            isResizing: false,
            dragStart: { r: 0, c: 0 },
            offset: { r: 0, c: 0 }
        };
        this.isEditMode = false;
        this.isHarvestMode = false;
        this.currentLogTarget = { r: null, c: null, cropId: null, bedId: null };
    }
};
