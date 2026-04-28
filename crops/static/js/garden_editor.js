const GardenEditor = {

    // --- 1. 基本設定 ---
    canvas: null,
    ctx: null,
    cellSize: 0,
    rows: 180,
    cols: 70,
    plotData: {},
    crops: [],

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
    
    // --- 3. 初期化 ---
    init(canvasId, dataId, vTypesId) {
        console.log("dataId", dataId, "vTypesId", vTypesId);
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // Djangoのjson_scriptからデータを取得
        const dataElement = document.getElementById(dataId);
        if (dataElement) {
            this.plotData = JSON.parse(dataElement.textContent);
        }

        // 作物タイプのデータを取得
        const vTypesElement = document.getElementById(vTypesId);
        if (vTypesElement) {
            this.vTypes = JSON.parse(vTypesElement.textContent);
            console.log("Vegetable types loaded:", this.vTypes);
            this.renderVegetablePicker();
        }

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

    // 適当な場所（initの下など）に追加
    async loadSavedCrops() {
        try {
            const response = await fetch('/garden/api/get_crops/');
            const data = await response.json();

            // サーバーから届いたデータを this.crops にセット
            this.crops = data.crops;

            console.log("Crops loaded:", this.crops);
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
    },

    // garden_editor.js

    renderVegetablePicker() {
        const picker = document.getElementById('v-type-picker');
        if (!picker) return;

        // --- ここを修正： this.vTypes ではなく GardenEditor.vTypes を使う ---
        const types = this.vTypes;
        console.log(this.vTypes)
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
        if (!this.editor.active) return;
        const pos = this.getMousePos(e);

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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 畑と既存の作物の描画（ここに以前のループ処理を書く）
        this.drawGrid();

        // 編集中のプレビューを表示
        if (this.editor.active) {
            this.drawPreview();
        }
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

                if (cropInPlot) {
                    fillColor = '#8b45136e'; // ひとまず緑色にする（cropInPlot.color があればそれを使う）
                }
                this.ctx.fillStyle = fillColor;
                this.ctx.fillRect(x, y, this.cellSize - 1, this.cellSize - 1);

                // 作物(SVG)の描画ロジックもここに入る
            }
        }
        this.drawCrops(); // 追加：作物の描画関数を呼び出す
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

                const iconH = this.cellSize * 1.8; // セルより少し小さめ
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

