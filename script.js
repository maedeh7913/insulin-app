// ==========================================
// Smart Insulin Cap
// Main Application Logic
// ==========================================

// ==========================================
// BLE Configuration
// ==========================================

const SERVICE_UUID =
    "12345678-1234-1234-1234-1234567890ab";

const CHARACTERISTIC_UUID =
    "abcdefab-1234-1234-1234-abcdefabcdef";

let bleDevice = null;
let bleCharacteristic = null;

// ==========================================
// Application Data
// ==========================================

let injectionHistory = [];
let todayInjectionCount = 0;
let todayTotalDose = 0;

// ==========================================
// Page Navigation
// ==========================================

function showPage(pageName) {

    const pages = document.querySelectorAll(".page");

    pages.forEach(function(page) {
        page.style.display = "none";
    });

    const selectedPage =
        document.getElementById(pageName + "Page");

    if (selectedPage) {
        selectedPage.style.display = "block";
    }

    const navItems =
        document.querySelectorAll(".nav-item");

    navItems.forEach(function(item) {
        item.classList.remove("active");
    });

    navItems.forEach(function(button) {

        const onclickValue =
            button.getAttribute("onclick");

        if (
            onclickValue &&
            onclickValue.includes("'" + pageName + "'")
        ) {
            button.classList.add("active");
        }

    });
}

// ==========================================
// Device Connection
// ==========================================

async function connectDevice() {

    const connectionStatus =
        document.getElementById("connectionStatus");

    const connectionText =
        document.getElementById("connectionText");

    const systemMessage =
        document.getElementById("systemMessage");

    try {

        if (!navigator.bluetooth) {
            throw new Error(
                "Web Bluetooth توسط این مرورگر پشتیبانی نمی‌شود."
            );
        }

        if (connectionStatus) {
            connectionStatus.className =
                "status waiting";
        }

        if (connectionText) {
            connectionText.textContent =
                "در حال جستجوی درپوش...";
        }

        if (systemMessage) {
            systemMessage.textContent =
                "لطفاً SmartInsulinCap را انتخاب کنید.";
        }

        bleDevice =
            await navigator.bluetooth.requestDevice({
                filters: [
                    {
                        services: [SERVICE_UUID]
                    }
                ]
            });

        console.log(
            "Device selected:",
            bleDevice.name
        );

        // تشخیص قطع شدن اتصال
        bleDevice.addEventListener(
            "gattserverdisconnected",
            handleDisconnect
        );

        // اتصال GATT
        const server =
            await bleDevice.gatt.connect();

        console.log("GATT connected");

        // دریافت Service
        const service =
            await server.getPrimaryService(
                SERVICE_UUID
            );

        // دریافت Characteristic
        bleCharacteristic =
            await service.getCharacteristic(
                CHARACTERISTIC_UUID
            );

        // فعال کردن Notification
        await bleCharacteristic.startNotifications();

        bleCharacteristic.addEventListener(
            "characteristicvaluechanged",
            handleBLEData
        );

        // وضعیت اتصال
        if (connectionStatus) {
            connectionStatus.className =
                "status connected";
        }

        if (connectionText) {
            connectionText.textContent =
                "متصل";
        }

        if (systemMessage) {
            systemMessage.textContent =
                "درپوش هوشمند با موفقیت متصل شد.";
        }

        updateCapStatus(true);

        console.log(
            "SmartInsulinCap connected successfully"
        );

    }

    catch (error) {

        console.error(
            "BLE Connection Error:",
            error
        );

        if (connectionStatus) {
            connectionStatus.className =
                "status waiting";
        }

        if (connectionText) {
            connectionText.textContent =
                "اتصال ناموفق";
        }

        if (systemMessage) {
            systemMessage.textContent =
                "اتصال به درپوش انجام نشد.";
        }
    }
}

// ==========================================
// BLE Disconnect
// ==========================================

function handleDisconnect() {

    console.log("BLE disconnected");

    const connectionStatus =
        document.getElementById("connectionStatus");

    const connectionText =
        document.getElementById("connectionText");

    const systemMessage =
        document.getElementById("systemMessage");

    if (connectionStatus) {
        connectionStatus.className =
            "status waiting";
    }

    if (connectionText) {
        connectionText.textContent =
            "قطع";
    }

    if (systemMessage) {
        systemMessage.textContent =
            "ارتباط با درپوش قطع شد.";
    }

    updateCapStatus(false);
}

// ==========================================
// Receive BLE Data
// ==========================================

function handleBLEData(event) {

    try {

        const decoder =
            new TextDecoder("utf-8");

        const value =
            decoder.decode(
                event.target.value
            ).trim();

        console.log(
            "BLE DATA:",
            value
        );

        const data =
            JSON.parse(value);

        processDeviceData(data);

    }

    catch (error) {

        console.error(
            "خطا در پردازش داده BLE:",
            error
        );

        const systemMessage =
            document.getElementById("systemMessage");

        if (systemMessage) {
            systemMessage.textContent =
                "داده دریافتی قابل پردازش نیست.";
        }
    }
}

