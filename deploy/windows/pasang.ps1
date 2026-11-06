#Requires -RunAsAdministrator
<#
  Education Hub - pemasang untuk Windows VPS / Windows Server

  Apa yang dibuat:
    1. Pasang Node.js 22 (jika belum ada)
    2. Muat turun sistem Education Hub dari GitHub
    3. Pasang Caddy untuk HTTPS automatik (sijil percuma Let's Encrypt)
    4. Buka port 80 dan 443 dalam Windows Firewall
    5. Daftar tugas Windows supaya sistem hidup sendiri selepas restart
    6. Backup database setiap hari jam 2 pagi (simpan 30 terbaru)

  Cara guna (PowerShell sebagai Administrator):
    .\pasang.ps1                          # pasang kali pertama (akan tanya domain dan kata laluan)
    .\pasang.ps1                          # jalankan semula untuk KEMAS KINI sistem (data kekal)
    .\pasang.ps1 -TukarKataLaluan         # tukar kata laluan mentor
    .\pasang.ps1 -Domain baru.duckdns.org # tukar domain
#>
param(
  [string]$Domain,
  [switch]$TukarKataLaluan,
  [string]$Repo = 'cikgudanie/Education-Hub',
  [string]$Cawangan = 'claude/hello-o2npie',
  [string]$Folder = 'C:\EducationHub'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Langkah($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Amaran($m) { Write-Host "AMARAN: $m" -ForegroundColor Yellow }
function Berjaya($m) { Write-Host "    OK: $m" -ForegroundColor Green }
function Gagal($m) { Write-Host "`nRALAT: $m" -ForegroundColor Red; exit 1 }

function Tulis-Fail($path, $content) {
  [IO.File]::WriteAllText($path, $content, (New-Object Text.UTF8Encoding $false))
}

function Minta-KataLaluan {
  while ($true) {
    $a = Read-Host 'Cipta kata laluan MENTOR (sekurang-kurangnya 8 aksara)' -AsSecureString
    $b = Read-Host 'Ulang kata laluan mentor' -AsSecureString
    $pa = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($a))
    $pb = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($b))
    if ($pa.Length -lt 8) { Amaran 'Kata laluan terlalu pendek.'; continue }
    if ($pa -ne $pb) { Amaran 'Kata laluan tidak sepadan. Cuba lagi.'; continue }
    return $pa
  }
}

function Rawak-Hex {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

# Hentikan semua proses sistem ini (launcher, node, caddy) sebelum kemas kini.
function Hentikan-Sistem {
  foreach ($t in 'Aplikasi', 'Caddy') {
    $task = Get-ScheduledTask -TaskPath '\EducationHub\' -TaskName $t -ErrorAction SilentlyContinue
    if ($task) { Stop-ScheduledTask -TaskPath '\EducationHub\' -TaskName $t -ErrorAction SilentlyContinue }
  }
  $pattern = '*' + $Folder + '*'
  Get-CimInstance Win32_Process |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -like $pattern -and $_.CommandLine -notlike '*pasang.ps1*' } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
  Start-Sleep -Seconds 2
}

Write-Host '=============================================' -ForegroundColor Cyan
Write-Host '  Education Hub - Pemasang Windows' -ForegroundColor Cyan
Write-Host '=============================================' -ForegroundColor Cyan

# ---------------------------------------------------------------- 1. Tetapan
Langkah 'Menyediakan folder dan tetapan'
foreach ($d in 'app', 'data', 'backup', 'logs', 'bin', 'caddy') {
  New-Item -ItemType Directory -Force -Path (Join-Path $Folder $d) | Out-Null
}
$fileTetapan = Join-Path $Folder 'tetapan.json'
$cfg = $null
if (Test-Path $fileTetapan) {
  $cfg = Get-Content $fileTetapan -Raw | ConvertFrom-Json
  Berjaya "Tetapan sedia ada dijumpai (domain: $($cfg.Domain)). Data pelajar akan dikekalkan."
}
if (-not $Domain -and $cfg) { $Domain = $cfg.Domain }
if (-not $Domain) { $Domain = Read-Host 'Masukkan domain anda (cth: namaanda.duckdns.org)' }
$Domain = ($Domain.Trim().ToLower() -replace '^https?://', '') -replace '/.*$', ''
if ($Domain -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') {
  Gagal "Domain '$Domain' tidak sah. Contoh yang betul: namaanda.duckdns.org"
}

$mentorPw = $null
if ($cfg -and -not $TukarKataLaluan) { $mentorPw = $cfg.MentorPassword } else { $mentorPw = Minta-KataLaluan }
$secret = $null
if ($cfg -and $cfg.SessionSecret) { $secret = $cfg.SessionSecret } else { $secret = Rawak-Hex }

$baru = [ordered]@{ Domain = $Domain; MentorPassword = $mentorPw; SessionSecret = $secret }
Tulis-Fail $fileTetapan ($baru | ConvertTo-Json)
# Hanya Administrators (S-1-5-32-544) dan SYSTEM (S-1-5-18) boleh baca fail tetapan.
& icacls.exe $fileTetapan /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
Berjaya "Tetapan disimpan di $fileTetapan"

# ---------------------------------------------------------------- 2. Port 80/443
Langkah 'Menyemak port 80 dan 443'
$sibuk = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -eq 80 -or $_.LocalPort -eq 443 } |
  ForEach-Object {
    $nama = '?'
    try { $nama = (Get-Process -Id $_.OwningProcess -ErrorAction Stop).ProcessName } catch { }
    [pscustomobject]@{ Port = $_.LocalPort; Proses = $nama; PID = $_.OwningProcess }
  } | Where-Object { $_.Proses -ne 'caddy' } | Sort-Object Port -Unique)
