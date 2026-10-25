// Smart Insulin Cap — BLE receive, history, timer and UI bridge
"use strict";

const SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
const CHARACTERISTIC_UUID = "abcdefab-1234-1234-1234-abcdefabcdef";
const HISTORY_STORAGE_KEY = "smartInsulinCapHistory";

let bleDevice = null;
let bleCharacteristic = null;
let bleServer = null;
let rxTextBuffer = "";

let appData = {
    capConnected: null,
    injectionActive: null,
    angle: null,
    dose: null,
    durationMs: null,
    injectionInvalid: null
};

function loadHistoryRecords() {
    try {
        const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!saved) return [];
        const records = JSON.parse(saved);
        if (!Array.isArray(records)) return [];
        return records.filter(record =>
            record &&
            Number.isFinite(Number(record.timestamp)) &&
            Number.isFinite(Number(record.dose)) &&
            Number(record.dose) > 0
        ).sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    } catch (error) {
        console.warn("[HISTORY] Could not load saved history:", error);
        return [];
    }
}

const historyRecords = loadHistoryRecords();
let previousFirmwareStatus = null;
let latestValidDose = null;
let latestValidAngle = null;
let latestDurationMs = null;
let latestInjectionInvalid = null;
let lastRecordedEventKey = null;
let lastReceivedCompletedSignature = null;

function saveHistoryRecords() {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyRecords));
    } catch (error) {
        console.warn("[HISTORY] Could not save history:", error);
    }
}

function $(id) {
    return document.getElementById(id);
}

function setConnectionStatus(status) {
    const root = $("connectionStatus");
    const label = $("connectionText");
    const button = $("connectButton");

    if (root) {
        root.classList.remove("connected", "waiting", "disconnected", "connecting");
        root.classList.add(
            status === "connected" ? "connected" :
            status === "disconnected" ? "disconnected" : "waiting"
        );
    }
    if (label) {
        label.textContent =
            status === "connected" ? "متصل" :
            status === "connecting" ? "در حال اتصال..." :
            status === "disconnected" ? "قطع" : "آماده";
    }
    if (button) {
        button.disabled = status === "connecting" || status === "connected";
        button.textContent =
            status === "connected" ? "متصل شد" :
            status === "connecting" ? "در حال اتصال..." :
            "اتصال به درپوش";
    }
}

function showPage(pageName) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
        page.style.display = "none";
    });
    const target = $(pageName + "Page");
    if (target) {
        target.classList.add("active");
        target.style.display = "block";
    }
    document.querySelectorAll(".nav-item").forEach(button => {
        button.classList.remove("active");
        const value = button.getAttribute("onclick") || "";
        if (value.includes("'" + pageName + "'")) button.classList.add("active");
    });
    if (pageName === "statistics") renderDoseChart();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function connectDevice() {
    if (!navigator.bluetooth) {
        alert("این مرورگر از Web Bluetooth پشتیبانی نمی‌کند. از Chrome یا Edge در بستر HTTPS استفاده کنید.");
        return;
    }
    if (bleDevice?.gatt?.connected && bleCharacteristic) {
        console.info("[BLE] Already connected.");
        return;
    }

    try {
        setConnectionStatus("connecting");
        if (!bleDevice) {
            bleDevice = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [SERVICE_UUID]
            });
            bleDevice.addEventListener("gattserverdisconnected", handleDisconnect);
        }

        bleServer = await bleDevice.gatt.connect();
        const service = await bleServer.getPrimaryService(SERVICE_UUID);
        bleCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
        bleCharacteristic.removeEventListener("characteristicvaluechanged", handleBLEData);
        bleCharacteristic.addEventListener("characteristicvaluechanged", handleBLEData);
        await bleCharacteristic.startNotifications();
        rxTextBuffer = "";
        setConnectionStatus("connected");

        console.info("[BLE] Connected", {
            deviceName: bleDevice.name || "(unnamed)",
            serviceUUID: SERVICE_UUID,
            characteristicUUID: CHARACTERISTIC_UUID
        });
        setSystemMessage({ ...appData, status: "ready" });

        if (bleCharacteristic.properties.read) {
            try {
                const value = await bleCharacteristic.readValue();
                consumeDataView(value, "initial-read");
            } catch (error) {
                console.warn("[BLE] Initial read unavailable.", error);
            }
        }
    } catch (error) {
        console.error("[BLE] Connection error:", error);
        setConnectionStatus(bleDevice?.gatt?.connected ? "connected" : "ready");
        setSystemMessage({ ...appData, status: "ready" });
        if (bleDevice?.gatt?.connected) {
            try { bleDevice.gatt.disconnect(); } catch (_) {}
        }
        alert("اتصال برقرار نشد. اتصال بلوتوث و کد برد را بررسی کنید.");
    }
}

