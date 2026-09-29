```javascript
// ======================================================
//              Smart Insulin Cap - script.js
// ======================================================

// ======================================================
//                  BLE Configuration
// ======================================================

const SERVICE_UUID =
    "12345678-1234-1234-1234-1234567890ab";

const CHARACTERISTIC_UUID =
    "abcdefab-1234-1234-1234-abcdefabcdef";

let bluetoothDevice = null;
let bleCharacteristic = null;


// ======================================================
//                  Page Navigation
// ======================================================

function showPage(pageName) {

    const pages = document.querySelectorAll(".page");

    pages.forEach(page => {
        page.classList.remove("active");
    });

    const selectedPage =
        document.getElementById(pageName);

    if (selectedPage) {
        selectedPage.classList.add("active");
    }

    // تغییر وضعیت منوی پایین
    const navItems =
        document.querySelectorAll(".nav-item");

    navItems.forEach(item => {
        item.classList.remove("active");

        if (item.dataset.page === pageName) {
            item.classList.add("active");
        }
    });
}


// ======================================================
//                  BLE Connection
// ======================================================

async function connectDevice() {

    try {

        // بررسی پشتیبانی Web Bluetooth
        if (!navigator.bluetooth) {

            alert(
                "مرورگر شما از Web Bluetooth پشتیبانی نمی‌کند."
            );

            return;
        }


        // ------------------------------------------------
        // انتخاب دستگاه
        // ------------------------------------------------

        bluetoothDevice =
            await navigator.bluetooth.requestDevice({

                filters: [
                    {
                        services: [SERVICE_UUID]
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
        // اتصال GATT
        // ------------------------------------------------

        bluetoothDevice.addEventListener(
            "gattserverdisconnected",
            handleDisconnect
        );


        const server =
            await bluetoothDevice.gatt.connect();


        console.log("BLE متصل شد.");


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
        // فعال کردن Notification
        // ------------------------------------------------

        await bleCharacteristic.startNotifications();


        bleCharacteristic.addEventListener(
            "characteristicvaluechanged",
            handleBLEData
        );


        // ------------------------------------------------
        // تغییر وضعیت رابط کاربری
        // ------------------------------------------------

        setConnectionStatus(true);

        console.log(
            "ارتباط با SmartInsulinCap برقرار شد."
        );

    }

    catch (error) {

        console.error(
            "خطا در اتصال BLE:",
            error
        );

        setConnectionStatus(false);

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
        "ارتباط BLE قطع شد."
    );

    bleCharacteristic = null;

    setConnectionStatus(false);
}


// ======================================================
//                  Connection Status
// ======================================================

function setConnectionStatus(connected) {

    const connectionText =
        document.getElementById("connectionText");

    const connectionStatus =
        document.getElementById("connectionStatus");


    if (connected) {

        if (connectionText) {
            connectionText.textContent =
                "متصل";
        }

        if (connectionStatus) {
            connectionStatus.classList.add(
                "connected"
            );
        }

    }

    else {

        if (connectionText) {
            connectionText.textContent =
                "قطع";
        }

        if (connectionStatus) {
            connectionStatus.classList.remove(
                "connected"
            );
        }
    }
}


// ======================================================
//                  Receive BLE Data
// ======================================================

function handleBLEData(event) {

    try {

        // ------------------------------------------------
        // تبدیل داده BLE به متن
        // ------------------------------------------------

        const decoder =
            new TextDecoder("utf-8");

        const message =
            decoder.decode(
                event.target.value
            ).trim();


        console.log(
            "BLE Data:",
            message
        );


        // ------------------------------------------------
        // تبدیل JSON
        // ------------------------------------------------

        const data =
            JSON.parse(message);


        // ------------------------------------------------
        // دریافت ۶ پارامتر اصلی
        // ------------------------------------------------

        /*
            ساختار مورد انتظار از ESP32:

            {
                "capConnected": true,
                "injectionActive": true,
                "angle": 354.18,
                "dose": 19.68,
                "durationMs": 3544,
                "injectionInvalid": false
            }
        */


        // 1. وضعیت درپوش
        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "capConnected"
            )
        ) {

            updateCapStatus(
                data.capConnected
            );
        }


        // 2. وضعیت تزریق
        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "injectionActive"
            )
        ) {

            updateInjectionState(
                data.injectionActive
            );
        }


        // 3. زاویه
        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "angle"
            )
        ) {

            updateAngle(
                Number(data.angle)
            );
        }


        // 4. دوز
        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "dose"
            )
        ) {

            updateDose(
                Number(data.dose)
            );
        }


        // 5. مدت تزریق
        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "durationMs"
            )
        ) {

            updateDuration(
                Number(data.durationMs)
            );
        }


        // 6. اعتبار تزریق
        if (
            Object.prototype.hasOwnProperty.call(
                data,
                "injectionInvalid"
            )
        ) {

            updateValidity(
                data.injectionInvalid
            );
        }


        // ------------------------------------------------
        // نمایش پیام سیستم
        // ------------------------------------------------

        updateSystemMessage(data);

    }

    catch (error) {

        console.error(
            "خطا در پردازش داده BLE:",
            error
        );
    }
}


// ======================================================
//                  Cap Status
// ======================================================

function updateCapStatus(connected) {

    const capStatus =
        document.getElementById(
            "capStatus"
        );

    const capStatusValue =
        document.getElementById(
            "capStatusValue"
        );


    const text =
        connected
            ? "متصل"
            : "جدا";


    // داشبورد
    if (capStatus) {
        capStatus.textContent =
            text;
    }


    // صفحه مانیتورینگ
    if (capStatusValue) {
        capStatusValue.textContent =
            text;
    }
}


// ======================================================
//                  Injection State
// ======================================================

function updateInjectionState(active) {

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


    // وضعیت اصلی صفحه مانیتورینگ
    setInjectionStatus(
        active
            ? "injecting"
            : "ready"
    );
}


// ======================================================
//                  Angle
// ======================================================

function updateAngle(angle) {

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


    // جلوگیری از NaN
    if (isNaN(angle)) {
        return;
    }


    // مقدار زاویه
    if (angleValue) {

        angleValue.textContent =
            angle.toFixed(2) + "°";
    }


    // ------------------------------------------------
    // نوار پیشرفت
    // ------------------------------------------------

    /*
       مقدار 1080 درجه به عنوان سقف نمایش
       در نظر گرفته شده است.

       این مقدار فقط برای نمایش گرافیکی است
       و روی محاسبه واقعی زاویه تأثیری ندارد.
    */

    const MAX_DISPLAY_ANGLE = 1080;

    let percent =
        Math.abs(angle)
        / MAX_DISPLAY_ANGLE
        * 100;


    percent =
        Math.min(
            Math.max(percent, 0),
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
}


// ======================================================
//                  Dose
// ======================================================

function updateDose(dose) {

    const doseValue =
        document.getElementById(
            "doseValue"
        );

    const lastDose =
        document.getElementById(
            "lastDose"
        );


    if (isNaN(dose)) {
        return;
    }


    // جلوگیری از نمایش مقدار منفی
    dose =
        Math.max(
            0,
            dose
        );


    if (doseValue) {

        doseValue.textContent =
            dose.toFixed(2)
            + " واحد";
    }


    if (lastDose) {

        lastDose.textContent =
            dose.toFixed(2);
    }
}


// ======================================================
//                  Duration
// ======================================================

function updateDuration(durationMs) {

    const durationValue =
        document.getElementById(
            "durationValue"
        );


    if (isNaN(durationMs)) {
        return;
    }


    const seconds =
        durationMs / 1000;


    if (durationValue) {

        durationValue.textContent =
            seconds.toFixed(3)
            + " ثانیه";
    }
}


// ======================================================
//                  Injection Validity
// ======================================================

function updateValidity(invalid) {

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

function setInjectionStatus(status) {

    const injectionStatus =
        document.getElementById(
            "injectionStatus"
        );


    if (!injectionStatus) {
        return;
    }


    switch (status) {

        case "ready":

            injectionStatus.textContent =
                "آماده";

            injectionStatus.classList.remove(
                "injecting",
                "completed"
            );

            break;


        case "injecting":

            injectionStatus.textContent =
                "در حال تزریق";

            injectionStatus.classList.add(
                "injecting"
            );

            injectionStatus.classList.remove(
                "completed"
            );

            break;


        case "completed":

            injectionStatus.textContent =
                "تزریق تکمیل شد";

            injectionStatus.classList.add(
                "completed"
            );

            injectionStatus.classList.remove(
                "injecting"
            );

            break;
    }
}


// ======================================================
//                  System Message
// ======================================================

function updateSystemMessage(data) {

    const systemMessage =
        document.getElementById(
            "systemMessage"
        );


    if (!systemMessage) {
        return;
    }


    // اگر تزریق فعال است
    if (data.injectionActive) {

        systemMessage.textContent =
            "فرآیند تزریق در حال انجام است.";

        return;
    }


    // اگر تزریق نامعتبر شده
    if (data.injectionInvalid) {

        systemMessage.textContent =
            "تزریق نامعتبر است؛ درپوش هنگام تزریق جدا شده است.";

        return;
    }


    // اگر درپوش متصل نیست
    if (!data.capConnected) {

        systemMessage.textContent =
            "درپوش متصل نیست.";

        return;
    }


    // حالت عادی
    systemMessage.textContent =
        "سیستم آماده ثبت تزریق است.";
}


// ======================================================
//                  Initialize Dashboard
// ======================================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        // وضعیت اولیه اتصال
        setConnectionStatus(false);


        // وضعیت اولیه زاویه
        updateAngle(0);


        // وضعیت اولیه دوز
        const doseValue =
            document.getElementById(
                "doseValue"
            );

        if (doseValue) {
            doseValue.textContent =
                "--";
        }


        // وضعیت اولیه مدت تزریق
        const durationValue =
            document.getElementById(
                "durationValue"
            );

        if (durationValue) {
            durationValue.textContent =
                "--";
        }


        // وضعیت اولیه اعتبار
        const validityValue =
            document.getElementById(
                "validityValue"
            );

        if (validityValue) {
            validityValue.textContent =
                "--";
        }


        // وضعیت اولیه درپوش
        updateCapStatus(false);


        // وضعیت اولیه تزریق
        updateInjectionState(false);


        // پیام اولیه
        const systemMessage =
            document.getElementById(
                "systemMessage"
            );

        if (systemMessage) {

            systemMessage.textContent =
                "برای شروع، درپوش را متصل کنید.";
        }


        // ------------------------------------------------
        // دکمه اتصال
        // ------------------------------------------------

        const connectButton =
            document.getElementById(
                "connectButton"
            );


        if (connectButton) {

            connectButton.addEventListener(
                "click",
                connectDevice
            );
        }


        // ------------------------------------------------
        // مقداردهی اولیه صفحه
        // ------------------------------------------------

        showPage("home");
    }
);
```

**نکته:** این `script.js` فرض می‌کند در `index.html` این IDها وجود داشته باشند:

```text
capStatus
capStatusValue
injectionStateValue
angleValue
anglePercent
angleProgress
doseValue
durationValue
validityValue
injectionStatus
systemMessage
connectButton
connectionText
connectionStatus
lastDose
```
