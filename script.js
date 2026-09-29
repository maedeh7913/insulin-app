```javascript
// ======================================================
//              Smart Insulin Cap - script.js
// ======================================================


// ======================================================
//                     BLE UUID
// ======================================================

const SERVICE_UUID =
    "12345678-1234-1234-1234-1234567890ab";

const CHARACTERISTIC_UUID =
    "abcdefab-1234-1234-1234-abcdefabcdef";


// ======================================================
//                  BLE Variables
// ======================================================

let bluetoothDevice = null;
let bleCharacteristic = null;


// ======================================================
//                  Page Navigation
// ======================================================

function showPage(pageName) {

    const pages =
        document.querySelectorAll(".page");

    pages.forEach(page => {

        page.style.display = "none";
        page.classList.remove("active");

    });


    const page =
        document.getElementById(
            pageName + "Page"
        );


    if (page) {

        page.style.display = "block";
        page.classList.add("active");

    }


    const navItems =
        document.querySelectorAll(".nav-item");


    navItems.forEach(item => {

        item.classList.remove("active");

    });


    navItems.forEach(item => {

        const onclick =
            item.getAttribute("onclick");

        if (
            onclick &&
            onclick.includes(
                "'" + pageName + "'"
            )
        ) {

            item.classList.add("active");

        }

    });

}


// ======================================================
//                  Connection Status
// ======================================================

function setConnectionStatus(status) {

    const connectionStatus =
        document.getElementById(
            "connectionStatus"
        );

    const connectionText =
        document.getElementById(
            "connectionText"
        );

    const connectButton =
        document.getElementById(
            "connectButton"
        );


    if (!connectionStatus || !connectionText) {
        return;
    }


    // حذف وضعیت‌های قبلی
    connectionStatus.classList.remove(
        "connected",
        "waiting",
        "disconnected"
    );


    // --------------------------------------------------
    // آماده
    // --------------------------------------------------

    if (status === "ready") {

        connectionStatus.classList.add(
            "waiting"
        );

        connectionText.textContent =
            "آماده";


        if (connectButton) {

            connectButton.disabled = false;

            connectButton.textContent =
                "اتصال به درپوش";
        }

    }


    // --------------------------------------------------
    // در حال اتصال
    // --------------------------------------------------

    else if (status === "connecting") {

        connectionStatus.classList.add(
            "waiting"
        );

        connectionText.textContent =
            "در حال اتصال";


        if (connectButton) {

            connectButton.disabled = true;

            connectButton.textContent =
                "در حال اتصال...";
        }

    }


    // --------------------------------------------------
    // متصل
    // --------------------------------------------------

    else if (status === "connected") {

        connectionStatus.classList.add(
            "connected"
        );

        connectionText.textContent =
            "متصل";


        if (connectButton) {

            connectButton.disabled = false;

            connectButton.textContent =
                "متصل به درپوش";
        }

    }


    // --------------------------------------------------
    // قطع
    // --------------------------------------------------

    else if (status === "disconnected") {

        connectionStatus.classList.add(
            "waiting"
        );

        connectionText.textContent =
            "قطع";


        if (connectButton) {

            connectButton.disabled = false;

            connectButton.textContent =
                "اتصال مجدد";
        }

    }

}


// ======================================================
//                     BLE Connect
// ======================================================

async function connectDevice() {

    try {

        // ------------------------------------------------
        // بررسی Web Bluetooth
        // ------------------------------------------------

        if (!navigator.bluetooth) {

            alert(
                "مرورگر شما از Web Bluetooth پشتیبانی نمی‌کند."
            );

            return;
        }


        // ------------------------------------------------
        // وضعیت اتصال
        // ------------------------------------------------

        setConnectionStatus(
            "connecting"
        );


        // ------------------------------------------------
        // انتخاب دستگاه
        // ------------------------------------------------

        bluetoothDevice =
            await navigator.bluetooth.requestDevice({

                filters: [
                    {
                        services: [
                            SERVICE_UUID
                        ]
                    }
                ],

                optionalServices: [
                    SERVICE_UUID
                ]

            });


        console.log(
            "دستگاه انتخاب شد:",
            bluetoothDevice.name
        );


        // ------------------------------------------------
        // Listener برای قطع اتصال
        // ------------------------------------------------

        bluetoothDevice.addEventListener(
            "gattserverdisconnected",
            handleDisconnect
        );


        // ------------------------------------------------
        // اتصال GATT
        // ------------------------------------------------

        const server =
            await bluetoothDevice.gatt.connect();


        console.log(
            "GATT connected"
        );


        // ------------------------------------------------
        // دریافت Service
        // ------------------------------------------------

        const service =
            await server.getPrimaryService(
                SERVICE_UUID
            );


        // ------------------------------------------------
        // دریافت Characteristic
        // ------------------------------------------------

        bleCharacteristic =
            await service.getCharacteristic(
                CHARACTERISTIC_UUID
            );


        // ------------------------------------------------
        // فعال‌سازی Notification
        // ------------------------------------------------

        await bleCharacteristic.startNotifications();


        bleCharacteristic.addEventListener(
            "characteristicvaluechanged",
            handleBLEData
        );


        // ------------------------------------------------
        // اتصال موفق
        // ------------------------------------------------

        setConnectionStatus(
            "connected"
        );


        updateSystemMessage({
            capConnected: false,
            injectionActive: false,
            injectionInvalid: false
        });


        console.log(
            "Smart Insulin Cap متصل شد."
        );

    }

    catch (error) {

        console.error(
            "BLE connection error:",
            error
        );


        bleCharacteristic = null;


        setConnectionStatus(
            "ready"
        );


        // اگر کاربر پنجره انتخاب دستگاه را بسته باشد
        if (
            error &&
            error.name ===
            "NotFoundError"
        ) {

            console.log(
                "انتخاب دستگاه لغو شد."
            );

            return;
        }


        alert(
            "اتصال به درپوش انجام نشد."
        );

    }

}


// ======================================================
//                  BLE Disconnect
// ======================================================

function handleDisconnect() {

    console.log(
        "Smart Insulin Cap disconnected."
    );


    bleCharacteristic = null;


    setConnectionStatus(
        "disconnected"
    );


    const systemMessage =
        document.getElementById(
            "systemMessage"
        );


    if (systemMessage) {

        systemMessage.textContent =
            "ارتباط با درپوش قطع شده است.";
    }

}


// ======================================================
//                  BLE Data Handler
// ======================================================

function handleBLEData(event) {

    try {

        const decoder =
            new TextDecoder(
                "utf-8"
            );


        const message =
            decoder.decode(
                event.target.value
            ).trim();


        console.log(
            "BLE:",
            message
        );


        const data =
            JSON.parse(
                message
            );


        // ------------------------------------------------
        // 1. وضعیت فیزیکی درپوش
        // ------------------------------------------------

        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "capConnected"
            )
        ) {

            updateCapStatus(
                Boolean(
                    data.capConnected
                )
            );

        }


        // ------------------------------------------------
        // 2. وضعیت تزریق
        // ------------------------------------------------

        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "injectionActive"
            )
        ) {

            updateInjectionState(
                Boolean(
                    data.injectionActive
                )
            );

        }


        // ------------------------------------------------
        // 3. زاویه
        // ------------------------------------------------

        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "angle"
            )
        ) {

            updateAngle(
                Number(
                    data.angle
                )
            );

        }


        // ------------------------------------------------
        // 4. دوز
        // ------------------------------------------------

        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "dose"
            )
        ) {

            updateDose(
                Number(
                    data.dose
                )
            );

        }


        // ------------------------------------------------
        // 5. مدت تزریق
        // ------------------------------------------------

        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "durationMs"
            )
        ) {

            updateDuration(
                Number(
                    data.durationMs
                )
            );

        }


        // ------------------------------------------------
        // 6. اعتبار تزریق
        // ------------------------------------------------

        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "injectionInvalid"
            )
        ) {

            updateValidity(
                Boolean(
                    data.injectionInvalid
                )
            );

        }


        // ------------------------------------------------
        // پیام سیستم
        // ------------------------------------------------

        updateSystemMessage(
            data
        );

    }

    catch (error) {

        console.error(
            "BLE data parsing error:",
            error
        );

    }

}


// ======================================================
//                  Cap Status
// ======================================================

function updateCapStatus(
    connected
) {

    const capStatus =
        document.getElementById(
            "capStatus"
        );


    const capStatusValue =
        document.getElementById(
            "capStatusValue"
        );


    if (connected) {

        if (capStatus) {

            capStatus.textContent =
                "درپوش متصل است";

        }


        if (capStatusValue) {

            capStatusValue.textContent =
                "متصل";

        }

    }

    else {

        if (capStatus) {

            capStatus.textContent =
                "درپوش جدا است";

        }


        if (capStatusValue) {

            capStatusValue.textContent =
                "جدا";

        }

    }

}


// ======================================================
//                  Injection State
// ======================================================

function updateInjectionState(
    active
) {

    const injectionStateValue =
        document.getElementById(
            "injectionStateValue"
        );


    if (injectionStateValue) {

        injectionStateValue.textContent =
            active
                ? "در حال تزریق"
                : "غیرفعال";

    }


    setInjectionStatus(
        active
            ? "injecting"
            : "ready"
    );

}


// ======================================================
//                  Angle
// ======================================================

function updateAngle(
    angle
) {

    if (!Number.isFinite(angle)) {
        return;
    }


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


    if (angleValue) {

        angleValue.textContent =
            angle.toFixed(2);

    }


    const MAX_DISPLAY_ANGLE =
        1080;


    let percent =
        Math.abs(angle)
        /
        MAX_DISPLAY_ANGLE
        *
        100;


    percent =
        Math.min(
            Math.max(
                percent,
                0
            ),
            100
        );


    if (anglePercent) {

        anglePercent.textContent =
            Math.round(
                percent
            ) + "%";

    }


    if (angleProgress) {

        angleProgress.style.width =
            percent + "%";

    }

}


// ======================================================
//                  Dose
// ======================================================

function updateDose(
    dose
) {

    if (!Number.isFinite(dose)) {
        return;
    }


    const doseValue =
        document.getElementById(
            "doseValue"
        );


    const lastDose =
        document.getElementById(
            "lastDose"
        );


    dose =
        Math.max(
            0,
            dose
        );


    if (doseValue) {

        doseValue.textContent =
            dose.toFixed(2);

    }


    if (lastDose) {

        lastDose.textContent =
            dose.toFixed(2);

    }

}


// ======================================================
//                  Duration
// ======================================================

function updateDuration(
    durationMs
) {

    if (!Number.isFinite(durationMs)) {
        return;
    }


    const durationValue =
        document.getElementById(
            "durationValue"
        );


    const seconds =
        Math.max(
            0,
            durationMs
        ) / 1000;


    if (durationValue) {

        durationValue.textContent =
            seconds.toFixed(3);

    }

}


// ======================================================
//                  Validity
// ======================================================

function updateValidity(
    invalid
) {

    const validityValue =
        document.getElementById(
            "validityValue"
        );


    if (!validityValue) {
        return;
    }


    if (invalid) {

        validityValue.textContent =
            "نامعتبر";

        validityValue.classList.add(
            "invalid"
        );

        validityValue.classList.remove(
            "valid"
        );

    }

    else {

        validityValue.textContent =
            "معتبر";

        validityValue.classList.add(
            "valid"
        );

        validityValue.classList.remove(
            "invalid"
        );

    }

}


// ======================================================
//                  Injection Status
// ======================================================

function setInjectionStatus(
    status
) {

    const injectionStatus =
        document.getElementById(
            "injectionStatus"
        );


    if (!injectionStatus) {
        return;
    }


    const textElement =
        injectionStatus.querySelector(
            "span:last-child"
        );


    injectionStatus.classList.remove(
        "waiting",
        "connected",
        "injecting",
        "completed"
    );


    if (status === "injecting") {

        injectionStatus.classList.add(
            "injecting"
        );


        if (textElement) {

            textElement.textContent =
                "در حال تزریق";

        }

    }

    else if (status === "completed") {

        injectionStatus.classList.add(
            "completed"
        );


        if (textElement) {

            textElement.textContent =
                "تزریق تکمیل شد";

        }

    }

    else {

        injectionStatus.classList.add(
            "waiting"
        );


        if (textElement) {

            textElement.textContent =
                "آماده";

        }

    }

}


// ======================================================
//                  System Message
// ======================================================

function updateSystemMessage(
    data
) {

    const systemMessage =
        document.getElementById(
            "systemMessage"
        );


    if (!systemMessage) {
        return;
    }


    if (
        data.injectionActive
    ) {

        systemMessage.textContent =
            "فرآیند تزریق در حال انجام است.";

        return;
    }


    if (
        data.injectionInvalid
    ) {

        systemMessage.textContent =
            "تزریق نامعتبر است؛ درپوش هنگام تزریق جدا شده است.";

        return;
    }


    if (
        data.capConnected === false
    ) {

        systemMessage.textContent =
            "درپوش متصل نیست.";

        return;
    }


    if (
        data.capConnected === true
    ) {

        systemMessage.textContent =
            "درپوش متصل است و سیستم آماده ثبت تزریق است.";

        return;
    }


    systemMessage.textContent =
        "در انتظار دریافت اطلاعات از درپوش...";

}


// ======================================================
//                  Initial State
// ======================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        // وضعیت ارتباط اپ با ESP32
        setConnectionStatus(
            "ready"
        );


        // وضعیت اولیه درپوش
        updateCapStatus(
            false
        );


        // وضعیت اولیه تزریق
        updateInjectionState(
            false
        );


        // زاویه
        updateAngle(
            0
        );


        // دوز
        const doseValue =
            document.getElementById(
                "doseValue"
            );


        if (doseValue) {

            doseValue.textContent =
                "--";

        }


        // مدت
        const durationValue =
            document.getElementById(
                "durationValue"
            );


        if (durationValue) {

            durationValue.textContent =
                "--";

        }


        // اعتبار
        const validityValue =
            document.getElementById(
                "validityValue"
            );


        if (validityValue) {

            validityValue.textContent =
                "--";

        }


        // پیام سیستم
        const systemMessage =
            document.getElementById(
                "systemMessage"
            );


        if (systemMessage) {

            systemMessage.textContent =
                "برای شروع، به درپوش هوشمند متصل شوید.";

        }

    }
);
```
