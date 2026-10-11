function applyIncomingData(data) {
    console.log("[BLE] Data received:", data);

    // وضعیت درپوش
    const cap = data.capConnected ?? data.cap;

    if (typeof cap === "boolean") {
        appData.capConnected = cap;
        latestCapConnected = cap;
        updateCapStatus(cap);
    }

    // وضعیت تزریق
    const status = String(data.status ?? "").toLowerCase();

    const active =
        typeof data.injectionActive === "boolean"
            ? data.injectionActive
            : status === "injecting";

    appData.injectionActive = active;
    previousInjectionActive = active;
    updateInjectionState(active);

    // زاویه دریافتی از ESP32
    const angle = Number(data.angle ?? data.yaw);

    if (Number.isFinite(angle)) {
        appData.angle = angle;
        latestValidAngle = angle;
        updateAngle(angle);
    }

    // دوز دریافتی از ESP32
    const dose = Number(data.dose);

    if (data.dose !== undefined &&
        data.dose !== null &&
        Number.isFinite(dose) &&
        dose >= 0) {

        appData.dose = dose;
        latestValidDose = dose;
        updateDose(dose);
    }

    // مدت زمان تزریق
    const duration = Number(data.durationMs ?? data.duration);

    if (Number.isFinite(duration) && duration >= 0) {
        appData.durationMs = duration;
        latestDurationMs = duration;
        updateDuration(duration);
    }

    // اعتبار تزریق
    let invalid = data.injectionInvalid;

    if (typeof invalid !== "boolean") {
        if (status === "invalid") {
            invalid = true;
        } else if (status === "completed" && data.valid === true) {
            invalid = false;
        }
    }

    if (typeof invalid === "boolean") {
        appData.injectionInvalid = invalid;
        latestInjectionInvalid = invalid;
        updateValidity(invalid);
    }

    // ثبت نتیجه تزریق کامل‌شده
    if (
        status === "completed" &&
        previousFirmwareStatus !== "completed" &&
        data.valid === true &&
        Number.isFinite(dose) &&
        dose > 0
    ) {
        maybeRecordCompletedInjection(data);
    }

    previousFirmwareStatus = status || previousFirmwareStatus;

    updateDashboardFromHistory();

    setSystemMessage({
        ...appData,
        status: status,
        firmwareValid:
            typeof data.valid === "boolean" ? data.valid : null
    });
}