function handleDisconnect() {
    bleCharacteristic = null;
    bleServer = null;
    rxTextBuffer = "";
    setConnectionStatus("disconnected");
    setSystemMessage({ ...appData, status: "ready" });
    console.warn("[BLE] Device disconnected.");
}

function handleBLEData(event) {
    if (!event?.target?.value) {
        console.warn("[BLE] Notification has no DataView.");
        return;
    }
    consumeDataView(event.target.value, "notification");
}

function consumeDataView(dataView, source) {
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const chunk = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    console.log(`[BLE RAW ${source}]`, chunk);
    rxTextBuffer += chunk;
    if (rxTextBuffer.length > 16384) {
        console.warn("[BLE] Receive buffer cleared.");
        rxTextBuffer = chunk;
    }
    processReceiveBuffer();
}

function processReceiveBuffer() {
    let newlineIndex;
    while ((newlineIndex = rxTextBuffer.indexOf("\n")) >= 0) {
        const record = rxTextBuffer.slice(0, newlineIndex).trim();
        rxTextBuffer = rxTextBuffer.slice(newlineIndex + 1);
        if (record) processRecord(record);
    }

    while (rxTextBuffer.trim().startsWith("{")) {
        const trimmed = rxTextBuffer.trimStart();
        const leadingWhitespace = rxTextBuffer.length - trimmed.length;
        let depth = 0, inString = false, escaped = false, end = -1;

        for (let i = 0; i < trimmed.length; i++) {
            const ch = trimmed[i];
            if (inString) {
                if (escaped) escaped = false;
                else if (ch === "\\") escaped = true;
                else if (ch === '"') inString = false;
            } else {
                if (ch === '"') inString = true;
                else if (ch === "{") depth++;
                else if (ch === "}") {
                    depth--;
                    if (depth === 0) { end = i + 1; break; }
                }
            }
        }
        if (end < 0) return;
        const record = trimmed.slice(0, end);
        rxTextBuffer = rxTextBuffer.slice(leadingWhitespace + end);
        processRecord(record);
    }
}

function processRecord(raw) {
    console.log("[BLE RECORD]", raw);
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        console.warn("[BLE] Received non-JSON data:", raw);
        return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        console.warn("[BLE] Invalid JSON object.", parsed);
        return;
    }
    console.log("[BLE PARSED]", parsed);
    applyIncomingData(parsed);
}

function validBoolean(value) {
    return typeof value === "boolean" ? value : null;
}

function validFiniteNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function getOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function applyIncomingData(data) {
    const status = typeof data.status === "string" ? data.status.toLowerCase() : null;
    const normalized = {};

    const capValue = getOwn(data, "capConnected") ? data.capConnected : data.cap;
    if (capValue !== undefined) {
        const value = validBoolean(capValue);
        if (value !== null) normalized.capConnected = value;
    }

    if (getOwn(data, "injectionActive")) {
        const value = validBoolean(data.injectionActive);
        if (value !== null) normalized.injectionActive = value;
    } else if (status !== null) {
        normalized.injectionActive = status === "injecting";
    }

    const angleValue = getOwn(data, "angle") ? data.angle : data.yaw;
    if (angleValue !== undefined) {
        const value = validFiniteNumber(angleValue);
        if (value !== null) normalized.angle = value;
    }

    if (getOwn(data, "dose")) {
        const value = validFiniteNumber(data.dose);
        if (value !== null && value >= 0) normalized.dose = value;
    }

    const durationValue = getOwn(data, "durationMs") ? data.durationMs : data.duration;
    if (durationValue !== undefined) {
        const value = validFiniteNumber(durationValue);
        if (value !== null && value >= 0) normalized.durationMs = value;
    }

    if (getOwn(data, "injectionInvalid")) {
        const value = validBoolean(data.injectionInvalid);
        if (value !== null) normalized.injectionInvalid = value;
    } else if (
        status === "invalid" ||
        ((status === "completed" || status === "injecting") && data.valid === false)
    ) {
        normalized.injectionInvalid = true;
    } else if (
        (status === "completed" || status === "injecting") &&
        data.valid === true
    ) {
        normalized.injectionInvalid = false;
    }

    Object.assign(appData, normalized);

    if (getOwn(normalized, "capConnected")) updateCapStatus(normalized.capConnected);
    if (getOwn(normalized, "injectionActive")) updateInjectionState(normalized.injectionActive);
    if (getOwn(normalized, "angle")) {
        latestValidAngle = normalized.angle;
        updateAngle(normalized.angle);
    }
    if (getOwn(normalized, "dose")) {
        latestValidDose = normalized.dose;
        updateDose(normalized.dose);
    }
    if (getOwn(normalized, "durationMs")) latestDurationMs = normalized.durationMs;
    if (getOwn(normalized, "injectionInvalid")) {
        latestInjectionInvalid = normalized.injectionInvalid;
        updateValidity(normalized.injectionInvalid);
    }

    if (status === "completed" && previousFirmwareStatus !== "completed") {
        maybeRecordCompletedInjection(data);
    }
    previousFirmwareStatus = status ?? previousFirmwareStatus;

    updateDashboardFromHistory();
    updateTimeSinceLastInjection();
    setSystemMessage({ ...appData, status });
}

