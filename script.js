// ============================================================
// Smart Insulin Cap - BLE Web App
// ============================================================

// ---------------- BLE UUIDs ----------------

const SERVICE_UUID =
    "12345678-1234-1234-1234-1234567890ab";

const CHARACTERISTIC_UUID =
    "abcdefab-1234-1234-1234-abcdefabcdef";


// ---------------- BLE Variables ----------------

let bleDevice = null;
let bleCharacteristic = null;


// ---------------- App Data ----------------

let lastInjection = null;
let injectionHistory = [];

let totalDose = 0;
let injectionCount = 0;


// ============================================================
// PAGE NAVIGATION
// ============================================================

function showPage(pageName) {

    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
    });

    const page = document.getElementById(pageName);

    if (page) {
        page.classList.add("active");
    }
}


// ============================================================
// BLE CONNECT
// ============================================================

async function connectDevice() {

    try {

        if (!navigator.bluetooth) {

            alert(
                "مرورگر شما از Web Bluetooth پشتیبانی نمی‌کند."
            );

            return;
        }

        console.log("Requesting Bluetooth device...");

        bleDevice = await navigator.bluetooth.requestDevice({

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


        // Handle disconnect

        bleDevice.addEventListener(
            "gattserverdisconnected",
            onDisconnected
        );


        // Connect to GATT server

        console.log("Connecting to GATT server...");

        const server =
            await bleDevice.gatt.connect();

        console.log("GATT connected");


        // Get service

        const service =
            await server.getPrimaryService(
                SERVICE_UUID
            );

        console.log(
            "Service found:",
            service
        );


        // Get characteristic

        bleCharacteristic =
            await service.getCharacteristic(
                CHARACTERISTIC_UUID
            );

        console.log(
            "Characteristic found:",
            bleCharacteristic
        );


        // Start notifications

        await bleCharacteristic.startNotifications();

        console.log(
            "Notifications started successfully"
        );


        // Listen for incoming data

        bleCharacteristic.addEventListener(
            "characteristicvaluechanged",
            handleBLEData
        );


        // Update UI

        setConnectionStatus(
            true,
            "درپوش متصل است"
        );

        updateSystemMessage(
            "اتصال به درپوش با موفقیت برقرار شد."
        );


        // Try reading current value immediately

        try {

            const value =
                await bleCharacteristic.readValue();

            const decoder =
                new TextDecoder("utf-8");

            const text =
                decoder.decode(value);

            console.log(
                "Initial BLE value:",
                text
            );

            if (text) {

                try {

                    const data =
                        JSON.parse(text);

                    processDeviceData(data);

                } catch (error) {

                    console.log(
                        "Initial value is not JSON:",
                        text
                    );
                }
            }

        } catch (readError) {

            console.log(
                "Initial read not available:",
                readError
            );
        }


    } catch (error) {

        console.error(
            "BLE CONNECTION ERROR:",
            error
        );

        setConnectionStatus(
            false,
            "اتصال برقرار نشد"
        );

        updateSystemMessage(
            "خطا در اتصال به درپوش: " +
            error.message
        );
    }
}


// ============================================================
// BLE DATA HANDLER
// ============================================================

function handleBLEData(event) {

    try {

        const decoder =
            new TextDecoder("utf-8");

        const value =
            decoder.decode(
                event.target.value
            );

        console.log(
            "========== BLE DATA =========="
        );

        console.log(value);

        console.log(
            "=============================="
        );


        // Convert JSON string to object

        const data =
            JSON.parse(value);


        console.log(
            "Parsed BLE data:",
            data
        );


        // Process data

        processDeviceData(data);


    } catch (error) {

        console.error(
            "BLE DATA ERROR:",
            error
        );
    }
}


// ============================================================
// PROCESS DEVICE DATA
// ============================================================

function processDeviceData(data) {

    console.log(
        "Processing device data:",
        data
    );


    // --------------------------------------------------------
    // FSR1
    // --------------------------------------------------------

    if (
        data.fsr1 !== undefined &&
        data.fsr1 !== null
    ) {

        updateFSR(
            "fsr1Value",
            data.fsr1
        );
    }


    // --------------------------------------------------------
    // FSR2
    // --------------------------------------------------------

    if (
        data.fsr2 !== undefined &&
        data.fsr2 !== null
    ) {

        updateFSR(
            "fsr2Value",
            data.fsr2
        );
    }


    // --------------------------------------------------------
    // CAP STATUS
    // --------------------------------------------------------

    if (
        data.cap !== undefined
    ) {

        updateCapStatus(
            data.cap
        );
    }


    // --------------------------------------------------------
    // ANGLE
    // --------------------------------------------------------

    if (
        data.angle !== undefined &&
        data.angle !== null
    ) {

        updateAngle(
            Number(data.angle)
        );
    }


    // --------------------------------------------------------
    // DOSE
    // --------------------------------------------------------

    if (
        data.dose !== undefined &&
        data.dose !== null
    ) {

        updateDose(
            Number(data.dose)
        );
    }


    // --------------------------------------------------------
    // IMU
    // --------------------------------------------------------

    if (
        data.angle !== undefined &&
        data.angle !== null
    ) {

        updateIMU(
            Number(data.angle)
        );
    }


    // --------------------------------------------------------
    // INJECTION STATUS
    // --------------------------------------------------------

    if (
        data.status !== undefined
    ) {

        setInjectionStatus(
            data.status
        );
    }


    // --------------------------------------------------------
    // INJECTION COMPLETED
    // --------------------------------------------------------

    if (
        data.status === "completed" &&
        data.valid !== false
    ) {

        registerInjection(data);
    }


    // --------------------------------------------------------
    // INVALID INJECTION
    // --------------------------------------------------------

    if (
        data.status === "invalid"
    ) {

        updateSystemMessage(
            "تزریق نامعتبر تشخیص داده شد."
        );
    }
}


// ============================================================
// CONNECTION STATUS
// ============================================================

function setConnectionStatus(
    connected,
    message
) {

    const status =
        document.getElementById(
            "connectionStatus"
        );

    const text =
        document.getElementById(
            "connectionText"
        );


    if (status) {

        if (connected) {

            status.classList.add(
                "connected"
            );

            status.classList.remove(
                "disconnected"
            );

        } else {

            status.classList.remove(
                "connected"
            );

            status.classList.add(
                "disconnected"
            );
        }
    }


    if (text) {

        text.textContent =
            message;
    }
}


// ============================================================
// CAP STATUS
// ============================================================

function updateCapStatus(
    connected
) {

    const element =
        document.getElementById(
            "capStatus"
        );

    if (!element) {
        return;
    }


    if (connected) {

        element.textContent =
            "متصل";

        element.classList.add(
            "active"
        );

        element.classList.remove(
            "inactive"
        );

    } else {

        element.textContent =
            "جدا شده";

        element.classList.remove(
            "active"
        );

        element.classList.add(
            "inactive"
        );
    }
}


// ============================================================
// ANGLE
// ============================================================

function updateAngle(
    angle
) {

    angle =
        Number(angle) || 0;


    const angleValue =
        document.getElementById(
            "angleValue"
        );

    const anglePercent =
        document.getElementById(
            "anglePercent"
        );

    const angleProgress =
        document.getElementById(
            "angleProgress"
        );


    // Main angle value

    if (angleValue) {

        angleValue.textContent =
            angle.toFixed(1) + "°";
    }


    // Percentage for progress bar

    if (anglePercent) {

        let percent =
            (Math.abs(angle) / 360) * 100;

        // Maximum 100 for visual progress

        percent =
            Math.min(percent, 100);

        anglePercent.textContent =
            percent.toFixed(0) + "%";
    }


    // Progress bar

    if (angleProgress) {

        let percent =
            (Math.abs(angle) / 360) * 100;

        percent =
            Math.min(percent, 100);

        angleProgress.style.width =
            percent + "%";
    }
}


// ============================================================
// FSR UPDATE
// ============================================================

function updateFSR(
    elementId,
    value
) {

    const element =
        document.getElementById(
            elementId
        );

    if (!element) {
        return;
    }


    element.textContent =
        Number(value).toFixed(0);
}


// ============================================================
// DOSE
// ============================================================

function updateDose(
    dose
) {

    dose =
        Number(dose) || 0;


    const doseValue =
        document.getElementById(
            "doseValue"
        );

    if (doseValue) {

        doseValue.textContent =
            dose.toFixed(2);
    }


    // Dashboard - last dose

    const lastDose =
        document.getElementById(
            "lastDose"
        );

    if (lastDose) {

        lastDose.textContent =
            dose.toFixed(2);
    }
}


// ============================================================
// IMU
// ============================================================

function updateIMU(
    angle
) {

    const imuValue =
        document.getElementById(
            "imuValue"
        );

    if (imuValue) {

        imuValue.textContent =
            Number(angle).toFixed(1) +
            "°";
    }
}


// ============================================================
// INJECTION STATUS
// ============================================================

function setInjectionStatus(
    status
) {

    const element =
        document.getElementById(
            "injectionStatus"
        );


    if (!element) {
        return;
    }


    let text =
        "آماده";

    switch (status) {

        case "ready":

            text =
                "آماده";

            break;


        case "injecting":

            text =
                "در حال تزریق";

            break;


        case "completed":

            text =
                "تزریق تکمیل شد";

            break;


        case "invalid":

            text =
                "تزریق نامعتبر";

            break;


        default:

            text =
                status;
    }


    element.textContent =
        text;
}


// ============================================================
// SYSTEM MESSAGE
// ============================================================

function updateSystemMessage(
    message
) {

    const element =
        document.getElementById(
            "systemMessage"
        );

    if (element) {

        element.textContent =
            message;
    }
}


// ============================================================
// REGISTER COMPLETED INJECTION
// ============================================================

function registerInjection(
    data
) {

    const dose =
        Number(data.dose) || 0;

    const duration =
        Number(data.duration) || 0;

    const now =
        new Date();


    const injection = {

        dose: dose,

        duration: duration,

        angle:
            Number(data.angle) || 0,

        time:
            now.toLocaleTimeString(
                "fa-IR",
                {
                    hour: "2-digit",
                    minute: "2-digit"
                }
            ),

        date:
            now.toLocaleDateString(
                "fa-IR"
            )
    };


    lastInjection =
        injection;


    injectionHistory.unshift(
        injection
    );


    // Keep last 50 injections

    if (
        injectionHistory.length > 50
    ) {

        injectionHistory =
            injectionHistory.slice(
                0,
                50
            );
    }


    totalDose += dose;

    injectionCount++;


    // Update dashboard

    updateDashboard();


    // Update statistics

    updateStatistics();


    // Update history

    updateHistory();


    updateSystemMessage(
        "تزریق با موفقیت ثبت شد."
    );


    console.log(
        "Injection registered:",
        injection
    );
}


// ============================================================
// DASHBOARD
// ============================================================

function updateDashboard() {

    // Last dose

    const lastDose =
        document.getElementById(
            "lastDose"
        );

    if (
        lastDose &&
        lastInjection
    ) {

        lastDose.textContent =
            lastInjection.dose.toFixed(2);
    }


    // Today injections

    const todayInjections =
        document.getElementById(
            "todayInjections"
        );

    if (todayInjections) {

        todayInjections.textContent =
            injectionCount;
    }


    // Today total dose

    const todayTotalDose =
        document.getElementById(
            "todayTotalDose"
        );

    if (todayTotalDose) {

        todayTotalDose.textContent =
            totalDose.toFixed(2);
    }


    // Last injection time

    const lastInjectionTime =
        document.getElementById(
            "lastInjectionTime"
        );

    if (
        lastInjectionTime &&
        lastInjection
    ) {

        lastInjectionTime.textContent =
            lastInjection.time;
    }
}


// ============================================================
// STATISTICS
// ============================================================

function updateStatistics() {

    const totalDoseElement =
        document.getElementById(
            "statisticsTotalDose"
        );

    const injectionCountElement =
        document.getElementById(
            "statisticsInjectionCount"
        );


    if (totalDoseElement) {

        totalDoseElement.textContent =
            totalDose.toFixed(2);
    }


    if (injectionCountElement) {

        injectionCountElement.textContent =
            injectionCount;
    }
}


// ============================================================
// HISTORY
// ============================================================

function updateHistory() {

    const historyList =
        document.getElementById(
            "historyList"
        );


    if (!historyList) {
        return;
    }


    if (
        injectionHistory.length === 0
    ) {

        historyList.innerHTML =
            `
            <div class="empty-state">
                هنوز تزریقی ثبت نشده است.
            </div>
            `;

        return;
    }


    historyList.innerHTML = "";


    injectionHistory.forEach(
        (item, index) => {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "history-item";


            row.innerHTML = `

                <div>
                    <strong>
                        تزریق ${index + 1}
                    </strong>
                    <div>
                        ${item.date}
                        -
                        ${item.time}
                    </div>
                </div>

                <div>
                    <strong>
                        ${item.dose.toFixed(2)}
                    </strong>
                    واحد
                </div>

                <div>
                    ${item.angle.toFixed(1)}°
                </div>

            `;


            historyList.appendChild(
                row
            );
        }
    );
}


// ============================================================
// BLE DISCONNECT
// ============================================================

function onDisconnected() {

    console.log(
        "BLE device disconnected"
    );


    setConnectionStatus(
        false,
        "درپوش قطع شد"
    );


    updateSystemMessage(
        "ارتباط با درپوش قطع شد."
    );


    bleCharacteristic =
        null;
}


// ============================================================
// DISCONNECT MANUALLY
// ============================================================

function disconnectDevice() {

    if (
        bleDevice &&
        bleDevice.gatt.connected
    ) {

        bleDevice.gatt.disconnect();

    } else {

        console.log(
            "Device is already disconnected."
        );
    }
}


// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        console.log(
            "Smart Insulin Cap app initialized."
        );


        // Initial values

        updateAngle(0);

        updateDose(0);

        updateIMU(0);

        updateFSR(
            "fsr1Value",
            0
        );

        updateFSR(
            "fsr2Value",
            0
        );


        setInjectionStatus(
            "ready"
        );


        updateDashboard();

        updateStatistics();

        updateHistory();
    }
);