// ==========================================
// Process Device Data
// ==========================================

function processDeviceData(data) {

    console.log(
        "Parsed device data:",
        data
    );

    // ------------------------------
    // FSR Sensors
    // ------------------------------

    if (data.fsr1 !== undefined ||
        data.fsr2 !== undefined) {

        updateFSR(
            data.fsr1 !== undefined
                ? data.fsr1
                : "--",

            data.fsr2 !== undefined
                ? data.fsr2
                : "--"
        );
    }

    // ------------------------------
    // Cap Status
    // ------------------------------

    if (data.cap !== undefined) {
        updateCapStatus(data.cap);
    }

    // ------------------------------
    // Angle
    // ------------------------------

    if (data.angle !== undefined) {

        updateAngle(data.angle);
        updateIMU(data.angle);
    }

    // ------------------------------
    // Dose
    // ------------------------------

    if (data.dose !== undefined) {
        updateDose(data.dose);
    }

    // ------------------------------
    // Injection Status
    // ------------------------------

    if (data.status !== undefined) {

        setInjectionStatus(
            data.status
        );
    }

    // ------------------------------
    // Injection Completion
    // ------------------------------

    if (
        data.status === "completed" &&
        data.valid === true &&
        data.dose !== undefined
    ) {

        registerInjection(
            Number(data.dose),
            data.duration
        );
    }

    // ------------------------------
    // Invalid Injection
    // ------------------------------

    if (data.status === "invalid") {

        const systemMessage =
            document.getElementById("systemMessage");

        if (systemMessage) {
            systemMessage.textContent =
                "تزریق نامعتبر بود؛ درپوش هنگام تزریق جدا شده است.";
        }
    }
}

// ==========================================
// Update Cap Status
// ==========================================

function updateCapStatus(connected) {

    const capStatus =
        document.getElementById("capStatus");

    if (!capStatus) {
        return;
    }

    if (connected) {

        capStatus.textContent =
            "درپوش متصل است";

    }
    else {

        capStatus.textContent =
            "درپوش جدا است";
    }
}

// ==========================================
// Update Angle
// ==========================================

function updateAngle(angle) {

    const angleValue =
        document.getElementById("angleValue");

    const angleProgress =
        document.getElementById("angleProgress");

    const anglePercent =
        document.getElementById("anglePercent");

    const numericAngle =
        Number(angle);

    if (!Number.isFinite(numericAngle)) {
        return;
    }

    if (angleValue) {

        angleValue.textContent =
            numericAngle.toFixed(1);
    }

    // برای Progress فقط 0 تا 360 درجه
    let percent =
        (Math.abs(numericAngle) / 360) * 100;

    if (percent < 0) {
        percent = 0;
    }

    if (percent > 100) {
        percent = 100;
    }

    if (angleProgress) {

        angleProgress.style.width =
            percent + "%";
    }

    if (anglePercent) {

        anglePercent.textContent =
            Math.round(percent) + "%";
    }
}

// ==========================================
// Update FSR Sensors
// ==========================================

function updateFSR(fsr1, fsr2) {

    const fsr1Element =
        document.getElementById("fsr1Value");

    const fsr2Element =
        document.getElementById("fsr2Value");

    if (fsr1Element) {
        fsr1Element.textContent = fsr1;
    }

    if (fsr2Element) {
        fsr2Element.textContent = fsr2;
    }
}

// ==========================================
// Update Dose
// ==========================================

function updateDose(dose) {

    const doseElement =
        document.getElementById("doseValue");

    const lastDoseElement =
        document.getElementById("lastDose");

    const numericDose =
        Number(dose);

    if (dose === "--") {

        if (doseElement) {
            doseElement.textContent = "--";
        }

        return;
    }

    if (!Number.isFinite(numericDose)) {
        return;
    }

    if (doseElement) {

        doseElement.textContent =
            numericDose.toFixed(2);
    }

    if (lastDoseElement) {

        lastDoseElement.textContent =
            numericDose.toFixed(2);
    }
}

// ==========================================
// Update IMU
// ==========================================

function updateIMU(angle) {

    const imuElement =
        document.getElementById("imuValue");

    const numericAngle =
        Number(angle);

    if (
        imuElement &&
        Number.isFinite(numericAngle)
    ) {

        imuElement.textContent =
            numericAngle.toFixed(1);
    }
}

// ==========================================
// Injection Status
// ==========================================