if ($sibuk.Count -gt 0) {
  $sibuk | Format-Table -AutoSize | Out-String | Write-Host
  if ($sibuk | Where-Object { $_.Proses -eq 'System' }) {
    Amaran 'Port digunakan oleh "System". Biasanya ini IIS (laman web Windows).'
    Write-Host '  Jika anda tidak guna IIS, hentikan dengan arahan ini dan jalankan semula pemasang:'
    Write-Host '    Stop-Service W3SVC; Set-Service W3SVC -StartupType Disabled' -ForegroundColor White
  }
  Gagal 'Port 80/443 sedang digunakan oleh program lain. Hentikan program itu dahulu.'
}
Berjaya 'Port 80 dan 443 kosong'

# ---------------------------------------------------------------- 3. Node.js
Langkah 'Menyemak Node.js'
$nodeDir = Join-Path $env:ProgramFiles 'nodejs'
$nodeExe = Join-Path $nodeDir 'node.exe'
$perluNode = $true
if (Test-Path $nodeExe) {
  $ver = (& $nodeExe -v).TrimStart('v').Split('.')
  if ([int]$ver[0] -gt 22 -or ([int]$ver[0] -eq 22 -and [int]$ver[1] -ge 13)) { $perluNode = $false }
}
if ($perluNode) {
  Write-Host '    Memuat turun Node.js 22 LTS...'
  $base = 'https://nodejs.org/dist/latest-v22.x'
  $sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content
  $line = ($sums -split "`n") | Where-Object { $_ -match 'node-v22\.\d+\.\d+-x64\.msi\s*$' } | Select-Object -First 1
  if (-not $line) { Gagal 'Tidak dapat mencari pemasang Node.js.' }
  $parts = $line.Trim() -split '\s+'
  $msi = Join-Path $env:TEMP $parts[1]
  Invoke-WebRequest "$base/$($parts[1])" -OutFile $msi -UseBasicParsing
  if ((Get-FileHash $msi -Algorithm SHA256).Hash.ToLower() -ne $parts[0].ToLower()) { Gagal 'Fail Node.js rosak (hash tidak sepadan). Cuba lagi.' }
  Write-Host '    Memasang Node.js (1-2 minit)...'
  $p = Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
  if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { Gagal "Pemasangan Node.js gagal (kod $($p.ExitCode))." }
}
$env:Path = "$nodeDir;$env:Path"
Berjaya "Node.js $(& $nodeExe -v)"

