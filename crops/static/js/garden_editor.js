const GardenEditor = {

    // --- 1. 基本設定 ---
    canvas: null,
    ctx: null,
    cellSize: 0,
    rows: 180,
    cols: 70,
    plotData: {},
    crops: [],
    selectedDate: null, // カレンダーで選んだ日を保持する変数
    areaId: null,

    // --- 2. 編集ステート（ここが心臓部） ---
    editor: {
        active: false,
        vegId: null,
        vegName: '',
        r: 10, c: 10, w: 3, h: 3, // マス目単位
        isDragging: false,
        isResizing: false,
        dragStart: { r: 0, c: 0 },
        offset: { r: 0, c: 0 }
    
    },
    findCropAt(pos) {
        // 逆順で探すことで、重なっている場合に上のものを優先する
        return [...this.crops].reverse().find(crop =>
            pos.r >= crop.row && pos.r < crop.row + crop.height &&
            pos.c >= crop.col && pos.c < crop.col + crop.width
        );
    },
    // --- 3. 初期化 ---
    init(areaId, canvasId, dataId, vTypesId, bedDataId) {
        console.log("dataId", dataId, "vTypesId", vTypesId);
        this.areaId = areaId;
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // constructorの中でイベントリスナーを設定
        this.currentDate = document.getElementById('current-date');
        // --- ここから初期値セット ---
        if (this.currentDate && !this.currentDate.value) {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');

            // inputに "2026-05-01" のような形式で入れる
            this.currentDate.value = `${y}-${m}-${d}`;
            this.loadMaintenanceLogs(); // 初期値をセットした後にログを読み込む
        }

        // selectedDate はカレンダーで選んだ日 (Dateオブジェクト)
        this.selectedDate = new Date(this.currentDate.value.replace(/-/g, '/'));

        // これでズレが解消されるはずです！
        // Djangoのjson_scriptからデータを取得
        const dataElement = document.getElementById(dataId);
        if (dataElement) {
            this.plotData = JSON.parse(dataElement.textContent);
        }

        // 作物タイプのデータを取得
        const vTypesElement = document.getElementById(vTypesId);
        if (vTypesElement) {
            this.vTypes = JSON.parse(vTypesElement.textContent);
            this.renderVegetablePicker();
        }
        const bedDataElement = document.getElementById(bedDataId);
        if (bedDataElement) {
            this.beds = JSON.parse(bedDataElement.textContent);
        }
        // garden_editor.js の init または constructor 内
        this.isHarvestMode = false; // 初期状態はOFF

        const harvestBtn = document.getElementById('harvest-mode-btn');
        if (harvestBtn) {
            harvestBtn.addEventListener('click', () => {
                this.isHarvestMode = !this.isHarvestMode; // モードを反転

                // UIの見た目を変える
                if (this.isHarvestMode) {
                    harvestBtn.textContent = '🌾 収穫・撤去モード: ON';
                    harvestBtn.classList.replace('uk-button-default', 'uk-button-danger');
                    this.canvas.style.cursor = 'crosshair'; // カーソルを十字に変える
                    this.cancelEditing(); // もし植え付け中ならキャンセルさせる
                } else {
                    harvestBtn.textContent = '🌾 収穫・撤去モード: OFF';
                    harvestBtn.classList.replace('uk-button-danger', 'uk-button-default');
                    this.canvas.style.cursor = 'default';
                }
            });
        }

        // init() メソッドの中などでイベント設定
        document.getElementById('maintenance-form').onsubmit = async (e) => {
            e.preventDefault();
            console.log("Selected date:", this.selectedDate, "Current log target:", this.currentLogTarget);
            
            const payload = {
                area_id: this.areaId,
                task_type: document.getElementById('log-task-type').value,
                note: document.getElementById('log-note').value,
                row: this.currentLogTarget.r,
                col: this.currentLogTarget.c,
                crop_id: this.currentLogTarget.cropId, // 野菜がいればIDを送る
                bed_id: this.currentLogTarget.bedId, // 畝がいればIDを送る
                date: document.getElementById('current-date').value // 画面上の日付を送る
            };
            console.log(payload)
            
            try {
                const response = await fetch('/garden/api/save_maintenance_log/', {
                    
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': this.getCsrfToken()
                    },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    UIkit.modal('#maintenance-modal').hide();
                    alert('お世話を記録しました！');
                    // お世話アイコンを表示するために再描画
                    this.loadMaintenanceLogs();
                }
            } catch (error) {
                console.error("保存失敗:", error);
            }
        };
        this.updateSize();
        this.bindEvents();
        this.loadSavedCrops();
        this.draw();

        // 画面リサイズへの対応
        window.addEventListener('resize', () => {
            this.updateSize();
            this.draw();
        });
    },
    // garden_editor.js

    // 保存されているログを保持する変数（initのあたりで定義しておくと吉）
    maintenanceLogs: [],

    async loadMaintenanceLogs() {
        const areaId = this.areaId;
        // input[type="date"] から直接文字列を取得（時差ズレ防止）
        const dateStr = document.getElementById('current-date').value;

        console.log(`[Log] Loading logs for Area:${areaId}, Date:${dateStr}`);

        try {
            const response = await fetch(`/garden/api/get_maintenance_logs/?area_id=${areaId}&date=${dateStr}`);

            if (response.ok) {
                const data = await response.json();

                // views.py から届いた row, col 入りのリストを保存
                this.maintenanceLogs = Array.isArray(data) ? data : [];

                const summaryArea = document.getElementById('log-summary');
                if (summaryArea) {
                    if (data.length === 0) {
                        summaryArea.innerHTML = '<span class="uk-text-muted uk-text-small">本日の記録はありません</span>';
                    } else {
                        // task_type ごとに件数を集計
                        const summary = data.reduce((acc, log) => {
                            acc[log.task_display] = (acc[log.task_display] || 0) + 1;
                            return acc;
                        }, {});

                        summaryArea.innerHTML = Object.entries(summary)
                            .map(([name, count]) => `<span class="uk-badge uk-margin-small-right" style="background: #1e87f0;">${name} ${count}</span>`)
                            .join('');
                    }
                }
                // 再読み込みが終わったら、最新の maintenanceLogs を使って Canvas を描画
                this.draw();
            } else {
                console.error("Server returned an error:", response.status);
            }
        } catch (error) {
            console.error("ログの読み込み失敗:", error);
            this.maintenanceLogs = []; // エラー時は空にして描画の破綻を防ぐ
            this.draw(); // 空の状態で再描画
        }
    },
    // 適当な場所（initの下など）に追加
    async loadSavedCrops() {
        try {
            const response = await fetch('/garden/api/get_crops/');
            const data = await response.json();
            // サーバーから届いたデータを this.crops にセット
            this.crops = data.crops;

            this.draw(); // データが届いたら再描画
        } catch (e) {
            console.error("作物の読み込みに失敗:", e);
        }
    },

    updateSize() {
        const wrapper = this.canvas.parentElement;
        this.canvas.width = wrapper.clientWidth;
        this.cellSize = this.canvas.width / this.cols;
        this.canvas.height = this.rows * this.cellSize;
    },

    // --- 4. イベント管理 ---
    bindEvents() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.currentDate.addEventListener('change', () => {
            console.log("Selected date changed:", this.currentDate.value);
            this.selectedDate = new Date(this.currentDate.value.replace(/-/g, '/')); // ここでもズレを防ぐ工夫
            if (typeof this.loadMaintenanceLogs === 'function') {
                this.loadMaintenanceLogs();
            }

        });
    },

    // garden_editor.js

    renderVegetablePicker() {
        const picker = document.getElementById('v-type-picker');
        if (!picker) return;

        // --- ここを修正： this.vTypes ではなく GardenEditor.vTypes を使う ---
        const types = this.vTypes;
        if (!types || !Array.isArray(types)) {
            console.error("renderVegetablePicker: 野菜データが不正です", types);
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


    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            c: Math.floor((e.clientX - rect.left) / this.cellSize),
            r: Math.floor((e.clientY - rect.top) / this.cellSize)
        };
    },

    handleMouseDown(e) {
        const pos = this.getMousePos(e);

        // --- 収穫モードの場合 ---
        if (this.isHarvestMode) {
            const targetCrop = this.findCropAt(pos);
            console.log("Harvest mode: clicked position", pos, "found crop:", targetCrop);
            if (targetCrop) {
                this.harvestCrop(targetCrop.id);
            }
            return; // 収穫モードの時は移動処理をさせない
        }

        // その座標に作物がいるか探す
        const crop = this.crops.find(c =>
            pos.r >= c.row && pos.r < c.row + c.height &&
            pos.c >= c.col && pos.c < c.col + c.width
        );

        // --- 修正箇所：定義済みの pos.r, pos.c を使う ---
        const row = pos.r;
        const col = pos.c;

        // 1. キーを作成 (例: "3-3")
        const bedKey = `${row}-${col}`;

        // 2. 直接オブジェクトから取得
        const bedData = this.beds ? this.beds[bedKey] : null;

        // モーダル表示モード判定
        if (!this.isHarvestMode && !this.isEditMode) {
            const targetData = {
                r: row,
                c: col,
                cropId: crop ? crop.id : null,
                cropName: crop ? crop.veg_name : null,
                bedId: bedData ? bedData.bed_id : null,
                bedName: bedData ? bedData.name : null
            };
            this.openMaintenanceModal(targetData);

            return;
        }

        if (!this.editor.active) return;

        // ハンドル（右下隅）を掴んだか判定
        if (pos.c === this.editor.c + this.editor.w - 1 &&
            pos.r === this.editor.r + this.editor.h - 1) {
            this.editor.isResizing = true;
        }
        // 枠内を掴んだか判定
        else if (pos.c >= this.editor.c && pos.c < this.editor.c + this.editor.w &&
            pos.r >= this.editor.r && pos.r < this.editor.r + this.editor.h) {
            this.editor.isDragging = true;
            this.editor.offset.c = pos.c - this.editor.c;
            this.editor.offset.r = pos.r - this.editor.r;
        }
    },
    handleMouseMove(e) {
        if (!this.editor.active) return;
        const pos = this.getMousePos(e);

        if (this.editor.isResizing) {
            this.editor.w = Math.max(1, pos.c - this.editor.c + 1);
            this.editor.h = Math.max(1, pos.r - this.editor.r + 1);
        } else if (this.editor.isDragging) {
            this.editor.c = pos.c - this.editor.offset.c;
            this.editor.r = pos.r - this.editor.offset.r;
        }

        this.draw(); // 状態が変わるたびに再描画
    },

    handleMouseUp() {
        this.editor.isDragging = false;
        this.editor.isResizing = false;
    },

    
    // --- 5. 描画ロジック ---
    draw() {
        // 1. まずカレンダーから「今選ばれている日」を取得する
        const selectedDate = new Date(this.currentDate.value);
        
        // 2. Canvasを一旦真っ白に消す（これ重要！）
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 3. 背景やグリッドを描画（もしあれば）
        // draw() メソッド内の一部
        if (this.maintenanceLogs && Array.isArray(this.maintenanceLogs)) {
            this.maintenanceLogs.forEach(log => {
                
                const x = log.col * this.gridSize;
                const y = log.row * this.gridSize;
                console.log("Drawing log at:", log.row, log.col);
                // 例：右上に小さな水色の丸を出す
                // タスクごとに色を変える例
                this.ctx.fillStyle = (log.task_type === 'watering') ? '#00bfff' : '#ffcc00';

                // マスの中央に小さな丸を描画
                this.ctx.beginPath();
                this.ctx.arc(
                    x + this.gridSize / 2,
                    y + this.gridSize / 2,
                    4, 0, Math.PI * 2
                );
                this.ctx.fill();
            });
        }
        // 4. 野菜（crops）のループの中に「if文」を入れる！
        this.crops.forEach(crop => {
            // 文字列で届いている日付を比較可能なDateオブジェクトに変換
            const pAt = new Date(crop.planted_at);
            const hAt = crop.harvested_at ? new Date(crop.harvested_at) : null;

            // --- ここが「魔法」の条件分岐 ---
            // 「植え付け日が今日以前」かつ「（収穫されていない、または収穫日が今日より先）」
            if (pAt <= selectedDate && (!hAt || selectedDate < hAt)) {
                this.drawCrop(crop); // 条件に合う時だけ描画を実行
            }
        });

        // 編集中のプレビューを表示
        if (this.editor.active) {
            this.drawPreview();
        }
        this.drawGrid();

    },

    drawGrid() {
        // 以前の drawGarden の中身を this を使って実装
        for (let r = 0; r < this.rows; r++) {
            const isAlt = Math.floor(r / 30) % 2 === 0;
            for (let c = 0; c < this.cols; c++) {
                const x = c * this.cellSize;
                const y = r * this.cellSize;
                const plot = this.plotData[`${r}-${c}`];
                // --- 描画色の決定 ---
                let fillColor = (plot && plot.is_bed) ? '#8b45136e' : (isAlt ? '#E0E0E0' : '#F0F0F0');

                // ★ 保存された作物があるかチェック
                const cropInPlot = this.crops.find(crop =>
                    r >= crop.row && r < crop.row + crop.height &&
                    c >= crop.col && c < crop.col + crop.width
                );


                this.ctx.fillStyle = fillColor;
                this.ctx.fillRect(x, y, this.cellSize - 1, this.cellSize - 1);

                // 作物(SVG)の描画ロジックもここに入る
            }
        }
    },
    // drawGrid() 内、または独立した描画関数として実装
    drawCrops() {
        this.crops.forEach(crop => {
            const img = new Image();
            img.src = crop.icon_url;

            img.onload = () => {
                const iw = img.width;
                const ih = img.height;
                const aspect = iw / ih; // 比率（幅 / 高さ）
                
                // 1マス 10cm の設定
                const cmPerPlot = 10;
                // 栽培間隔（ピクセル単位に変換）
                const spacingPx = (crop.spacing_cm / cmPerPlot) * this.cellSize;

                const areaX = crop.col * this.cellSize;
                const areaY = crop.row * this.cellSize;
                const areaW = crop.width * this.cellSize;
                const areaH = crop.height * this.cellSize;

                const iconH = this.cellSize * 0.8; // セルより少し小さめ
                const iconW = iconH * aspect;

                if (crop.planting_method === 'dense') {
                    // --- 栽培間隔に基づいた繰り返し描画 ---
                    // spacingPx ごとにループを回す
                    // --- 【筋蒔き】セルごとにアイコンを配置 ---

                    for (let y = spacingPx / 2; y < areaH; y += spacingPx) {
                        for (let x = spacingPx / 2; x < areaW; x += spacingPx) {

                            const targetX = areaX + x - (iconW / 2);
                            const targetY = areaY + y - (iconH / 2);

                            // エリアからはみ出さないかチェックして描画
                            if (x + iconW / 2 <= areaW && y + iconH / 2 <= areaH) {
                                this.ctx.drawImage(img, targetX, targetY, iconW, iconH);
                            }
                        }
                    }
                } else {
                    // --- 【個体植え】占有範囲の中央に1つだけ配置 ---
                    // 範囲に収まる最大サイズを計算 (Contain)
                    let drawW, drawH;
                    if (areaW / areaH > aspect) {
                        drawH = areaH * 0.9;
                        drawW = drawH * aspect;
                    } else {
                        drawW = areaW * 0.9;
                        drawH = drawW / aspect;
                    }

                    const targetX = areaX + (areaW - drawW) / 2;
                    const targetY = areaY + (areaH - drawH) / 2;
                    this.ctx.drawImage(img, targetX, targetY, drawW, drawH);
                }
            };
        });
    },
    drawCrop(crop) {
        if (!crop.icon_url) return;

        const img = new Image();
        img.src = crop.icon_url;

        // 画像の読み込みが完了してから描画
        img.onload = () => {
            const iw = img.width;
            const ih = img.height;
            const aspect = iw / ih;

            // 1マス 10cm の設定（既存ロジックを継承）
            const cmPerPlot = 10;
            const spacingPx = (crop.spacing_cm / cmPerPlot) * this.cellSize;

            const areaX = crop.col * this.cellSize;
            const areaY = crop.row * this.cellSize;
            const areaW = crop.width * this.cellSize;
            const areaH = crop.height * this.cellSize;
            
            // デバッグ用：作物の占有エリアを赤い枠で表示
            this.ctx.strokeStyle = 'red';
            this.ctx.strokeRect(areaX, areaY, areaW, areaH);

            // アイコンの基本サイズ（1マスより少し大きくして見栄えを良くする）
            const iconH = this.cellSize * 1.8;
            const iconW = iconH * aspect;

            if (crop.planting_method === 'dense') {
                // --- 【筋蒔き/密植】間隔に合わせて並べて描画 ---
                for (let y = spacingPx / 2; y < areaH; y += spacingPx) {
                    for (let x = spacingPx / 2; x < areaW; x += spacingPx) {
                        const targetX = areaX + x - (iconW / 2);
                        const targetY = areaY + y - (iconH / 2);
                        
                        // エリアからはみ出さないかチェック
                        if (x + iconW / 2 <= areaW && y + iconH / 2 <= areaH) {
                            this.ctx.drawImage(img, targetX, targetY, iconW, iconH);
                            
                        }
                    }
                }

            } else {
                // --- 【個体植え】エリアの中央に大きく1つ描画 ---
                let drawW, drawH;
                if (areaW / areaH > aspect) {
                    drawH = areaH * 0.9;
                    drawW = drawH * aspect;
                } else {
                    drawW = areaW * 0.9;
                    drawH = drawW / aspect;
                }

                const targetX = areaX + (areaW - drawW) / 2;
                const targetY = areaY + (areaH - drawH) / 2;
                this.ctx.drawImage(img, targetX, targetY, drawW, drawH);
            }
        };
    },
    // マス(r, c)に野菜がいるかチェックし、いればその野菜オブジェクトを返す
    getCropAt(r, c) {
        return this.crops.find(crop => {
            // 現在の日付で表示されている野菜だけを対象にする判定
            const pAt = new Date(crop.planted_at);
            const hAt = crop.harvested_at ? new Date(crop.harvested_at) : null;
            const isVisible = pAt <= this.selectedDate && (!hAt || this.selectedDate < hAt);

            if (!isVisible) return false;

            // 範囲内に入っているか
            return r >= crop.row && r < crop.row + crop.height &&
                c >= crop.col && c < crop.col + crop.width;
        });
    },
    // garden_editor.js

    findBedAt(r, c) {
        // this.selectedDate (Dateオブジェクト) と比較
        return this.beds.find(bed => {
            const createdAt = new Date(bed.created_at);
            const deletedAt = bed.deleted_at ? new Date(bed.deleted_at) : null;

            // 1. 座標が範囲内か
            const isInside = r >= bed.row && r < bed.row + bed.height &&
                c >= bed.col && c < bed.col + bed.width;

            // 2. その日付時点で存在しているか
            // 作成日 <= 選択日 かつ (削除されていない、または 削除日 > 選択日)
            const isExists = createdAt <= this.selectedDate &&
                (!deletedAt || deletedAt > this.selectedDate);

            return isInside && isExists;
        });
    },
    // garden_editor.js 451行目付近

    getBedAt(r, c) {
        const key = `${r}-${c}`;

        // this.beds がオブジェクト { "0-0": {...}, "0-1": {...} } の想定
        const bedInfo = this.beds[key];

        if (!bedInfo) return null;

        // 日付の論理削除チェック
        const createdAt = new Date(bedInfo.created_at);
        const deletedAt = bedInfo.deleted_at ? new Date(bedInfo.deleted_at) : null;

        // 選択された日付時点で存在しているか判定
        const isExists = createdAt <= this.selectedDate &&
            (!deletedAt || deletedAt > this.selectedDate);

        return isExists ? { id: bedInfo.bed_id, name: bedInfo.name } : null;
    },
    drawPreview() {
        const x = this.editor.c * this.cellSize;
        const y = this.editor.r * this.cellSize;
        const w = this.editor.w * this.cellSize;
        const h = this.editor.h * this.cellSize;

        // 半透明のエリア
        this.ctx.fillStyle = 'rgba(52, 152, 219, 0.4)';
        this.ctx.fillRect(x, y, w, h);

        // 青い太枠
        this.ctx.strokeStyle = '#3498db';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, w, h);

        // リサイズハンドル（右下）
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(x + w - 10, y + h - 10, 20, 20);
        this.ctx.strokeRect(x + w - 10, y + h - 10, 20, 20);
    },

    async openMaintenanceModal(target) {
        // 1. 引数からすべての情報を一気に取り出す
        const { r, c, cropId, cropName, bedId, bedName } = target;
        console.log("Opening modal for:", target);
        const selectedDate = new Date(this.currentDate.value);
        // 2. 表示要素の取得
        const titleEl = document.getElementById('modal-title');
        const subtitleEl = document.getElementById('modal-subtitle');
        const historyDiv = document.getElementById('plot-history');

        // 3. 表示の切り替え（作物があれば作物優先、なければ畝、それもなければ土）
        if (cropId) {
            titleEl.innerHTML = `🌾 ${cropName}`;
            subtitleEl.innerText = `${r}行 ${c}列 (作物ID: ${cropId})`;
        } else if (bedId) {
            titleEl.innerHTML = `📦 ${bedName || '畝'}`;
            subtitleEl.innerText = `${r}行 ${c}列 (畝ID: ${bedId})`;
        } else {
            titleEl.innerHTML = `🟫 土の状態`;
            subtitleEl.innerText = `${r}行 ${c}列`;
        }

        // 4. 保存用ターゲットの更新（渡ってきた値をそのまま保持）
        this.currentLogTarget = { r, c, cropId, bedId };

        // 5. 履歴の取得
        if (historyDiv) {
            historyDiv.innerHTML = '<div class="uk-text-center"><span uk-spinner></span> 履歴を読み込み中...</div>';
        }

        try {
            // 分割代入で取り出した cropId, bedId をそのまま使う
            // (null や undefined の場合に備えて || '' をつけておくと安全)
            const url = `/garden/api/get_plot_history/?area_id=${this.areaId}&row=${r}&col=${c}&crop_id=${cropId || ''}&bed_id=${bedId || ''}`;
            const res = await fetch(url);

            if (res.ok) {
                const history = await res.json();
                console.log("Received history data:", history);
                if (historyDiv) {
                    historyDiv.innerHTML = history.map(h => `
                    <div class="uk-margin-small-bottom uk-border-bottom uk-padding-small">
                        <span class="uk-label uk-label-success" style="font-size: 10px;">${h.date}</span> 
                        <span class="uk-text-bold uk-margin-small-left">${h.task}</span>
                        crop: ${cropName || 'なし'}, bed: ${bedName || 'なし'}
                        <div class="uk-text-muted uk-text-small">${h.note || ''}</div>
                    </div>
                `).join('') || '<div class="uk-text-muted">過去の履歴はありません</div>';
                }
            }
        } catch (error) {
            console.error("履歴の取得失敗:", error);
        }

        UIkit.modal('#maintenance-modal').show();
    },
        startEditing(vegId, vegName) {
            // 1. UIkitのAPIでモーダルを閉じる
            UIkit.modal('#crop-modal').hide();

            // 2. 登録用の操作パネルを表示する
            const controlPanel = document.getElementById('editor-control-panel');
            if (controlPanel) {
                controlPanel.style.display = 'block';
            }

            // 3. パネル内の野菜名を更新
            const nameDisplay = document.getElementById('display-veg-name');
            if (nameDisplay) {
                nameDisplay.textContent = vegName;
            }

            // 4. エディタの状態をアクティブにする
            this.editor.active = true;
            this.editor.vegId = vegId;
            this.editor.vegName = vegName;

            // 5. Canvasを再描画（青い枠が出るようになります）
            this.draw();
        },

        // garden_editor.js 内
    savePlanting() {
            const data = {
                veg_id: this.editor.vegId,
                row: this.editor.r,
                col: this.editor.c,
                width: this.editor.w,
                height: this.editor.h
            };

            fetch('/garden/api/save_crop/', { // 実際のURLに合わせて変更
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken() // DjangoのCSRF対策
                },
                body: JSON.stringify(data)
            })
                .then(res => res.json())
                .then(result => {
                    alert('登録しました！');
                    this.loadSavedCrops(); // 画面を更新して畑に反映
                });
        },

    // --- ユーティリティ: CSRFトークンの取得 ---
    getCsrfToken() {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, 10) === 'csrftoken=') {
                    cookieValue = decodeURIComponent(cookie.substring(10));
                    break;
                }
            }
        }
        return cookieValue;
    },

    // --- 編集のキャンセル ---
    cancelEditing() {
        // 1. エディタの状態をリセット
        this.editor.active = false;
        this.editor.vegId = null;
        this.editor.vegName = '';

        // 2. 確定パネルを非表示にする
        const controlPanel = document.getElementById('editor-control-panel');
        if (controlPanel) {
            controlPanel.style.display = 'none';
        }

        // 3. 再描画して青い枠を消す
        this.draw();

        console.log("編集をキャンセルしました");
    },
    
    // garden_editor.js 内の harvestCrop を修正
    async harvestCrop(cropId) {
        // this.selectedDate が undefined の場合を考慮し、
        // 直接 HTML 要素から最新の日付文字列を取得する
        const dateInput = document.getElementById('current-date');
        const harvestDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

        if (!confirm(`${harvestDate} にこの作物を収穫（撤去）しますか？`)) return;

        try {
            const response = await fetch(`/garden/api/harvest_crop/${cropId}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken(),
                },
                body: JSON.stringify({ harvested_at: harvestDate })
            });
            const result = await response.json();

            if (result.status === 'success') {
                // ローカルデータの更新
                const crop = this.crops.find(c => c.id === cropId);
                if (crop) {
                    crop.harvested_at = harvestDate;
                }

                this.draw(); // 再描画して、判定ロジックにより画面から消す
                alert('収穫を記録しました！');
            }
        } catch (e) {
            console.error("収穫処理に失敗:", e);
        }
    }

};
// garden_editor.js または mypage.html の script 内
function startPlantingProcess() {
    const selectedId = document.getElementById('selected-type-id').value;
    const selectedName = document.querySelector('.veg-option.selected')?.textContent || "野菜";

    // 1. モーダルを閉じる
    UIkit.modal('#crop-modal').hide();

    // 2. エディタを「編集モード」にする
    GardenEditor.startEditing(selectedId, selectedName);
}