function maybeRecordCompletedInjection(payload) {
    const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
    const valid =
        payload.valid === true &&
        status === "completed" &&
        latestInjectionInvalid !== true &&
        latestValidDose !== null &&
        latestValidDose > 0;

    if (!valid) {
        console.info("[HISTORY] Injection not recorded: completion, validity and dose requirements not met.");
        return;
    }

    const eventKey = payload.eventId ?? payload.timestamp ?? payload.dateTime ?? null;
    if (eventKey !== null && eventKey === lastRecordedEventKey) return;
    if (eventKey !== null) lastRecordedEventKey = eventKey;

    // Fallback duplicate guard for firmware payloads without an event identifier.
    const signature = `${latestValidDose}|${latestValidAngle}|${latestDurationMs}`;
    const now = Date.now();
    if (eventKey === null && signature === lastReceivedCompletedSignature) {
        const newest = historyRecords[0];
        if (newest && now - Number(newest.timestamp) < 5000) {
            console.info("[HISTORY] Ignored repeated completion payload.");
            return;
        }
    }
    lastReceivedCompletedSignature = signature;

    const record = {
        dose: latestValidDose,
        angle: latestValidAngle,
        durationMs: latestDurationMs,
        timestamp: now,
        timestampSource: "browser_receive_time",
        firmwareConfirmed: true
    };

    historyRecords.unshift(record);
    historyRecords.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    saveHistoryRecords();
    renderHistory();
    updateDashboardFromHistory();
    updateTimeSinceLastInjection();
    renderDoseChart();
    console.info("[HISTORY] Completed injection recorded:", record);
}

function updateCapStatus(connected) {
    if ($("capStatus")) $("capStatus").textContent = connected ? "درپوش متصل است" : "درپوش جدا است";
    if ($("capStatusValue")) $("capStatusValue").textContent = connected ? "متصل" : "جدا";
}

function updateInjectionState(active) {
    if ($("injectionStateValue")) $("injectionStateValue").textContent = active ? "در حال تزریق" : "غیرفعال";
    const root = $("injectionStatus");
    if (root) {
        root.classList.remove("waiting", "injecting", "completed");
        root.classList.add(active ? "injecting" : "waiting");
        const text = root.querySelector("span:last-child");
        if (text) text.textContent = active ? "در حال تزریق" : "آماده";
    }
}

function updateAngle(angle) {
    const numericAngle = validFiniteNumber(angle);
    if (numericAngle === null) return;
    if ($("angleValue")) $("angleValue").textContent = numericAngle.toFixed(2) + "°";
    if ($("anglePercent") || $("angleProgress")) {
        const percent = Math.min(Math.abs(numericAngle) / 1080 * 100, 100);
        if ($("anglePercent")) $("anglePercent").textContent = Math.round(percent) + "%";
        if ($("angleProgress")) $("angleProgress").style.width = percent + "%";
    }
}

