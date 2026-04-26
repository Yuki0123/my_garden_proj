const GardenEditor = {
    // --- 1. 基本設定 ---
    canvas: null,
    ctx: null,
    cellSize: 0,
    rows: 180,
    cols: 70,
    plotData: {},

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
    init(canvasId, dataId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // Djangoのjson_scriptからデータを取得
        const dataElement = document.getElementById(dataId);
        if (dataElement) {
            this.plotData = JSON.parse(dataElement.textContent);
        }

        this.updateSize();
        this.bindEvents();
        this.draw();

        // 画面リサイズへの対応
        window.addEventListener('resize', () => {
            this.updateSize();
            this.draw();
        });
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

                this.ctx.fillStyle = (plot && plot.is_bed) ? '#8B4513' : (isAlt ? '#E0E0E0' : '#F0F0F0');
                this.ctx.fillRect(x, y, this.cellSize - 1, this.cellSize - 1);

                // 作物(SVG)の描画ロジックもここに入る
            }
        }
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

    // 外部（ボタンなど）から編集モードをONにするためのメソッド
    startEditing(vegId, vegName) {
        this.editor.active = true;
        this.editor.vegId = vegId;
        this.editor.vegName = vegName;
        this.draw();
    }
};