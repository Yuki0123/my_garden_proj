/**
 * GardenAPI.js - 畑エディタのAPI通信
 * サーバーとの通信、データ読み込み・保存を担当
 */

const GardenAPI = {
    /**
     * CSRF トークンを取得
     */
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

    /**
     * 本日のお世話ログを読み込む
     */
    async loadMaintenanceLogs() {
        const state = GardenState;
        const areaId = state.areaId;
        const dateStr = document.getElementById('current-date').value;


        try {
            const response = await fetch(`/garden/api/get_maintenance_logs/?area_id=${areaId}&date=${dateStr}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log("Maintenance logs fetched from server:", data);
                state.maintenanceLogs = Array.isArray(data) ? data : [];
                // サマリーを表示
                const summaryArea = document.getElementById('log-summary');
                if (summaryArea) {
                    if (data.length === 0) {
                        summaryArea.innerHTML = '<span class="uk-text-muted uk-text-small">本日の記録はありません</span>';
                    } else {
                        console.log("Maintenance logs loaded:", data);
                        const summary = data.reduce((acc, log) => {
                            acc[log.task_display] = (acc[log.task_display] || 0) + 1;
                            return acc;
                        }, {});
                        summaryArea.innerHTML = Object.entries(summary)
                            .map(([name, count]) => `<span class="uk-badge uk-margin-small-right" style="background: #1e87f0;">${name} ${count}</span>`)
                            .join('');
                    }
                }

                GardenRenderer.draw();
            } else {
                console.error("Server returned an error:", response.status);
            }
        } catch (error) {
            console.error("ログの読み込み失敗:", error);
            state.maintenanceLogs = [];
            GardenRenderer.draw();
        }
    },

    /**
     * 保存済みの作物を読み込む
     */
    async loadSavedCrops() {
        const state = GardenState;
        try {
            const response = await fetch('/garden/api/get_crops/');
            const data = await response.json();
            state.crops = data.crops;
            GardenRenderer.draw();
        } catch (e) {
            console.error("作物の読み込みに失敗:", e);
        }
    },

    /**
     * 作物を保存
     */
    savePlanting() {
        const state = GardenState;
        const data = {
            veg_id: state.editor.vegId,
            row: state.editor.r,
            col: state.editor.c,
            width: state.editor.w,
            height: state.editor.h
        };

        fetch('/garden/api/save_crop/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCsrfToken()
            },
            body: JSON.stringify(data)
        })
            .then(res => res.json())
            .then(result => {
                alert('登録しました！');
                this.loadSavedCrops();
            });
    },

    /**
     * 作物を収穫
     */
    async harvestCrop(cropId) {
        const state = GardenState;
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
                const crop = state.crops.find(c => c.id === cropId);
                if (crop) {
                    crop.harvested_at = harvestDate;
                }

                GardenRenderer.draw();
                alert('収穫を記録しました！');
            }
        } catch (e) {
            console.error("収穫処理に失敗:", e);
        }
    },

    /**
     * メンテナンスモーダルを開く
     */
    async openMaintenanceModal(target) {
        const state = GardenState;
        const { r, c, cropId, cropName, bedId, bedName } = target;

        console.log("Opening modal for:", target);

        const titleEl = document.getElementById('modal-title');
        const subtitleEl = document.getElementById('modal-subtitle');
        const historyDiv = document.getElementById('plot-history');

        // タイトルを切り替え
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

        state.currentLogTarget = { r, c, cropId, bedId };

        // 履歴を読み込む
        if (historyDiv) {
            historyDiv.innerHTML = '<div class="uk-text-center"><span uk-spinner></span> 履歴を読み込み中...</div>';
        }

        try {
            const url = `/garden/api/get_plot_history/?area_id=${state.areaId}&row=${r}&col=${c}&crop_id=${cropId || ''}&bed_id=${bedId || ''}`;
            const res = await fetch(url);

            if (res.ok) {
                const history = await res.json();
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

    /**
     * メンテナンスログを保存
     */
    async saveMaintenanceLog() {
        const state = GardenState;
        const payload = {
            area_id: state.areaId,
            task_type: document.getElementById('log-task-type').value,
            note: document.getElementById('log-note').value,
            row: state.currentLogTarget.r,
            col: state.currentLogTarget.c,
            crop_id: state.currentLogTarget.cropId,
            bed_id: state.currentLogTarget.bedId,
            date: document.getElementById('current-date').value
        };


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
                this.loadMaintenanceLogs();
            }
        } catch (error) {
            console.error("保存失敗:", error);
        }
    },

    async savePlanting() {
        const state = GardenState;
        const data = {
            veg_id: state.editor.vegId,
            row: state.editor.r,
            col: state.editor.c,
            width: state.editor.w,
            height: state.editor.h
        };

        await fetch('/garden/api/save_crop/', { // 実際のURLに合わせて変更
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

};