function updateDose(dose) {
    const n = validFiniteNumber(dose);
    if (n === null) return;
    if ($("doseValue")) $("doseValue").textContent = n.toFixed(2) + " واحد";
    if ($("lastDose")) $("lastDose").textContent = n.toFixed(2);
}

function updateValidity(invalid) {
    const el = $("validityValue");
    if (!el || typeof invalid !== "boolean") return;
    el.classList.remove("valid", "invalid");
    el.textContent = invalid ? "نامعتبر" : "معتبر";
    el.classList.add(invalid ? "invalid" : "valid");
}

function setSystemMessage(data) {
    const el = $("systemMessage");
    if (!el) return;
    if (data.capConnected === false) {
        el.textContent = "درپوش را به قلم متصل کنید.";
    } else if (data.status === "invalid" || data.injectionInvalid === true) {
        el.textContent = "برد، فرآیند تزریق را نامعتبر اعلام کرده است.";
    } else if (data.status === "completed") {
        el.textContent = "تزریق پایان یافت؛ نتیجه از برد دریافت شد.";
    } else if (data.injectionActive === true) {
        el.textContent = "فرآیند تزریق طبق داده دریافتی برد در حال انجام است.";
    } else if (bleDevice?.gatt?.connected) {
        el.textContent = "بلوتوث متصل است؛ منتظر داده‌های بعدی برد...";
    } else {
        el.textContent = "برای دریافت داده‌های واقعی، به درپوش متصل شوید.";
    }
}

function getValidHistory() {
    return historyRecords
        .filter(record =>
            Number.isFinite(Number(record.timestamp)) &&
            Number.isFinite(Number(record.dose)) &&
            Number(record.dose) > 0
        )
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
}

function updateDashboardFromHistory() {
    const records = getValidHistory();
    const todayKey = new Date().toDateString();
    const today = records.filter(record => new Date(Number(record.timestamp)).toDateString() === todayKey);
    const totalToday = today.reduce((sum, record) => sum + Number(record.dose), 0);
    const totalAll = records.reduce((sum, record) => sum + Number(record.dose), 0);

    if ($("todayInjections")) $("todayInjections").textContent = String(today.length);
    if ($("todayTotalDose")) $("todayTotalDose").textContent = totalToday.toFixed(2);
    if ($("statisticsInjectionCount")) $("statisticsInjectionCount").textContent = String(records.length);
    if ($("statisticsTotalDose")) $("statisticsTotalDose").textContent = totalAll.toFixed(2);

    if ($("lastDose")) $("lastDose").textContent = records.length ? Number(records[0].dose).toFixed(2) : "--";
    if ($("lastInjectionTime")) {
        $("lastInjectionTime").textContent = records.length
            ? new Date(Number(records[0].timestamp)).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })
            : "--";
    }
}

function updateTimeSinceLastInjection() {
    const el = $("timeSinceLastInjection");
    if (!el) return;

    const records = getValidHistory();
    if (!records.length) {
        el.textContent = "ثبت نشده";
        return;
    }

    const timestamp = Number(records[0].timestamp);
    const elapsed = Math.max(0, Date.now() - timestamp);
    const totalMinutes = Math.floor(elapsed / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) el.textContent = `${days} روز و ${hours} ساعت`;
    else if (hours > 0) el.textContent = `${hours} ساعت و ${minutes} دقیقه`;
    else if (totalMinutes > 0) el.textContent = `${totalMinutes} دقیقه`;
    else el.textContent = "کمتر از یک دقیقه";
}