# ---------------------------------------------------------------- 4. Muat turun sistem
Langkah "Memuat turun Education Hub ($Repo, cawangan $Cawangan)"
$tmp = Join-Path $env:TEMP ('eduhub-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
$zip = Join-Path $tmp 'app.zip'
Invoke-WebRequest "https://github.com/$Repo/archive/refs/heads/$Cawangan.zip" -OutFile $zip -UseBasicParsing
Expand-Archive $zip -DestinationPath (Join-Path $tmp 'x') -Force
$src = Get-ChildItem (Join-Path $tmp 'x') -Directory | Select-Object -First 1
if (-not (Test-Path (Join-Path $src.FullName 'server.js'))) { Gagal 'Fail sistem tidak lengkap.' }

Hentikan-Sistem
$appDir = Join-Path $Folder 'app'
Get-ChildItem $appDir -Force | Remove-Item -Recurse -Force
Copy-Item (Join-Path $src.FullName '*') $appDir -Recurse -Force
Remove-Item $tmp -Recurse -Force

Write-Host '    Memasang pakej (npm)...'
Push-Location $appDir
$ErrorActionPreference = 'Continue'   # npm menulis amaran ke stderr; jangan anggap sebagai ralat
& (Join-Path $nodeDir 'npm.cmd') ci --omit=dev --no-audit --no-fund
$npmExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
Pop-Location
if ($npmExit -ne 0) { Gagal 'npm ci gagal. Semak sambungan internet VPS.' }
Berjaya "Sistem dipasang di $appDir"

# ---------------------------------------------------------------- 5. Caddy (HTTPS)
Langkah 'Menyediakan Caddy (HTTPS automatik)'
$caddyExe = Join-Path $Folder 'bin\caddy.exe'
if (-not (Test-Path $caddyExe)) {
  Write-Host '    Memuat turun Caddy...'
  Invoke-WebRequest 'https://caddyserver.com/api/download?os=windows&arch=amd64' -OutFile $caddyExe -UseBasicParsing
}
$ErrorActionPreference = 'Continue'   # Caddy menulis log ke stderr
$caddyVer = (& $caddyExe version 2>$null | Select-Object -First 1)
$caddyOk = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = 'Stop'
if (-not $caddyOk) { Remove-Item $caddyExe -Force -ErrorAction SilentlyContinue; Gagal 'Muat turun Caddy rosak. Jalankan semula pemasang.' }
$caddyFile = Join-Path $Folder 'Caddyfile'
$caddyConf = @"
$Domain {
	encode gzip
	request_body {
		max_size 20MB
	}
	reverse_proxy 127.0.0.1:3000
}
"@
Tulis-Fail $caddyFile $caddyConf
$ErrorActionPreference = 'Continue'
& $caddyExe validate --config $caddyFile --adapter caddyfile 2>$null | Out-Null
$sahOk = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = 'Stop'
if (-not $sahOk) { Gagal "Caddyfile tidak sah. Semak $caddyFile" }
Berjaya "Caddy $(($caddyVer -split ' ')[0])"

# ---------------------------------------------------------------- 6. Skrip pelancar
Langkah 'Menulis skrip pelancar'
$mulaApp = @'
$ErrorActionPreference = 'Continue'
$F = '__FOLDER__'
$cfg = Get-Content "$F\tetapan.json" -Raw | ConvertFrom-Json
$env:ADMIN_PASSWORD = $cfg.MentorPassword
$env:SESSION_SECRET = $cfg.SessionSecret
$env:DATA_DIR = "$F\data"
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
$env:TRUST_PROXY = '1'
$env:COOKIE_SECURE = '1'
$env:NODE_NO_WARNINGS = '1'
$log = "$F\logs\app.log"
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
Set-Location "$F\app"
while ($true) {
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 10MB) { Move-Item $log "$log.old" -Force }
  & cmd.exe /d /s /c "`"`"$node`" `"$F\app\server.js`" >> `"$log`" 2>&1`""
  Start-Sleep -Seconds 5
}
'@
$mulaCaddy = @'
$ErrorActionPreference = 'Continue'
$F = '__FOLDER__'
$env:XDG_DATA_HOME = "$F\caddy\data"
$env:XDG_CONFIG_HOME = "$F\caddy\config"
$log = "$F\logs\caddy.log"
Set-Location $F
while ($true) {
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 10MB) { Move-Item $log "$log.old" -Force }
  & cmd.exe /d /s /c "`"`"$F\bin\caddy.exe`" run --config `"$F\Caddyfile`" --adapter caddyfile >> `"$log`" 2>&1`""
  Start-Sleep -Seconds 5
}
'@
$backup = @'
$F = '__FOLDER__'
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
$env:NODE_NO_WARNINGS = '1'
& cmd.exe /d /s /c "`"`"$node`" `"$F\app\scripts\backup.js`" `"$F\data\reports.db`" `"$F\backup`" 30 >> `"$F\logs\backup.log`" 2>&1`""
'@
Tulis-Fail (Join-Path $Folder 'mula-app.ps1') ($mulaApp.Replace('__FOLDER__', $Folder))
Tulis-Fail (Join-Path $Folder 'mula-caddy.ps1') ($mulaCaddy.Replace('__FOLDER__', $Folder))
Tulis-Fail (Join-Path $Folder 'backup.ps1') ($backup.Replace('__FOLDER__', $Folder))
Berjaya 'Skrip pelancar ditulis'

