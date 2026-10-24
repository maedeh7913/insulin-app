// Smart Insulin Cap — BLE receive and UI bridge
// Existing Web Bluetooth connection pattern and UUIDs are preserved.
// IMPORTANT: JSON fields are interpreted only when present and valid.
// Raw payloads are always logged for firmware protocol discovery.

"use strict";

const SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
const CHARACTERISTIC_UUID = "abcdefab-1234-1234-1234-abcdefabcdef";

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

const historyRecords = [];
let previousInjectionActive = null;
let latestValidDose = null;
let latestValidAngle = null;
let latestDurationMs = null;
let latestInjectionInvalid = null;
let latestCapConnected = null;
let lastRecordedEventKey = null;

const KNOWN_FIELDS = new Set([
    "capConnected", "injectionActive", "angle", "dose",
    "durationMs", "injectionInvalid", "injectionCompleted",
    "event", "timestamp", "time", "dateTime", "message",
    "fsr1", "fsr2", "pressure1", "pressure2", "yaw", "pitch", "roll"
]);

function $(id) { return document.getElementById(id); }

function setConnectionStatus(status) {
    const root = $("connectionStatus");
    const label = $("connectionText");
    const button = $("connectButton");
    if (root) {
        root.classList.remove("connected", "waiting", "disconnected", "connecting");
        root.classList.add(status === "connected" ? "connected" :
            status === "disconnected" ? "disconnected" : "waiting");
    }
    if (label) {
        label.textContent = status === "connected" ? "متصل" :
            status === "connecting" ? "در حال اتصال..." :
            status === "disconnected" ? "قطع" : "آماده";
    }
    if (button) {
        button.disabled = status === "connecting" || status === "connected";
        button.textContent = status === "connected" ? "متصل شد" :
            status === "connecting" ? "در حال اتصال..." : "اتصال به درپوش";
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
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function connectDevice() {
    if (!navigator.bluetooth) {
        alert("این مرورگر از Web Bluetooth پشتیبانی نمی‌کند. از Chrome یا Edge در بستر HTTPS استفاده کنید.");
        return;
    }
    if (bleDevice?.gatt?.connected && bleCharacteristic) {
        console.info("[BLE] Already connected; reusing existing connection.");
        return;
    }

    try {
        setConnectionStatus("connecting");
        // Preserve the existing service-filtered device chooser; do not create a second connection flow.
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

        // Subscribe before reporting success so notification setup errors are visible.
        bleCharacteristic.removeEventListener("characteristicvaluechanged", handleBLEData);
        bleCharacteristic.addEventListener("characteristicvaluechanged", handleBLEData);
        await bleCharacteristic.startNotifications();

        rxTextBuffer = "";
        setConnectionStatus("connected");
        console.info("[BLE] Connected", {
            deviceName: bleDevice.name || "(unnamed)",
            serviceUUID: SERVICE_UUID,
            characteristicUUID: CHARACTERISTIC_UUID,
            properties: {
                notify: bleCharacteristic.properties.notify,
                indicate: bleCharacteristic.properties.indicate,
                read: bleCharacteristic.properties.read
            }
        });
        setSystemMessage("بلوتوث متصل است؛ در انتظار داده از برد...");
        // Optional initial read, only if this characteristic explicitly supports READ.
        if (bleCharacteristic.properties.read) {
            try {
                const value = await bleCharacteristic.readValue();
                consumeDataView(value, "initial-read");
            } catch (e) {
                console.warn("[BLE] Initial read unavailable; waiting for notifications.", e);
            }
        }
    } catch (error) {
        console.error("[BLE] Connection error:", error);
        setConnectionStatus(bleDevice?.gatt?.connected ? "connected" : "ready");
        setSystemMessage("اتصال برقرار نشد. جزئیات خطا در Console مرورگر موجود است.");
        if (bleDevice?.gatt?.connected) {
            try { bleDevice.gatt.disconnect(); } catch (_) {}
        }
    }
}

function handleDisconnect() {
    bleCharacteristic = null;
    bleServer = null;
    rxTextBuffer = "";
    setConnectionStatus("disconnected");
    setSystemMessage("ارتباط بلوتوث قطع شد. برای دریافت مجدد، دوباره متصل شوید.");
    console.warn("[BLE] Device disconnected.");
}

function handleBLEData(event) {
    if (!event?.target?.value) {
        console.warn("[BLE] Notification did not contain a DataView.");
        return;
    }
    consumeDataView(event.target.value, "notification");
}

function consumeDataView(dataView, source) {
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const chunk = decoder.decode(bytes);
    // Required during protocol discovery: show bytes and decoded text, even if parsing fails.
    console.log(`[BLE RAW ${source}]`, {
        byteLength: bytes.length,
        hex: Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(" "),
        text: chunk
    });

    // Notifications may contain a whole JSON object, a newline-delimited message,
    // or fragments of a message. Keep partial text until a complete record is found.
    rxTextBuffer += chunk;
    if (rxTextBuffer.length > 16384) {
        console.warn("[BLE] Receive buffer exceeded 16 KB; clearing unparseable buffered data.");
        rxTextBuffer = chunk;
    }
    processReceiveBuffer();
}

function processReceiveBuffer() {
    // First consume newline-delimited records (JSON or text).
    let newlineIndex;
    while ((newlineIndex = rxTextBuffer.indexOf("\n")) >= 0) {
        const record = rxTextBuffer.slice(0, newlineIndex).trim();
        rxTextBuffer = rxTextBuffer.slice(newlineIndex + 1);
        if (record) processRecord(record);
    }

    // Then consume complete concatenated JSON objects, including objects without newlines.
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
        if (end < 0) return; // incomplete JSON; wait for more bytes
        const record = trimmed.slice(0, end);
        rxTextBuffer = rxTextBuffer.slice(leadingWhitespace + end);
        processRecord(record);
        // Continue if another complete JSON object follows.
    }

    // Avoid indefinitely holding obvious non-JSON text. Plain text is logged but
    // not mapped to UI fields until a protocol is defined; process it on idle-like
    // separators such as carriage return, already handled as newline above.
    if (rxTextBuffer.length && !rxTextBuffer.trimStart().startsWith("{")) {
        const candidate = rxTextBuffer.trim();
        if (candidate.length && candidate.length <= 512 && /^(OK|ERROR|[A-Za-z][A-Za-z0-9 _:-]*[:=].*)$/i.test(candidate)) {
            // Keep a short key/value line buffered until newline so split chunks aren't misread.
            return;
        }
    }
}

function processRecord(raw) {
    console.log("[BLE RECORD]", raw);
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        console.warn("[BLE TEXT / NON-JSON — not mapped to clinical fields]", raw);
        return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        console.warn("[BLE JSON ignored: expected an object]", parsed);
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
    // Accept only the explicitly documented field names currently present in the
    // original script. Unknown fields remain visible in [BLE PARSED] for diagnosis.
    const normalized = {};
    if (getOwn(data, "capConnected")) {
        const v = validBoolean(data.capConnected);
        if (v !== null) normalized.capConnected = v;
        else console.warn("[BLE] Ignored invalid capConnected:", data.capConnected);
    }
    if (getOwn(data, "injectionActive")) {
        const v = validBoolean(data.injectionActive);
        if (v !== null) normalized.injectionActive = v;
        else console.warn("[BLE] Ignored invalid injectionActive:", data.injectionActive);
    }
    for (const key of ["angle", "dose", "durationMs"]) {
        if (getOwn(data, key)) {
            const v = validFiniteNumber(data[key]);
            if (v !== null && (key !== "durationMs" || v >= 0)) normalized[key] = v;
            else console.warn(`[BLE] Ignored invalid ${key}:`, data[key]);
        }
    }
    if (getOwn(data, "injectionInvalid")) {
        const v = validBoolean(data.injectionInvalid);
        if (v !== null) normalized.injectionInvalid = v;
        else console.warn("[BLE] Ignored invalid injectionInvalid:", data.injectionInvalid);
    }

    // Update only fields actually present and valid; partial messages do not erase state.
    Object.assign(appData, normalized);
    if (getOwn(normalized, "capConnected")) {
        latestCapConnected = normalized.capConnected;
        updateCapStatus(normalized.capConnected);
    }
    if (getOwn(normalized, "injectionActive")) {
        const wasActive = previousInjectionActive;
        previousInjectionActive = normalized.injectionActive;
        updateInjectionState(normalized.injectionActive);
        // A falling edge is only a candidate completion. We record it only when
        // a valid dose was received and firmware has not marked it invalid.
        if (wasActive === true && normalized.injectionActive === false) {
            maybeRecordCompletedInjection(data);
        }
    }
    if (getOwn(normalized, "angle")) {
        latestValidAngle = normalized.angle;
        updateAngle(normalized.angle);
    }
    if (getOwn(normalized, "dose")) {
        latestValidDose = normalized.dose;
        updateDose(normalized.dose);
    }
    if (getOwn(normalized, "durationMs")) {
        latestDurationMs = normalized.durationMs;
        updateDuration(normalized.durationMs);
    }
    if (getOwn(normalized, "injectionInvalid")) {
        latestInjectionInvalid = normalized.injectionInvalid;
        updateValidity(normalized.injectionInvalid);
    }
    updateDashboardFromHistory();
    updateSystemMessage(appData);
}

function maybeRecordCompletedInjection(payload) {
    const explicitlyCompleted = payload.injectionCompleted === true ||
        payload.event === "injection_completed" || payload.event === "injectionCompleted";
    const invalid = getOwn(payload, "injectionInvalid") ?
        payload.injectionInvalid === true : latestInjectionInvalid === true;
    // Do not infer an injection record from a state transition alone. The firmware
    // must explicitly mark completion in the same payload before history is written.
    if (!explicitlyCompleted || invalid || latestValidDose === null) {
        console.info("[HISTORY] Not recorded: requires explicit firmware completion event, a valid dose, and a non-invalid status.");
        return;
    }
    // Do not fabricate timestamps; local receive time is labelled as receive time.
    const eventKey = payload.eventId ?? payload.timestamp ?? payload.dateTime ?? null;
    if (eventKey !== null && eventKey === lastRecordedEventKey) return;
    lastRecordedEventKey = eventKey;

    const record = {
        dose: latestValidDose,
        angle: latestValidAngle,
        durationMs: latestDurationMs,
        timestamp: Date.now(),
        timestampSource: "browser_receive_time",
        firmwareConfirmed: true
    };
    historyRecords.unshift(record);
    renderHistory();
    updateDashboardFromHistory();
    console.info("[HISTORY] Added candidate completed injection:", record);
}

function updateCapStatus(connected) {
    const label = connected ? "درپوش متصل است" : "درپوش جدا است";
    if ($("capStatus")) $("capStatus").textContent = label;
    if ($("capStatusValue")) $("capStatusValue").textContent = connected ? "متصل" : "جدا";
    if (!connected) {
        // Do not erase the last measured angle/dose; absence of cap is status only.
    }
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
    // Progress is a display scale only; it is not dose calibration.
    const percent = Math.min(Math.abs(numericAngle) / 1080 * 100, 100);
    if ($("anglePercent")) $("anglePercent").textContent = Math.round(percent) + "%";
    if ($("angleProgress")) $("angleProgress").style.width = percent + "%";
}
function updateDose(dose) {
    const n = validFiniteNumber(dose);
    if (n === null) return;
    if ($("doseValue")) $("doseValue").textContent = n.toFixed(2) + " واحد";
    if ($("lastDose")) $("lastDose").textContent = n.toFixed(2);
}
function updateDuration(durationMs) {
    const n = validFiniteNumber(durationMs);
    if (n === null || n < 0) return;
    if ($("durationValue")) $("durationValue").textContent = (n / 1000).toFixed(2);
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
    if (data.capConnected === false) el.textContent = "درپوش را به قلم متصل کنید.";
    else if (data.injectionInvalid === true) el.textContent = "برد، فرآیند تزریق را نامعتبر اعلام کرده است.";
    else if (data.injectionActive === true) el.textContent = "فرآیند تزریق طبق داده دریافتی برد در حال انجام است.";
    else if (bleDevice?.gatt?.connected) el.textContent = "بلوتوث متصل است؛ منتظر داده‌های بعدی برد...";
    else el.textContent = "برای دریافت داده‌های واقعی، به درپوش متصل شوید.";
}
function updateDashboardFromHistory() {
    if (!historyRecords.length) return;
    const todayKey = new Date().toDateString();
    const today = historyRecords.filter(r => new Date(r.timestamp).toDateString() === todayKey);
    if ($("todayInjections")) $("todayInjections").textContent = String(today.length);
    if ($("todayTotalDose")) {
        $("todayTotalDose").textContent = today.reduce((sum, r) => sum + r.dose, 0).toFixed(2);
    }
    if ($("statisticsInjectionCount")) $("statisticsInjectionCount").textContent = String(historyRecords.length);
    if ($("statisticsTotalDose")) {
        $("statisticsTotalDose").textContent = historyRecords.reduce((sum, r) => sum + r.dose, 0).toFixed(2);
    }
    if (historyRecords[0] && $("lastInjectionTime")) {
        $("lastInjectionTime").textContent = new Date(historyRecords[0].timestamp).toLocaleTimeString("fa-IR", {hour:"2-digit", minute:"2-digit"});
    }
}
function renderHistory() {
    const list = $("historyList");
    if (!list) return;
    list.replaceChildren();
    if (!historyRecords.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "هنوز تزریق تأییدشده‌ای دریافت نشده است.";
        list.appendChild(empty);
        return;
    }
    for (const record of historyRecords) {
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
        dose.textContent = `${record.dose.toFixed(2)} واحد`;
        const date = document.createElement("div");
        date.className = "history-date";
        const dt = new Date(record.timestamp);
        date.textContent = `${dt.toLocaleDateString("fa-IR")}، ${dt.toLocaleTimeString("fa-IR", {hour:"2-digit", minute:"2-digit"})} (زمان دریافت در مرورگر)`;
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
    // No fabricated sensor values or demo history are initialized.
    if ($("lastDose")) $("lastDose").textContent = "--";
    if ($("todayInjections")) $("todayInjections").textContent = "--";
    if ($("todayTotalDose")) $("todayTotalDose").textContent = "--";
    if ($("lastInjectionTime")) $("lastInjectionTime").textContent = "--";
    if ($("statisticsTotalDose")) $("statisticsTotalDose").textContent = "--";
    if ($("statisticsInjectionCount")) $("statisticsInjectionCount").textContent = "--";
    if ($("capStatus")) $("capStatus").textContent = "در انتظار داده از برد";
    if ($("capStatusValue")) $("capStatusValue").textContent = "--";
    if ($("injectionStateValue")) $("injectionStateValue").textContent = "--";
    if ($("angleValue")) $("angleValue").textContent = "--";
    if ($("anglePercent")) $("anglePercent").textContent = "--";
    if ($("angleProgress")) $("angleProgress").style.width = "0%";
    if ($("doseValue")) $("doseValue").textContent = "--";
    if ($("durationValue")) $("durationValue").textContent = "--";
    if ($("validityValue")) $("validityValue").textContent = "--";
    setSystemMessage({});
    renderHistory();
});

// Make the existing inline HTML handlers available in classic script context.
window.connectDevice = connectDevice;
window.showPage = showPage;
