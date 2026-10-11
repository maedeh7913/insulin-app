// Smart Insulin Cap — BLE receive and UI bridge
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
let previousFirmwareStatus = null;
let latestValidDose = null;
let latestValidAngle = null;
let latestDurationMs = null;
let latestInjectionInvalid = null;
let lastRecordedEventKey = null;

function $(id) {
    return document.getElementById(id);
}

function setConnectionStatus(status) {
    const root = $("connectionStatus");
    const label = $("connectionText");
    const button = $("connectButton");

    if (root) {
        root.classList.remove(
            "connected", "waiting", "disconnected", "connecting"
        );

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
        button.disabled =
            status === "connecting" || status === "connected";

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

        if (value.includes("'" + pageName + "'")) {
            button.classList.add("active");
        }
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function connectDevice() {
    if (!navigator.bluetooth) {
        alert(
            "این مرورگر از Web Bluetooth پشتیبانی نمی‌کند. " +
            "از Chrome یا Edge در بستر HTTPS استفاده کنید."
        );
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

            bleDevice.addEventListener(
                "gattserverdisconnected",
                handleDisconnect
            );
        }

        bleServer = await bleDevice.gatt.connect();

        const service = await bleServer.getPrimaryService(
            SERVICE_UUID
        );

        bleCharacteristic = await service.getCharacteristic(
            CHARACTERISTIC_UUID
        );

        bleCharacteristic.removeEventListener(
            "characteristicvaluechanged",
            handleBLEData
        );

        bleCharacteristic.addEventListener(
            "characteristicvaluechanged",
            handleBLEData
        );

        await bleCharacteristic.startNotifications();

        rxTextBuffer = "";

        setConnectionStatus("connected");

        console.info("[BLE] Connected", {
            deviceName: bleDevice.name || "(unnamed)",
            serviceUUID: SERVICE_UUID,
            characteristicUUID: CHARACTERISTIC_UUID
        });

        setSystemMessage({
            ...appData,
            status: "ready"
        });

        if (bleCharacteristic.properties.read) {
            try {
                const value = await bleCharacteristic.readValue();
                consumeDataView(value, "initial-read");
            } catch (error) {
                console.warn(
                    "[BLE] Initial read unavailable.",
                    error
                );
            }
        }
    } catch (error) {
        console.error("[BLE] Connection error:", error);

        setConnectionStatus(
            bleDevice?.gatt?.connected ? "connected" : "ready"
        );

        setSystemMessage({
            ...appData,
            status: "ready"
        });

        if (bleDevice?.gatt?.connected) {
            try {
                bleDevice.gatt.disconnect();
            } catch (_) {}
        }

        alert(
            "اتصال برقرار نشد. اتصال بلوتوث و کد برد را بررسی کنید."
        );
    }
}

function handleDisconnect() {
    bleCharacteristic = null;
    bleServer = null;
    rxTextBuffer = "";

    setConnectionStatus("disconnected");

    setSystemMessage({
        ...appData,
        status: "ready"
    });

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
    const bytes = new Uint8Array(
        dataView.buffer,
        dataView.byteOffset,
        dataView.byteLength
    );

    const decoder = new TextDecoder("utf-8", {
        fatal: false
    });

    const chunk = decoder.decode(bytes);

    console.log(`[BLE RAW ${source}]`, chunk);

    rxTextBuffer += chunk;

    if (rxTextBuffer.length > 16384) {
        console.warn("[BLE] Receive buffer cleared.");
        rxTextBuffer = chunk;
    }

    processReceiveBuffer();
}

function processReceiveBuffer() {
    // پردازش پیام‌هایی که با خط جدید جدا شده‌اند
    let newlineIndex;

    while ((newlineIndex = rxTextBuffer.indexOf("\n")) >= 0) {
        const record = rxTextBuffer
            .slice(0, newlineIndex)
            .trim();

        rxTextBuffer = rxTextBuffer.slice(newlineIndex + 1);

        if (record) {
            processRecord(record);
        }
    }

    // پردازش JSON حتی اگر خط جدید نداشته باشد
    while (rxTextBuffer.trim().startsWith("{")) {
        const trimmed = rxTextBuffer.trimStart();

        const leadingWhitespace =
            rxTextBuffer.length - trimmed.length;

        let depth = 0;
        let inString = false;
        let escaped = false;
        let end = -1;

        for (let i = 0; i < trimmed.length; i++) {
            const ch = trimmed[i];

            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (ch === "\\") {
                    escaped = true;
                } else if (ch === '"') {
                    inString = false;
                }
            } else {
                if (ch === '"') {
                    inString = true;
                } else if (ch === "{") {
                    depth++;
                } else if (ch === "}") {
                    depth--;

                    if (depth === 0) {
                        end = i + 1;
                        break;
                    }
                }
            }
        }

        if (end < 0) {
            return;
        }

        const record = trimmed.slice(0, end);

        rxTextBuffer = rxTextBuffer.slice(
            leadingWhitespace + end
        );

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

    if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
    ) {
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
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (
        typeof value === "string" &&
        value.trim() !== ""
    ) {
        const n = Number(value);

        return Number.isFinite(n) ? n : null;
    }

    return null;
}

function getOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function applyIncomingData(data) {
    /*
      هماهنگ‌سازی داده‌های برد با اپ:

      cap       -> capConnected
      status    -> injectionActive
      duration  -> durationMs
      valid     -> وضعیت اعتبار تزریق

      وضعیت‌های برد:
      ready
      injecting
      completed
      invalid
    */

    const status =
        typeof data.status === "string"
            ? data.status.toLowerCase()
            : null;

    const normalized = {};

    // وضعیت اتصال درپوش
    const capValue = getOwn(data, "capConnected")
        ? data.capConnected
        : data.cap;

    if (capValue !== undefined) {
        const value = validBoolean(capValue);

        if (value !== null) {
            normalized.capConnected = value;
        }
    }

    // وضعیت تزریق
    if (getOwn(data, "injectionActive")) {
        const value = validBoolean(data.injectionActive);

        if (value !== null) {
            normalized.injectionActive = value;
        }
    } else if (status !== null) {
        normalized.injectionActive =
            status === "injecting";
    }

    // زاویه
    const angleValue = getOwn(data, "angle")
        ? data.angle
        : data.yaw;

    if (angleValue !== undefined) {
        const value = validFiniteNumber(angleValue);

        if (value !== null) {
            normalized.angle = value;
        }
    }

    // دوز
    if (getOwn(data, "dose")) {
        const value = validFiniteNumber(data.dose);

        if (value !== null && value >= 0) {
            normalized.dose = value;
        }
    }

    // مدت تزریق بر حسب میلی‌ثانیه
    const durationValue = getOwn(data, "durationMs")
        ? data.durationMs
        : data.duration;

    if (durationValue !== undefined) {
        const value = validFiniteNumber(durationValue);

        if (value !== null && value >= 0) {
            normalized.durationMs = value;
        }
    }

    // اعتبار تزریق
    if (getOwn(data, "injectionInvalid")) {
        const value = validBoolean(data.injectionInvalid);

        if (value !== null) {
            normalized.injectionInvalid = value;
        }
    } else if (
        status === "invalid" ||
        (
            status === "completed" &&
            data.valid === false
        ) ||
        (
            status === "injecting" &&
            data.valid === false
        )
    ) {
        normalized.injectionInvalid = true;
    } else if (
        (
            status === "completed" ||
            status === "injecting"
        ) &&
        data.valid === true
    ) {
        normalized.injectionInvalid = false;
    }

    // فقط فیلدهای معتبر به‌روزرسانی می‌شوند
    Object.assign(appData, normalized);

    if (getOwn(normalized, "capConnected")) {
        updateCapStatus(normalized.capConnected);
    }

    if (getOwn(normalized, "injectionActive")) {
        updateInjectionState(normalized.injectionActive);
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
        latestInjectionInvalid =
            normalized.injectionInvalid;

        updateValidity(normalized.injectionInvalid);
    }

    // وضعیت ready با valid=false یعنی هنوز تزریق معتبری ثبت نشده؛
    // این حالت نباید به‌اشتباه تزریق نامعتبر تلقی شود.

    // ثبت تاریخچه فقط هنگام ورود به وضعیت completed
    if (
        status === "completed" &&
        previousFirmwareStatus !== "completed"
    ) {
        maybeRecordCompletedInjection(data);
    }

    previousFirmwareStatus = status ?? previousFirmwareStatus;

    updateDashboardFromHistory();

    setSystemMessage({
        ...appData,
        status
    });
}

function maybeRecordCompletedInjection(payload) {
    const status =
        typeof payload.status === "string"
            ? payload.status.toLowerCase()
            : "";

    const valid =
        payload.valid === true &&
        status === "completed" &&
        latestInjectionInvalid !== true &&
        latestValidDose !== null &&
        latestValidDose > 0;

    if (!valid) {
        console.info(
            "[HISTORY] Injection not recorded: " +
            "completion, validity and dose requirements not met."
        );
        return;
    }

    const eventKey =
        payload.eventId ??
        payload.timestamp ??
        payload.dateTime ??
        null;

    if (
        eventKey !== null &&
        eventKey === lastRecordedEventKey
    ) {
        return;
    }

    if (eventKey !== null) {
        lastRecordedEventKey = eventKey;
    }

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

    console.info("[HISTORY] Completed injection recorded:", record);
}

function updateCapStatus(connected) {
    if ($("capStatus")) {
        $("capStatus").textContent = connected
            ? "درپوش متصل است"
            : "درپوش جدا است";
    }

    if ($("capStatusValue")) {
        $("capStatusValue").textContent = connected
            ? "متصل"
            : "جدا";
    }
}

function updateInjectionState(active) {
    if ($("injectionStateValue")) {
        $("injectionStateValue").textContent = active
            ? "در حال تزریق"
            : "غیرفعال";
    }

    const root = $("injectionStatus");

    if (root) {
        root.classList.remove(
            "waiting",
            "injecting",
            "completed"
        );

        root.classList.add(
            active ? "injecting" : "waiting"
        );

        const text = root.querySelector("span:last-child");

        if (text) {
            text.textContent = active
                ? "در حال تزریق"
                : "آماده";
        }
    }
}

function updateAngle(angle) {
    const numericAngle = validFiniteNumber(angle);

    if (numericAngle === null) {
        return;
    }

    if ($("angleValue")) {
        $("angleValue").textContent =
            numericAngle.toFixed(2) + "°";
    }

    // مقیاس نوار پیشرفت فقط برای نمایش است
    if ($("anglePercent") || $("angleProgress")) {
        const percent = Math.min(
            Math.abs(numericAngle) / 1080 * 100,
            100
        );

        if ($("anglePercent")) {
            $("anglePercent").textContent =
                Math.round(percent) + "%";
        }

        if ($("angleProgress")) {
            $("angleProgress").style.width =
                percent + "%";
        }
    }
}

function updateDose(dose) {
    const n = validFiniteNumber(dose);

    if (n === null) {
        return;
    }

    if ($("doseValue")) {
        $("doseValue").textContent =
            n.toFixed(2) + " واحد";
    }

    if ($("lastDose")) {
        $("lastDose").textContent = n.toFixed(2);
    }
}

function updateDuration(durationMs) {
    const n = validFiniteNumber(durationMs);

    if (n === null || n < 0) {
        return;
    }

    if ($("durationValue")) {
        $("durationValue").textContent =
            (n / 1000).toFixed(2);
    }
}

function updateValidity(invalid) {
    const el = $("validityValue");

    if (!el || typeof invalid !== "boolean") {
        return;
    }

    el.classList.remove("valid", "invalid");

    el.textContent = invalid
        ? "نامعتبر"
        : "معتبر";

    el.classList.add(
        invalid ? "invalid" : "valid"
    );
}

function setSystemMessage(data) {
    const el = $("systemMessage");

    if (!el) {
        return;
    }

    if (data.capConnected === false) {
        el.textContent = "درپوش را به قلم متصل کنید.";
    } else if (
        data.status === "invalid" ||
        data.injectionInvalid === true
    ) {
        el.textContent =
            "برد، فرآیند تزریق را نامعتبر اعلام کرده است.";
    } else if (data.status === "completed") {
        el.textContent =
            "تزریق پایان یافت؛ نتیجه از برد دریافت شد.";
    } else if (data.injectionActive === true) {
        el.textContent =
            "فرآیند تزریق طبق داده دریافتی برد در حال انجام است.";
    } else if (bleDevice?.gatt?.connected) {
        el.textContent =
            "بلوتوث متصل است؛ منتظر داده‌های بعدی برد...";
    } else {
        el.textContent =
            "برای دریافت داده‌های واقعی، به درپوش متصل شوید.";
    }
}

function updateDashboardFromHistory() {
    if (!historyRecords.length) {
        return;
    }

    const todayKey = new Date().toDateString();

    const today = historyRecords.filter(record =>
        new Date(record.timestamp).toDateString() === todayKey
    );

    if ($("todayInjections")) {
        $("todayInjections").textContent =
            String(today.length);
    }

    if ($("todayTotalDose")) {
        $("todayTotalDose").textContent =
            today.reduce(
                (sum, record) => sum + record.dose,
                0
            ).toFixed(2);
    }

    if ($("statisticsInjectionCount")) {
        $("statisticsInjectionCount").textContent =
            String(historyRecords.length);
    }

    if ($("statisticsTotalDose")) {
        $("statisticsTotalDose").textContent =
            historyRecords.reduce(
                (sum, record) => sum + record.dose,
                0
            ).toFixed(2);
    }

    if (historyRecords[0] && $("lastInjectionTime")) {
        $("lastInjectionTime").textContent =
            new Date(
                historyRecords[0].timestamp
            ).toLocaleTimeString("fa-IR", {
                hour: "2-digit",
                minute: "2-digit"
            });
    }
}

function renderHistory() {
    const list = $("historyList");

    if (!list) {
        return;
    }

    list.replaceChildren();

    if (!historyRecords.length) {
        const empty = document.createElement("div");

        empty.className = "empty-state";
        empty.textContent =
            "هنوز تزریق تأییدشده‌ای دریافت نشده است.";

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
        dose.textContent =
            `${record.dose.toFixed(2)} واحد`;

        const date = document.createElement("div");
        date.className = "history-date";

        const dt = new Date(record.timestamp);

        date.textContent =
            `${dt.toLocaleDateString("fa-IR")}، ` +
            `${dt.toLocaleTimeString("fa-IR", {
                hour: "2-digit",
                minute: "2-digit"
            })} (زمان دریافت در مرورگر)`;

        details.append(dose, date);
        left.append(icon, details);

        const status = document.createElement("span");

        status.className =
            "status " +
            (record.firmwareConfirmed
                ? "connected"
                : "waiting");

        status.textContent = "تأییدشده توسط برد";

        item.append(left, status);
        list.appendChild(item);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setConnectionStatus("ready");

    if ($("lastDose")) $("lastDose").textContent = "--";
    if ($("todayInjections")) $("todayInjections").textContent = "--";
    if ($("todayTotalDose")) $("todayTotalDose").textContent = "--";
    if ($("lastInjectionTime")) $("lastInjectionTime").textContent = "--";
    if ($("statisticsTotalDose")) $("statisticsTotalDose").textContent = "--";
    if ($("statisticsInjectionCount")) $("statisticsInjectionCount").textContent = "--";

    if ($("capStatus")) {
        $("capStatus").textContent = "در انتظار داده از برد";
    }

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

window.connectDevice = connectDevice;
window.showPage = showPage;
