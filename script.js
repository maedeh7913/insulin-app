// ==========================================
// Smart Insulin Cap
// Main Application Logic
// ==========================================


// ==========================================
// Page Navigation
// ==========================================

function showPage(pageName) {

    // همه صفحات
    const pages = document.querySelectorAll(".page");

    pages.forEach(function(page) {
        page.style.display = "none";
    });


    // صفحه انتخاب‌شده
    const selectedPage = document.getElementById(
        pageName + "Page"
    );

    if (selectedPage) {
        selectedPage.style.display = "block";
    }


    // تغییر وضعیت منوی پایین
    const navItems = document.querySelectorAll(".nav-item");

    navItems.forEach(function(item) {
        item.classList.remove("active");
    });


    // پیدا کردن دکمه مربوط به صفحه
    const navButtons = document.querySelectorAll(".nav-item");

    navButtons.forEach(function(button) {

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

        // بررسی پشتیبانی Web Bluetooth
        if (!navigator.bluetooth) {

            throw new Error(
                "Web Bluetooth توسط این مرورگر پشتیبانی نمی‌شود."
            );

        }


        // وضعیت اتصال
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
                "لطفاً در پنجره بازشده، SmartInsulinCap را انتخاب کنید.";
        }


        // درخواست اتصال به ESP32
        const device =
            await navigator.bluetooth.requestDevice({

                filters: [
                    {
                        name: "SmartInsulinCap"
                    }
                ],

                optionalServices: [
                    "12345678-1234-1234-1234-1234567890ab"
                ]

            });


        console.log(
            "Device selected:",
            device.name
        );


        // اتصال به GATT
        const server =
            await device.gatt.connect();


        console.log(
            "GATT connected"
        );


        // دریافت Service
        const service =
            await server.getPrimaryService(
                "12345678-1234-1234-1234-1234567890ab"
            );


        // دریافت Characteristic
        const characteristic =
            await service.getCharacteristic(
                "abcdefab-1234-1234-1234-abcdefabcdef"
            );


        // فعال کردن دریافت Notification
        await characteristic.startNotifications();


        characteristic.addEventListener(
            "characteristicvaluechanged",
            function(event) {

                const decoder =
                    new TextDecoder("utf-8");

                const value =
                    decoder.decode(
                        event.target.value
                    );


                console.log(
                    "ESP32:",
                    value
                );


                if (systemMessage) {

                    systemMessage.textContent =
                        "دریافت از درپوش: " + value;

                }

            }
        );


        // اتصال موفق
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
// Update Angle
// ==========================================

function updateAngle(angle) {

    const angleValue =
        document.getElementById("angleValue");

    const angleProgress =
        document.getElementById("angleProgress");

    const anglePercent =
        document.getElementById("anglePercent");


    if (angleValue) {

        angleValue.textContent =
            Number(angle).toFixed(1);

    }


    // محدود کردن زاویه برای نمایش Progress
    let percent =
        (Number(angle) / 360) * 100;


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

        fsr1Element.textContent =
            fsr1;

    }


    if (fsr2Element) {

        fsr2Element.textContent =
            fsr2;

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


    if (doseElement) {

        doseElement.textContent =
            dose;

    }


    if (lastDoseElement) {

        lastDoseElement.textContent =
            dose;

    }

}


// ==========================================
// Update IMU
// ==========================================

function updateIMU(angle) {

    const imuElement =
        document.getElementById("imuValue");


    if (imuElement) {

        imuElement.textContent =
            Number(angle).toFixed(1);

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


    if (status === "ready") {

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

}


// ==========================================
// Initial Application State
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    function() {

        // صفحه پیش‌فرض
        showPage("dashboard");


        // مقدار اولیه زاویه
        updateAngle(0);


        // وضعیت اولیه تزریق
        setInjectionStatus("ready");


        // مقادیر اولیه حسگرها
        updateFSR("--", "--");


        // مقدار اولیه IMU
        updateIMU(0);


        // مقدار اولیه دوز
        updateDose("--");

    }
);
