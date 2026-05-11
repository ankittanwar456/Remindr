$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$androidDir = Join-Path $projectRoot "android"
$javaHome = "F:\Program Files\openjdk_21.0.9"
$androidSdk = "F:\Program Files"
$gradleWrapper = Join-Path $androidDir "gradlew.bat"

if (-not (Test-Path $javaHome)) {
    throw "Java home not found: $javaHome"
}

if (-not (Test-Path $androidSdk)) {
    throw "Android SDK path not found: $androidSdk"
}

if (-not (Test-Path $gradleWrapper)) {
    throw "Gradle wrapper not found: $gradleWrapper"
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk

Push-Location $projectRoot
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Web build failed with exit code $LASTEXITCODE"
    }

    & npx cap sync android
    if ($LASTEXITCODE -ne 0) {
        throw "Android asset sync failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

Push-Location $androidDir
try {
    & $gradleWrapper assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle debug build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

$apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apkPath)) {
    throw "Debug APK was not created: $apkPath"
}

Write-Host "Debug build complete: $apkPath"
