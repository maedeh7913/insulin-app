
"use strict";

(() => {
    const STORAGE_KEY = "smartInsulinCapGlucoseRecords";
    const $ = id => document.getElementById(id);

    let records = loadRecords();

    function loadRecords() {
        try {
            const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            if (!Array.isArray(data)) return [];

            return data.filter(r =>
                r &&
                typeof r.id === "string" &&
                Number.isFinite(Number(r.value)) &&
                Number(r.value) > 0 &&
                Number.isFinite(Number(r.timestamp)) &&
                ["mg/dL", "mmol/L"].includes(r.unit)
            ).sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            console.error("خطا در بارگذاری سوابق قند خون:", error);
            return [];
        }
    }

    function saveRecords() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
            return true;
        } catch (error) {
            console.error("خطا در ذخیره قند خون:", error);
            alert("ذخیره اطلاعات ممکن نشد. تنظیمات مرورگر را بررسی کنید.");
            return false;
        }
    }

    function localDateTime(date = new Date()) {
        const pad = n => String(n).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function formatDate(timestamp) {
        const date = new Date(Number(timestamp));
        return date.toLocaleDateString("fa-IR") + "، " +
            date.toLocaleTimeString("fa-IR", {
                hour: "2-digit",
                minute: "2-digit"
            });
    }

    function mealText(meal) {
        const labels = {
            fasting: "ناشتا",
            before_meal: "قبل از غذا",
            after_meal: "بعد از غذا",
            bedtime: "قبل از خواب",
            random: "زمان دیگر"
        };
        return labels[meal] || "ثبت نشده";
    }

    function createInterface() {
       const page = $("glucosePage");

if (!page || $("glucoseFeature")) return;

        const section = document.createElement("section");
        section.id = "glucoseFeature";
        section.className = "glucose-card";
section.style.marginTop = "0";
        section.innerHTML = `
            <div class="glucose-header">
                <div>
                    <h3>ثبت قند خون</h3>
                    <p>اندازه‌گیری‌های خود را ثبت و روند آن‌ها را مشاهده کنید.</p>
                </div>
                <span class="glucose-icon">🩸</span>
            </div>

            <form id="glucoseForm">
                <label for="glucoseValue">مقدار قند خون</label>
                <div class="glucose-value-row">
                    <input
                        id="glucoseValue"
                        type="number"
                        min="1"
                        max="2000"
                        step="any"
                        inputmode="decimal"
                        placeholder="مثلاً 110"
                        required
                    >
                    <select id="glucoseUnit" aria-label="واحد قند خون">
                        <option value="mg/dL">mg/dL</option>
                        <option value="mmol/L">mmol/L</option>
                    </select>
                </div>

                <label for="glucoseDateTime">تاریخ و ساعت اندازه‌گیری</label>
                <input id="glucoseDateTime" type="datetime-local" required>

                <label for="glucoseMeal">زمان اندازه‌گیری نسبت به غذا</label>
                <select id="glucoseMeal">
                    <option value="fasting">ناشتا</option>
                    <option value="before_meal">قبل از غذا</option>
                    <option value="after_meal">بعد از غذا</option>
                    <option value="bedtime">قبل از خواب</option>
                    <option value="random">زمان دیگر</option>
                </select>

                <label for="glucoseNote">یادداشت (اختیاری)</label>
                <input
                    id="glucoseNote"
                    type="text"
                    maxlength="160"
                    placeholder="توضیح کوتاه"
                >

                <button type="submit" class="glucose-save">
                    ثبت اندازه‌گیری
                </button>

                <p id="glucoseMessage" role="status"></p>
            </form>

            <div class="glucose-subheading">
                <h3>نمودار قند خون</h3>
                <p>حداکثر ۲۰ اندازه‌گیری اخیر</p>
            </div>

            <div id="glucoseChart"></div>

            <div class="glucose-subheading">
                <h3>سوابق قند خون</h3>
                <span id="glucoseCount"></span>
            </div>

            <div id="glucoseHistory"></div>

            <p class="glucose-disclaimer">
                این بخش برای ثبت و مشاهده اطلاعات است و جایگزین توصیه پزشک
                یا ابزار تصمیم‌گیری درباره درمان و دوز انسولین نیست.
            </p>
        `;

        page.appendChild(section);

        $("glucoseDateTime").value = localDateTime();

        $("glucoseForm").addEventListener("submit", addRecord);
        $("glucoseHistory").addEventListener("click", deleteRecord);

        renderAll();
    }

    function addRecord(event) {
        event.preventDefault();

        const value = Number($("glucoseValue").value);
        const unit = $("glucoseUnit").value;
        const dateValue = $("glucoseDateTime").value;
        const timestamp = new Date(dateValue).getTime();
        const message = $("glucoseMessage");

        message.style.color = "#b91c1c";

        if (!Number.isFinite(value) || value <= 0 || value > 2000) {
            message.textContent = "مقدار قند خون را به‌صورت عددی معتبر وارد کنید.";
            return;
        }

        if (!dateValue || !Number.isFinite(timestamp)) {
            message.textContent = "تاریخ و ساعت معتبر وارد کنید.";
            return;
        }

        if (unit === "mmol/L" && value > 111) {
            message.textContent =
                "این مقدار برای واحد mmol/L غیرمعمول است؛ مقدار و واحد را بررسی کنید.";
            return;
        }

        const record = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            value,
            unit,
            timestamp,
            meal: $("glucoseMeal").value,
            note: $("glucoseNote").value.trim()
        };

        const previousRecords = records.slice();
        records.push(record);
        records.sort((a, b) => b.timestamp - a.timestamp);

        if (!saveRecords()) {
            records = previousRecords;
            return;
        }

        $("glucoseValue").value = "";
        $("glucoseNote").value = "";
        $("glucoseDateTime").value = localDateTime();

        message.style.color = "#15803d";
        message.textContent = "اندازه‌گیری ذخیره شد.";

        renderAll();
    }

    function deleteRecord(event) {
        const button = event.target.closest("[data-delete-id]");
        if (!button) return;

        const id = button.dataset.deleteId;
        if (!records.some(record => record.id === id)) return;

        if (!confirm("این رکورد قند خون حذف شود؟")) return;

        const previousRecords = records.slice();
        records = records.filter(record => record.id !== id);

        if (!saveRecords()) {
            records = previousRecords;
            return;
        }

        renderAll();
    }

    function renderAll() {
        renderChart();
        renderHistory();
    }

    function renderChart() {
        const container = $("glucoseChart");
        if (!container) return;

        if (!records.length) {
            container.innerHTML = `
                <div class="glucose-empty">
                    هنوز اندازه‌گیری قند خونی ثبت نشده است.
                    پس از ثبت داده‌ها، نمودار در این قسمت نمایش داده می‌شود.
                </div>
            `;
            return;
        }

        // برای مقایسه روی یک محور، mmol/L به معادل تقریبی mg/dL تبدیل می‌شود.
        // مقدار اصلی رکوردها تغییر نمی‌کند.
        const recent = records.slice(0, 20).reverse();
        const chartValues = recent.map(record => ({
            record,
            mg: record.unit === "mmol/L"
                ? record.value * 18.0182
                : record.value
        }));

        const width = 340;
        const height = 220;
        const left = 40;
        const right = 12;
        const top = 20;
        const bottom = 48;
        const plotWidth = width - left - right;
        const plotHeight = height - top - bottom;

        const maxValue = Math.max(
            100,
            ...chartValues.map(item => item.mg)
        );
        const chartMax = Math.ceil(maxValue / 50) * 50;

        const x = index => chartValues.length === 1
            ? left + plotWidth / 2
            : left + index * plotWidth / (chartValues.length - 1);

        const y = value =>
            top + plotHeight * (1 - value / chartMax);

        const grid = [0, 0.5, 1].map(ratio => {
            const gy = top + plotHeight * (1 - ratio);
            const label = Math.round(chartMax * ratio);

            return `
                <line
                    x1="${left}" y1="${gy}"
                    x2="${width - right}" y2="${gy}"
                    stroke="currentColor"
                    opacity="0.16"
                    stroke-dasharray="3 3"
                />
                <text
                    x="${left - 7}" y="${gy + 4}"
                    text-anchor="end"
                    font-size="9"
                    fill="currentColor"
                >${label}</text>
            `;
        }).join("");

        const points = chartValues.map((item, index) => {
            const px = x(index);
            const py = y(item.mg);
            const color = item.record.unit === "mg/dL"
                ? "#e11d48"
                : "#7c3aed";

            return `
                <circle cx="${px}" cy="${py}" r="4" fill="${color}">
                    <title>${item.record.value} ${item.record.unit}</title>
                </circle>
                <text
                    x="${px}" y="${height - 25}"
                    text-anchor="middle"
                    font-size="8"
                    fill="currentColor"
                >${new Date(item.record.timestamp).toLocaleDateString(
                    "fa-IR", { day: "numeric", month: "numeric" }
                )}</text>
            `;
        }).join("");

        const line = chartValues.map((item, index) =>
            `${x(index)},${y(item.mg)}`
        ).join(" ");

        const units = [...new Set(recent.map(r => r.unit))];

        const legend = units.map(unit => `
            <span class="glucose-legend-item">
                <span class="glucose-legend-dot"
                    style="background:${unit === "mg/dL" ? "#e11d48" : "#7c3aed"}">
                </span>
                ${unit}
            </span>
        `).join("");

        container.innerHTML = `
            <svg
                viewBox="0 0 ${width} ${height}"
                role="img"
                aria-label="نمودار اندازه‌گیری‌های قند خون"
                style="display:block;width:100%;height:auto;color:inherit"
            >
                ${grid}
                ${chartValues.length > 1
                    ? `<polyline points="${line}" fill="none"
                        stroke="#94a3b8" stroke-width="1.5"/>`
                    : ""}
                ${points}
            </svg>
            <p class="glucose-chart-note">
                محور عمودی بر حسب معادل تقریبی mg/dL است.
                مقدار و واحد دقیق هر اندازه‌گیری در سوابق نمایش داده می‌شود.
            </p>
            <div class="glucose-legend">${legend}</div>
        `;
    }

    function renderHistory() {
        const container = $("glucoseHistory");
        if (!container) return;

        $("glucoseCount").textContent =
            `${records.length.toLocaleString("fa-IR")} رکورد`;

        container.replaceChildren();

        if (!records.length) {
            const empty = document.createElement("div");
            empty.className = "glucose-empty";
            empty.textContent = "هنوز سابقه‌ای ثبت نشده است.";
            container.appendChild(empty);
            return;
        }

        // متن رکوردها با textContent درج می‌شود تا یادداشت کاربر به‌عنوان HTML اجرا نشود.
        records.slice(0, 100).forEach(record => {
            const item = document.createElement("div");
            item.className = "glucose-record";

            const main = document.createElement("div");
            main.className = "glucose-record-main";

            const value = document.createElement("div");
            value.className = "glucose-record-value";
            value.textContent =
                `${Number(record.value).toLocaleString("fa-IR")} ${record.unit}`;

            const meta = document.createElement("div");
            meta.className = "glucose-record-meta";
            meta.textContent =
                `${formatDate(record.timestamp)} · ${mealText(record.meal)}` +
                (record.note ? ` · ${record.note}` : "");

            const button = document.createElement("button");
            button.type = "button";
            button.className = "glucose-delete";
            button.textContent = "حذف";
            button.dataset.deleteId = record.id;

            main.append(value, meta);
            item.append(main, button);
            container.appendChild(item);
        });

        if (records.length > 100) {
            const note = document.createElement("p");
            note.className = "glucose-chart-note";
            note.textContent =
                "۱۰۰ رکورد اخیر نمایش داده شده‌اند؛ سایر رکوردها نیز ذخیره هستند.";
            container.appendChild(note);
        }
    }

    document.addEventListener("DOMContentLoaded", createInterface);
})();

