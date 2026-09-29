```javascript
// ===============================
// Smart Insulin Cap - script.js
// ===============================

// ---------- BLE Configuration ----------
const SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
const CHARACTERISTIC_UUID = "abcdefab-1234-1234-1234-abcdefabcdef";

let bleDevice = null;
let bleCharacteristic = null;

// ---------- Application State ----------
let appData = {
    capConnected: false,
    injectionActive: false,
    angle: 0,
    dose: null,
    durationMs: null,
    injectionInvalid: false
};


// ===============================
// PAGE NAVIGATION
// ===============================

function showPage(pageName) {

    const pages = document.querySelectorAll(".page");

    pages.forEach(page => {
        page.classList.remove("active");
        page.style.display = "none";
    });

    const targetPage = document.getElementById(pageName + "Page");

    if (targetPage) {
        targetPage.classList.add("active");
        targetPage.style.display = "block";
    }

    // Update bottom navigation
    const navButtons = document.querySelectorAll(".nav-item");

    navButtons.forEach(button => {
        button.classList.remove("active");

        const onclickValue = button.getAttribute("onclick");

        if (onclickValue && onclickValue.includes("'" + pageName + "'")) {
            button.classList.add("active");
        }
    });

    // Scroll to top
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


// ===============================
// CONNECTION STATUS
// ===============================

function setConnectionStatus(status) {

    const connectionStatus = document.getElementById("connectionStatus");
    const connectionText = document.getElementById("connectionText");
    const connectButton = document.getElementById("connectButton");

    if (!connectionStatus || !connectionText) return;

    connectionStatus.classList.remove(
        "connected",
        "waiting",
        "disconnected",
        "connecting"
    );

    if (status === "connected") {

        connectionStatus.classList.add("connected");
        connectionText.textContent = "متصل";

        if (connectButton) {
            connectButton.textContent = "متصل شد";
            connectButton.disabled = true;
        }

    } else if (status === "connecting") {

        connectionStatus.classList.add("waiting");
        connectionText.textContent = "در حال اتصال...";

        if (connectButton) {
            connectButton.textContent = "در حال اتصال...";
            connectButton.disabled = true;
        }

    } else if (status === "disconnected") {

        connectionStatus.classList.add("disconnected");
        connectionText.textContent = "قطع";

        if (connectButton) {
            connectButton.textContent = "اتصال به درپوش";
            connectButton.disabled = false;
        }

    } else {

        connectionStatus.classList.add("waiting");
        connectionText.textContent = "آماده";

        if (connectButton) {
            connectButton.textContent = "اتصال به درپوش";
            connectButton.disabled = false;
        }
    }
}


// ===============================
// BLE CONNECTION
// ===============================

async function connectDevice() {

    if (!navigator.bluetooth) {

        alert("مرورگر شما از Web Bluetooth پشتیبانی نمی‌کند.");
        return;
    }

    try {

        setConnectionStatus("connecting");

        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [
                {
                    services: [SERVICE_UUID]
                }
            ]
        });

        bleDevice.addEventListener(
            "gattserverdisconnected",
            handleDisconnect
        );

        const server = await bleDevice.gatt.connect();

        const service = await server.getPrimaryService(
            SERVICE_UUID
        );

        bleCharacteristic = await service.getCharacteristic(
            CHARACTERISTIC_UUID
        );

        await bleCharacteristic.startNotifications();

        bleCharacteristic.addEventListener(
            "characteristicvaluechanged",
            handleBLEData
        );

        setConnectionStatus("connected");

        updateSystemMessage({
            capConnected: appData.capConnected,
            injectionActive: appData.injectionActive,
            injectionInvalid: appData.injectionInvalid
        });

    } catch (error) {

        console.error("BLE Connection Error:", error);

        setConnectionStatus("ready");

        updateSystemMessage({
            capConnected: appData.capConnected,
            injectionActive: appData.injectionActive,
            injectionInvalid: appData.injectionInvalid
        });
    }
}


// ===============================
// BLE DISCONNECT
// ===============================

function handleDisconnect() {

    bleCharacteristic = null;

    setConnectionStatus("disconnected");

    updateSystemMessage({
        capConnected: appData.capConnected,
        injectionActive: appData.injectionActive,
        injectionInvalid: appData.injectionInvalid
    });
}


// ===============================
// RECEIVE BLE DATA
// ===============================

function handleBLEData(event) {

    try {

        const decoder = new TextDecoder("utf-8");

        const text = decoder.decode(
            event.target.value
        );

        console.log("BLE:", text);

        const data = JSON.parse(text);

        appData = {
            ...appData,
            ...data
        };

        // Cap status
        if ("capConnected" in data) {
            updateCapStatus(data.capConnected);
        }

        // Injection state
        if ("injectionActive" in data) {
            updateInjectionState(data.injectionActive);
        }

        // Angle
        if ("angle" in data) {
            updateAngle(data.angle);
        }

        // Dose
        if ("dose" in data) {
            updateDose(data.dose);
        }

        // Duration
        if ("durationMs" in data) {
            updateDuration(data.durationMs);
        }

        // Validity
        if ("injectionInvalid" in data) {
            updateValidity(data.injectionInvalid);
        }

        updateSystemMessage(data);

    } catch (error) {

        console.error(
            "Invalid BLE data:",
            error
        );
    }
}


// ===============================
// CAP STATUS
// ===============================

function updateCapStatus(connected) {

    const capStatus = document.getElementById("capStatus");
    const capStatusValue = document.getElementById("capStatusValue");

    const text = connected
        ? "درپوش متصل است"
        : "درپوش جدا است";

    if (capStatus) {
        capStatus.textContent = text;
    }

    if (capStatusValue) {
        capStatusValue.textContent = text;
    }

    appData.capConnected = connected;
}


// ===============================
// INJECTION STATE
// ===============================

function updateInjectionState(active) {

    const injectionStateValue =
        document.getElementById("injectionStateValue");

    if (injectionStateValue) {

        injectionStateValue.textContent =
            active
                ? "در حال تزریق"
                : "آماده";
    }

    setInjectionStatus(active);

    appData.injectionActive = active;
}


// ===============================
// INJECTION STATUS HEADER
// ===============================

function setInjectionStatus(active) {

    const injectionStatus =
        document.getElementById("injectionStatus");

    if (!injectionStatus) return;

    const statusText =
        injectionStatus.querySelector("span:last-child");

    injectionStatus.classList.remove(
        "waiting",
        "injecting",
        "completed"
    );

    if (active) {

        injectionStatus.classList.add("injecting");

        if (statusText) {
            statusText.textContent = "در حال تزریق";
        }

    } else {

        injectionStatus.classList.add("waiting");

        if (statusText) {
            statusText.textContent = "آماده";
        }
    }
}


// ===============================
// ANGLE
// ===============================

function updateAngle(angle) {

    const angleValue =
        document.getElementById("angleValue");

    const anglePercent =
        document.getElementById("anglePercent");

    const angleProgress =
        document.getElementById("angleProgress");

    const numericAngle =
        Number(angle) || 0;

    if (angleValue) {

        angleValue.textContent =
            numericAngle.toFixed(2) + "°";
    }

    // Maximum display scale = 1080 degrees
    const percent =
        Math.min(
            Math.max(
                (Math.abs(numericAngle) / 1080) * 100,
                0
            ),
            100
        );

    if (anglePercent) {
        anglePercent.textContent =
            Math.round(percent) + "%";
    }

    if (angleProgress) {
        angleProgress.style.width =
            percent + "%";
    }

    appData.angle = numericAngle;
}


// ===============================
// DOSE
// ===============================

function updateDose(dose) {

    const doseValue =
        document.getElementById("doseValue");

    const lastDose =
        document.getElementById("lastDose");

    const numericDose =
        Number(dose);

    if (
        dose === null ||
        dose === undefined ||
        isNaN(numericDose)
    ) {

        if (doseValue) {
            doseValue.textContent = "--";
        }

        return;
    }

    const formattedDose =
        numericDose.toFixed(2);

    if (doseValue) {
        doseValue.textContent =
            formattedDose + " واحد";
    }

    if (lastDose) {
        lastDose.textContent =
            formattedDose + " واحد";
    }

    appData.dose = numericDose;
}


// ===============================
// DURATION
// ===============================

function updateDuration(durationMs) {

    const durationValue =
        document.getElementById("durationValue");

    if (
        durationMs === null ||
        durationMs === undefined
    ) {

        if (durationValue) {
            durationValue.textContent = "--";
        }

        return;
    }

    const seconds =
        Number(durationMs) / 1000;

    if (durationValue) {

        durationValue.textContent =
            seconds.toFixed(2) + " ثانیه";
    }

    appData.durationMs =
        Number(durationMs);
}


// ===============================
// VALIDITY
// ===============================

function updateValidity(invalid) {

    const validityValue =
        document.getElementById("validityValue");

    if (!validityValue) return;

    validityValue.classList.remove(
        "valid",
        "invalid"
    );

    if (invalid) {

        validityValue.textContent =
            "نامعتبر";

        validityValue.classList.add(
            "invalid"
        );

    } else {

        validityValue.textContent =
            "معتبر";

        validityValue.classList.add(
            "valid"
        );
    }

    appData.injectionInvalid =
        invalid;
}


// ===============================
// SYSTEM MESSAGE
// ===============================

function updateSystemMessage(data) {

    const systemMessage =
        document.getElementById("systemMessage");

    if (!systemMessage) return;

    if (!data.capConnected) {

        systemMessage.textContent =
            "درپوش را به قلم متصل کنید.";

        return;
    }

    if (data.injectionInvalid) {

        systemMessage.textContent =
            "تزریق نامعتبر است.";

        return;
    }

    if (data.injectionActive) {

        systemMessage.textContent =
            "فرآیند تزریق در حال انجام است.";

        return;
    }

    systemMessage.textContent =
        "درپوش متصل است و سیستم آماده ثبت تزریق است.";
}


// ===============================
// INITIALIZATION
// ===============================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        // Initial BLE status
        setConnectionStatus("ready");

        // Initial application state
        updateCapStatus(false);
        updateInjectionState(false);

        updateAngle(0);

        const doseValue =
            document.getElementById("doseValue");

        const durationValue =
            document.getElementById("durationValue");

        const validityValue =
            document.getElementById("validityValue");

        if (doseValue) {
            doseValue.textContent = "--";
        }

        if (durationValue) {
            durationValue.textContent = "--";
        }

        if (validityValue) {
            validityValue.textContent = "--";
        }

        updateSystemMessage({
            capConnected: false,
            injectionActive: false,
            injectionInvalid: false
        });
    }
);
```

