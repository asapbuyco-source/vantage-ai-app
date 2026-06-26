# Generate a release keystore for Vantage AI Android app
# Requires Java (keytool) to be installed

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$androidDir = Join-Path $scriptDir ".." "android"
$appDir = Join-Path $androidDir "app"
$keystorePath = Join-Path $appDir "release.keystore"
$propsPath = Join-Path $androidDir "keystore.properties"

$storePass = Read-Host "Enter keystore password (min 6 chars)" -AsSecureString
$keyAlias = "vantage-ai-release"
$keyPass = $storePass

$storePassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePass))

keytool -genkey -v -keystore $keystorePath -alias $keyAlias -keyalg RSA -keysize 2048 -validity 10000 -storepass $storePassPlain -keypass $storePassPlain -dname "CN=Vantage AI, OU=Dev, O=Vantage, L=Lagos, ST=Lagos, C=NG"

if ($LASTEXITCODE -eq 0) {
    @"
storeFile=release.keystore
storePassword=$storePassPlain
keyAlias=$keyAlias
keyPassword=$storePassPlain
"@ | Out-File -FilePath $propsPath -Encoding ascii

    Write-Host "Keystore created: $keystorePath" -ForegroundColor Green
    Write-Host "Properties file created: $propsPath" -ForegroundColor Green
    Write-Host "WARNING: Keep 'keystore.properties' and 'release.keystore' secret. Never commit them to git." -ForegroundColor Yellow
} else {
    Write-Host "Failed to generate keystore. Is Java installed?" -ForegroundColor Red
}