# ---------------------------------------------------------------- 7. Tugas Windows
Langkah 'Mendaftar tugas Windows (auto-mula selepas restart + backup harian)'
function Daftar-Tugas($nama, $skrip, $trigger) {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$skrip`""
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskPath '\EducationHub\' -TaskName $nama -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null
}
Daftar-Tugas 'Aplikasi' (Join-Path $Folder 'mula-app.ps1') (New-ScheduledTaskTrigger -AtStartup)
Daftar-Tugas 'Caddy' (Join-Path $Folder 'mula-caddy.ps1') (New-ScheduledTaskTrigger -AtStartup)
Daftar-Tugas 'Backup' (Join-Path $Folder 'backup.ps1') (New-ScheduledTaskTrigger -Daily -At '2:00AM')
Berjaya 'Tugas didaftarkan dalam Task Scheduler > EducationHub'

# ---------------------------------------------------------------- 8. Firewall
Langkah 'Membuka port 80 dan 443 dalam Windows Firewall'
foreach ($port in 80, 443) {
  $nama = "Education Hub (TCP $port)"
  if (-not (Get-NetFirewallRule -DisplayName $nama -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $nama -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null
  }
}
Berjaya 'Port 80 dan 443 dibuka'

# ---------------------------------------------------------------- 9. Mula
Langkah 'Memulakan sistem'
Start-ScheduledTask -TaskPath '\EducationHub\' -TaskName 'Aplikasi'
Start-ScheduledTask -TaskPath '\EducationHub\' -TaskName 'Caddy'
$ok = $false
for ($i = 0; $i -lt 20 -and -not $ok; $i++) {
  Start-Sleep -Seconds 2
  try { $r = Invoke-WebRequest 'http://127.0.0.1:3000/' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { $ok = $true } } catch { }
}
if (-not $ok) { Gagal "Sistem tidak dapat dimulakan. Semak log: $Folder\logs\app.log" }
Berjaya 'Education Hub sedang berjalan'

# ---------------------------------------------------------------- 10. Semak DNS
Langkah 'Menyemak domain'
$ipAwam = $null; $ipDns = $null
try { $ipAwam = (Invoke-RestMethod 'https://api.ipify.org' -TimeoutSec 10).ToString().Trim() } catch { }
try { $ipDns = (Resolve-DnsName $Domain -Type A -DnsOnly -ErrorAction Stop | Where-Object { $_.IPAddress } | Select-Object -First 1).IPAddress } catch { }
if (-not $ipDns) {
  Amaran "Domain $Domain belum menghala ke mana-mana IP. Tetapkan di duckdns.org kepada IP: $ipAwam"
} elseif ($ipAwam -and $ipDns -ne $ipAwam) {
  Amaran "Domain $Domain menghala ke $ipDns, tetapi IP VPS ini ialah $ipAwam. Kemas kini di duckdns.org."
} else {
  Berjaya "$Domain menghala ke $ipDns"
}

Write-Host ''
Write-Host '=============================================' -ForegroundColor Green
Write-Host '  SIAP!' -ForegroundColor Green
Write-Host '=============================================' -ForegroundColor Green
Write-Host "  Laman pelajar   : https://$Domain"
Write-Host "  Daftar pelajar  : https://$Domain/daftar"
Write-Host "  Log masuk mentor: https://$Domain/guru/login"
Write-Host ''
Write-Host '  Sijil HTTPS mungkin mengambil 1-2 minit pada kali pertama.'
Write-Host "  Data  : $Folder\data\reports.db"
Write-Host "  Backup: $Folder\backup (setiap hari jam 2 pagi)"
Write-Host "  Log   : $Folder\logs"
Write-Host ''
Write-Host '  PENTING: pastikan port 80 dan 443 juga dibuka di panel penyedia VPS anda' -ForegroundColor Yellow
Write-Host '  (Security Group / Firewall), bukan hanya di Windows.' -ForegroundColor Yellow