function renderDoseChart() {
    const container = $("doseChart");
    if (!container) return;

    const records = getValidHistory();
    if (!records.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <div class="empty-title">هنوز داده‌ای برای نمودار وجود ندارد</div>
                <div class="empty-text">پس از ثبت تزریق‌های معتبر، نمودار دوز روزانه در این قسمت نمایش داده می‌شود.</div>
            </div>`;
        return;
    }

    const byDay = new Map();
    records.forEach(record => {
        const date = new Date(Number(record.timestamp));
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const current = byDay.get(key) || { date, dose: 0, count: 0 };
        current.dose += Number(record.dose);
        current.count += 1;
        byDay.set(key, current);
    });

    const days = Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-7)
        .map(([key, value]) => ({ key, ...value }));

    const width = 320, height = 210;
    const left = 42, right = 10, top = 18, bottom = 48;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxDose = Math.max(...days.map(d => d.dose), 1);
    const step = plotWidth / days.length;
    const barWidth = Math.min(28, step * 0.58);

    const grid = [0, 0.5, 1].map(ratio => {
        const y = top + plotHeight * (1 - ratio);
        const value = (maxDose * ratio).toFixed(maxDose < 10 ? 1 : 0);
        return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" stroke="currentColor" opacity="0.14" stroke-dasharray="3 3"></line>
                <text x="${left-7}" y="${y+4}" text-anchor="end" font-size="9" fill="currentColor">${value}</text>`;
    }).join("");

    const bars = days.map((day, index) => {
        const barHeight = (day.dose / maxDose) * plotHeight;
        const x = left + step * index + (step - barWidth) / 2;
        const y = top + plotHeight - barHeight;
        const label = day.date.toLocaleDateString("fa-IR", { day: "numeric", month: "numeric" });
        return `<rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, 1)}" rx="4" fill="#2563eb" opacity="0.85"><title>${label}: ${day.dose.toFixed(2)} واحد، ${day.count} تزریق</title></rect>
                <text x="${x + barWidth/2}" y="${Math.max(top+10, y-5)}" text-anchor="middle" font-size="9" fill="currentColor">${day.dose.toFixed(1)}</text>
                <text x="${x + barWidth/2}" y="${height-25}" text-anchor="middle" font-size="9" fill="currentColor">${label}</text>`;
    }).join("");

    container.innerHTML = `
        <div style="width:100%;overflow:hidden;">
          <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="مجموع دوز روزانه در هفت روز دارای داده" style="display:block;width:100%;height:auto;max-width:100%;color:inherit">
            ${grid}
            <line x1="${left}" y1="${top+plotHeight}" x2="${width-right}" y2="${top+plotHeight}" stroke="currentColor" opacity="0.3"></line>
            ${bars}
          </svg>
          <div class="card-label" style="text-align:center;margin-top:4px;">مجموع دوز روزانه (واحد)؛ حداکثر ۷ روز دارای داده</div>
        </div>`;
}

function renderHistory() {
    const list = $("historyList");
    if (!list) return;
    list.replaceChildren();

    const records = getValidHistory();
    if (!records.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "هنوز تزریق تأییدشده‌ای دریافت نشده است.";
        list.appendChild(empty);
        return;
    }

    for (const record of records) {
        const item = document.createElement("div");
        item.className = "history-item";
        const left = document.createElement("div");
        left.className = "history-left";
        const icon = document.createElement("div");
        icon.className = "history-icon";
        icon.textContent = "💉";
        const details = document.createElement("div");
        const dose = document.createElement("div");
        dose.className = "history-dose";
        dose.textContent = `${Number(record.dose).toFixed(2)} واحد`;
        const date = document.createElement("div");
        date.className = "history-date";
        const dt = new Date(Number(record.timestamp));
        date.textContent = `${dt.toLocaleDateString("fa-IR")}، ${dt.toLocaleTimeString("fa-IR", {
            hour: "2-digit", minute: "2-digit"
        })} (زمان دریافت در مرورگر)`;
        details.append(dose, date);
        left.append(icon, details);
        const status = document.createElement("span");
        status.className = "status " + (record.firmwareConfirmed ? "connected" : "waiting");
        status.textContent = "تأییدشده توسط برد";
        item.append(left, status);
        list.appendChild(item);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setConnectionStatus("ready");
    if ($("capStatus")) $("capStatus").textContent = "در انتظار داده از برد";
    if ($("capStatusValue")) $("capStatusValue").textContent = "--";
    if ($("injectionStateValue")) $("injectionStateValue").textContent = "--";
    if ($("angleValue")) $("angleValue").textContent = "--";
    if ($("anglePercent")) $("anglePercent").textContent = "--";
    if ($("angleProgress")) $("angleProgress").style.width = "0%";
    if ($("doseValue")) $("doseValue").textContent = "--";
    if ($("validityValue")) $("validityValue").textContent = "--";

    renderHistory();
    updateDashboardFromHistory();
    updateTimeSinceLastInjection();
    renderDoseChart();

    // فقط نمایش زمان را به‌روزرسانی می‌کند؛ داده‌ای از برد درخواست نمی‌شود.
    window.setInterval(updateTimeSinceLastInjection, 30000);
});

window.connectDevice = connectDevice;
window.showPage = showPage;