function setInjectionStatus(status) {

    const injectionStatus =
        document.getElementById("injectionStatus");

    const systemMessage =
        document.getElementById("systemMessage");

    if (!injectionStatus) {
        return;
    }

    // ------------------------------
    // Ready
    // ------------------------------

    if (
        status === "ready" ||
        status === "connected"
    ) {

        injectionStatus.className =
            "status waiting";

        injectionStatus.innerHTML =
            '<span class="status-dot"></span>' +
            '<span>آماده</span>';

        if (systemMessage) {

            systemMessage.textContent =
                "در انتظار شروع فرآیند تزریق...";
        }
    }

    // ------------------------------
    // Injecting
    // ------------------------------

    else if (status === "injecting") {

        injectionStatus.className =
            "status connected";

        injectionStatus.innerHTML =
            '<span class="status-dot"></span>' +
            '<span>در حال تزریق</span>';

        if (systemMessage) {

            systemMessage.textContent =
                "فرآیند تزریق شناسایی شد.";
        }
    }

    // ------------------------------
    // Completed
    // ------------------------------

    else if (status === "completed") {

        injectionStatus.className =
            "status connected";

        injectionStatus.innerHTML =
            '<span class="status-dot"></span>' +
            '<span>تزریق کامل شد</span>';

        if (systemMessage) {

            systemMessage.textContent =
                "تزریق با موفقیت ثبت شد.";
        }
    }

    // ------------------------------
    // Invalid
    // ------------------------------

    else if (status === "invalid") {

        injectionStatus.className =
            "status waiting";

        injectionStatus.innerHTML =
            '<span class="status-dot"></span>' +
            '<span>نامعتبر</span>';

        if (systemMessage) {

            systemMessage.textContent =
                "تزریق نامعتبر است.";
        }
    }
}

// ==========================================
// Register Injection
// ==========================================

function registerInjection(dose, duration) {

    if (!Number.isFinite(dose)) {
        return;
    }

    // جلوگیری از ثبت دوباره همان تزریق
    const now =
        new Date();

    const time =
        now.toLocaleTimeString(
            "fa-IR",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

    const injection = {

        dose: dose,

        time: time,

        duration:
            duration !== undefined
                ? duration
                : 0
    };

    injectionHistory.unshift(
        injection
    );

    todayInjectionCount++;

    todayTotalDose += dose;

    // ------------------------------
    // Dashboard
    // ------------------------------

    const todayInjections =
        document.getElementById(
            "todayInjections"
        );

    const todayTotalDoseElement =
        document.getElementById(
            "todayTotalDose"
        );

    const lastInjectionTime =
        document.getElementById(
            "lastInjectionTime"
        );

    if (todayInjections) {

        todayInjections.textContent =
            todayInjectionCount;
    }

    if (todayTotalDoseElement) {

        todayTotalDoseElement.textContent =
            todayTotalDose.toFixed(2);
    }

    if (lastInjectionTime) {

        lastInjectionTime.textContent =
            time;
    }

    // ------------------------------
    // Statistics
    // ------------------------------

    const statisticsTotalDose =
        document.getElementById(
            "statisticsTotalDose"
        );

    const statisticsInjectionCount =
        document.getElementById(
            "statisticsInjectionCount"
        );

    if (statisticsTotalDose) {

        statisticsTotalDose.textContent =
            todayTotalDose.toFixed(2);
    }

    if (statisticsInjectionCount) {

        statisticsInjectionCount.textContent =
            todayInjectionCount;
    }

    // ------------------------------
    // History
    // ------------------------------

    updateHistory();

    console.log(
        "Injection registered:",
        injection
    );
}

// ==========================================
// Update History
// ==========================================

function updateHistory() {

    const historyList =
        document.getElementById(
            "historyList"
        );

    if (!historyList) {
        return;
    }

    historyList.innerHTML = "";

    injectionHistory.forEach(
        function(injection) {

            const item =
                document.createElement("div");

            item.className =
                "history-item";

            item.innerHTML =

                '<div class="history-left">' +

                    '<div class="history-icon">' +
                        '💉' +
                    '</div>' +

                    '<div>' +

                        '<div class="history-dose">' +
                            injection.dose.toFixed(2) +
                            ' واحد' +
                        '</div>' +

                        '<div class="history-date">' +
                            'امروز، ' +
                            injection.time +
                        '</div>' +

                    '</div>' +

                '</div>' +

                '<span class="status connected">' +
                    'خودکار' +
                '</span>';

            historyList.appendChild(item);
        }
    );
}

// ==========================================
// Initial Application State
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    function() {

        showPage("dashboard");

        updateAngle(0);

        updateFSR(
            "--",
            "--"
        );

        updateIMU(0);

        updateDose("--");

        updateCapStatus(false);

        setInjectionStatus("ready");

        console.log(
            "Smart Insulin Cap App Ready"
        );
    }
);
